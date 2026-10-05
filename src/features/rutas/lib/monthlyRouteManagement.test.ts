import { describe, expect, it } from 'vitest';
import {
  getRutaMesActionLabel,
  normalizeRutaMesManagementMonth,
  normalizeRutaMesManagementSummary,
} from './monthlyRouteManagement';

describe('monthlyRouteManagement', () => {
  it('normaliza la previsualización de liberación sin perder los protegidos', () => {
    const summary = normalizeRutaMesManagementSummary({
      ok: true,
      accion: 'LIBERAR',
      mes: '2026-09',
      ejecutado: false,
      totalRutas: 90,
      elegibles: 87,
      afectadas: 0,
      supervisores: 18,
      supervisorIds: ['sup-1', 'sup-1', 'sup-2'],
      protegidasPorEjecucion: 1,
      protegidasPorFecha: 0,
      noListas: 2,
      semanasLimite: 2,
    });

    expect(summary).toMatchObject({
      action: 'LIBERAR',
      month: '2026-09',
      eligibleCount: 87,
      supervisorCount: 18,
      protectedByExecutionCount: 1,
      notReadyCount: 2,
      boundaryWeekCount: 2,
    });
    expect(summary.supervisorIds).toEqual(['sup-1', 'sup-2']);
    expect(summary.message).toContain('87 rutas');
  });

  it('genera el resultado ejecutado de aprobación', () => {
    const summary = normalizeRutaMesManagementSummary({
      ok: true,
      accion: 'APROBAR',
      mes: '2026-09',
      ejecutado: true,
      elegibles: 12,
      afectadas: 12,
    });

    expect(summary.executed).toBe(true);
    expect(summary.affectedCount).toBe(12);
    expect(summary.message).toBe('Se aprobaron 12 rutas enviadas del mes.');
    expect(getRutaMesActionLabel(summary.action)).toBe('Aprobar rutas del mes');
  });

  it('normaliza el mes sin aceptar fechas ambiguas', () => {
    expect(normalizeRutaMesManagementMonth('2026-09-17')).toBe('2026-09');
    expect(() => normalizeRutaMesManagementMonth('2026-13')).toThrow(/mes válido/i);
  });

  it('normaliza la gestión mensual enfocada a un supervisor específico', () => {
    const summary = normalizeRutaMesManagementSummary({
      ok: true,
      accion: 'APROBAR',
      mes: '2026-09',
      ejecutado: false,
      totalRutas: 1,
      elegibles: 1,
      afectadas: 0,
      supervisores: 1,
      supervisorIds: ['sup-gloria'],
      protegidasPorEjecucion: 0,
      protegidasPorFecha: 0,
      noListas: 0,
      semanasLimite: 1,
    });

    expect(summary.eligibleCount).toBe(1);
    expect(summary.supervisorCount).toBe(1);
    expect(summary.supervisorIds).toEqual(['sup-gloria']);
    expect(summary.message).toContain('1 rutas están listas para aprobarse');
  });

  it('normaliza la selección de múltiples supervisores marcados en la tabla', () => {
    const summary = normalizeRutaMesManagementSummary({
      ok: true,
      accion: 'APROBAR',
      mes: '2026-09',
      ejecutado: false,
      totalRutas: 8,
      elegibles: 8,
      afectadas: 0,
      supervisores: 2,
      supervisorIds: ['sup-atzin', 'sup-gloria'],
      protegidasPorEjecucion: 0,
      protegidasPorFecha: 0,
      noListas: 0,
      semanasLimite: 0,
    });

    expect(summary.eligibleCount).toBe(8);
    expect(summary.supervisorCount).toBe(2);
    expect(summary.supervisorIds).toEqual(['sup-atzin', 'sup-gloria']);
    expect(summary.message).toContain('8 rutas están listas para aprobarse');
  });
});
