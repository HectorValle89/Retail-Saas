-- Traslado controlado de la operación de Felisa Judith Rodriguez Salinas
-- desde Sanborns Toluca a Sanborns Galerías Metepec para agosto de 2026.

begin;

do $$
declare
  v_cuenta uuid;
  v_felisa uuid;
  v_supervisor uuid;
  v_metepec uuid;
  v_toluca uuid;
  v_asignacion uuid;
  v_count integer;
  v_count_asistencias integer := 0;
  v_count_ventas integer := 0;
  v_count_love integer := 0;
  v_count_capturas integer := 0;
  v_count_resueltas integer := 0;
  v_detalle record;
begin
  select id into strict v_felisa
  from public.empleado
  where nombre_completo = 'FELISA JUDITH RODRIGUEZ SALINAS';

  select id into strict v_metepec
  from public.pdv
  where clave_btl = 'BTL-SAN-GALM-ME';

  select id into strict v_toluca
  from public.pdv
  where clave_btl = 'BTL-SAN-TOLU-01';

  select cuenta_cliente_id, supervisor_empleado_id, id
  into strict v_cuenta, v_supervisor, v_asignacion
  from public.asignacion
  where empleado_id = v_felisa
    and pdv_id = v_toluca
    and fecha_inicio = date '2026-08-01'
    and fecha_fin = date '2026-08-31'
    and estado_publicacion = 'PUBLICADA'
  order by created_at desc
  limit 1;

  -- El PDV maestro conserva su baja histórica; la versión efectiva de agosto
  -- se publica en las capas versionadas que consume el formulario.
  insert into public.cuenta_cliente_pdv (cuenta_cliente_id, pdv_id, activo, fecha_inicio, fecha_fin)
  values (v_cuenta, v_metepec, true, date '2026-08-01', date '2026-08-31')
  on conflict (cuenta_cliente_id, pdv_id, fecha_inicio) do update
    set activo = excluded.activo,
        fecha_fin = excluded.fecha_fin,
        updated_at = timezone('utc', now());

  select * into strict v_detalle
  from public.pdv_detalle_vigencia
  where cuenta_cliente_id = v_cuenta
    and pdv_id = v_metepec
    and vigente_desde = date '2026-09-01'
  order by created_at desc
  limit 1;

  insert into public.pdv_detalle_vigencia (
    cuenta_cliente_id, lote_id, pdv_id, cadena_id, ciudad_id,
    supervisor_empleado_id, id_cadena, nombre, direccion, zona, formato,
    estatus, latitud, longitud, radio_tolerancia_metros, tolerancia_minutos,
    dias_fuente, descanso_fuente, vigente_desde, vigente_hasta, fila_origen,
    metadata, aplicado_at
  ) values (
    v_detalle.cuenta_cliente_id, v_detalle.lote_id, v_detalle.pdv_id,
    v_detalle.cadena_id, v_detalle.ciudad_id, v_supervisor,
    v_detalle.id_cadena, 'Sanborns Galerías Metepec', v_detalle.direccion,
    v_detalle.zona, v_detalle.formato, 'ACTIVO', v_detalle.latitud,
    v_detalle.longitud, v_detalle.radio_tolerancia_metros,
    v_detalle.tolerancia_minutos, v_detalle.dias_fuente,
    v_detalle.descanso_fuente, date '2026-08-01', date '2026-08-31',
    v_detalle.fila_origen,
    coalesce(v_detalle.metadata, '{}'::jsonb) || jsonb_build_object(
      'traslado_operativo', jsonb_build_object(
        'version', 1,
        'origen_pdv_id', v_toluca,
        'destino_pdv_id', v_metepec,
        'fecha_inicio', '2026-08-01',
        'fecha_fin', '2026-08-31'
      )
    ),
    timezone('utc', now())
  )
  on conflict (cuenta_cliente_id, pdv_id, vigente_desde) do update
    set vigente_hasta = excluded.vigente_hasta,
        supervisor_empleado_id = excluded.supervisor_empleado_id,
        nombre = excluded.nombre,
        estatus = excluded.estatus,
        metadata = excluded.metadata,
        updated_at = timezone('utc', now());

  insert into public.supervisor_pdv (pdv_id, empleado_id, activo, fecha_inicio, fecha_fin)
  values (v_metepec, v_supervisor, true, date '2026-08-01', date '2026-08-31')
  on conflict do nothing;

  -- Traslada la asignación de agosto sin crear una segunda identidad histórica.
  update public.asignacion
  set pdv_id = v_metepec,
      clave_btl = 'BTL-SAN-GALM-ME',
      supervisor_empleado_id = v_supervisor,
      observaciones = concat_ws(' · ', observaciones, 'Traslado operativo agosto 2026 a Sanborns Galerías Metepec'),
      motivo_movimiento = coalesce(motivo_movimiento, 'TRASLADO FELISA AGOSTO 2026'),
      updated_at = timezone('utc', now())
  where empleado_id = v_felisa
    and fecha_inicio = date '2026-08-01';

  update public.asistencia
  set pdv_id = v_metepec,
      pdv_clave_btl = 'BTL-SAN-GALM-ME',
      pdv_nombre = 'Sanborns Galerías Metepec',
      asignacion_id = v_asignacion,
      supervisor_empleado_id = v_supervisor,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'traslado_operativo', jsonb_build_object(
          'version', 1,
          'origen_pdv_id', v_toluca,
          'destino_pdv_id', v_metepec,
          'supervisor_empleado_id', v_supervisor,
          'fecha_inicio', '2026-08-01',
          'fecha_fin', '2026-08-31'
        )
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_felisa
    and pdv_id = v_toluca
    and fecha_operacion between date '2026-08-01' and date '2026-08-31';
  get diagnostics v_count_asistencias = row_count;

  update public.venta
  set pdv_id = v_metepec,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_empleado_id', v_supervisor,
        'traslado_operativo', jsonb_build_object(
          'version', 1,
          'origen_pdv_id', v_toluca,
          'destino_pdv_id', v_metepec,
          'fecha_inicio', '2026-08-01',
          'fecha_fin', '2026-08-31'
        )
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_felisa
    and pdv_id = v_toluca
    and asistencia_id in (
      select id
      from public.asistencia
      where cuenta_cliente_id = v_cuenta
        and empleado_id = v_felisa
        and pdv_id = v_metepec
        and fecha_operacion between date '2026-08-01' and date '2026-08-31'
    );
  get diagnostics v_count_ventas = row_count;

  update public.love_isdin
  set pdv_id = v_metepec,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_empleado_id', v_supervisor,
        'traslado_operativo', jsonb_build_object(
          'version', 1,
          'origen_pdv_id', v_toluca,
          'destino_pdv_id', v_metepec,
          'fecha_inicio', '2026-08-01',
          'fecha_fin', '2026-08-31'
        )
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_felisa
    and pdv_id = v_toluca
    and asistencia_id in (
      select id
      from public.asistencia
      where cuenta_cliente_id = v_cuenta
        and empleado_id = v_felisa
        and pdv_id = v_metepec
        and fecha_operacion between date '2026-08-01' and date '2026-08-31'
    );
  get diagnostics v_count_love = row_count;

  update public.captura_publica_registro
  set pdv_id = v_metepec,
      pdv_nombre_snapshot = 'Sanborns Galerías Metepec',
      asignacion_id = v_asignacion,
      supervisor_empleado_id = v_supervisor,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'traslado_operativo', jsonb_build_object(
          'version', 1,
          'origen_pdv_id', v_toluca,
          'destino_pdv_id', v_metepec,
          'supervisor_empleado_id', v_supervisor,
          'fecha_inicio', '2026-08-01',
          'fecha_fin', '2026-08-31'
        )
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta
    and empleado_id = v_felisa
    and pdv_id = v_toluca
    and fecha_operativa between date '2026-08-01' and date '2026-08-31';
  get diagnostics v_count_capturas = row_count;

  update public.asignacion_diaria_resuelta
  set pdv_id = v_metepec,
      cuenta_cliente_id = v_cuenta,
      supervisor_empleado_id = v_supervisor,
      referencia_tabla = 'asignacion',
      referencia_id = v_asignacion,
      mensaje_operativo = null,
      estado_operativo = 'ASIGNADA_PDV',
      origen = 'BASE',
      laborable = true,
      trabaja_en_tienda = true,
      refreshed_at = timezone('utc', now())
  where empleado_id = v_felisa
    and fecha between date '2026-08-01' and date '2026-08-31'
    and pdv_id = v_toluca;
  get diagnostics v_count_resueltas = row_count;

  insert into public.audit_log (tabla, registro_id, accion, payload, usuario_id, cuenta_cliente_id)
  values (
    'asignacion',
    v_asignacion::text,
    'EVENTO',
    jsonb_build_object(
      'tipo', 'TRASLADO_HISTORICO_AGOSTO_2026',
      'empleado_id', v_felisa,
      'origen_pdv_id', v_toluca,
      'destino_pdv_id', v_metepec,
      'supervisor_empleado_id', v_supervisor,
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
