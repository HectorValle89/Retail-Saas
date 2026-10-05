import { describe, expect, it } from 'vitest';
import {
  buildPlaneacionProjectionMonths,
  chunkPlaneacionEmployees,
  getPlaneacionEligibleEmployeeIds,
  getPlaneacionMonthRange,
  isPlaneacionProjectionComplete,
} from '@/features/asignaciones/lib/planeacionProjectionHorizon';

describe('planeacionProjectionHorizon', () => {
  it('proyecta el mes actual y cuatro meses futuros', () => {
    expect(buildPlaneacionProjectionMonths('2026-08')).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('hereda asignaciones abiertas y respeta vigencias cerradas', () => {
    const assignments = [
      { empleado_id: 'dc-abierta', fecha_inicio: '2026-08-01', fecha_fin: null },
      { empleado_id: 'dc-septiembre', fecha_inicio: '2026-09-15', fecha_fin: null },
      { empleado_id: 'dc-agosto', fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
    ];

    expect(getPlaneacionEligibleEmployeeIds(assignments, '2026-09')).toEqual([
      'dc-abierta',
      'dc-septiembre',
    ]);
    expect(getPlaneacionEligibleEmployeeIds(assignments, '2026-12')).toEqual([
      'dc-abierta',
      'dc-septiembre',
    ]);
  });

  it('considera incompleto un snapshot que sólo materializó parte de las DC', () => {
    expect(
      isPlaneacionProjectionComplete({
        hasSnapshot: true,
        expectedMaterializedRows: 217 * 30,
        materializedRows: 136 * 30,
      })
    ).toBe(false);
    expect(
      isPlaneacionProjectionComplete({
        hasSnapshot: true,
        expectedMaterializedRows: 217 * 30,
        materializedRows: 217 * 30,
      })
    ).toBe(true);
    expect(
      isPlaneacionProjectionComplete({
        hasSnapshot: false,
        expectedMaterializedRows: 0,
        materializedRows: 0,
      })
    ).toBe(false);
  });

  it('calcula meses calendario y agrupa empleados sin duplicados', () => {
    expect(getPlaneacionMonthRange('2028-02')).toEqual({
      fechaInicio: '2028-02-01',
      fechaFin: '2028-02-29',
      days: 29,
    });
    expect(
      chunkPlaneacionEmployees(Array.from({ length: 51 }, (_, index) => `dc-${index}`))
    ).toHaveLength(3);
  });
});
