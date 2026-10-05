import type {
  PlaneacionMensualOperacion,
  PlaneacionMensualTipoOperacion,
} from '@/features/asignaciones/types/planeacionMensual';

export interface PlaneacionOperacionValidationIssue {
  code: string;
  field: string;
}

const EMPLOYEE_OPERATIONS = new Set<PlaneacionMensualTipoOperacion>([
  'ASIGNAR_DC',
  'LIBERAR_DC',
  'MOVER_DC',
  'CAMBIAR_DESCANSO',
  'CAMBIAR_HORARIO',
  'AGREGAR_EVENTO',
]);

const ORIGIN_PDV_OPERATIONS = new Set<PlaneacionMensualTipoOperacion>([
  'LIBERAR_DC',
  'MOVER_DC',
  'CAMBIAR_ROTACION',
  'CAMBIAR_DESCANSO',
  'CAMBIAR_HORARIO',
  'CAMBIAR_ESTADO_PDV',
]);

const DESTINATION_PDV_OPERATIONS = new Set<PlaneacionMensualTipoOperacion>([
  'ASIGNAR_DC',
  'MOVER_DC',
]);

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DIRECT_SCHEDULE_PATTERN = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
const STANDARD_SCHEDULES = new Set(['M', 'TCM', 'TC', 'TC_12', 'TCV', 'V1', 'V', 'ES1/ACT', 'CAP', 'VC']);

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidPlaneacionSchedule(value: unknown) {
  if (!hasText(value)) return false;
  const normalized = value.trim().toUpperCase();
  return STANDARD_SCHEDULES.has(normalized) || DIRECT_SCHEDULE_PATTERN.test(normalized);
}

export function validatePlaneacionMensualOperacion(
  operation: PlaneacionMensualOperacion
): PlaneacionOperacionValidationIssue[] {
  const issues: PlaneacionOperacionValidationIssue[] = [];
  const payload = operation.payload ?? {};

  if (!ISO_DATE_PATTERN.test(operation.fechaInicio)) {
    issues.push({ code: 'FECHA_INICIO_INVALIDA', field: 'fechaInicio' });
  }
  if (operation.fechaFin && !ISO_DATE_PATTERN.test(operation.fechaFin)) {
    issues.push({ code: 'FECHA_FIN_INVALIDA', field: 'fechaFin' });
  }
  if (operation.fechaFin && operation.fechaFin < operation.fechaInicio) {
    issues.push({ code: 'RANGO_INVALIDO', field: 'fechaFin' });
  }
  if (!hasText(operation.motivo)) {
    issues.push({ code: 'MOTIVO_REQUERIDO', field: 'motivo' });
  }
  if (EMPLOYEE_OPERATIONS.has(operation.tipoOperacion) && !hasText(operation.empleadoId)) {
    issues.push({ code: 'DC_REQUERIDA', field: 'empleadoId' });
  }
  if (ORIGIN_PDV_OPERATIONS.has(operation.tipoOperacion) && !hasText(operation.pdvOrigenId)) {
    issues.push({ code: 'PDV_ORIGEN_REQUERIDO', field: 'pdvOrigenId' });
  }
  if (
    DESTINATION_PDV_OPERATIONS.has(operation.tipoOperacion) &&
    !hasText(operation.pdvDestinoId)
  ) {
    issues.push({ code: 'PDV_DESTINO_REQUERIDO', field: 'pdvDestinoId' });
  }
  if (
    operation.tipoOperacion === 'MOVER_DC' &&
    operation.pdvOrigenId === operation.pdvDestinoId
  ) {
    issues.push({ code: 'PDV_ORIGEN_DESTINO_IGUALES', field: 'pdvDestinoId' });
  }
  if (operation.tipoOperacion === 'CAMBIAR_ROTACION') {
    if (payload.tipo !== 'FIJA' && payload.tipo !== 'ROTATIVA') {
      issues.push({ code: 'ROTACION_INVALIDA', field: 'payload.tipo' });
    }
    if (payload.tipo === 'ROTATIVA' && !hasText(payload.grupoRotacion)) {
      issues.push({ code: 'GRUPO_ROTACION_REQUERIDO', field: 'payload.grupoRotacion' });
    }
    if (payload.tipo === 'ROTATIVA' && ![2, 3].includes(payload.grupoTamano ?? 0)) {
      issues.push({ code: 'GRUPO_TAMANO_INVALIDO', field: 'payload.grupoTamano' });
    }
    if (payload.tipo === 'ROTATIVA' && !['A', 'B', 'C'].includes(payload.slotRotacion ?? '')) {
      issues.push({ code: 'SLOT_ROTACION_INVALIDO', field: 'payload.slotRotacion' });
    }
    if (payload.grupoTamano === 2 && payload.slotRotacion === 'C') {
      issues.push({ code: 'SLOT_ROTACION_FUERA_DE_GRUPO', field: 'payload.slotRotacion' });
    }
  }
  if (
    operation.tipoOperacion === 'CAMBIAR_HORARIO' &&
    !isValidPlaneacionSchedule(payload.horarioReferencia)
  ) {
    issues.push({ code: 'HORARIO_INVALIDO', field: 'payload.horarioReferencia' });
  }
  if (
    operation.tipoOperacion === 'CAMBIAR_DESCANSO' &&
    !hasText(payload.diaDescanso) &&
    !(payload.fechasDescanso?.length || payload.fechasTrabajo?.length)
  ) {
    issues.push({ code: 'DESCANSO_REQUERIDO', field: 'payload.diaDescanso' });
  }
  if (
    operation.tipoOperacion === 'CAMBIAR_ESTADO_PDV' &&
    !['ACTIVO', 'PAUSADO', 'INACTIVO'].includes(payload.estadoPdv ?? '')
  ) {
    issues.push({ code: 'ESTADO_PDV_INVALIDO', field: 'payload.estadoPdv' });
  }
  if (operation.tipoOperacion === 'AGREGAR_EVENTO') {
    if (!hasText(payload.eventoNombre)) {
      issues.push({ code: 'EVENTO_NOMBRE_REQUERIDO', field: 'payload.eventoNombre' });
    }
    if (!operation.fechaFin) {
      issues.push({ code: 'EVENTO_FIN_REQUERIDO', field: 'fechaFin' });
    }
  }
  if (operation.tipoOperacion === 'REASIGNAR_SUPERVISOR') {
    if (!hasText(payload.supervisorOrigenId)) {
      issues.push({ code: 'SUPERVISOR_ORIGEN_REQUERIDO', field: 'payload.supervisorOrigenId' });
    }
    if (!hasText(payload.supervisorDestinoId)) {
      issues.push({ code: 'SUPERVISOR_DESTINO_REQUERIDO', field: 'payload.supervisorDestinoId' });
    }
    if (payload.supervisorOrigenId === payload.supervisorDestinoId) {
      issues.push({ code: 'SUPERVISORES_IGUALES', field: 'payload.supervisorDestinoId' });
    }
  }

  return issues;
}

export function collectPlaneacionMensualOperationPdvIds(
  operations: PlaneacionMensualOperacion[]
) {
  return [
    ...new Set(
      operations.flatMap((operation) =>
        [operation.pdvOrigenId, operation.pdvDestinoId].filter(hasText)
      )
    ),
  ];
}
