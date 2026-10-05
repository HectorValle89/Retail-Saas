import { describe, expect, it } from 'vitest';
import {
  normalizeMonthlyRouteSubmission,
  normalizeMonthlyRouteSubmissionResult,
} from './monthlyRouteSubmission';

describe('monthlyRouteSubmission', () => {
  it('normaliza y ordena visitas por fecha y orden', () => {
    expect(
      normalizeMonthlyRouteSubmission(
        JSON.stringify([
          { fecha: '2026-10-12', pdvId: 'pdv-b', orden: 2 },
          { fecha: '2026-10-12', pdvId: 'pdv-a', orden: 1, notas: ' Apertura ' },
          { fecha: '2026-10-03', pdvId: 'pdv-c', orden: 1 },
        ]),
        '2026-10'
      )
    ).toEqual([
      { fecha: '2026-10-03', pdvId: 'pdv-c', orden: 1, notas: null },
      { fecha: '2026-10-12', pdvId: 'pdv-a', orden: 1, notas: 'Apertura' },
      { fecha: '2026-10-12', pdvId: 'pdv-b', orden: 2, notas: null },
    ]);
  });

  it('rechaza visitas fuera del mes seleccionado', () => {
    expect(() =>
      normalizeMonthlyRouteSubmission(
        JSON.stringify([{ fecha: '2026-11-01', pdvId: 'pdv-a', orden: 1 }]),
        '2026-10'
      )
    ).toThrow(/fuera del mes/i);
  });

  it('rechaza meses y fechas que no existen en calendario', () => {
    expect(() =>
      normalizeMonthlyRouteSubmission(
        JSON.stringify([{ fecha: '2026-13-01', pdvId: 'pdv-a', orden: 1 }]),
        '2026-13'
      )
    ).toThrow(/mes válido/i);

    expect(() =>
      normalizeMonthlyRouteSubmission(
        JSON.stringify([{ fecha: '2026-02-30', pdvId: 'pdv-a', orden: 1 }]),
        '2026-02'
      )
    ).toThrow(/fecha válida/i);
  });

  it('rechaza PDVs u órdenes repetidas en un mismo día', () => {
    expect(() =>
      normalizeMonthlyRouteSubmission(
        JSON.stringify([
          { fecha: '2026-10-12', pdvId: 'pdv-a', orden: 1 },
          { fecha: '2026-10-12', pdvId: 'pdv-a', orden: 2 },
        ]),
        '2026-10'
      )
    ).toThrow(/misma tienda/i);

    expect(() =>
      normalizeMonthlyRouteSubmission(
        JSON.stringify([
          { fecha: '2026-10-12', pdvId: 'pdv-a', orden: 1 },
          { fecha: '2026-10-12', pdvId: 'pdv-b', orden: 1 },
        ]),
        '2026-10'
      )
    ).toThrow(/mismo orden/i);
  });

  it('normaliza el resumen devuelto por el RPC mensual', () => {
    expect(
      normalizeMonthlyRouteSubmissionResult({
        ok: true,
        envioId: 'envio-1',
        mes: '2026-10-01',
        revision: 3,
        rutasAfectadas: 5,
        visitas: 18,
        diasPlaneados: 12,
      })
    ).toEqual({
      ok: true,
      submissionId: 'envio-1',
      month: '2026-10',
      revision: 3,
      routesAffected: 5,
      visits: 18,
      plannedDays: 12,
    });
  });
});
