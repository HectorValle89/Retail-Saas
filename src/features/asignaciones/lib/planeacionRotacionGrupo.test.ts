import { describe, expect, it } from 'vitest';
import {
  buildPlaneacionRotacionOperations,
  getPlaneacionRotacionPatternDays,
  type PlaneacionRotacionMiembro,
} from './planeacionRotacionGrupo';

const PDV_A = '11111111-1111-4111-8111-111111111111';
const PDV_B = '22222222-2222-4222-8222-222222222222';
const DC = '33333333-3333-4333-8333-333333333333';

function member(overrides: Partial<PlaneacionRotacionMiembro>): PlaneacionRotacionMiembro {
  return {
    slot: 'A',
    pdvId: PDV_A,
    empleadoId: DC,
    empleadoActualId: DC,
    asignacionActualId: '44444444-4444-4444-8444-444444444444',
    diasLaborales: 'LUN,MAR,MIE',
    horarioReferencia: 'TC',
    ...overrides,
  };
}

describe('planeacionRotacionGrupo', () => {
  it('aplica los patrones LMX/JVS sin capturar cada día por separado', () => {
    expect(getPlaneacionRotacionPatternDays('LMX_JVS', 'A')).toBe('LUN,MAR,MIE');
    expect(getPlaneacionRotacionPatternDays('LMX_JVS', 'B')).toBe('JUE,VIE,SAB');
    expect(getPlaneacionRotacionPatternDays('JVS_LMX', 'A')).toBe('JUE,VIE,SAB');
  });

  it('genera un lote atómico para liberar, versionar y reasignar el grupo', () => {
    const result = buildPlaneacionRotacionOperations({
      tipo: 'ROTATIVA',
      fechaInicio: '2026-09-01',
      motivo: 'Nueva rotación San Pablo',
      members: [
        member({}),
        member({
          slot: 'B',
          pdvId: PDV_B,
          empleadoActualId: '',
          asignacionActualId: '',
          diasLaborales: 'JUE,VIE,SAB',
        }),
      ],
    });

    expect(result.issues).toEqual([]);
    expect(result.operations.map((operation) => operation.tipoOperacion)).toEqual([
      'LIBERAR_DC',
      'CAMBIAR_ROTACION',
      'ASIGNAR_DC',
      'CAMBIAR_ROTACION',
      'ASIGNAR_DC',
    ]);
    expect(
      result.operations.filter((operation) => operation.tipoOperacion === 'CAMBIAR_ROTACION')
    ).toHaveLength(2);
    expect(result.operations.at(-1)?.payload?.diasLaborales).toBe('JUE,VIE,SAB');
    expect(result.operations.at(-1)?.payload?.factorTiempo).toBe(0.5);
  });

  it('impide repetir un PDV o colocar la misma DC en días traslapados', () => {
    const result = buildPlaneacionRotacionOperations({
      tipo: 'ROTATIVA',
      fechaInicio: '2026-09-01',
      motivo: 'Rotación inválida',
      members: [member({}), member({ slot: 'B', diasLaborales: 'MIE,JUE,VIE' })],
    });

    expect(result.operations).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['PDV_REPETIDO', 'DC_DIAS_TRASLAPADOS'])
    );
  });

  it('convierte un PDV a fijo con una nueva vigencia abierta', () => {
    const result = buildPlaneacionRotacionOperations({
      tipo: 'FIJA',
      fechaInicio: '2026-09-01',
      motivo: 'PDV fijo desde septiembre',
      members: [member({ diasLaborales: 'LUN-SAB' })],
    });

    expect(result.issues).toEqual([]);
    expect(result.operations.map((operation) => operation.tipoOperacion)).toEqual([
      'LIBERAR_DC',
      'CAMBIAR_ROTACION',
      'ASIGNAR_DC',
    ]);
    expect(result.operations.at(-1)?.payload).toMatchObject({ tipo: 'FIJA', factorTiempo: 1 });
  });

  it('libera en el mismo lote el PDV externo de una DC movida al nuevo grupo', () => {
    const externalAssignmentId = '55555555-5555-4555-8555-555555555555';
    const result = buildPlaneacionRotacionOperations({
      tipo: 'FIJA',
      fechaInicio: '2026-09-01',
      motivo: 'Movimiento maestro de DC',
      members: [member({ empleadoActualId: '', asignacionActualId: '' })],
      additionalReleases: [
        {
          pdvId: PDV_B,
          empleadoId: DC,
          asignacionId: externalAssignmentId,
        },
      ],
    });

    expect(result.operations[0]).toMatchObject({
      tipoOperacion: 'LIBERAR_DC',
      pdvOrigenId: PDV_B,
      empleadoId: DC,
      payload: { asignacionId: externalAssignmentId },
    });
    expect(result.operations.at(-1)).toMatchObject({
      tipoOperacion: 'ASIGNAR_DC',
      pdvDestinoId: PDV_A,
      empleadoId: DC,
    });
  });
});
