-- Cierra el ciclo de vida cuando el cambio nace en el catálogo maestro de PDVs.
-- Las escrituras son transaccionales y alimentan la misma cola diaria de Planeación.

create or replace function public.sincronizar_estado_pdv_operativo(
  p_cuenta_cliente_id uuid,
  p_pdv_id uuid,
  p_estado text,
  p_usuario_id uuid,
  p_motivo text default 'Actualización desde catálogo de PDVs'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text := upper(trim(coalesce(p_estado, '')));
  v_fecha date := current_date;
  v_empleados integer := 0;
begin
  if v_estado not in ('ACTIVO', 'INACTIVO') then
    raise exception 'PDV_ESTADO_OPERATIVO_INVALIDO';
  end if;
  if not exists (
    select 1 from public.cuenta_cliente_pdv ccp
    where ccp.cuenta_cliente_id = p_cuenta_cliente_id
      and ccp.pdv_id = p_pdv_id
      and ccp.activo
  ) then
    raise exception 'PDV_FUERA_DE_CUENTA';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'pdv-estado:' || p_cuenta_cliente_id::text || ':' || p_pdv_id::text, 0
  ));

  update public.pdv_estado_vigencia
  set vigente_hasta = v_fecha - 1, updated_at = now()
  where cuenta_cliente_id = p_cuenta_cliente_id
    and pdv_id = p_pdv_id
    and vigente_desde < v_fecha
    and coalesce(vigente_hasta, '9999-12-31'::date) >= v_fecha;

  delete from public.pdv_estado_vigencia
  where cuenta_cliente_id = p_cuenta_cliente_id
    and pdv_id = p_pdv_id
    and vigente_desde >= v_fecha;

  insert into public.pdv_estado_vigencia (
    cuenta_cliente_id, pdv_id, estado, vigente_desde, vigente_hasta,
    motivo, creado_por_usuario_id, metadata
  ) values (
    p_cuenta_cliente_id, p_pdv_id, v_estado, v_fecha, null,
    trim(coalesce(p_motivo, 'Actualización desde catálogo de PDVs')),
    p_usuario_id, jsonb_build_object('source', 'pdvs_admin')
  );

  update public.pdv
  set estatus = v_estado, updated_at = now()
  where id = p_pdv_id;

  insert into public.asignacion_diaria_dirty_queue (
    empleado_id, fecha_inicio, fecha_fin, motivo, payload
  )
  select distinct a.empleado_id, v_fecha, v_fecha + 62,
    'CATALOGO_PDV_ESTADO',
    jsonb_build_object('pdvId', p_pdv_id, 'estado', v_estado)
  from public.asignacion a
  where a.cuenta_cliente_id = p_cuenta_cliente_id
    and a.pdv_id = p_pdv_id
    and a.estado_publicacion = 'PUBLICADA'
    and coalesce(a.fecha_fin, '9999-12-31'::date) >= v_fecha;
  get diagnostics v_empleados = row_count;

  return jsonb_build_object('ok', true, 'estado', v_estado, 'empleadosEncolados', v_empleados);
end;
$$;

