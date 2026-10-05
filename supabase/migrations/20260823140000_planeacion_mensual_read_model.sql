-- Read model mensual: se regenera después de escrituras y nunca durante una lectura de navegación.

create index if not exists idx_asignacion_planeacion_mes
on public.asignacion(
  cuenta_cliente_id,
  estado_publicacion,
  empleado_id,
  pdv_id,
  fecha_inicio,
  coalesce(fecha_fin, '9999-12-31'::date)
);

create index if not exists idx_asignacion_resuelta_planeacion_mes
on public.asignacion_diaria_resuelta(cuenta_cliente_id, fecha, pdv_id, empleado_id);

create or replace function public.refrescar_planeacion_mensual_snapshot(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_pdv_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_mes_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_scope_key text;
  v_version bigint := 1;
  v_rows integer := 0;
begin
  if p_cuenta_cliente_id is null then
    raise exception 'PLANEACION_CUENTA_REQUERIDA';
  end if;

  if p_mes is null or p_mes <> v_mes then
    raise exception 'PLANEACION_MES_INVALIDO';
  end if;

  v_scope_key := p_cuenta_cliente_id::text || ':' || to_char(v_mes, 'YYYY-MM');

  select greatest(version, 1) into v_version
  from public.ui_change_version
  where module = 'asignaciones'
    and surface = 'planeacion_mensual'
    and scope_key = v_scope_key
    and role_target = 'ALL';
  v_version := coalesce(v_version, 1);

  perform pg_advisory_xact_lock(
    hashtextextended('planeacion-snapshot:' || p_cuenta_cliente_id::text || ':' || v_mes::text, 0)
  );

  update public.planeacion_mensual_snapshot_fila snapshot
  set es_vigente = false
  where snapshot.cuenta_cliente_id = p_cuenta_cliente_id
    and snapshot.mes = v_mes
    and snapshot.es_vigente
    and (
      p_pdv_ids is null
      or cardinality(p_pdv_ids) = 0
      or snapshot.pdv_id = any(p_pdv_ids)
    );

  with
  calendar as (
    select dia::date as fecha
    from generate_series(v_mes, v_mes_fin, interval '1 day') dia
  ),
  pdv_scope as (
    select distinct
      pdv.id as pdv_id,
      pdv.clave_btl,
      pdv.nombre as pdv_nombre,
      pdv.zona,
      pdv.estatus as pdv_estatus,
      cadena.id as cadena_id,
      cadena.nombre as cadena_nombre,
      ciudad.id as ciudad_id,
      ciudad.nombre as ciudad_nombre,
      ciudad.zona as ciudad_zona
    from public.cuenta_cliente_pdv ccp
    join public.pdv pdv on pdv.id = ccp.pdv_id
    left join public.cadena cadena on cadena.id = pdv.cadena_id
    left join public.ciudad ciudad on ciudad.id = pdv.ciudad_id
    where ccp.cuenta_cliente_id = p_cuenta_cliente_id
      and ccp.fecha_inicio <= v_mes_fin
      and (ccp.fecha_fin is null or ccp.fecha_fin >= v_mes)
      and (
        p_pdv_ids is null
        or cardinality(p_pdv_ids) = 0
        or pdv.id = any(p_pdv_ids)
      )
  ),
  segment_groups as (
    select
      asignacion.pdv_id,
      asignacion.empleado_id,
      min(asignacion.fecha_inicio) as rango_inicio,
      case
        when bool_or(asignacion.fecha_fin is null) then null
        else max(asignacion.fecha_fin)
      end as rango_fin
    from public.asignacion asignacion
    join pdv_scope scope on scope.pdv_id = asignacion.pdv_id
    where asignacion.cuenta_cliente_id = p_cuenta_cliente_id
      and asignacion.estado_publicacion = 'PUBLICADA'
      and asignacion.fecha_inicio <= v_mes_fin
      and coalesce(asignacion.fecha_fin, '9999-12-31'::date) >= v_mes
    group by asignacion.pdv_id, asignacion.empleado_id
  ),
  segments as (
    select
      groups.pdv_id,
      groups.empleado_id,
      groups.rango_inicio,
      groups.rango_fin,
      representative.id as asignacion_id,
      representative.tipo,
      representative.factor_tiempo,
      representative.naturaleza,
      representative.dias_laborales,
      representative.dia_descanso,
      representative.horario_referencia,
      representative.supervisor_empleado_id
    from segment_groups groups
    cross join lateral (
      select asignacion.*
      from public.asignacion asignacion
      where asignacion.cuenta_cliente_id = p_cuenta_cliente_id
        and asignacion.pdv_id = groups.pdv_id
        and asignacion.empleado_id = groups.empleado_id
        and asignacion.estado_publicacion = 'PUBLICADA'
        and asignacion.fecha_inicio <= v_mes_fin
        and coalesce(asignacion.fecha_fin, '9999-12-31'::date) >= v_mes
      order by asignacion.prioridad desc, asignacion.fecha_inicio desc, asignacion.updated_at desc
      limit 1
    ) representative
  ),
  dc_cells as (
    select
      segment.pdv_id,
      segment.empleado_id,
      calendar.fecha,
      day_assignment.id as asignacion_id,
      day_assignment.tipo,
      day_assignment.factor_tiempo,
      day_assignment.naturaleza,
      resolved.estado_operativo,
      resolved.origen,
      resolved.pdv_id as pdv_resuelto_id,
      resolved.referencia_id,
      resolved.mensaje_operativo,
      resolved.horario_inicio,
      resolved.horario_fin,
      coalesce(turno.codigo,
        case
          when resolved.horario_inicio is not null and resolved.horario_fin is not null
            then left(resolved.horario_inicio, 5) || '-' || left(resolved.horario_fin, 5)
          else null
        end
      ) as turno_codigo,
      turno.color_token as turno_color,
      coalesce(cuota.monto_cuota, 0) as cuota_dia,
      coalesce(cuota_dc.monto_asignado, 0) as cuota_asignada,
      case
        when day_assignment.id is null then 'D'
        when resolved.estado_operativo = 'FORMACION' then 'FOR'
        when resolved.estado_operativo = 'INCAPACIDAD' then
          case when solicitud.metadata ->> 'incapacidad_clase' = 'SUBSECUENTE' then 'IS' else 'I' end
        when resolved.estado_operativo = 'VACACIONES' then 'VAC'
        when resolved.estado_operativo = 'FALTA_JUSTIFICADA' then 'JUS'
        when resolved.estado_operativo = 'ASIGNADA_PDV'
          and resolved.pdv_id = segment.pdv_id
          and resolved.origen in ('COBERTURA_TEMPORAL', 'COBERTURA_PERMANENTE') then 'COV'
        when resolved.estado_operativo = 'ASIGNADA_PDV'
          and resolved.pdv_id = segment.pdv_id then '1'
        when resolved.estado_operativo = 'ASIGNADA_PDV'
          and resolved.pdv_id <> segment.pdv_id then 'COV'
        else 'SIN'
      end as codigo,
      resolved.estado_operativo = 'ASIGNADA_PDV'
        and resolved.pdv_id = segment.pdv_id as trabaja_en_pdv
    from segments segment
    cross join calendar
    left join lateral (
      select asignacion.*
      from public.asignacion asignacion
      where asignacion.cuenta_cliente_id = p_cuenta_cliente_id
        and asignacion.empleado_id = segment.empleado_id
        and asignacion.pdv_id = segment.pdv_id
        and asignacion.estado_publicacion = 'PUBLICADA'
        and asignacion.fecha_inicio <= calendar.fecha
        and coalesce(asignacion.fecha_fin, '9999-12-31'::date) >= calendar.fecha
        and public.planeacion_dia_laboral(
          asignacion.dias_laborales,
          asignacion.dia_descanso,
          calendar.fecha
        )
      order by asignacion.prioridad desc, asignacion.fecha_inicio desc, asignacion.updated_at desc
      limit 1
    ) day_assignment on true
    left join public.asignacion_diaria_resuelta resolved
      on resolved.cuenta_cliente_id = p_cuenta_cliente_id
      and resolved.empleado_id = segment.empleado_id
      and resolved.fecha = calendar.fecha
    left join public.solicitud solicitud
      on solicitud.id = resolved.referencia_id
      and resolved.referencia_tabla = 'solicitud'
    left join lateral (
      select catalogo.codigo, catalogo.color_token
      from public.catalogo_turno catalogo
      where catalogo.activo
        and resolved.horario_inicio is not null
        and resolved.horario_fin is not null
        and left(catalogo.hora_entrada::text, 5) = left(resolved.horario_inicio, 5)
        and left(catalogo.hora_salida::text, 5) = left(resolved.horario_fin, 5)
      order by catalogo.codigo
      limit 1
    ) turno on true
    left join lateral (
      select cuota_row.monto_cuota
      from public.cuotas_diarias_pdv cuota_row
      where cuota_row.cuenta_cliente_id = p_cuenta_cliente_id
        and cuota_row.pdv_id = segment.pdv_id
        and cuota_row.fecha = calendar.fecha
        and cuota_row.estado in ('PUBLICADA', 'CERRADA')
      order by cuota_row.version desc
      limit 1
    ) cuota on true
    left join lateral (
      select cuota_row.monto_asignado
      from public.cuota_asignacion_diaria_dc cuota_row
      where cuota_row.cuenta_cliente_id = p_cuenta_cliente_id
        and cuota_row.pdv_id = segment.pdv_id
        and cuota_row.empleado_id = segment.empleado_id
        and cuota_row.fecha = calendar.fecha
        and cuota_row.estado_calculo in ('VIGENTE', 'CIERRE')
      order by cuota_row.version desc
      limit 1
    ) cuota_dc on true
  ),
  dc_rows as (
    select
      scope.pdv_id,
      'DC:' || segment.empleado_id::text as segmento_clave,
      jsonb_build_object(
        'segmentoClave', 'DC:' || segment.empleado_id::text,
        'segmentoTipo', 'DC',
        'cadenaId', scope.cadena_id,
        'cadenaNombre', scope.cadena_nombre,
        'pdvId', scope.pdv_id,
        'pdvClave', scope.clave_btl,
        'pdvNombre', scope.pdv_nombre,
        'pdvEstatus', scope.pdv_estatus,
        'ciudadId', scope.ciudad_id,
        'ciudadNombre', scope.ciudad_nombre,
        'zona', coalesce(scope.zona, scope.ciudad_zona),
        'empleadoId', employee.id,
        'empleadoNomina', employee.id_nomina,
        'empleadoNombre', employee.nombre_completo,
        'rol', segment.tipo,
        'factorTiempo', segment.factor_tiempo,
        'naturaleza', segment.naturaleza,
        'asignacionId', segment.asignacion_id,
        'rangoFechaInicio', greatest(segment.rango_inicio, v_mes),
        'rangoFechaFin', least(coalesce(segment.rango_fin, v_mes_fin), v_mes_fin),
        'diasLaborales', segment.dias_laborales,
        'diaDescanso', segment.dia_descanso,
        'horarioReferencia', segment.horario_referencia,
        'supervisorId', coalesce(segment.supervisor_empleado_id, pdv_supervisor.empleado_id),
        'supervisorNombre', supervisor.nombre_completo,
        'diasLaborados', count(*) filter (where cells.trabaja_en_pdv),
        'diasProgramados', count(*) filter (where cells.asignacion_id is not null),
        'cuotaMensual', coalesce(max(monthly_quota.cuota_mensual), 0),
        'cuotaIndividual', coalesce(sum(cells.cuota_asignada), 0),
        'dias', jsonb_agg(jsonb_build_object(
          'fecha', cells.fecha,
          'diaSemana', (array['L','M','X','J','V','S','D'])[extract(isodow from cells.fecha)::integer],
          'codigo', cells.codigo,
          'estadoOperativo', cells.estado_operativo,
          'origen', cells.origen,
          'pdvResueltoId', cells.pdv_resuelto_id,
          'trabajaEnPdv', cells.trabaja_en_pdv,
          'turnoCodigo', cells.turno_codigo,
          'turnoColor', cells.turno_color,
          'horarioInicio', cells.horario_inicio,
          'horarioFin', cells.horario_fin,
          'cuotaDia', cells.cuota_dia,
          'cuotaAsignada', cells.cuota_asignada,
          'referenciaId', cells.referencia_id,
          'mensajeOperativo', cells.mensaje_operativo
        ) order by cells.fecha)
      ) as payload
    from segments segment
    join pdv_scope scope on scope.pdv_id = segment.pdv_id
    join public.empleado employee on employee.id = segment.empleado_id
    join dc_cells cells
      on cells.pdv_id = segment.pdv_id and cells.empleado_id = segment.empleado_id
    left join lateral (
      select sp.empleado_id
      from public.supervisor_pdv sp
      where sp.pdv_id = segment.pdv_id
        and sp.activo
        and sp.fecha_inicio <= v_mes_fin
        and (sp.fecha_fin is null or sp.fecha_fin >= v_mes)
      order by sp.fecha_inicio desc, sp.created_at desc
      limit 1
    ) pdv_supervisor on true
    left join public.empleado supervisor
      on supervisor.id = coalesce(segment.supervisor_empleado_id, pdv_supervisor.empleado_id)
    left join lateral (
      select sum(cuota.monto_cuota) as cuota_mensual
      from public.cuotas_diarias_pdv cuota
      where cuota.cuenta_cliente_id = p_cuenta_cliente_id
        and cuota.pdv_id = segment.pdv_id
        and cuota.fecha between v_mes and v_mes_fin
        and cuota.estado in ('PUBLICADA', 'CERRADA')
    ) monthly_quota on true
    group by
      scope.pdv_id, scope.cadena_id, scope.cadena_nombre, scope.clave_btl,
      scope.pdv_nombre, scope.pdv_estatus, scope.ciudad_id, scope.ciudad_nombre,
      scope.zona, scope.ciudad_zona, segment.empleado_id, employee.id,
      employee.id_nomina, employee.nombre_completo, segment.tipo,
      segment.factor_tiempo, segment.naturaleza, segment.asignacion_id,
      segment.rango_inicio, segment.rango_fin, segment.dias_laborales,
      segment.dia_descanso, segment.horario_referencia,
      segment.supervisor_empleado_id, pdv_supervisor.empleado_id,
      supervisor.nombre_completo
  ),
  vacancy_cells as (
    select
      scope.pdv_id,
      calendar.fecha,
      exists (
        select 1
        from public.asignacion asignacion
        where asignacion.cuenta_cliente_id = p_cuenta_cliente_id
          and asignacion.pdv_id = scope.pdv_id
          and asignacion.estado_publicacion = 'PUBLICADA'
          and asignacion.fecha_inicio <= v_mes_fin
          and coalesce(asignacion.fecha_fin, '9999-12-31'::date) >= v_mes
      ) as tiene_segmentos,
      exists (
        select 1
        from public.asignacion asignacion
        where asignacion.cuenta_cliente_id = p_cuenta_cliente_id
          and asignacion.pdv_id = scope.pdv_id
          and asignacion.estado_publicacion = 'PUBLICADA'
          and asignacion.fecha_inicio <= calendar.fecha
          and coalesce(asignacion.fecha_fin, '9999-12-31'::date) >= calendar.fecha
          and public.planeacion_dia_laboral(
            asignacion.dias_laborales,
            asignacion.dia_descanso,
            calendar.fecha
          )
      ) as tiene_programacion,
      exists (
        select 1
        from public.asignacion_diaria_resuelta resolved
        where resolved.cuenta_cliente_id = p_cuenta_cliente_id
          and resolved.pdv_id = scope.pdv_id
          and resolved.fecha = calendar.fecha
          and resolved.estado_operativo = 'ASIGNADA_PDV'
      ) as tiene_cobertura,
      coalesce(cuota.monto_cuota, 0) as cuota_dia
    from pdv_scope scope
    cross join calendar
    left join lateral (
      select cuota_row.monto_cuota
      from public.cuotas_diarias_pdv cuota_row
      where cuota_row.cuenta_cliente_id = p_cuenta_cliente_id
        and cuota_row.pdv_id = scope.pdv_id
        and cuota_row.fecha = calendar.fecha
        and cuota_row.estado in ('PUBLICADA', 'CERRADA')
      order by cuota_row.version desc
      limit 1
    ) cuota on true
  ),
  vacancy_rows as (
    select
      scope.pdv_id,
      'VACANTE'::text as segmento_clave,
      jsonb_build_object(
        'segmentoClave', 'VACANTE',
        'segmentoTipo', 'VACANTE',
        'cadenaId', scope.cadena_id,
        'cadenaNombre', scope.cadena_nombre,
        'pdvId', scope.pdv_id,
        'pdvClave', scope.clave_btl,
        'pdvNombre', scope.pdv_nombre,
        'pdvEstatus', scope.pdv_estatus,
        'ciudadId', scope.ciudad_id,
        'ciudadNombre', scope.ciudad_nombre,
        'zona', coalesce(scope.zona, scope.ciudad_zona),
        'empleadoId', null,
        'empleadoNomina', null,
        'empleadoNombre', 'POR CUBRIR',
        'rol', 'VACANTE',
        'factorTiempo', 0,
        'naturaleza', 'NINGUNO',
        'asignacionId', null,
        'rangoFechaInicio', v_mes,
        'rangoFechaFin', v_mes_fin,
        'diasLaborales', null,
        'diaDescanso', null,
        'horarioReferencia', 'VC',
        'supervisorId', pdv_supervisor.empleado_id,
        'supervisorNombre', supervisor.nombre_completo,
        'diasLaborados', 0,
        'diasProgramados', count(*) filter (
          where (cells.tiene_segmentos and cells.tiene_programacion)
             or (not cells.tiene_segmentos and extract(isodow from cells.fecha) between 1 and 6)
        ),
        'cuotaMensual', sum(cells.cuota_dia),
        'cuotaIndividual', 0,
        'dias', jsonb_agg(jsonb_build_object(
          'fecha', cells.fecha,
          'diaSemana', (array['L','M','X','J','V','S','D'])[extract(isodow from cells.fecha)::integer],
          'codigo', case
            when cells.tiene_cobertura then '—'
            when cells.tiene_segmentos and cells.tiene_programacion then 'PC'
            when not cells.tiene_segmentos and extract(isodow from cells.fecha) between 1 and 6 then 'PC'
            else 'D'
          end,
          'estadoOperativo', case
            when cells.tiene_cobertura then 'CUBIERTO'
            when cells.tiene_segmentos and cells.tiene_programacion then 'POR_CUBRIR'
            when not cells.tiene_segmentos and extract(isodow from cells.fecha) between 1 and 6 then 'POR_CUBRIR'
            else 'NO_PROGRAMADO'
          end,
          'origen', 'NINGUNO',
          'pdvResueltoId', scope.pdv_id,
          'trabajaEnPdv', false,
          'turnoCodigo', case when cells.tiene_cobertura then null else 'VC' end,
          'turnoColor', case when cells.tiene_cobertura then null else 'turno-vc' end,
          'horarioInicio', null,
          'horarioFin', null,
          'cuotaDia', cells.cuota_dia,
          'cuotaAsignada', 0,
          'referenciaId', null,
          'mensajeOperativo', case
            when cells.tiene_cobertura then null
            when cells.tiene_segmentos and cells.tiene_programacion then 'PDV por cubrir en un día programado.'
            when not cells.tiene_segmentos and extract(isodow from cells.fecha) between 1 and 6 then 'PDV sin DC estructural asignada.'
            else 'Día no programado.'
          end
        ) order by cells.fecha)
      ) as payload
    from pdv_scope scope
    join vacancy_cells cells on cells.pdv_id = scope.pdv_id
    left join lateral (
      select sp.empleado_id
      from public.supervisor_pdv sp
      where sp.pdv_id = scope.pdv_id
        and sp.activo
        and sp.fecha_inicio <= v_mes_fin
        and (sp.fecha_fin is null or sp.fecha_fin >= v_mes)
      order by sp.fecha_inicio desc, sp.created_at desc
      limit 1
    ) pdv_supervisor on true
    left join public.empleado supervisor on supervisor.id = pdv_supervisor.empleado_id
    group by
      scope.pdv_id, scope.cadena_id, scope.cadena_nombre, scope.clave_btl,
      scope.pdv_nombre, scope.pdv_estatus, scope.ciudad_id, scope.ciudad_nombre,
      scope.zona, scope.ciudad_zona, pdv_supervisor.empleado_id,
      supervisor.nombre_completo
    having bool_or(
      not cells.tiene_cobertura
      and (
        (cells.tiene_segmentos and cells.tiene_programacion)
        or (not cells.tiene_segmentos and extract(isodow from cells.fecha) between 1 and 6)
      )
    )
  ),
  rows_to_write as (
    select * from dc_rows
    union all
    select * from vacancy_rows
  )
  insert into public.planeacion_mensual_snapshot_fila (
    cuenta_cliente_id,
    mes,
    pdv_id,
    segmento_clave,
    version_snapshot,
    es_vigente,
    payload,
    generated_at
  )
  select
    p_cuenta_cliente_id,
    v_mes,
    row_data.pdv_id,
    row_data.segmento_clave,
    v_version,
    true,
    row_data.payload,
    now()
  from rows_to_write row_data
  on conflict (cuenta_cliente_id, mes, pdv_id, segmento_clave, version_snapshot)
  do update set
    es_vigente = true,
    payload = excluded.payload,
    generated_at = now();

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'cuentaClienteId', p_cuenta_cliente_id,
    'mes', v_mes,
    'version', v_version,
    'rows', v_rows,
    'pdvScope', case
      when p_pdv_ids is null then 'ALL'
      else cardinality(p_pdv_ids)::text
    end
  );
