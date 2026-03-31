import { parseDiasLaborales, rangesOverlap } from './assignmentPlanning'

export type AssignmentEngineNature =
  | 'BASE'
  | 'COBERTURA_TEMPORAL'
  | 'COBERTURA_PERMANENTE'
  | 'MOVIMIENTO'

export interface AssignmentEngineRow {
  id: string
  empleado_id: string
  pdv_id: string
  supervisor_empleado_id: string | null
  cuenta_cliente_id: string | null
  tipo: string
  factor_tiempo: number
  dias_laborales: string | null
  dia_descanso: string | null
  horario_referencia: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
  naturaleza?: AssignmentEngineNature | null
  retorna_a_base?: boolean | null
  asignacion_base_id?: string | null
  asignacion_origen_id?: string | null
  prioridad?: number | null
  motivo_movimiento?: string | null
  observaciones?: string | null
}

export interface AssignmentEngineDraft
  extends Omit<AssignmentEngineRow, 'id' | 'estado_publicacion'> {
  id?: string | null
}

export interface AssignmentEngineUpdate {
  id: string
  patch: Partial<
    Pick<
      AssignmentEngineRow,
      | 'fecha_inicio'
      | 'fecha_fin'
      | 'estado_publicacion'
      | 'observaciones'
      | 'asignacion_origen_id'
    >
  >
}

export interface AssignmentEngineInsert
  extends Omit<AssignmentEngineRow, 'id' | 'estado_publicacion'> {
  estado_publicacion: 'PUBLICADA'
  generado_automaticamente: boolean
}

export interface AssignmentEngineTransitionPlan {
  ignoredComparableIds: string[]
  updates: AssignmentEngineUpdate[]
  continuationInsert: AssignmentEngineInsert | null
}

export interface AssignmentEngineAlert {
  code: 'TEMPORAL_POR_VENCER' | 'DC_SIN_PDV_PROXIMO' | 'PDV_QUEDARA_LIBRE'
  severity: 'ALERTA' | 'AVISO'
  message: string
  empleadoId?: string
  pdvId?: string
  assignmentId?: string
}

export interface AssignmentScheduleLike {
  id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string | null
  dias_laborales: string | null
  pdv_id?: string | null
  supervisor_empleado_id?: string | null
  cuenta_cliente_id?: string | null
  horario_referencia?: string | null
  naturaleza?: AssignmentEngineNature | null
  prioridad?: number | null
  tipo?: string | null
}

function addDays(dateIso: string, offset: number) {
  const date = new Date(`${dateIso}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    return dateIso
  }

  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

export function getDayBefore(dateIso: string) {
  return addDays(dateIso, -1)
}

export function getDayAfter(dateIso: string) {
  return addDays(dateIso, 1)
}

function buildAutoNote(label: string, referenceDate: string, current: string | null | undefined) {
  const suffix = current?.trim() ? ` | ${current.trim()}` : ''
  return `[AUTO ${label} ${referenceDate}]${suffix}`
}

function isPublished(row: AssignmentEngineRow) {
  return row.estado_publicacion === 'PUBLICADA'
}

export function normalizeAssignmentNature(
  value: AssignmentEngineNature | null | undefined
): Exclude<AssignmentEngineNature, 'MOVIMIENTO'> {
  if (value === 'COBERTURA_PERMANENTE') {
    return 'COBERTURA_PERMANENTE'
  }

  if (value === 'COBERTURA_TEMPORAL' || value === 'MOVIMIENTO') {
    return 'COBERTURA_TEMPORAL'
  }

  return 'BASE'
}

function normalizeNature(value: AssignmentEngineNature | null | undefined) {
  return normalizeAssignmentNature(value)
}

function isCoverageNature(value: AssignmentEngineNature | null | undefined) {
  const normalized = normalizeNature(value)
  return normalized === 'COBERTURA_TEMPORAL' || normalized === 'COBERTURA_PERMANENTE'
}

function isTemporaryCoverageNature(value: AssignmentEngineNature | null | undefined) {
  return normalizeNature(value) === 'COBERTURA_TEMPORAL'
}

function getWeekdayCode(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00Z`)
  const day = date.getUTCDay()
  const weekdayCodes = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] as const
  return weekdayCodes[day === 0 ? 6 : day - 1]
}

