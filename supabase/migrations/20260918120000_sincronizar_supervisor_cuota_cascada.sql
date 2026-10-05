-- Migración: Sincronización en cascada de cuotas de supervisión y reconciliación de PDVs
-- Fecha: 2026-09-18
-- Objetivo: Garantizar coincidencia bidireccional entre catálogo (supervisor_pdv), asignaciones y cuotas (ruta_cuota_supervisor_pdv).

-- 1. Reconciliación de datos actuales: F Ahorro Luis Barragán (BTL-FAH-LUIS-9S)
-- Supervisor activo: MARIA ZENAIDA MONROY GONZALEZ (d70024f8-7f51-4085-a3c6-cf2ab77e5b16)
do $$
declare
  v_cuenta_id uuid := '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba';
  v_pdv_luis uuid := 'ecf82ab1-727c-474d-af74-488cc3a9d34f';
  v_zenaida_id uuid := 'd70024f8-7f51-4085-a3c6-cf2ab77e5b16';
  v_jacqueline_id uuid := '6a95ae3b-2266-49b1-b67f-52f6e3e6b810';
  v_pdv_prado uuid := '88c7eab9-6b26-42c4-9d7d-edb9ddb1f3ec';
begin
  -- Luis Barragán: Desactivar asignación histórica en supervisor_pdv para Jacqueline
  update public.supervisor_pdv
  set activo = false,
      updated_at = now()
  where pdv_id = v_pdv_luis
    and empleado_id = v_jacqueline_id
    and fecha_fin is not null
    and fecha_fin < '2026-09-17';

  -- Luis Barragán: Eliminar cuota huérfana de Jacqueline en septiembre
  delete from public.ruta_cuota_supervisor_pdv
  where pdv_id = v_pdv_luis
    and supervisor_empleado_id = v_jacqueline_id
    and vigente_desde = '2026-09-01';

  -- Luis Barragán: Crear/activar cuota para Zenaida en septiembre
  insert into public.ruta_cuota_supervisor_pdv (
    cuenta_cliente_id, supervisor_empleado_id, pdv_id, visitas_mensuales, vigente_desde, vigente_hasta, metadata
  ) values (
    v_cuenta_id, v_zenaida_id, v_pdv_luis, 6, '2026-09-01', null,
    jsonb_build_object('origen', 'RECONCILIACION_CATALOGO_LUIS_BARRAGAN', 'fecha', now())
  )
  on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
  do update set vigente_hasta = null, visitas_mensuales = 6, updated_at = now();

  -- S Pablo Prado Norte: Eliminar cuota de Zenaida en septiembre
  delete from public.ruta_cuota_supervisor_pdv
  where pdv_id = v_pdv_prado
    and supervisor_empleado_id = v_zenaida_id
    and vigente_desde = '2026-09-01';

  -- S Pablo Prado Norte: Crear/activar cuota para Jacqueline en septiembre
  insert into public.ruta_cuota_supervisor_pdv (
    cuenta_cliente_id, supervisor_empleado_id, pdv_id, visitas_mensuales, vigente_desde, vigente_hasta, metadata
  ) values (
    v_cuenta_id, v_jacqueline_id, v_pdv_prado, 6, '2026-09-01', null,
    jsonb_build_object('origen', 'RECONCILIACION_CATALOGO_PRADO_NORTE', 'fecha', now())
  )
  on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
  do update set vigente_hasta = null, visitas_mensuales = 6, updated_at = now();

  -- Sincronizar cuotas para todos los PDVs activos en supervisor_pdv que no tengan cuota en septiembre
  insert into public.ruta_cuota_supervisor_pdv (
    cuenta_cliente_id, supervisor_empleado_id, pdv_id, visitas_mensuales, vigente_desde, vigente_hasta, metadata
  )
  select distinct
    v_cuenta_id,
    sp.empleado_id,
    sp.pdv_id,
    coalesce(
      (select rc_prev.visitas_mensuales
       from public.ruta_cuota_supervisor_pdv rc_prev
       where rc_prev.pdv_id = sp.pdv_id and rc_prev.visitas_mensuales > 0
       order by rc_prev.created_at desc limit 1),
      4
    ),
    '2026-09-01'::date,
    null::date,
    jsonb_build_object('origen', 'RECONCILIACION_MASIVA_CATALOGO', 'fecha', now())
  from public.supervisor_pdv sp
  join public.pdv p on p.id = sp.pdv_id and p.activo = true
  join public.cuenta_cliente_pdv ccp on ccp.pdv_id = p.id and ccp.activo = true and ccp.cuenta_cliente_id = v_cuenta_id
  where sp.activo = true
    and (sp.fecha_fin is null or sp.fecha_fin >= '2026-09-17')
    and not exists (
      select 1
      from public.ruta_cuota_supervisor_pdv rc
      where rc.pdv_id = sp.pdv_id
        and rc.supervisor_empleado_id = sp.empleado_id
        and (rc.vigente_hasta is null or rc.vigente_hasta >= '2026-09-17')
        and rc.vigente_desde <= '2026-09-17'
    )
  on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
  do update set vigente_hasta = null, updated_at = now();