create or replace function public.sincronizar_supervisor_pdv_operativo(
  p_cuenta_cliente_id uuid,
  p_pdv_id uuid,
  p_supervisor_empleado_id uuid,
  p_usuario_id uuid,
  p_motivo text default 'Actualización desde catálogo de PDVs'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := current_date;
  v_supervisor_anterior_id uuid;
  v_empleados integer := 0;
begin
  if not exists (
    select 1 from public.cuenta_cliente_pdv ccp
    where ccp.cuenta_cliente_id = p_cuenta_cliente_id
      and ccp.pdv_id = p_pdv_id
      and ccp.activo
  ) then
    raise exception 'PDV_FUERA_DE_CUENTA';
  end if;
  if not exists (
    select 1 from public.empleado e
    where e.id = p_supervisor_empleado_id
      and e.puesto = 'SUPERVISOR'
      and e.estatus_laboral = 'ACTIVO'
      and (
        exists (
          select 1 from public.usuario u
          where u.empleado_id = e.id
            and u.cuenta_cliente_id = p_cuenta_cliente_id
            and u.estado_cuenta <> 'BAJA'
        )
        or exists (
          select 1
          from public.supervisor_pdv sp
          join public.cuenta_cliente_pdv ccp on ccp.pdv_id = sp.pdv_id
          where sp.empleado_id = e.id
            and ccp.cuenta_cliente_id = p_cuenta_cliente_id
            and sp.activo
        )
      )
  ) then
    raise exception 'SUPERVISOR_FUERA_DE_CUENTA';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'pdv-supervisor:' || p_cuenta_cliente_id::text || ':' || p_pdv_id::text, 0
  ));

  select sp.empleado_id into v_supervisor_anterior_id
  from public.supervisor_pdv sp
  where sp.pdv_id = p_pdv_id and sp.activo
  order by sp.fecha_inicio desc, sp.created_at desc
  limit 1;

  if v_supervisor_anterior_id is not distinct from p_supervisor_empleado_id then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'supervisorId', p_supervisor_empleado_id
    );
  end if;

  update public.supervisor_pdv
  set activo = false,
      fecha_fin = case when fecha_inicio < v_fecha then v_fecha - 1 else fecha_inicio end,
      updated_at = now()
  where pdv_id = p_pdv_id and activo;

  insert into public.supervisor_pdv (
    pdv_id, empleado_id, activo, fecha_inicio, fecha_fin
  ) values (
    p_pdv_id, p_supervisor_empleado_id, true, v_fecha, null
  )
  on conflict (pdv_id, empleado_id, fecha_inicio) do update
    set activo = true, fecha_fin = null, updated_at = now();

  update public.asignacion a
  set supervisor_empleado_id = p_supervisor_empleado_id,
      metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_actualizado_desde_pdv', now(),
        'supervisor_anterior_id', v_supervisor_anterior_id,
        'motivo_supervisor', p_motivo
      ),
      updated_at = now()
  where a.cuenta_cliente_id = p_cuenta_cliente_id
    and a.pdv_id = p_pdv_id
    and a.estado_publicacion = 'PUBLICADA'
    and coalesce(a.fecha_fin, '9999-12-31'::date) >= v_fecha;

  update public.empleado e
  set supervisor_empleado_id = p_supervisor_empleado_id,
      updated_at = now()
  where e.puesto = 'DERMOCONSEJERO'
    and e.estatus_laboral <> 'BAJA'
    and exists (
      select 1 from public.asignacion a
      where a.empleado_id = e.id
        and a.cuenta_cliente_id = p_cuenta_cliente_id
        and a.pdv_id = p_pdv_id
        and a.estado_publicacion = 'PUBLICADA'
        and a.fecha_inicio <= v_fecha
        and coalesce(a.fecha_fin, '9999-12-31'::date) >= v_fecha
    );

  insert into public.asignacion_diaria_dirty_queue (
    empleado_id, fecha_inicio, fecha_fin, motivo, payload
  )
  select distinct a.empleado_id, v_fecha, v_fecha + 62,
    'CATALOGO_PDV_SUPERVISOR',
    jsonb_build_object(
      'pdvId', p_pdv_id,
      'supervisorAnteriorId', v_supervisor_anterior_id,
      'supervisorDestinoId', p_supervisor_empleado_id
    )
  from public.asignacion a
  where a.cuenta_cliente_id = p_cuenta_cliente_id
    and a.pdv_id = p_pdv_id
    and a.estado_publicacion = 'PUBLICADA'
    and coalesce(a.fecha_fin, '9999-12-31'::date) >= v_fecha;
  get diagnostics v_empleados = row_count;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'supervisorAnteriorId', v_supervisor_anterior_id,
    'supervisorId', p_supervisor_empleado_id,
    'empleadosEncolados', v_empleados
  );
