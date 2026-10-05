import { describe, expect, it } from 'vitest';
import { summarizeSupervisorDailyAttendanceProgress } from './supervisorAttendanceSummary';
import type { DashboardSupervisorDailyItem } from '../services/dashboardService';

describe('summarizeSupervisorDailyAttendanceProgress', () => {
  it('calcula correctamente los contadores de faltan entrada, faltan salida y completadas', () => {
    const mockItems: Partial<DashboardSupervisorDailyItem>[] = [
      { assignmentId: '1', flowState: 'SIN_CHECKIN' },
      { assignmentId: '2', flowState: 'SIN_CHECKIN' },
      { assignmentId: '3', flowState: 'ENTRADA_RECHAZADA' },
      { assignmentId: '4', flowState: 'ESPERA_SALIDA' },
      { assignmentId: '5', flowState: 'REVISION_SALIDA' },
      { assignmentId: '6', flowState: 'FINALIZADA' },
      { assignmentId: '7', flowState: 'INCAPACIDAD' },
      { assignmentId: '8', flowState: 'VACACIONES' },
    ];

    const result = summarizeSupervisorDailyAttendanceProgress(
      mockItems as DashboardSupervisorDailyItem[]
    );

    expect(result.total).toBe(8);
    expect(result.faltanEntrada).toBe(3); // 2 SIN_CHECKIN + 1 ENTRADA_RECHAZADA
    expect(result.faltanSalida).toBe(2);  // 1 ESPERA_SALIDA + 1 REVISION_SALIDA
    expect(result.completadas).toBe(3);   // 1 FINALIZADA + 1 INCAPACIDAD + 1 VACACIONES
    expect(result.porcentajeCompletado).toBe(38); // 3 / 8 * 100 ~ 37.5 -> 38%
  });

  it('maneja listas vacías sin errores ni NaN', () => {
    const result = summarizeSupervisorDailyAttendanceProgress([]);
    expect(result.total).toBe(0);
    expect(result.faltanEntrada).toBe(0);
    expect(result.faltanSalida).toBe(0);
    expect(result.completadas).toBe(0);
    expect(result.porcentajeCompletado).toBe(100);
  });
});
