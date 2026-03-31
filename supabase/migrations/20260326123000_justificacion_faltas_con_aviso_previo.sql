-- =====================================================
-- Justificacion de faltas con aviso previo
-- Objetivo:
--   habilitar aviso de inasistencia previo y justificacion
--   posterior con receta IMSS obligatoria.
-- =====================================================

alter table public.solicitud
  drop constraint if exists solicitud_tipo_check;

alter table public.solicitud
  add constraint solicitud_tipo_check
  check (
    tipo in (
      'INCAPACIDAD',
      'VACACIONES',
      'PERMISO',
      'AVISO_INASISTENCIA',
      'JUSTIFICACION_FALTA'
    )
  );

alter table public.solicitud
  drop constraint if exists solicitud_estatus_check;

alter table public.solicitud
  add constraint solicitud_estatus_check
  check (
    estatus in (
      'BORRADOR',
      'ENVIADA',
      'VALIDADA_SUP',
      'REGISTRADA_RH',
      'REGISTRADA',
      'RECHAZADA',
      'CORRECCION_SOLICITADA'
    )
  );

create index if not exists idx_solicitud_tipo_empleado_fecha
on public.solicitud(tipo, empleado_id, fecha_inicio desc);

