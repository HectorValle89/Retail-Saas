-- Migración: Corregir generación de vacantes en planeación mensual (evitar falsos positivos en días de descanso)
-- Proyecto: HectorValle89/Retail-Saas
-- Regla de Oro: Tablas y comentarios en español latino, UTF-8 estricto sin BOM

-- 1. Actualizar la función base de planeación mensual
-- Corrige para que:
-- a) Los descansos regulares de un colaborador asignado (ej. miércoles o jueves) NO se consideren días descubiertos ('PC') ni originen filas de vacante duplicadas.
-- b) Un punto de venta solo origine una fila de VACANTE si verdaderamente carece de asignación publicada y vigente en días laborales (lunes a sábado).
-- c) Cuando una tienda tiene cobertura vigente para cierta fecha, la fila de vacante muestre '—' (no 'PC').
-- d) Se limpien del snapshot las filas obsoletas o no vigentes (es_vigente = false).

create or replace function public.refrescar_planeacion_mensual_snapshot_base(
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
    join public.empleado emp on emp.id = asignacion.empleado_id
    where asignacion.cuenta_cliente_id = p_cuenta_cliente_id
      and asignacion.estado_publicacion = 'PUBLICADA'
      and asignacion.fecha_inicio <= v_mes_fin
      and coalesce(asignacion.fecha_fin, '9999-12-31'::date) >= v_mes
      and not (emp.estatus_laboral = 'BAJA' and emp.fecha_baja is not null and emp.fecha_baja < v_mes)
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
        when employee.estatus_laboral = 'BAJA' and employee.fecha_baja is not null and calendar.fecha > employee.fecha_baja then '—'
        when calendar.fecha < segment.rango_inicio or (segment.rango_fin is not null and calendar.fecha > segment.rango_fin) then '—'
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
      case
        when employee.estatus_laboral = 'BAJA' and employee.fecha_baja is not null and calendar.fecha > employee.fecha_baja then false
        when calendar.fecha < segment.rango_inicio or (segment.rango_fin is not null and calendar.fecha > segment.rango_fin) then false
        else (resolved.estado_operativo = 'ASIGNADA_PDV' and resolved.pdv_id = segment.pdv_id)
      end as trabaja_en_pdv
    from segments segment
    join public.empleado employee on employee.id = segment.empleado_id
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
        'diasProgramados', count(*) filter (where cells.asignacion_id is not null and cells.codigo <> '—'),
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
        from public.asignacion asg
        join public.empleado emp on emp.id = asg.empleado_id
        where asg.cuenta_cliente_id = p_cuenta_cliente_id
          and asg.pdv_id = scope.pdv_id
          and asg.estado_publicacion = 'PUBLICADA'
          and asg.fecha_inicio <= calendar.fecha
          and coalesce(asg.fecha_fin, '9999-12-31'::date) >= calendar.fecha
          and (
            emp.estatus_laboral = 'ACTIVO'
            or (emp.estatus_laboral = 'BAJA' and emp.fecha_baja is not null and calendar.fecha <= emp.fecha_baja)
          )
      ) as tiene_asignacion_vigente,
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
          where not cells.tiene_asignacion_vigente
            and extract(isodow from cells.fecha) between 1 and 6
        ),
        'cuotaMensual', sum(cells.cuota_dia),
        'cuotaIndividual', 0,
        'dias', jsonb_agg(jsonb_build_object(
          'fecha', cells.fecha,
          'diaSemana', (array['L','M','X','J','V','S','D'])[extract(isodow from cells.fecha)::integer],
          'codigo', case
            when cells.tiene_asignacion_vigente then '—'
            when not cells.tiene_asignacion_vigente and extract(isodow from cells.fecha) between 1 and 6 then 'PC'
            else 'D'
          end,
          'estadoOperativo', case
            when cells.tiene_asignacion_vigente then 'CUBIERTO'
            when not cells.tiene_asignacion_vigente and extract(isodow from cells.fecha) between 1 and 6 then 'POR_CUBRIR'
            else 'NO_PROGRAMADO'
          end,
          'origen', 'NINGUNO',
          'pdvResueltoId', scope.pdv_id,
          'trabajaEnPdv', false,
          'turnoCodigo', case when cells.tiene_asignacion_vigente then null else 'VC' end,
          'turnoColor', case when cells.tiene_asignacion_vigente then null else 'turno-vc' end,
          'horarioInicio', null,
          'horarioFin', null,
          'cuotaDia', cells.cuota_dia,
          'cuotaAsignada', 0,
          'referenciaId', null,
          'mensajeOperativo', case
            when cells.tiene_asignacion_vigente then null
            when not cells.tiene_asignacion_vigente and extract(isodow from cells.fecha) between 1 and 6 then 'PDV sin DC asignada.'
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
      not cells.tiene_asignacion_vigente
      and extract(isodow from cells.fecha) between 1 and 6
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

  -- 2. Limpiar del snapshot cualquier fila que haya quedado no vigente
  delete from public.planeacion_mensual_snapshot_fila snapshot
  where snapshot.cuenta_cliente_id = p_cuenta_cliente_id
    and snapshot.mes = v_mes
    and not snapshot.es_vigente
    and (
      p_pdv_ids is null
      or cardinality(p_pdv_ids) = 0
      or snapshot.pdv_id = any(p_pdv_ids)
    );

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'mes', v_mes,
    'version', v_version,
    'rows', v_rows,
    'pdvScope', case
      when p_pdv_ids is null or cardinality(p_pdv_ids) = 0 then 'TODOS'
      else cardinality(p_pdv_ids)::text
    end,
    'cuentaClienteId', p_cuenta_cliente_id
  );
end;
$$;

-- 3. Refrescar de inmediato el snapshot de septiembre 2026 para todas las cuentas activas
do $$
declare
  acc record;
begin
  for acc in
    select distinct cuenta_cliente_id
    from public.cuenta_cliente_pdv
    where fecha_inicio <= '2026-09-30' and (fecha_fin is null or fecha_fin >= '2026-09-01')
  loop
    perform public.refrescar_planeacion_mensual_snapshot(
      acc.cuenta_cliente_id,
      '2026-09-01'::date
    );
  end loop;
end $$;
