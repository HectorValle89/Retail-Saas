-- Migration: 20260917120000_fix_ruta_mensual_limpieza_previa.sql
-- Description: Ajustar la limpieza previa en rpc_guardar_ruta_mensual para evitar
--              violaciones de unicidad (ruta_semanal_visita_ruta_semanal_id_dia_semana_orden_key)
--              al enviar una ruta mensual que reemplaza visitas borradores existentes con
--              o sin ruta_mensual_envio_id asignado.

begin;

create or replace function public.rpc_guardar_ruta_mensual(
  p_cuenta_cliente_id uuid,
  p_supervisor_empleado_id uuid,
  p_mes date,
  p_usuario_id uuid,
  p_visitas jsonb,
  p_revision_esperada integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_mes_fin date;
  v_envio_id uuid;
  v_revision integer;
  v_total_visitas integer;
  v_total_dias integer;
  v_rutas_afectadas integer := 0;
begin
  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception 'RUTA_MENSUAL_MES_INVALIDO';
  end if;

  if p_mes < date_trunc('month', v_hoy)::date then
    raise exception 'RUTA_MENSUAL_MES_PASADO';
  end if;

  if p_mes > (date_trunc('month', v_hoy) + interval '12 months')::date then
    raise exception 'RUTA_MENSUAL_FUERA_HORIZONTE';
  end if;

  if p_visitas is null or jsonb_typeof(p_visitas) <> 'array' then
    raise exception 'RUTA_MENSUAL_PAYLOAD_INVALIDO';
  end if;

  v_mes_fin := (p_mes + interval '1 month - 1 day')::date;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_cuenta_cliente_id::text || ':' || p_supervisor_empleado_id::text || ':' || p_mes::text,
      0
    )
  );

  create temporary table ruta_mensual_payload_tmp (
    fecha date not null,
    pdv_id uuid not null,
    orden smallint not null,
    notas text,
    primary key (fecha, pdv_id),
    unique (fecha, orden)
  ) on commit drop;

  begin
    insert into ruta_mensual_payload_tmp(fecha, pdv_id, orden, notas)
    select
      (item ->> 'fecha')::date,
      (item ->> 'pdvId')::uuid,
      (item ->> 'orden')::smallint,
      nullif(left(trim(item ->> 'notas'), 1000), '')
    from jsonb_array_elements(p_visitas) as payload(item);
  exception
    when invalid_text_representation or not_null_violation or numeric_value_out_of_range
      or unique_violation then
      raise exception 'RUTA_MENSUAL_PAYLOAD_INVALIDO';
  end;

  select count(*), count(distinct fecha)
  into v_total_visitas, v_total_dias
  from ruta_mensual_payload_tmp;

  if v_total_visitas = 0 then
    raise exception 'RUTA_MENSUAL_SIN_VISITAS';
  end if;

  if exists (
    select 1
    from ruta_mensual_payload_tmp payload
    where payload.fecha < p_mes
       or payload.fecha > v_mes_fin
       or payload.fecha < v_hoy
       or payload.orden < 1
       or payload.orden > 99
  ) then
    raise exception 'RUTA_MENSUAL_FECHA_NO_EDITABLE';
  end if;

  if exists (
    select 1
    from ruta_mensual_payload_tmp payload
    where not exists (
      select 1
      from public.cuenta_cliente_pdv cuenta_pdv
      where cuenta_pdv.cuenta_cliente_id = p_cuenta_cliente_id
        and cuenta_pdv.pdv_id = payload.pdv_id
        and cuenta_pdv.activo = true
        and cuenta_pdv.fecha_inicio <= payload.fecha
        and (cuenta_pdv.fecha_fin is null or cuenta_pdv.fecha_fin >= payload.fecha)
    )
    or not (
      exists (
        select 1
        from public.supervisor_pdv relacion
        where relacion.empleado_id = p_supervisor_empleado_id
          and relacion.pdv_id = payload.pdv_id
          and relacion.activo = true
          and relacion.fecha_inicio <= payload.fecha
          and (relacion.fecha_fin is null or relacion.fecha_fin >= payload.fecha)
      )
      or exists (
        select 1
        from public.asignacion asignacion
        where asignacion.supervisor_empleado_id = p_supervisor_empleado_id
          and asignacion.cuenta_cliente_id = p_cuenta_cliente_id
          and asignacion.pdv_id = payload.pdv_id
          and asignacion.estado_publicacion = 'PUBLICADA'
          and asignacion.fecha_inicio <= payload.fecha
          and (asignacion.fecha_fin is null or asignacion.fecha_fin >= payload.fecha)
      )
    )
  ) then
    raise exception 'RUTA_MENSUAL_PDV_FUERA_ALCANCE';
  end if;

  if exists (
    select 1
    from ruta_mensual_payload_tmp payload
    join public.ruta_semanal ruta
      on ruta.supervisor_empleado_id = p_supervisor_empleado_id
     and ruta.semana_inicio = payload.fecha - (extract(isodow from payload.fecha)::integer - 1)
    join public.ruta_semanal_visita visita
      on visita.ruta_semanal_id = ruta.id
     and visita.dia_semana = extract(isodow from payload.fecha)::smallint
    left join public.ruta_mensual_envio envio_anterior
      on envio_anterior.id = visita.ruta_mensual_envio_id
    where visita.estatus = 'COMPLETADA'
       or visita.completada_en is not null
       or envio_anterior.estado in ('APROBADA', 'EN_PROGRESO', 'CERRADA')
       or (
         visita.ruta_mensual_envio_id is null
         and ruta.estatus in ('PUBLICADA', 'EN_PROGRESO', 'CERRADA')
       )
  ) then
    raise exception 'RUTA_MENSUAL_FECHA_PROTEGIDA';
  end if;

  select id, revision
  into v_envio_id, v_revision
  from public.ruta_mensual_envio
  where supervisor_empleado_id = p_supervisor_empleado_id
    and periodo = p_mes
  for update;

  if v_envio_id is not null then
    if p_revision_esperada is not null and p_revision_esperada <> v_revision then
      raise exception 'RUTA_MENSUAL_CAMBIO_CONCURRENTE';
    end if;

    update public.ruta_mensual_envio
    set cuenta_cliente_id = p_cuenta_cliente_id,
        estado = 'PENDIENTE_COORDINACION',
        revision = revision + 1,
        total_visitas = v_total_visitas,
        total_dias_planeados = v_total_dias,
        enviado_en = now(),
        enviado_por_usuario_id = p_usuario_id,
        revisado_en = null,
        revisado_por_usuario_id = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'supervisor_monthly_calendar',
          'compatibilityModel', 'ruta_semanal'
        )
    where id = v_envio_id
    returning revision into v_revision;
  else
    insert into public.ruta_mensual_envio(
      cuenta_cliente_id,
      supervisor_empleado_id,
      periodo,
      estado,
      revision,
      total_visitas,
      total_dias_planeados,
      enviado_por_usuario_id,
      metadata
    )
    values (
      p_cuenta_cliente_id,
      p_supervisor_empleado_id,
      p_mes,
      'PENDIENTE_COORDINACION',
      1,
      v_total_visitas,
      v_total_dias,
      p_usuario_id,
      jsonb_build_object(
        'source', 'supervisor_monthly_calendar',
        'compatibilityModel', 'ruta_semanal'
      )
    )
    returning id, revision into v_envio_id, v_revision;
  end if;

  insert into public.ruta_semanal(
    cuenta_cliente_id,
    supervisor_empleado_id,
    semana_inicio,
    estatus,
    notas,
    created_by_usuario_id,
    updated_by_usuario_id,
    metadata,
    ruta_mensual_envio_id
  )
  select
    p_cuenta_cliente_id,
    p_supervisor_empleado_id,
    semanas.semana_inicio,
    'BORRADOR',
    'Ruta mensual enviada por supervisor para aprobación de coordinación.',
    p_usuario_id,
    p_usuario_id,
    jsonb_build_object(
      'approval', jsonb_build_object(
        'state', 'PENDIENTE_COORDINACION',
        'note', 'Ruta mensual enviada por supervisor.',
        'reviewedAt', null,
        'reviewedByUsuarioId', null
      ),
      'monthlySubmission', jsonb_build_object(
        'id', v_envio_id,
        'period', to_char(p_mes, 'YYYY-MM'),
        'revision', v_revision
      )
    ),
    v_envio_id
  from (
    select distinct
      fecha::date - (extract(isodow from fecha)::integer - 1) as semana_inicio
    from generate_series(p_mes, v_mes_fin, interval '1 day') as dias(fecha)
  ) semanas
  on conflict (supervisor_empleado_id, semana_inicio)
  do update set
    cuenta_cliente_id = excluded.cuenta_cliente_id,
    estatus = 'BORRADOR',
    notas = excluded.notas,
    updated_by_usuario_id = excluded.updated_by_usuario_id,
    updated_at = now(),
    ruta_mensual_envio_id = excluded.ruta_mensual_envio_id,
    metadata = jsonb_set(
      jsonb_set(
        coalesce(ruta_semanal.metadata, '{}'::jsonb),
        '{approval}',
        excluded.metadata -> 'approval',
        true
      ),
      '{monthlySubmission}',
      excluded.metadata -> 'monthlySubmission',
      true
    )
  where ruta_semanal.estatus = 'BORRADOR'
    and not exists (
      select 1
      from public.ruta_semanal_visita ejecutada
      where ejecutada.ruta_semanal_id = ruta_semanal.id
        and (ejecutada.estatus = 'COMPLETADA' or ejecutada.completada_en is not null)
    );

  get diagnostics v_rutas_afectadas = row_count;

  insert into public.ruta_mensual_envio_semana(
    ruta_mensual_envio_id,
    ruta_semanal_id,
    semana_inicio
  )
  select v_envio_id, ruta.id, ruta.semana_inicio
  from public.ruta_semanal ruta
  where ruta.supervisor_empleado_id = p_supervisor_empleado_id
    and ruta.semana_inicio <= v_mes_fin
    and ruta.semana_inicio + 6 >= p_mes
  on conflict (ruta_mensual_envio_id, ruta_semanal_id)
  do nothing;

  select count(*)::integer
  into v_rutas_afectadas
  from public.ruta_mensual_envio_semana
  where ruta_mensual_envio_id = v_envio_id;

  -- Borrar visitas editables previas en el rango del mes para este supervisor (>= v_hoy).
  -- Incluye tanto visitas vinculadas a este envío o anteriores, como visitas con ruta_mensual_envio_id nulo
  -- provenientes de borradores semanales o cargas previas, evitando colisión con la clave única (ruta_semanal_id, dia_semana, orden).
  delete from public.ruta_semanal_visita visita
  using public.ruta_semanal ruta
  where visita.ruta_semanal_id = ruta.id
    and ruta.supervisor_empleado_id = p_supervisor_empleado_id
    and (
      visita.ruta_mensual_envio_id = v_envio_id
      or visita.ruta_mensual_envio_id is null
      or exists (
        select 1
        from public.ruta_mensual_envio envio_otro
        where envio_otro.id = visita.ruta_mensual_envio_id
          and envio_otro.periodo = p_mes
      )
    )
    and visita.estatus in ('PLANIFICADA', 'CANCELADA')
    and visita.completada_en is null
    and ruta.semana_inicio + (visita.dia_semana - 1) between p_mes and v_mes_fin
    and ruta.semana_inicio + (visita.dia_semana - 1) >= v_hoy;

  insert into public.ruta_semanal_visita(
    ruta_semanal_id,
    ruta_mensual_envio_id,
    cuenta_cliente_id,
    supervisor_empleado_id,
    pdv_id,
    asignacion_id,
    dia_semana,
    orden,
    estatus,
    comentarios,
    metadata
  )
  select
    ruta.id,
    v_envio_id,
    p_cuenta_cliente_id,
    p_supervisor_empleado_id,
    payload.pdv_id,
    asignacion.id,
    extract(isodow from payload.fecha)::smallint,
    payload.orden,
    'CANCELADA',
    payload.notas,
    jsonb_build_object(
      'source', 'ruta_mensual_envio',
      'submissionId', v_envio_id,
      'operationDate', payload.fecha
    )
  from ruta_mensual_payload_tmp payload
  join public.ruta_semanal ruta
    on ruta.supervisor_empleado_id = p_supervisor_empleado_id
   and ruta.semana_inicio = payload.fecha - (extract(isodow from payload.fecha)::integer - 1)
  join public.ruta_mensual_envio_semana enlace
    on enlace.ruta_mensual_envio_id = v_envio_id
   and enlace.ruta_semanal_id = ruta.id
  left join lateral (
    select asignacion.id
    from public.asignacion asignacion
    where asignacion.supervisor_empleado_id = p_supervisor_empleado_id
      and asignacion.cuenta_cliente_id = p_cuenta_cliente_id
      and asignacion.pdv_id = payload.pdv_id
      and asignacion.estado_publicacion = 'PUBLICADA'
      and asignacion.fecha_inicio <= payload.fecha
      and (asignacion.fecha_fin is null or asignacion.fecha_fin >= payload.fecha)
    order by asignacion.fecha_inicio desc, asignacion.created_at desc
    limit 1
  ) asignacion on true;

  select count(*)::integer, count(distinct fecha_operacion)::integer
  into v_total_visitas, v_total_dias
  from (
    select
      (ruta.semana_inicio + (visita.dia_semana - 1))::date as fecha_operacion
    from public.ruta_semanal_visita visita
    join public.ruta_semanal ruta on ruta.id = visita.ruta_semanal_id
    where visita.ruta_mensual_envio_id = v_envio_id
      and (ruta.semana_inicio + (visita.dia_semana - 1)) between p_mes and v_mes_fin
  ) visitas_envio;

  update public.ruta_mensual_envio
  set total_visitas = v_total_visitas,
      total_dias_planeados = v_total_dias
  where id = v_envio_id;

  insert into public.audit_log(
    tabla,
    registro_id,
    accion,
    payload,
    usuario_id,
    cuenta_cliente_id
  )
  values (
    'ruta_mensual_envio',
    v_envio_id::text,
    'EVENTO',
    jsonb_build_object(
      'evento', 'ruta_mensual_enviada_a_coordinacion',
      'periodo', to_char(p_mes, 'YYYY-MM'),
      'revision', v_revision,
      'total_visitas', v_total_visitas,
      'total_dias_planeados', v_total_dias,
      'rutas_compatibilidad', v_rutas_afectadas
    ),
    p_usuario_id,
    p_cuenta_cliente_id
  );

  return jsonb_build_object(
    'ok', true,
    'envioId', v_envio_id,
    'mes', p_mes,
    'revision', v_revision,
    'rutasAfectadas', v_rutas_afectadas,
    'visitas', v_total_visitas,
    'diasPlaneados', v_total_dias
  );
end;
$$;

revoke all on function public.rpc_guardar_ruta_mensual(
  uuid, uuid, date, uuid, jsonb, integer
) from public, anon, authenticated;

grant execute on function public.rpc_guardar_ruta_mensual(
  uuid, uuid, date, uuid, jsonb, integer
) to service_role, postgres;

comment on function public.rpc_guardar_ruta_mensual(uuid, uuid, date, uuid, jsonb, integer) is
  'Guarda y envía una ruta mensual completa en una sola transacción; limpia de forma segura visitas no ejecutadas previas para evitar colisiones de orden.';

commit;
