import { describe, expect, it } from 'vitest';
import {
  buildRecurringQuotaMap,
  normalizeQuotaMonthStart,
  resolveRecurringVisitQuota,
} from './recurringVisitQuotas';

describe('recurring visit quotas', () => {
  it('mantiene una cuota abierta en todos los meses siguientes', () => {
    const versions = [
      {
        pdvId: 'pdv-1',
        visitasMensuales: 4,
        vigenteDesde: '2026-08-01',
        vigenteHasta: null,
      },
    ];

    expect(resolveRecurringVisitQuota(versions, '2026-08')?.visitasMensuales).toBe(4);
    expect(resolveRecurringVisitQuota(versions, '2026-12')?.visitasMensuales).toBe(4);
    expect(resolveRecurringVisitQuota(versions, '2027-08')?.visitasMensuales).toBe(4);
  });

  it('aplica una nueva versión hacia adelante sin cambiar el mes histórico', () => {
    const versions = [
      {
        pdvId: 'pdv-1',
        visitasMensuales: 4,
        vigenteDesde: '2026-08-01',
        vigenteHasta: '2026-08-31',
      },
      {
        pdvId: 'pdv-1',
        visitasMensuales: 2,
        vigenteDesde: '2026-09-01',
        vigenteHasta: null,
      },
    ];

    expect(resolveRecurringVisitQuota(versions, '2026-08')?.visitasMensuales).toBe(4);
    expect(resolveRecurringVisitQuota(versions, '2026-09')?.visitasMensuales).toBe(2);
    expect(resolveRecurringVisitQuota(versions, '2027-03')?.visitasMensuales).toBe(2);
  });

  it('normaliza mes y agrupa una sola lectura por supervisor', () => {
    expect(normalizeQuotaMonthStart('2026-08')).toBe('2026-08-01');
    expect(() => normalizeQuotaMonthStart('2026-13')).toThrow('no es válido');

    const grouped = buildRecurringQuotaMap([
      {
        supervisorEmpleadoId: 'sup-1',
        pdvId: 'pdv-1',
        visitasMensuales: 3,
        vigenteDesde: '2026-08-01',
        vigenteHasta: null,
      },
      {
        supervisorEmpleadoId: 'sup-1',
        pdvId: 'pdv-2',
        visitasMensuales: 5,
        vigenteDesde: '2026-08-01',
        vigenteHasta: null,
      },
    ]);

    expect(grouped.get('sup-1')?.get('pdv-2')?.visitasMensuales).toBe(5);
  });
});