end $$;

-- 2. Actualización de la función RPC para que toda reasignación en catálogo mantenga sincronizadas las cuotas
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
  v_mes_inicio date := date_trunc('month', current_date)::date;
  v_supervisor_anterior_id uuid;
  v_empleados integer := 0;
  v_cuota_visitas integer := 4;
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

  -- 1. Cerrar asignación anterior en supervisor_pdv
  update public.supervisor_pdv
  set activo = false,
      fecha_fin = case when fecha_inicio < v_fecha then v_fecha - 1 else fecha_inicio end,
      updated_at = now()
  where pdv_id = p_pdv_id and activo;

  -- 2. Insertar o activar asignación nueva en supervisor_pdv
  insert into public.supervisor_pdv (
    pdv_id, empleado_id, activo, fecha_inicio, fecha_fin
  ) values (
    p_pdv_id, p_supervisor_empleado_id, true, v_fecha, null
  )
  on conflict (pdv_id, empleado_id, fecha_inicio) do update
    set activo = true, fecha_fin = null, updated_at = now();

  -- 3. Actualizar asignación de dermoconsejeras en nivel central
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

  -- 4. Actualizar empleado (supervisor asignado)
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

  -- 5. Sincronizar ruta_cuota_supervisor_pdv (Cerrar cuota previa y activar nueva)
  select coalesce(
    (select visitas_mensuales
     from public.ruta_cuota_supervisor_pdv
     where pdv_id = p_pdv_id and visitas_mensuales > 0
     order by created_at desc limit 1),
    4
  ) into v_cuota_visitas;

  update public.ruta_cuota_supervisor_pdv
  set vigente_hasta = case
        when vigente_desde < v_mes_inicio
        then v_mes_inicio - 1
        else vigente_desde
      end,
      updated_at = now()
  where pdv_id = p_pdv_id
    and cuenta_cliente_id = p_cuenta_cliente_id
    and supervisor_empleado_id <> p_supervisor_empleado_id
    and (vigente_hasta is null or vigente_hasta >= v_mes_inicio);

  insert into public.ruta_cuota_supervisor_pdv (
    cuenta_cliente_id,
    supervisor_empleado_id,
    pdv_id,
    visitas_mensuales,
    vigente_desde,
    vigente_hasta,
    metadata
  ) values (
    p_cuenta_cliente_id,
    p_supervisor_empleado_id,
    p_pdv_id,
    v_cuota_visitas,
    v_mes_inicio,
    null,
    jsonb_build_object(
      'origen', 'SINCRONIZAR_SUPERVISOR_PDV_OPERATIVO',
      'supervisor_anterior_id', v_supervisor_anterior_id,
      'motivo', p_motivo,
      'fecha_efectiva', v_fecha
    )
  )
  on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
  do update set
    vigente_hasta = null,
    visitas_mensuales = excluded.visitas_mensuales,
    updated_at = now();

  -- 6. Encolar para regeneración de asignación diaria resuelta
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
