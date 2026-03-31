import type { Puesto, Solicitud } from '@/types/database'
import {
  resolveAssignmentsForDate,
  type AssignmentEngineNature,
  type AssignmentScheduleLike,
} from '@/features/asignaciones/lib/assignmentEngine'
import { formacionTargetsEmployee } from '@/features/formaciones/lib/formacionTargeting'

export type AsignacionOperativaEstado =
  | 'FORMACION'
  | 'INCAPACIDAD'
  | 'VACACIONES'
  | 'FALTA_JUSTIFICADA'
  | 'ASIGNADA_PDV'
  | 'SIN_ASIGNACION'

export type AsignacionOperativaOrigen =
  | 'FORMACION'
  | 'INCAPACIDAD'
  | 'VACACIONES'
  | 'JUSTIFICACION'
  | 'COBERTURA_TEMPORAL'
  | 'COBERTURA_PERMANENTE'
  | 'BASE'
  | 'NINGUNO'

export interface EffectiveAssignmentRequestLike {
  id: string
  empleadoId: string
  fechaInicio: string
  fechaFin: string
  tipo: Solicitud['tipo'] | string
  estatus: Solicitud['estatus'] | string
  metadata: Record<string, unknown> | null | undefined
}

export interface EffectiveAssignmentFormationLike {
  id: string
  fechaInicio: string
  fechaFin: string
  estado: string
  nombre?: string | null
  tipo?: string | null
  sede?: string | null
  participantes?: Array<Record<string, unknown>> | null
  metadata?: Record<string, unknown> | null
}

export interface EffectiveAssignmentEmployeeContext {
  empleadoId: string
  puesto: Puesto | null
  pdvIds: string[]
}

