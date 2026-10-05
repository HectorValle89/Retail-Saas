import type { DashboardSupervisorDailyItem } from '../services/dashboardService';

export interface SupervisorDailyAttendanceSummary {
  total: number;
  faltanEntrada: number;
  faltanSalida: number;
  completadas: number;
  porcentajeCompletado: number;
}

export function summarizeSupervisorDailyAttendanceProgress(
  items: DashboardSupervisorDailyItem[]
): SupervisorDailyAttendanceSummary {
  if (!items || items.length === 0) {
    return {
      total: 0,
      faltanEntrada: 0,
      faltanSalida: 0,
      completadas: 0,
      porcentajeCompletado: 100,
    };
  }

  let faltanEntrada = 0;
  let faltanSalida = 0;
  let completadas = 0;

  for (const item of items) {
    if (item.flowState === 'SIN_CHECKIN' || item.flowState === 'ENTRADA_RECHAZADA') {
      faltanEntrada += 1;
    } else if (
      item.flowState === 'ESPERA_SALIDA' ||
      item.flowState === 'REVISION_SALIDA' ||
      item.flowState === 'SALIDA_RECHAZADA'
    ) {
      faltanSalida += 1;
    } else if (
      item.flowState === 'FINALIZADA' ||
      item.flowState === 'VACACIONES' ||
      item.flowState === 'INCAPACIDAD'
    ) {
      completadas += 1;
    } else {
      faltanEntrada += 1;
    }
  }

  const total = items.length;
  const porcentajeCompletado = total > 0 ? Math.round((completadas / total) * 100) : 100;

  return {
    total,
    faltanEntrada,
    faltanSalida,
    completadas,
    porcentajeCompletado,
  };
}