end;
$$;

create or replace function public.encolar_pdv_asignaciones_operativas(
  p_cuenta_cliente_id uuid,
  p_pdv_id uuid,
  p_motivo text default 'Actualización del PDV'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if not exists (
    select 1 from public.cuenta_cliente_pdv ccp
    where ccp.cuenta_cliente_id = p_cuenta_cliente_id
      and ccp.pdv_id = p_pdv_id
      and ccp.activo
  ) then
    raise exception 'PDV_FUERA_DE_CUENTA';
  end if;

  insert into public.asignacion_diaria_dirty_queue (
    empleado_id, fecha_inicio, fecha_fin, motivo, payload
  )
  select distinct a.empleado_id, current_date, current_date + 62,
    trim(coalesce(p_motivo, 'Actualización del PDV')),
    jsonb_build_object('pdvId', p_pdv_id, 'source', 'pdvs_admin')
  from public.asignacion a
  where a.cuenta_cliente_id = p_cuenta_cliente_id
    and a.pdv_id = p_pdv_id
    and a.estado_publicacion = 'PUBLICADA'
    and coalesce(a.fecha_fin, '9999-12-31'::date) >= current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.programar_reasignacion_supervisor_baja(
  p_cuenta_cliente_id uuid,
  p_supervisor_origen_id uuid,
  p_supervisor_destino_id uuid,
  p_fecha_efectiva date,
  p_usuario_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_fecha_efectiva)::date;
  v_scope_key text := p_cuenta_cliente_id::text || ':' || to_char(p_fecha_efectiva, 'YYYY-MM');
  v_version bigint := 0;
  v_operaciones jsonb;
begin
  if p_supervisor_origen_id = p_supervisor_destino_id then
    raise exception 'SUPERVISORES_IGUALES';
  end if;

  select coalesce(max(version), 0) into v_version
  from public.ui_change_version
  where module = 'asignaciones'
    and surface = 'planeacion_mensual'
    and scope_key = v_scope_key
    and role_target = 'ALL';

  v_operaciones := jsonb_build_array(jsonb_build_object(
    'tipoOperacion', 'REASIGNAR_SUPERVISOR',
    'empleadoId', null,
    'pdvOrigenId', null,
    'pdvDestinoId', null,
    'fechaInicio', p_fecha_efectiva,
    'fechaFin', null,
    'motivo', trim(coalesce(p_motivo, 'Baja de supervisor')),
    'payload', jsonb_build_object(
      'supervisorOrigenId', p_supervisor_origen_id,
      'supervisorDestinoId', p_supervisor_destino_id
    )
  ));

  return public.aplicar_planeacion_mensual(
    p_cuenta_cliente_id,
    v_mes,
    'baja-supervisor-' || p_supervisor_origen_id::text || '-' || p_fecha_efectiva::text,
    v_version,
    v_operaciones,
    p_usuario_id
  );
end;
$$;

revoke all on function public.sincronizar_estado_pdv_operativo(uuid, uuid, text, uuid, text)
from public, anon, authenticated;
revoke all on function public.sincronizar_supervisor_pdv_operativo(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.encolar_pdv_asignaciones_operativas(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.programar_reasignacion_supervisor_baja(uuid, uuid, uuid, date, uuid, text)
from public, anon, authenticated;

grant execute on function public.sincronizar_estado_pdv_operativo(uuid, uuid, text, uuid, text)
to service_role;
grant execute on function public.sincronizar_supervisor_pdv_operativo(uuid, uuid, uuid, uuid, text)
to service_role;
grant execute on function public.encolar_pdv_asignaciones_operativas(uuid, uuid, text)
to service_role;
grant execute on function public.programar_reasignacion_supervisor_baja(uuid, uuid, uuid, date, uuid, text)
to service_role;
