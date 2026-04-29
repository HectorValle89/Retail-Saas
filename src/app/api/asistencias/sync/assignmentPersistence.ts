import { resolveAssignmentsForDate, type AssignmentScheduleLike } from '@/features/asignaciones/lib/assignmentEngine'

export interface CheckInAssignmentRow extends AssignmentScheduleLike {
  cuenta_cliente_id: string | null
  supervisor_empleado_id: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
}

interface AssignmentQueryBuilder {
  select(columns: string): AssignmentQueryBuilder
  eq(column: string, value: string): AssignmentQueryBuilder
  lte(column: string, value: string): AssignmentQueryBuilder
  or(filter: string): AssignmentQueryBuilder
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): AssignmentQueryBuilder
  limit(count: number): Promise<{ data: CheckInAssignmentRow[] | CheckInAssignmentRow | null; error: { message: string } | null }>
  maybeSingle(): Promise<{ data: CheckInAssignmentRow | null; error: { message: string } | null }>
}

interface AssignmentPersistenceService {
  from(table: 'asignacion'): AssignmentQueryBuilder
}

export interface ResolveCheckInAssignmentInput {
  assignmentId: string | null
  empleadoId: string
  pdvId: string
  fechaOperacion: string
}

function isActiveAssignmentForDate(
  assignment: CheckInAssignmentRow,
  input: ResolveCheckInAssignmentInput
) {
  return (
    assignment.empleado_id === input.empleadoId &&
    assignment.pdv_id === input.pdvId &&
    assignment.estado_publicacion === 'PUBLICADA' &&
    assignment.fecha_inicio <= input.fechaOperacion &&
    (!assignment.fecha_fin || assignment.fecha_fin >= input.fechaOperacion)
  )
}

export async function resolveCheckInAssignmentForPersistence(
  service: AssignmentPersistenceService,
  input: ResolveCheckInAssignmentInput
) {
  if (!input.assignmentId) {
    throw new Error('El check-in requiere una asignacion activa con PDV y horario de referencia.')
  }

  const selectColumns = [
    'id',
    'empleado_id',
    'pdv_id',
    'cuenta_cliente_id',
    'supervisor_empleado_id',
    'fecha_inicio',
    'fecha_fin',
    'dias_laborales',
    'dia_descanso',
    'horario_referencia',
    'naturaleza',
    'prioridad',
    'tipo',
    'estado_publicacion',
  ].join(', ')

  const { data: directAssignment, error: directError } = await service
    .from('asignacion')
    .select(selectColumns)
    .eq('id', input.assignmentId)
    .maybeSingle()

  if (directError) {
    throw new Error(directError.message)
  }

  if (directAssignment && isActiveAssignmentForDate(directAssignment, input)) {
    return directAssignment
  }

  const { data: fallbackRows, error: fallbackError } = await service
    .from('asignacion')
    .select(selectColumns)
    .eq('empleado_id', input.empleadoId)
    .eq('pdv_id', input.pdvId)
    .eq('estado_publicacion', 'PUBLICADA')
    .lte('fecha_inicio', input.fechaOperacion)
    .or(`fecha_fin.is.null,fecha_fin.gte.${input.fechaOperacion}`)
    .order('prioridad', { ascending: false, nullsFirst: false })
    .order('fecha_inicio', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false, nullsFirst: false })
    .limit(50)

  if (fallbackError) {
    throw new Error(fallbackError.message)
  }

  const resolvedFallback = resolveAssignmentsForDate(
    (Array.isArray(fallbackRows) ? fallbackRows : fallbackRows ? [fallbackRows] : []) as AssignmentScheduleLike[],
    input.fechaOperacion
  )[0] ?? null

  if (resolvedFallback) {
    return resolvedFallback as CheckInAssignmentRow
  }

  throw new Error('El check-in requiere una asignacion activa con PDV y horario de referencia.')
}
