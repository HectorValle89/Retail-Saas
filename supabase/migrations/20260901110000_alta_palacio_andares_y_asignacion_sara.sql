-- Alta controlada de Palacio Andares y corrección permanente de la asignación
-- de Sara Luz Ramírez del Toro desde septiembre de 2026.
--
-- Fuente operativa autorizada:
--   PDV: BTL-PAL-GDL-AND / Palacio Andares
--   DC: 382 / SARA LUZ RAMIREZ DEL TORO
--   Supervisor: 400 / SILVIA BERENICE LOPEZ ESTRADA

begin;

do $$
declare
  v_cuenta_id uuid := '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba'::uuid;
  v_fecha_efectiva date := date '2026-09-01';
  v_sara_id uuid;
  v_silvia_id uuid;
  v_cadena_id uuid;
  v_ciudad_id uuid;
  v_pdv_id uuid;
  v_pdv_origen_id uuid;
  v_asignacion_id uuid;
  v_asistencias integer := 0;
  v_ventas integer := 0;
  v_love integer := 0;
  v_capturas integer := 0;
  v_diarias integer := 0;
begin
  select id into strict v_sara_id
  from public.empleado
  where id_nomina = '382'
    and nombre_completo = 'SARA LUZ RAMIREZ DEL TORO'
    and puesto = 'DERMOCONSEJERO'
    and estatus_laboral = 'ACTIVO';

  select id into strict v_silvia_id
  from public.empleado
  where id_nomina = '400'
    and nombre_completo = 'SILVIA BERENICE LOPEZ ESTRADA'
    and puesto = 'SUPERVISOR'
    and estatus_laboral = 'ACTIVO';

  select id into strict v_cadena_id
  from public.cadena
  where nombre = 'EL PALACIO DE HIERRO'
    and activa;

  select id into strict v_ciudad_id
  from public.ciudad
  where nombre = 'GUADALAJARA'
    and activa;

  insert into public.pdv (
    clave_btl, cadena_id, ciudad_id, id_cadena, nombre, direccion, zona,
    formato, estatus, activo, metadata
  ) values (
    'BTL-PAL-GDL-AND', v_cadena_id, v_ciudad_id, null, 'Palacio Andares',
    'Av. Patria 2085, Puerta de Hierro, 45116 Zapopan, Jal.', 'Occidente',
    'TIENDA ANDARES', 'ACTIVO', true,
    jsonb_build_object(
      'fuente', 'CORRECCION_OPERATIVA_SEPTIEMBRE_2026',
      'codigo_btl', 'BTL-PAL-GDL-AND',
      'sucursal_fuente', 'TIENDA ANDARES',
      'nombre_corto', 'Palacio Andares',
      'territorio', 'GUADALAJARA',
      'entidad_federativa', 'Jalisco',
      'geocerca_metros_fuente', 100,
      'tolerancia_minutos_fuente', 5,
      'supervisor_asignado_fuente', 'LOPEZ ESTRADA SILVIA BERENICE',
      'id_nomina_supervisor_fuente', '400',
      'activo_fuente', 'SI'
    )
  )
  on conflict (clave_btl) do update
  set cadena_id = excluded.cadena_id,
      ciudad_id = excluded.ciudad_id,
      id_cadena = excluded.id_cadena,
      nombre = excluded.nombre,
      direccion = excluded.direccion,
      zona = excluded.zona,
      formato = excluded.formato,
      estatus = excluded.estatus,
      activo = excluded.activo,
      metadata = public.pdv.metadata || excluded.metadata,
      updated_at = timezone('utc', now())
  returning id into v_pdv_id;

  insert into public.cuenta_cliente_pdv (
    cuenta_cliente_id, pdv_id, activo, fecha_inicio, fecha_fin
  ) values (
    v_cuenta_id, v_pdv_id, true, v_fecha_efectiva, null
  )
  on conflict (cuenta_cliente_id, pdv_id, fecha_inicio) do update
  set activo = true,
      fecha_fin = null,
      updated_at = timezone('utc', now());

  update public.pdv_detalle_vigencia
  set cadena_id = v_cadena_id,
      ciudad_id = v_ciudad_id,
      supervisor_empleado_id = v_silvia_id,
      id_cadena = null,
      nombre = 'Palacio Andares',
      direccion = 'Av. Patria 2085, Puerta de Hierro, 45116 Zapopan, Jal.',
      zona = 'Occidente',
      formato = 'TIENDA ANDARES',
      estatus = 'ACTIVO',
      latitud = 20.709032750985994,
      longitud = -103.41116844048715,
      radio_tolerancia_metros = 100,
      tolerancia_minutos = 5,
      dias_fuente = 'LUN-SAB',
      descanso_fuente = 'DOMINGO',
      vigente_hasta = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'fuente', 'CORRECCION_OPERATIVA_SEPTIEMBRE_2026',
        'codigo_btl', 'BTL-PAL-GDL-AND',
        'sucursal_fuente', 'TIENDA ANDARES',
        'nombre_corto', 'Palacio Andares',
        'territorio', 'GUADALAJARA',
        'entidad_federativa', 'Jalisco',
        'geocerca_metros_fuente', 100,
        'tolerancia_minutos_fuente', 5,
        'supervisor_asignado_fuente', 'LOPEZ ESTRADA SILVIA BERENICE',
        'id_nomina_supervisor_fuente', '400',
        'activo_fuente', 'SI'
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta_id
    and pdv_id = v_pdv_id
    and vigente_desde = v_fecha_efectiva;

  if not found then
    insert into public.pdv_detalle_vigencia (
      cuenta_cliente_id, pdv_id, cadena_id, ciudad_id, supervisor_empleado_id,
      id_cadena, nombre, direccion, zona, formato, estatus, latitud, longitud,
      radio_tolerancia_metros, tolerancia_minutos, dias_fuente, descanso_fuente,
      vigente_desde, vigente_hasta, metadata, aplicado_at
    ) values (
      v_cuenta_id, v_pdv_id, v_cadena_id, v_ciudad_id, v_silvia_id,
      null, 'Palacio Andares',
      'Av. Patria 2085, Puerta de Hierro, 45116 Zapopan, Jal.',
      'Occidente', 'TIENDA ANDARES', 'ACTIVO',
      20.709032750985994, -103.41116844048715, 100, 5, 'LUN-SAB', 'DOMINGO',
      v_fecha_efectiva, null,
      jsonb_build_object(
        'fuente', 'CORRECCION_OPERATIVA_SEPTIEMBRE_2026',
        'codigo_btl', 'BTL-PAL-GDL-AND',
        'sucursal_fuente', 'TIENDA ANDARES',
        'nombre_corto', 'Palacio Andares',
        'territorio', 'GUADALAJARA',
        'entidad_federativa', 'Jalisco',
        'geocerca_metros_fuente', 100,
        'tolerancia_minutos_fuente', 5,
        'supervisor_asignado_fuente', 'LOPEZ ESTRADA SILVIA BERENICE',
        'id_nomina_supervisor_fuente', '400',
        'activo_fuente', 'SI'
      ),
      timezone('utc', now())
    );
  end if;

  update public.pdv_estado_vigencia
  set estado = 'ACTIVO',
      vigente_hasta = null,
      motivo = 'ALTA PALACIO ANDARES SEPTIEMBRE 2026',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'codigo_btl', 'BTL-PAL-GDL-AND',
        'origen', 'CORRECCION_OPERATIVA_SEPTIEMBRE_2026'
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta_id
    and pdv_id = v_pdv_id
    and vigente_desde = v_fecha_efectiva;

  if not found then
    insert into public.pdv_estado_vigencia (
      cuenta_cliente_id, pdv_id, estado, vigente_desde, vigente_hasta, motivo, metadata
    ) values (
      v_cuenta_id, v_pdv_id, 'ACTIVO', v_fecha_efectiva, null,
      'ALTA PALACIO ANDARES SEPTIEMBRE 2026',
      jsonb_build_object(
        'codigo_btl', 'BTL-PAL-GDL-AND',
        'origen', 'CORRECCION_OPERATIVA_SEPTIEMBRE_2026'
      )
    );
  end if;

  update public.supervisor_pdv
  set empleado_id = v_silvia_id,
      activo = true,
      fecha_fin = null,
      updated_at = timezone('utc', now())
  where pdv_id = v_pdv_id
    and fecha_inicio = v_fecha_efectiva;

  if not found then
    insert into public.supervisor_pdv (
      pdv_id, empleado_id, activo, fecha_inicio, fecha_fin
    ) values (
      v_pdv_id, v_silvia_id, true, v_fecha_efectiva, null
    );
  end if;

  select id, pdv_id into strict v_asignacion_id, v_pdv_origen_id
  from public.asignacion
  where cuenta_cliente_id = v_cuenta_id
    and empleado_id = v_sara_id
    and fecha_inicio = v_fecha_efectiva
    and estado_publicacion = 'PUBLICADA'
    and tipo = 'FIJA'
  order by created_at desc
  limit 1;

  update public.asignacion
  set pdv_id = v_pdv_id,
      supervisor_empleado_id = v_silvia_id,
      clave_btl = 'BTL-PAL-GDL-AND',
      tipo = 'FIJA',
      factor_tiempo = 1,
      dias_laborales = 'LUN-SAB',
      dia_descanso = 'DOMINGO',
      fecha_fin = null,
      naturaleza = 'BASE',
      retorna_a_base = false,
      prioridad = 100,
      motivo_movimiento = 'ASIGNACION PERMANENTE PALACIO ANDARES',
      observaciones = case
        when coalesce(observaciones, '') like '%Corrección permanente desde 2026-09-01 a Palacio Andares%'
          then observaciones
        else concat_ws(' · ', nullif(observaciones, ''),
          'Corrección permanente desde 2026-09-01 a Palacio Andares')
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'correccion_operativa', jsonb_build_object(
          'version', 1,
          'fecha_efectiva', '2026-09-01',
          'origen_pdv_id', coalesce(
            nullif(metadata #>> '{correccion_operativa,origen_pdv_id}', '')::uuid,
            v_pdv_origen_id
          ),
          'destino_pdv_id', v_pdv_id,
          'tipo', 'ASIGNACION_PERMANENTE',
          'supervisor_empleado_id', v_silvia_id
        )
      ),
      updated_at = timezone('utc', now())
  where id = v_asignacion_id;

  -- La jerarquía de la DC se alinea con el PDV raíz de responsabilidad.
  update public.empleado
  set supervisor_empleado_id = v_silvia_id,
      updated_at = timezone('utc', now())
  where id = v_sara_id
    and supervisor_empleado_id is distinct from v_silvia_id;

  -- Si esta corrección se reaplica después de alguna captura de septiembre,
  -- conserva los IDs y traslada únicamente su dimensión operativa.
  update public.asistencia
  set pdv_id = v_pdv_id,
      pdv_clave_btl = 'BTL-PAL-GDL-AND',
      pdv_nombre = 'Palacio Andares',
      asignacion_id = v_asignacion_id,
      supervisor_empleado_id = v_silvia_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'correccion_operativa_pdv', 'BTL-PAL-GDL-AND'
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta_id
    and empleado_id = v_sara_id
    and pdv_id = v_pdv_origen_id
    and fecha_operacion >= v_fecha_efectiva;
  get diagnostics v_asistencias = row_count;

  update public.venta
  set pdv_id = v_pdv_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_empleado_id', v_silvia_id,
        'correccion_operativa_pdv', 'BTL-PAL-GDL-AND'
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta_id
    and empleado_id = v_sara_id
    and pdv_id = v_pdv_origen_id
    and asistencia_id in (
      select id
      from public.asistencia
      where cuenta_cliente_id = v_cuenta_id
        and empleado_id = v_sara_id
        and pdv_id = v_pdv_id
        and fecha_operacion >= v_fecha_efectiva
    );
  get diagnostics v_ventas = row_count;

  update public.love_isdin
  set pdv_id = v_pdv_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_empleado_id', v_silvia_id,
        'correccion_operativa_pdv', 'BTL-PAL-GDL-AND'
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta_id
    and empleado_id = v_sara_id
    and pdv_id = v_pdv_origen_id
    and asistencia_id in (
      select id
      from public.asistencia
      where cuenta_cliente_id = v_cuenta_id
        and empleado_id = v_sara_id
        and pdv_id = v_pdv_id
        and fecha_operacion >= v_fecha_efectiva
    );
  get diagnostics v_love = row_count;

  update public.captura_publica_registro
  set pdv_id = v_pdv_id,
      pdv_nombre_snapshot = 'Palacio Andares',
      asignacion_id = v_asignacion_id,
      supervisor_empleado_id = v_silvia_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'correccion_operativa_pdv', 'BTL-PAL-GDL-AND'
      ),
      updated_at = timezone('utc', now())
  where cuenta_cliente_id = v_cuenta_id
    and empleado_id = v_sara_id
    and pdv_id = v_pdv_origen_id
    and fecha_operativa >= v_fecha_efectiva;
  get diagnostics v_capturas = row_count;

  -- El materializado sólo se ajusta después de actualizar la asignación fuente.
  -- Se conserva el descanso dominical y cualquier excepción operativa existente.
  update public.asignacion_diaria_resuelta
  set pdv_id = v_pdv_id,
      cuenta_cliente_id = v_cuenta_id,
      supervisor_empleado_id = v_silvia_id,
      referencia_tabla = 'asignacion',
      referencia_id = v_asignacion_id,
      estado_operativo = 'ASIGNADA_PDV',
      origen = 'BASE',
      mensaje_operativo = null,
      laborable = true,
      trabaja_en_tienda = true,
      flags = coalesce(flags, '{}'::jsonb) || jsonb_build_object(
        'zona', 'Occidente',
        'naturaleza_asignacion', 'BASE',
        'pdv_estado_suspendio_asignacion', false,
        'correccion_operativa_pdv', 'BTL-PAL-GDL-AND'
      ),
      refreshed_at = timezone('utc', now())
  where empleado_id = v_sara_id
    and fecha >= v_fecha_efectiva
    and (pdv_id = v_pdv_origen_id or referencia_id = v_asignacion_id)
    and estado_operativo = 'ASIGNADA_PDV';
  get diagnostics v_diarias = row_count;

  insert into public.asignacion_diaria_dirty_queue (
    empleado_id, fecha_inicio, fecha_fin, motivo, payload
  ) values (
    v_sara_id, v_fecha_efectiva, date '2026-12-31',
    'ALTA_PDV_PALACIO_ANDARES_Y_ASIGNACION_PERMANENTE',
    jsonb_build_object(
      'pdv_id', v_pdv_id,
      'asignacion_id', v_asignacion_id,
      'origen_pdv_id', v_pdv_origen_id,
      'supervisor_empleado_id', v_silvia_id
    )
  ) on conflict do nothing;

  -- Renueva únicamente los PDVs afectados. Las cuotas no se inventan: si no
  -- existe una carga comercial para Andares, permanece visible con cuota cero.
  perform public.refrescar_cuota_mensual_resumen(
    v_cuenta_id, v_fecha_efectiva, array[v_pdv_origen_id, v_pdv_id]
  );
  perform public.refrescar_planeacion_mensual_snapshot(
    v_cuenta_id, v_fecha_efectiva, array[v_pdv_origen_id, v_pdv_id]
  );
  perform public.touch_ui_change_version(
    v_cuenta_id, 'asignaciones', 'planeacion_mensual',
    v_cuenta_id::text || ':2026-09', 'ALL', v_sara_id, v_silvia_id,
    'alta_pdv_palacio_andares',
    jsonb_build_object('pdv_id', v_pdv_id, 'asignacion_id', v_asignacion_id)
  );

  insert into public.planeacion_evento_outbox (
    cuenta_cliente_id, evento, mes, payload
  ) values (
    v_cuenta_id, 'PDV_PALACIO_ANDARES_PUBLICADO', v_fecha_efectiva,
    jsonb_build_object(
      'pdv_id', v_pdv_id,
      'clave_btl', 'BTL-PAL-GDL-AND',
      'empleado_id', v_sara_id,
      'supervisor_empleado_id', v_silvia_id,
      'propaga', jsonb_build_array(
        'APP_MOVIL', 'CAPTURA_PUBLICA', 'LOVE_ISDIN', 'CANJES', 'REPORTES', 'RUTA_SEMANAL'
      )
    )
  );

  insert into public.audit_log (
    tabla, registro_id, accion, payload, cuenta_cliente_id
  ) values (
    'asignacion', v_asignacion_id::text, 'EVENTO',
    jsonb_build_object(
      'tipo', 'ALTA_PDV_Y_ASIGNACION_PERMANENTE',
      'fecha_efectiva', v_fecha_efectiva,
      'pdv_id', v_pdv_id,
      'clave_btl', 'BTL-PAL-GDL-AND',
      'empleado_id', v_sara_id,
      'supervisor_empleado_id', v_silvia_id,
      'origen_pdv_id', v_pdv_origen_id,
      'asistencias_trasladadas', v_asistencias,
      'ventas_trasladadas', v_ventas,
      'love_isdin_trasladados', v_love,
      'capturas_publicas_trasladadas', v_capturas,
      'dias_materializados_actualizados', v_diarias,
      'cuota', 'PENDIENTE_DE_CARGA_COMERCIAL'
    ),
    v_cuenta_id
  );
end;
$$;

commit;