export interface EffectiveAssignmentResolved {
  empleadoId: string
  fecha: string
  estadoOperativo: AsignacionOperativaEstado
  origen: AsignacionOperativaOrigen
  pdvId: string | null
  supervisorEmpleadoId: string | null
  cuentaClienteId: string | null
  referenciaId: string | null
  horarioEsperadoId: string | null
  mensajeOperativo: string | null
  assignment: AssignmentScheduleLike | null
  request: EffectiveAssignmentRequestLike | null
  formation: EffectiveAssignmentFormationLike | null
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

function isDateInRange(date: string, start: string, end: string | null) {
  const effectiveEnd = end ?? '9999-12-31'
  return start <= date && effectiveEnd >= date
}

function normalizeAssignmentOrigin(nature: AssignmentEngineNature | null | undefined): AsignacionOperativaOrigen {
  if (nature === 'COBERTURA_PERMANENTE') {
    return 'COBERTURA_PERMANENTE'
  }

  if (nature === 'COBERTURA_TEMPORAL' || nature === 'MOVIMIENTO') {
    return 'COBERTURA_TEMPORAL'
  }

  return 'BASE'
}

function isApprovedJustificationRequest(request: EffectiveAssignmentRequestLike) {
  if (!['REGISTRADA_RH', 'REGISTRADA'].includes(request.estatus)) {
    return false
  }

  const metadata = normalizeMetadata(request.metadata)
  return Boolean(metadata.justifica_asistencia)
}

function isApprovedVacationRequest(request: EffectiveAssignmentRequestLike) {
  if (String(request.tipo).trim().toUpperCase() !== 'VACACIONES') {
    return false
  }

  return isApprovedJustificationRequest(request)
}

function isApprovedIncapacityRequest(request: EffectiveAssignmentRequestLike) {
  if (String(request.tipo).trim().toUpperCase() !== 'INCAPACIDAD') {
    return false
  }

  return isApprovedJustificationRequest(request)
}

function isApprovedFaltaJustificationRequest(request: EffectiveAssignmentRequestLike) {
  if (String(request.tipo).trim().toUpperCase() !== 'JUSTIFICACION_FALTA') {
    return false
  }

  return isApprovedJustificationRequest(request)
}

function isActiveFormation(formation: EffectiveAssignmentFormationLike, targetDate: string) {
  return ['PROGRAMADA', 'EN_CURSO'].includes(formation.estado) &&
    isDateInRange(targetDate, formation.fechaInicio, formation.fechaFin)
}

function resolveFormationForEmployeeDate(
  context: EffectiveAssignmentEmployeeContext,
  targetDate: string,
  formations: EffectiveAssignmentFormationLike[]
) {
  return (
    formations.find((formation) => {
      if (!isActiveFormation(formation, targetDate)) {
        return false
      }

      return formacionTargetsEmployee(
        {
          participantes: formation.participantes,
          metadata: formation.metadata,
        },
        {
          empleadoId: context.empleadoId,
          puesto: context.puesto,
          pdvId: context.pdvIds[0] ?? null,
        }
      ) || context.pdvIds.some((pdvId) =>
        formacionTargetsEmployee(
          {
            participantes: formation.participantes,
            metadata: formation.metadata,
          },
          {
            empleadoId: context.empleadoId,
            puesto: context.puesto,
            pdvId,
          }
        )
      )
    }) ?? null
  )
}

function resolveApprovedRequestForEmployeeDate(
  empleadoId: string,
  targetDate: string,
  requests: EffectiveAssignmentRequestLike[]
) {
  const applicable = requests.filter((request) =>
    request.empleadoId === empleadoId && isDateInRange(targetDate, request.fechaInicio, request.fechaFin)
  )

  const incapacity = applicable.find(isApprovedIncapacityRequest)
  if (incapacity) {
    return {
      estadoOperativo: 'INCAPACIDAD' as const,
      origen: 'INCAPACIDAD' as const,
      request: incapacity,
      mensajeOperativo: 'La jornada operativa del dia queda suspendida por incapacidad aprobada.',
    }
  }

  const vacation = applicable.find(isApprovedVacationRequest)
  if (vacation) {
    return {
      estadoOperativo: 'VACACIONES' as const,
      origen: 'VACACIONES' as const,
      request: vacation,
      mensajeOperativo: 'La jornada operativa del dia queda suspendida por vacaciones aprobadas.',
    }
  }

  const justification = applicable.find(isApprovedFaltaJustificationRequest)
  if (justification) {
    return {
      estadoOperativo: 'FALTA_JUSTIFICADA' as const,
      origen: 'JUSTIFICACION' as const,
      request: justification,
      mensajeOperativo: 'La jornada del dia se interpreta como falta justificada aprobada.',
    }
  }

  return null
}

export function resolveEffectiveAssignmentForEmployeeDate(
  context: EffectiveAssignmentEmployeeContext,
  targetDate: string,
  assignments: AssignmentScheduleLike[],
  requests: EffectiveAssignmentRequestLike[] = [],
  formations: EffectiveAssignmentFormationLike[] = []
): EffectiveAssignmentResolved {
  const resolvedAssignment =
    resolveAssignmentsForDate(assignments.filter((item) => item.empleado_id === context.empleadoId), targetDate)[0] ?? null

  const structuralPdvIds = Array.from(
    new Set([
      ...context.pdvIds,
      ...(resolvedAssignment?.pdv_id ? [resolvedAssignment.pdv_id] : []),
    ].filter((item): item is string => Boolean(item)))
  )

  const effectiveContext: EffectiveAssignmentEmployeeContext = {
    ...context,
    pdvIds: structuralPdvIds,
  }

  const formation = resolveFormationForEmployeeDate(effectiveContext, targetDate, formations)
  if (formation) {
    return {
      empleadoId: context.empleadoId,
      fecha: targetDate,
      estadoOperativo: 'FORMACION',
      origen: 'FORMACION',
      pdvId: null,
      supervisorEmpleadoId: resolvedAssignment?.supervisor_empleado_id ?? null,
      cuentaClienteId: resolvedAssignment?.cuenta_cliente_id ?? null,
      referenciaId: formation.id,
      horarioEsperadoId: null,
      mensajeOperativo: 'La formacion activa desplaza la tienda como jornada principal del dia.',
      assignment: resolvedAssignment,
      request: null,
      formation,
    }
  }

  const requestResolution = resolveApprovedRequestForEmployeeDate(context.empleadoId, targetDate, requests)
  if (requestResolution) {
    return {
      empleadoId: context.empleadoId,
      fecha: targetDate,
      estadoOperativo: requestResolution.estadoOperativo,
      origen: requestResolution.origen,
      pdvId: null,
      supervisorEmpleadoId: resolvedAssignment?.supervisor_empleado_id ?? null,
      cuentaClienteId: resolvedAssignment?.cuenta_cliente_id ?? null,
      referenciaId: requestResolution.request.id,
      horarioEsperadoId: null,
      mensajeOperativo: requestResolution.mensajeOperativo,
      assignment: resolvedAssignment,
      request: requestResolution.request,
      formation: null,
    }
  }

  if (resolvedAssignment) {
    return {
      empleadoId: context.empleadoId,
      fecha: targetDate,
      estadoOperativo: 'ASIGNADA_PDV',
      origen: normalizeAssignmentOrigin(resolvedAssignment.naturaleza),
      pdvId: resolvedAssignment.pdv_id ?? null,
      supervisorEmpleadoId: resolvedAssignment.supervisor_empleado_id ?? null,
      cuentaClienteId: resolvedAssignment.cuenta_cliente_id ?? null,
      referenciaId: resolvedAssignment.id,
      horarioEsperadoId: resolvedAssignment.horario_referencia ?? null,
      mensajeOperativo: null,
      assignment: resolvedAssignment,
      request: null,
      formation: null,
    }
  }

  return {
    empleadoId: context.empleadoId,
    fecha: targetDate,
    estadoOperativo: 'SIN_ASIGNACION',
    origen: 'NINGUNO',
    pdvId: null,
    supervisorEmpleadoId: null,
    cuentaClienteId: null,
    referenciaId: null,
    horarioEsperadoId: null,
    mensajeOperativo: 'No existe asignacion estructural vigente ni excepcion operativa para este dia.',
    assignment: null,
    request: null,
    formation: null,
  }
}

export function resolveEffectiveAssignmentsForDate(
  targetDate: string,
  contexts: EffectiveAssignmentEmployeeContext[],
  assignments: AssignmentScheduleLike[],
  requests: EffectiveAssignmentRequestLike[] = [],
  formations: EffectiveAssignmentFormationLike[] = []
) {
  return contexts.map((context) =>
    resolveEffectiveAssignmentForEmployeeDate(context, targetDate, assignments, requests, formations)
  )
}