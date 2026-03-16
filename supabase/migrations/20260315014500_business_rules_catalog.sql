insert into public.regla_negocio (
  codigo,
  modulo,
  descripcion,
  severidad,
  prioridad,
  condicion,
  accion,
  activa
)
values
  (
    'JERARQUIA_SUPERVISOR_PDV_EMPLEADO_ASIGNACION',
    'reglas',
    'Hereda supervisor en orden PDV -> EMPLEADO -> ASIGNACION para mantener trazabilidad operativa.',
    'ERROR',
    110,
    jsonb_build_object('sources', jsonb_build_array('PDV', 'EMPLEADO', 'ASIGNACION')),
    jsonb_build_object('persist_to_assignment', true),
    true
  ),
  (
    'JERARQUIA_HORARIO_PRIORIDADES',
    'reglas',
    'Resuelve horario operativo por prioridad: excepcion PDV, base PDV, cadena y fallback global.',
    'ALERTA',
    120,
    jsonb_build_object(
      'levels',
      jsonb_build_array('PDV_FECHA', 'PDV_BASE', 'CADENA_DIA', 'CADENA_BASE', 'GLOBAL')
    ),
    jsonb_build_object(
      'global_fallback',
      jsonb_build_object(
        'label', 'Horario global agencia',
        'hora_entrada', '11:00:00',
        'hora_salida', '19:00:00'
      )
    ),
    true
  ),
  (
    'SOLICITUD_APROBACION_VACACIONES',
    'solicitudes',
    'Vacaciones requieren aprobacion de SUPERVISOR y confirmacion final de COORDINADOR.',
    'ERROR',
    210,
    jsonb_build_object('tipo_solicitud', 'VACACIONES', 'min_notice_days', 30),
    jsonb_build_object(
      'steps',
      jsonb_build_array(
        jsonb_build_object('actor', 'SUPERVISOR', 'target_status', 'VALIDADA_SUP', 'sla_hours', 24),
        jsonb_build_object('actor', 'COORDINADOR', 'target_status', 'REGISTRADA', 'sla_hours', 48)
      )
    ),
    true
  ),
  (
    'SOLICITUD_APROBACION_INCAPACIDAD',
    'solicitudes',
    'Incapacidades pasan por validacion de SUPERVISOR y formalizacion de NOMINA.',
    'ERROR',
    220,
    jsonb_build_object('tipo_solicitud', 'INCAPACIDAD', 'min_notice_days', null),
    jsonb_build_object(
      'steps',
      jsonb_build_array(
        jsonb_build_object('actor', 'SUPERVISOR', 'target_status', 'VALIDADA_SUP', 'sla_hours', 24),
        jsonb_build_object('actor', 'NOMINA', 'target_status', 'REGISTRADA_RH', 'sla_hours', 48)
      )
    ),
    true
  ),
  (
    'SOLICITUD_APROBACION_PERMISO',
    'solicitudes',
    'Permisos ordinarios siguen flujo SUPERVISOR -> COORDINADOR para trazabilidad total.',
    'ERROR',
    230,
    jsonb_build_object('tipo_solicitud', 'PERMISO', 'min_notice_days', 3),
    jsonb_build_object(
      'steps',
      jsonb_build_array(
        jsonb_build_object('actor', 'SUPERVISOR', 'target_status', 'VALIDADA_SUP', 'sla_hours', 24),
        jsonb_build_object('actor', 'COORDINADOR', 'target_status', 'REGISTRADA', 'sla_hours', 48)
      )
    ),
    true
  ),
  (
    'SOLICITUD_APROBACION_CAMBIO_TIENDA',
    'solicitudes',
    'Cambios de tienda se elevan a COORDINADOR tras revision del SUPERVISOR.',
    'ERROR',
    240,
    jsonb_build_object('tipo_solicitud', 'CAMBIO_TIENDA', 'min_notice_days', 0),
    jsonb_build_object(
      'steps',
      jsonb_build_array(
        jsonb_build_object('actor', 'SUPERVISOR', 'target_status', 'VALIDADA_SUP', 'sla_hours', 24),
        jsonb_build_object('actor', 'COORDINADOR', 'target_status', 'APROBADA_FINAL', 'sla_hours', 48)
      )
    ),
    true
  ),
  (
    'SOLICITUD_APROBACION_CUMPLEANOS',
    'solicitudes',
    'Dias de cumpleanos quedan sujetos a aviso previo y aprobacion de COORDINADOR.',
    'ERROR',
    250,
    jsonb_build_object('tipo_solicitud', 'CUMPLEANOS', 'min_notice_days', 30),
    jsonb_build_object(
      'steps',
      jsonb_build_array(
        jsonb_build_object('actor', 'SUPERVISOR', 'target_status', 'VALIDADA_SUP', 'sla_hours', 24),
        jsonb_build_object('actor', 'COORDINADOR', 'target_status', 'REGISTRADA', 'sla_hours', 48)
      )
    ),
    true
  )
on conflict (codigo) do update
set
  modulo = excluded.modulo,
  descripcion = excluded.descripcion,
  severidad = excluded.severidad,
  prioridad = excluded.prioridad,
  condicion = excluded.condicion,
  accion = excluded.accion,
  activa = excluded.activa,
  updated_at = now();