end;
$$;

create or replace function public.obtener_planeacion_mensual_resumen(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_busqueda text default null,
  p_cadena_ids uuid[] default null,
  p_supervisor_ids uuid[] default null,
  p_estados text[] default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_search text := lower(trim(coalesce(p_busqueda, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 1000), 1000));
  v_version bigint := 0;
  v_generated_at timestamptz;
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_cuenta_cliente_id is null then
    raise exception 'PLANEACION_CUENTA_REQUERIDA';
  end if;

  if p_mes is null or p_mes <> v_mes then
    raise exception 'PLANEACION_MES_INVALIDO';
  end if;

  with filtered as (
    select snapshot.payload, snapshot.version_snapshot, snapshot.generated_at
    from public.planeacion_mensual_snapshot_fila snapshot
    where snapshot.cuenta_cliente_id = p_cuenta_cliente_id
      and snapshot.mes = v_mes
      and snapshot.es_vigente
      and (
        v_search = ''
        or lower(concat_ws(' ',
          snapshot.payload ->> 'cadenaNombre',
          snapshot.payload ->> 'pdvClave',
          snapshot.payload ->> 'pdvNombre',
          snapshot.payload ->> 'empleadoNombre',
          snapshot.payload ->> 'supervisorNombre',
          snapshot.payload ->> 'ciudadNombre',
          snapshot.payload ->> 'zona'
        )) like '%' || v_search || '%'
      )
      and (
        p_cadena_ids is null
        or cardinality(p_cadena_ids) = 0
        or (snapshot.payload ->> 'cadenaId')::uuid = any(p_cadena_ids)
      )
      and (
        p_supervisor_ids is null
        or cardinality(p_supervisor_ids) = 0
        or (snapshot.payload ->> 'supervisorId')::uuid = any(p_supervisor_ids)
      )
      and (
        p_estados is null
        or cardinality(p_estados) = 0
        or snapshot.payload ->> 'segmentoTipo' = any(p_estados)
        or snapshot.payload ->> 'pdvEstatus' = any(p_estados)
      )
  ),
  counted as (
    select count(*)::integer as total,
           coalesce(max(version_snapshot), 0) as version,
           max(generated_at) as generated_at
    from filtered
  ),
  limited as (
    select payload
    from filtered
    order by
      payload ->> 'cadenaNombre',
      payload ->> 'pdvNombre',
      case when payload ->> 'segmentoTipo' = 'VACANTE' then 1 else 0 end,
      payload ->> 'empleadoNombre'
    limit v_limit
  )
  select counted.total, counted.version, counted.generated_at,
         coalesce((select jsonb_agg(payload) from limited), '[]'::jsonb)
  into v_total, v_version, v_generated_at, v_rows
  from counted;

  return jsonb_build_object(
    'ok', true,
    'mes', v_mes,
    'version', v_version,
    'generatedAt', v_generated_at,
    'total', v_total,
    'truncated', v_total > v_limit,
    'rows', v_rows
  );
end;
$$;

create or replace function public.obtener_planeacion_mensual_dia(
  p_cuenta_cliente_id uuid,
  p_pdv_id uuid,
  p_fecha date
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with pdv_context as (
    select
      pdv.id,
      pdv.clave_btl,
      pdv.nombre,
      cadena.nombre as cadena_nombre,
      ciudad.nombre as ciudad_nombre
    from public.cuenta_cliente_pdv ccp
    join public.pdv pdv on pdv.id = ccp.pdv_id
    left join public.cadena cadena on cadena.id = pdv.cadena_id
    left join public.ciudad ciudad on ciudad.id = pdv.ciudad_id
    where ccp.cuenta_cliente_id = p_cuenta_cliente_id
      and ccp.pdv_id = p_pdv_id
      and ccp.fecha_inicio <= p_fecha
      and (ccp.fecha_fin is null or ccp.fecha_fin >= p_fecha)
    limit 1
  ),
  structural as (
    select
      asignacion.id,
      asignacion.empleado_id,
      employee.nombre_completo,
      asignacion.tipo,
      asignacion.factor_tiempo,
      asignacion.naturaleza,
      asignacion.dias_laborales,
      asignacion.dia_descanso,
      asignacion.horario_referencia,
      public.planeacion_dia_laboral(
        asignacion.dias_laborales,
        asignacion.dia_descanso,
        p_fecha
      ) as programada
    from public.asignacion asignacion
    join public.empleado employee on employee.id = asignacion.empleado_id
    where asignacion.cuenta_cliente_id = p_cuenta_cliente_id
      and asignacion.pdv_id = p_pdv_id
      and asignacion.estado_publicacion = 'PUBLICADA'
      and asignacion.fecha_inicio <= p_fecha
      and coalesce(asignacion.fecha_fin, '9999-12-31'::date) >= p_fecha
  ),
  employees as (
    select distinct empleado_id from structural
    union
    select empleado_id
    from public.asignacion_diaria_resuelta
    where cuenta_cliente_id = p_cuenta_cliente_id
      and pdv_id = p_pdv_id
      and fecha = p_fecha
  ),
  detail as (
    select
      employee.id as empleado_id,
      employee.nombre_completo,
      resolved.estado_operativo,
      resolved.origen,
      resolved.pdv_id as pdv_resuelto_id,
      resolved.horario_inicio,
      resolved.horario_fin,
      resolved.mensaje_operativo,
      resolved.referencia_tabla,
      resolved.referencia_id,
      structural.id as asignacion_id,
      structural.tipo,
      structural.factor_tiempo,
      structural.naturaleza,
      structural.dias_laborales,
      structural.dia_descanso,
      structural.horario_referencia,
      structural.programada
    from employees universe
    join public.empleado employee on employee.id = universe.empleado_id
    left join public.asignacion_diaria_resuelta resolved
      on resolved.cuenta_cliente_id = p_cuenta_cliente_id
      and resolved.empleado_id = universe.empleado_id
      and resolved.fecha = p_fecha
    left join lateral (
      select source.*
      from structural source
      where source.empleado_id = universe.empleado_id
      order by source.programada desc, source.naturaleza desc, source.id
      limit 1
    ) structural on true
  ),
  quota as (
    select coalesce(sum(monto_cuota), 0) as monto
    from public.cuotas_diarias_pdv
    where cuenta_cliente_id = p_cuenta_cliente_id
      and pdv_id = p_pdv_id
      and fecha = p_fecha
      and estado in ('PUBLICADA', 'CERRADA')
  )
  select jsonb_build_object(
    'ok', context.id is not null,
    'fecha', p_fecha,
    'pdv', case when context.id is null then null else jsonb_build_object(
      'id', context.id,
      'clave', context.clave_btl,
      'nombre', context.nombre,
      'cadenaNombre', context.cadena_nombre,
      'ciudadNombre', context.ciudad_nombre
    ) end,
    'cuotaDia', quota.monto,
    'personas', coalesce((select jsonb_agg(to_jsonb(detail) order by detail.nombre_completo) from detail), '[]'::jsonb)
  )
  from quota
  left join pdv_context context on true;
$$;

revoke all on function public.refrescar_planeacion_mensual_snapshot(uuid, date, uuid[])
from public, anon, authenticated;
revoke all on function public.obtener_planeacion_mensual_resumen(uuid, date, text, uuid[], uuid[], text[], integer)
from public, anon, authenticated;
revoke all on function public.obtener_planeacion_mensual_dia(uuid, uuid, date)
from public, anon, authenticated;

grant execute on function public.refrescar_planeacion_mensual_snapshot(uuid, date, uuid[])
to service_role;
grant execute on function public.obtener_planeacion_mensual_resumen(uuid, date, text, uuid[], uuid[], text[], integer)
to service_role;
grant execute on function public.obtener_planeacion_mensual_dia(uuid, uuid, date)
to service_role;

comment on function public.refrescar_planeacion_mensual_snapshot(uuid, date, uuid[]) is
  'Regenera filas compactas de Planeación Mensual después de escrituras; no debe invocarse desde una carga de lectura.';
comment on function public.obtener_planeacion_mensual_resumen(uuid, date, text, uuid[], uuid[], text[], integer) is
  'Devuelve en una sola consulta el snapshot mensual filtrado y listo para renderizar.';
comment on function public.obtener_planeacion_mensual_dia(uuid, uuid, date) is
  'Carga diferida del detalle estructural y operativo para una única celda PDV-fecha.';
