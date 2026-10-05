-- Traslado controlado de la operación de Olga Elizabeth Rodriguez Bailon
-- desde Palacio Polanco a Palacio Durango para agosto de 2026.
-- Conserva los IDs históricos y solo corrige la dimensión operativa (PDV/supervisor).

begin;

do $$
declare
  v_cuenta uuid;
  v_olga uuid;
  v_miguel uuid;
  v_durango uuid;
  v_polanco uuid;
  v_asignacion uuid;
  v_count integer;
  v_count_asistencias integer := 0;
  v_count_ventas integer := 0;
  v_count_love integer := 0;
  v_count_capturas integer := 0;
  v_count_resueltas integer := 0;
begin
  select id into strict v_olga
  from public.empleado
  where nombre_completo = 'OLGA ELIZABETH RODRIGUEZ BAILON';

  select id into strict v_miguel
  from public.empleado
  where nombre_completo = 'MIGUEL ANGEL MONTAGNER OLIVARES';

  select id into strict v_durango
  from public.pdv
  where clave_btl = 'BTL-PAL-DURA-0M';

  select id into strict v_polanco
  from public.pdv
  where clave_btl = 'BTL-PAL-POLA-MF';

  select cuenta_cliente_id, id
  into strict v_cuenta, v_asignacion
  from public.asignacion
  where empleado_id = v_olga
    and pdv_id = v_durango
    and fecha_inicio = date '2026-08-01'
    and fecha_fin = date '2026-08-31'
    and estado_publicacion = 'PUBLICADA'
  order by created_at desc
  limit 1;

  -- Normaliza el nombre visible para distinguirlo de cualquier otra tienda Durango.
  update public.pdv
  set nombre = 'Palacio Durango',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'nombre_normalizado', 'Palacio Durango',
        'nombre_normalizado_motivo', 'Traslado operativo Olga agosto 2026'
      ),
      updated_at = timezone('utc', now())
  where id = v_durango
    and nombre <> 'Palacio Durango';

  -- El plan publicado de agosto y sus duplicados importados deben heredar al supervisor correcto.
  update public.asignacion
  set supervisor_empleado_id = v_miguel,
      observaciones = concat_ws(' · ', observaciones, 'Traslado operativo agosto 2026 a MIGUEL ANGEL MONTAGNER OLIVARES'),
      motivo_movimiento = coalesce(motivo_movimiento, 'TRASLADO OLGA AGOSTO 2026'),
      updated_at = timezone('utc', now())
  where empleado_id = v_olga
    and pdv_id = v_durango
    and fecha_inicio = date '2026-08-01';

  -- El supervisor efectivo del PDV también se versiona para los fallback de atribución.
  update public.supervisor_pdv
  set empleado_id = v_miguel,
      updated_at = timezone('utc', now())
  where pdv_id = v_durango
    and fecha_inicio = date '2026-08-01'
    and fecha_fin = date '2026-08-31';

  get diagnostics v_count = row_count;
  if v_count = 0 then
    insert into public.supervisor_pdv (pdv_id, empleado_id, activo, fecha_inicio, fecha_fin)
    values (v_durango, v_miguel, true, date '2026-08-01', date '2026-08-31');
  end if;

  -- Primero se mueven las jornadas para que las filas derivadas puedan seguir su FK histórica.
  update public.asistencia
  set pdv_id = v_durango,
      pdv_clave_btl = 'BTL-PAL-DURA-0M',
      pdv_nombre = 'Palacio Durango',
      asignacion_id = v_asignacion,
      supervisor_empleado_id = v_miguel,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'traslado_operativo', jsonb_build_object(
          'version', 1,
          'origen_pdv_id', v_polanco,
          'destino_pdv_id', v_durango,
          'supervisor_empleado_id', v_miguel,
          'fecha_inicio', '2026-08-01',
          'fecha_fin', '2026-08-31'
        )
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_olga
    and pdv_id = v_polanco
    and fecha_operacion between date '2026-08-01' and date '2026-08-31';
  get diagnostics v_count_asistencias = row_count;

  update public.venta
  set pdv_id = v_durango,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_empleado_id', v_miguel,
        'traslado_operativo', jsonb_build_object(
          'version', 1,
          'origen_pdv_id', v_polanco,
          'destino_pdv_id', v_durango,
          'fecha_inicio', '2026-08-01',
          'fecha_fin', '2026-08-31'
        )
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_olga
    and pdv_id = v_polanco
    and asistencia_id in (
      select id
      from public.asistencia
      where cuenta_cliente_id = v_cuenta
        and empleado_id = v_olga
        and pdv_id = v_durango
        and fecha_operacion between date '2026-08-01' and date '2026-08-31'
    );
  get diagnostics v_count_ventas = row_count;

  update public.love_isdin
  set pdv_id = v_durango,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_empleado_id', v_miguel,
        'traslado_operativo', jsonb_build_object(
          'version', 1,
          'origen_pdv_id', v_polanco,
          'destino_pdv_id', v_durango,
          'fecha_inicio', '2026-08-01',
          'fecha_fin', '2026-08-31'
        )
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_olga
    and pdv_id = v_polanco
    and asistencia_id in (
      select id
      from public.asistencia
      where cuenta_cliente_id = v_cuenta
        and empleado_id = v_olga
        and pdv_id = v_durango
        and fecha_operacion between date '2026-08-01' and date '2026-08-31'
    );
  get diagnostics v_count_love = row_count;

  update public.captura_publica_registro
  set pdv_id = v_durango,
      asignacion_id = v_asignacion,
      supervisor_empleado_id = v_miguel,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'traslado_operativo', jsonb_build_object(
          'version', 1,
          'origen_pdv_id', v_polanco,
          'destino_pdv_id', v_durango,
          'supervisor_empleado_id', v_miguel,
          'fecha_inicio', '2026-08-01',
          'fecha_fin', '2026-08-31'
        )
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_olga
    and pdv_id = v_polanco
    and fecha_operativa between date '2026-08-01' and date '2026-08-31';
  get diagnostics v_count_capturas = row_count;

  -- Mantiene alineada la proyección diaria que consumen app, planeación y supervisión.
  update public.asignacion_diaria_resuelta
  set supervisor_empleado_id = v_miguel,
      refreshed_at = timezone('utc', now())
  where empleado_id = v_olga
    and fecha between date '2026-08-01' and date '2026-08-31';

  update public.asignacion_diaria_resuelta
  set pdv_id = v_durango,
      cuenta_cliente_id = v_cuenta,
      supervisor_empleado_id = v_miguel,
      referencia_tabla = 'asignacion',
      referencia_id = v_asignacion,
      mensaje_operativo = null,
      estado_operativo = 'ASIGNADA_PDV',
      origen = 'BASE',
      laborable = true,
      trabaja_en_tienda = true,
      flags = coalesce(flags, '{}'::jsonb) || jsonb_build_object(
        'zona', 'Centro',
        'naturaleza_asignacion', 'BASE',
        'pdv_estado_suspendio_asignacion', false
      ),
      refreshed_at = timezone('utc', now())
  where empleado_id = v_olga
    and fecha between date '2026-08-01' and date '2026-08-31'
    and (pdv_id = v_polanco or pdv_id = v_durango);
  get diagnostics v_count_resueltas = row_count;

  insert into public.audit_log (tabla, registro_id, accion, payload, usuario_id, cuenta_cliente_id)
  values (
    'asignacion',
    v_asignacion::text,
    'EVENTO',
    jsonb_build_object(
      'empleado_id', v_olga,
      'origen_pdv_id', v_polanco,
      'destino_pdv_id', v_durango,
      'supervisor_empleado_id', v_miguel,
      'asistencias', v_count_asistencias,
      'ventas', v_count_ventas,
      'love_isdin', v_count_love,
      'capturas', v_count_capturas,
      'asignaciones_diarias', v_count_resueltas,
      'fecha_inicio', '2026-08-01',
      'fecha_fin', '2026-08-31'
    ),
    null,
    v_cuenta
  );
end;
$$;

commit;
