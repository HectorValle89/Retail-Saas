export type RutaMesManagementAction = 'APROBAR' | 'LIBERAR';

export interface RutaMesManagementSummary {
  ok: boolean;
  action: RutaMesManagementAction;
  month: string;
  executed: boolean;
  totalRoutes: number;
  eligibleCount: number;
  affectedCount: number;
  supervisorCount: number;
  supervisorIds: string[];
  protectedByExecutionCount: number;
  protectedByDateCount: number;
  notReadyCount: number;
  boundaryWeekCount: number;
  message: string;
}

export function normalizeRutaMesManagementMonth(value: string) {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(normalized);
  const month = match ? Number(match[2]) : 0;

  if (!match || month < 1 || month > 12) {
    throw new Error('Selecciona un mes válido antes de gestionar las rutas.');
  }

  return `${match[1]}-${match[2]}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function asAction(value: unknown): RutaMesManagementAction {
  return value === 'LIBERAR' ? 'LIBERAR' : 'APROBAR';
}

function asSupervisorIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))
  );
}

export function normalizeRutaMesManagementSummary(value: unknown): RutaMesManagementSummary {
  const source = asRecord(value);
  const action = asAction(source.accion);
  const executed = source.ejecutado === true;
  const eligibleCount = asCount(source.elegibles);
  const affectedCount = asCount(source.afectadas);
  const month = typeof source.mes === 'string' ? source.mes.slice(0, 7) : '';

  return {
    ok: source.ok === true,
    action,
    month,
    executed,
    totalRoutes: asCount(source.totalRutas),
    eligibleCount,
    affectedCount,
    supervisorCount: asCount(source.supervisores),
    supervisorIds: asSupervisorIds(source.supervisorIds),
    protectedByExecutionCount: asCount(source.protegidasPorEjecucion),
    protectedByDateCount: asCount(source.protegidasPorFecha),
    notReadyCount: asCount(source.noListas),
    boundaryWeekCount: asCount(source.semanasLimite),
    message: executed
      ? action === 'LIBERAR'
        ? `Se liberaron ${affectedCount} rutas del mes para ajuste y reenvío.`
        : `Se aprobaron ${affectedCount} rutas enviadas del mes.`
      : eligibleCount === 0
        ? action === 'LIBERAR'
          ? 'No hay rutas publicadas y seguras para liberar en este mes.'
          : 'No hay rutas enviadas pendientes de aprobación en este mes.'
        : `${eligibleCount} rutas están listas para ${action === 'LIBERAR' ? 'liberarse' : 'aprobarse'}.`,
  };
}

export function getRutaMesActionLabel(action: RutaMesManagementAction) {
  return action === 'LIBERAR' ? 'Liberar rutas del mes' : 'Aprobar rutas del mes';
}