function getAssignmentPriority(value: number | null | undefined, naturaleza: AssignmentEngineNature | null | undefined) {
  if (Number.isFinite(value)) {
    return Number(value)
  }

  const normalizedNature = normalizeNature(naturaleza)
  if (normalizedNature === 'COBERTURA_TEMPORAL') {
    return 200
  }

  if (normalizedNature === 'COBERTURA_PERMANENTE') {
    return 150
  }

  return 100
}

function getAssignmentTypeWeight(tipo: string | null | undefined) {
  if (tipo === 'COBERTURA') {
    return 3
  }

  if (tipo === 'ROTATIVA') {
    return 2
  }

  return 1
}

export function isAssignmentScheduledForDate(item: AssignmentScheduleLike, targetDate: string) {
  if (item.fecha_inicio > targetDate) {
    return false
  }

  if (item.fecha_fin && item.fecha_fin < targetDate) {
    return false
  }

  const parsed = parseDiasLaborales(item.dias_laborales)
  if (parsed.dias.length === 0) {
    return true
  }

  return parsed.dias.includes(getWeekdayCode(targetDate))
}

export function compareAssignmentOperationalPriority(
  left: AssignmentScheduleLike,
  right: AssignmentScheduleLike
) {
  const priorityDelta =
    getAssignmentPriority(right.prioridad, right.naturaleza) -
    getAssignmentPriority(left.prioridad, left.naturaleza)

  if (priorityDelta !== 0) {
    return priorityDelta
  }

  const natureDelta =
    (isCoverageNature(right.naturaleza) ? 1 : 0) - (isCoverageNature(left.naturaleza) ? 1 : 0)

  if (natureDelta !== 0) {
    return natureDelta
  }

  const typeDelta = getAssignmentTypeWeight(right.tipo) - getAssignmentTypeWeight(left.tipo)
  if (typeDelta !== 0) {
    return typeDelta
  }

  const startDelta = right.fecha_inicio.localeCompare(left.fecha_inicio)
  if (startDelta !== 0) {
    return startDelta
  }

  return right.id.localeCompare(left.id)
}

export function resolveAssignmentsForDate<T extends AssignmentScheduleLike>(
  assignments: T[],
  targetDate: string
) {
  const byEmployee = new Map<string, T[]>()

  for (const assignment of assignments) {
    if (!isAssignmentScheduledForDate(assignment, targetDate)) {
      continue
    }

    const current = byEmployee.get(assignment.empleado_id) ?? []
    current.push(assignment)
    byEmployee.set(assignment.empleado_id, current)
  }

  return Array.from(byEmployee.values())
    .map((items) => items.sort(compareAssignmentOperationalPriority)[0] ?? null)
    .filter((item): item is T => Boolean(item))
}

