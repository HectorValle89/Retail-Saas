import type {
  RutaCalendarioCell,
  RutaCalendarioSupervisorRow,
} from '../services/rutaCalendarioMensualService';

export type SupervisorMonthlyEstado =
  | 'FALTANTE'
  | 'ENVIADA'
  | 'CAMBIOS_SOLICITADOS'
  | 'APROBADA';

export interface SupervisorMonthlyStatus {
  supervisorEmpleadoId: string;
  supervisor: string;
  zona: string | null;
  estado: SupervisorMonthlyEstado;
  diasPlaneados: number;
  totalVisitas: number;
  visitasCompletadas: number;
  visitasPendientes: number;
  porcentajeAvance: number;
  cells: RutaCalendarioCell[];
  submissionId?: string | null;
  revision?: number | null;
  enviadoEn?: string | null;
  revisadoEn?: string | null;
  nota?: string | null;
}

export interface MonthlyRouteBoardSummary {
  totalSupervisores: number;
  faltantes: number;
  enviadas: number;
  cambiosSolicitados: number;
  aprobadas: number;
  totalVisitasPlaneadas: number;
  totalVisitasCompletadas: number;
  porcentajeGlobalAvance: number;
}

export function calculateSupervisorMonthlyStatus(
  row: RutaCalendarioSupervisorRow,
  submissionOverride?: {
    submissionId?: string | null;
    estado?: string | null;
    revision?: number | null;
    enviadoEn?: string | null;
    revisadoEn?: string | null;
    nota?: string | null;
  }
): SupervisorMonthlyStatus {
  const cells = row.cells ?? [];
  const plannedCells = cells.filter((c) => c.plannedCount > 0);
  const totalVisitas = plannedCells.reduce((acc, c) => acc + c.plannedCount, 0);
  const visitasCompletadas = plannedCells.reduce((acc, c) => acc + c.completedCount, 0);
  const visitasPendientes = Math.max(0, totalVisitas - visitasCompletadas);
  const diasPlaneados = plannedCells.length;
  const porcentajeAvance =
    totalVisitas > 0 ? Math.round((visitasCompletadas / totalVisitas) * 100) : 0;

  let estado: SupervisorMonthlyEstado = 'FALTANTE';

  if (submissionOverride?.estado) {
    const rawEstado = submissionOverride.estado.toUpperCase();
    if (rawEstado === 'APROBADA') {
      estado = 'APROBADA';
    } else if (rawEstado === 'CAMBIOS_SOLICITADOS') {
      estado = 'CAMBIOS_SOLICITADOS';
    } else if (
      rawEstado === 'PENDIENTE_COORDINACION' ||
      rawEstado === 'ENVIADA' ||
      rawEstado === 'EN_PROGRESO'
    ) {
      estado = 'ENVIADA';
    } else if (totalVisitas > 0) {
      estado = 'ENVIADA';
    } else {
      estado = 'FALTANTE';
    }
  } else if (totalVisitas === 0) {
    estado = 'FALTANTE';
  } else {
    const hasCambios = plannedCells.some(
      (c) => c.approvalState === 'CAMBIOS_SOLICITADOS'
    );
    const hasPendingCoordination = plannedCells.some(
      (c) =>
        c.approvalState === 'PENDIENTE_COORDINACION' ||
        c.approvalState === 'SIN_RUTA' ||
        c.routeStatus === 'BORRADOR'
    );
    const allApproved =
      plannedCells.length > 0 &&
      !hasCambios &&
      !hasPendingCoordination &&
      plannedCells.every(
        (c) => c.approvalState === 'APROBADA' || c.routeStatus === 'PUBLICADA'
      );

    if (hasCambios) {
      estado = 'CAMBIOS_SOLICITADOS';
    } else if (allApproved) {
      estado = 'APROBADA';
    } else {
      estado = 'ENVIADA';
    }
  }

  return {
    supervisorEmpleadoId: row.supervisorEmpleadoId,
    supervisor: row.supervisor,
    zona: row.zona ?? null,
    estado,
    diasPlaneados,
    totalVisitas,
    visitasCompletadas,
    visitasPendientes,
    porcentajeAvance,
    cells,
    submissionId: submissionOverride?.submissionId ?? null,
    revision: submissionOverride?.revision ?? null,
    enviadoEn: submissionOverride?.enviadoEn ?? null,
    revisadoEn: submissionOverride?.revisadoEn ?? null,
    nota: submissionOverride?.nota ?? null,
  };
}

export function summarizeMonthlyRouteStatuses(
  items: SupervisorMonthlyStatus[]
): MonthlyRouteBoardSummary {
  let faltantes = 0;
  let enviadas = 0;
  let cambiosSolicitados = 0;
  let aprobadas = 0;
  let totalVisitasPlaneadas = 0;
  let totalVisitasCompletadas = 0;

  for (const item of items) {
    if (item.estado === 'FALTANTE') faltantes += 1;
    else if (item.estado === 'ENVIADA') enviadas += 1;
    else if (item.estado === 'CAMBIOS_SOLICITADOS') cambiosSolicitados += 1;
    else if (item.estado === 'APROBADA') aprobadas += 1;

    totalVisitasPlaneadas += item.totalVisitas;
    totalVisitasCompletadas += item.visitasCompletadas;
  }

  const porcentajeGlobalAvance =
    totalVisitasPlaneadas > 0
      ? Math.round((totalVisitasCompletadas / totalVisitasPlaneadas) * 100)
      : 0;

  return {
    totalSupervisores: items.length,
    faltantes,
    enviadas,
    cambiosSolicitados,
    aprobadas,
    totalVisitasPlaneadas,
    totalVisitasCompletadas,
    porcentajeGlobalAvance,
  };
}