export function buildAssignmentTransitionPlan(
  draft: AssignmentEngineDraft,
  existingRows: AssignmentEngineRow[]
): AssignmentEngineTransitionPlan {
  const overlappingRows = existingRows
    .filter((row) => row.id !== draft.id)
    .filter((row) => row.empleado_id === draft.empleado_id)
    .filter(isPublished)
    .filter((row) => rangesOverlap(draft.fecha_inicio, draft.fecha_fin, row.fecha_inicio, row.fecha_fin))
    .sort((left, right) => left.fecha_inicio.localeCompare(right.fecha_inicio))

  const updates: AssignmentEngineUpdate[] = []
  const ignoredComparableIds: string[] = []
  const draftNature = normalizeNature(draft.naturaleza ?? null)
  let continuationSource: AssignmentEngineRow | null = null

  for (const row of overlappingRows) {
    ignoredComparableIds.push(row.id)

    if (row.fecha_inicio < draft.fecha_inicio) {
      updates.push({
        id: row.id,
        patch: {
          fecha_fin: getDayBefore(draft.fecha_inicio),
          observaciones: buildAutoNote('CIERRE', draft.fecha_inicio, row.observaciones),
        },
      })

      if (
        !continuationSource &&
        draftNature === 'COBERTURA_TEMPORAL' &&
        draft.retorna_a_base &&
        draft.fecha_fin
      ) {
        continuationSource = row
      }

      continue
    }

    if (draft.fecha_fin) {
      const nextStart = getDayAfter(draft.fecha_fin)
      const rowEndsBeforeNextStart = row.fecha_fin !== null && row.fecha_fin < nextStart

      if (!rowEndsBeforeNextStart) {
        updates.push({
          id: row.id,
          patch: {
            fecha_inicio: nextStart,
            observaciones: buildAutoNote('REPROGRAMACION', nextStart, row.observaciones),
          },
        })
      } else {
        updates.push({
          id: row.id,
          patch: {
            estado_publicacion: 'BORRADOR',
            observaciones: buildAutoNote('REEMPLAZADA', draft.fecha_inicio, row.observaciones),
          },
        })
      }

      continue
    }

    updates.push({
      id: row.id,
      patch: {
        estado_publicacion: 'BORRADOR',
        observaciones: buildAutoNote('REEMPLAZADA', draft.fecha_inicio, row.observaciones),
      },
    })
  }

  const continuationInsert =
    continuationSource && draft.fecha_fin
      ? {
          cuenta_cliente_id: continuationSource.cuenta_cliente_id,
          empleado_id: continuationSource.empleado_id,
          pdv_id: continuationSource.pdv_id,
          supervisor_empleado_id: continuationSource.supervisor_empleado_id,
          tipo: continuationSource.tipo,
          factor_tiempo: continuationSource.factor_tiempo,
          dias_laborales: continuationSource.dias_laborales,
          dia_descanso: continuationSource.dia_descanso,
          horario_referencia: continuationSource.horario_referencia,
          fecha_inicio: getDayAfter(draft.fecha_fin),
          fecha_fin: continuationSource.fecha_fin,
          naturaleza: 'BASE' as const,
          retorna_a_base: false,
          asignacion_base_id: continuationSource.asignacion_base_id ?? continuationSource.id,
          asignacion_origen_id: draft.id ?? null,
          prioridad: continuationSource.prioridad ?? 100,
          motivo_movimiento: 'RETORNO_AUTOMATICO_A_BASE',
          observaciones: buildAutoNote('RETORNO', getDayAfter(draft.fecha_fin), continuationSource.observaciones),
          estado_publicacion: 'PUBLICADA' as const,
          generado_automaticamente: true,
        }
      : null

  return {
    ignoredComparableIds,
    updates,
    continuationInsert,
  }
}

export function buildAssignmentEngineAlerts(
  assignments: AssignmentEngineRow[],
  referenceDate: string
) {
  const alerts: AssignmentEngineAlert[] = []
  const publishedAssignments = assignments.filter(isPublished)
  const activeEmployees = new Set(publishedAssignments.map((item) => item.empleado_id))
  const pdvIds = new Set(publishedAssignments.map((item) => item.pdv_id))

  for (const assignment of publishedAssignments) {
    if (
      isTemporaryCoverageNature(assignment.naturaleza ?? null) &&
      assignment.fecha_fin &&
      assignment.fecha_fin >= referenceDate &&
      assignment.fecha_fin <= addDays(referenceDate, 3)
    ) {
      alerts.push({
        code: 'TEMPORAL_POR_VENCER',
        severity: 'ALERTA',
        message: `La asignacion temporal ${assignment.id} vence el ${assignment.fecha_fin}.`,
        empleadoId: assignment.empleado_id,
        pdvId: assignment.pdv_id,
        assignmentId: assignment.id,
      })
    }

    if (!assignment.fecha_fin) {
      continue
    }

    if (assignment.fecha_fin < referenceDate) {
      continue
    }

    const nextDay = getDayAfter(assignment.fecha_fin)
    const employeeHasNext = publishedAssignments.some(
      (item) =>
        item.id !== assignment.id &&
        item.empleado_id === assignment.empleado_id &&
        rangesOverlap(nextDay, nextDay, item.fecha_inicio, item.fecha_fin)
    )
    if (!employeeHasNext) {
      alerts.push({
        code: 'DC_SIN_PDV_PROXIMO',
        severity: 'ALERTA',
        message: `La dermoconsejera ${assignment.empleado_id} quedara sin PDV a partir del ${nextDay}.`,
        empleadoId: assignment.empleado_id,
        assignmentId: assignment.id,
      })
    }

    const pdvHasNext = publishedAssignments.some(
      (item) =>
        item.id !== assignment.id &&
        item.pdv_id === assignment.pdv_id &&
        rangesOverlap(nextDay, nextDay, item.fecha_inicio, item.fecha_fin)
    )
    if (!pdvHasNext && pdvIds.has(assignment.pdv_id)) {
      alerts.push({
        code: 'PDV_QUEDARA_LIBRE',
        severity: 'AVISO',
        message: `El PDV ${assignment.pdv_id} quedara libre a partir del ${nextDay}.`,
        pdvId: assignment.pdv_id,
        assignmentId: assignment.id,
      })
    }
  }

  return alerts
}
