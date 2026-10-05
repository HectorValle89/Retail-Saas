import { describe, expect, it } from 'vitest';
import type { PlaneacionMensualFila } from '@/features/asignaciones/types/planeacionMensual';
import { buildPlaneacionMasivaPdvOperations } from './planeacionMasivaPdv';

function row(patch: Partial<PlaneacionMensualFila>): PlaneacionMensualFila {
  return {
    segmentoClave: 'segmento-1',
    segmentoTipo: 'DC',
    cadenaId: 'cadena-1',
    cadenaNombre: 'Cadena',
    pdvId: 'pdv-1',
    pdvClave: 'PDV-1',
    pdvNombre: 'Tienda 1',
    pdvEstatus: 'ACTIVO',
    ciudadId: null,
    ciudadNombre: null,
    zona: null,
    empleadoId: 'dc-1',
    empleadoNomina: '1',
    empleadoNombre: 'DC Uno',
    rol: 'FIJA',
    factorTiempo: 1,
    naturaleza: 'BASE',
    asignacionId: 'asignacion-1',
    rangoFechaInicio: '2026-09-01',
    rangoFechaFin: '2026-09-30',
    diasLaborales: 'LUN-SAB',
    diaDescanso: 'DOM',
    horarioReferencia: 'TC',
    supervisorId: 'supervisor-1',
    supervisorNombre: 'Supervisor Uno',
    diasLaborados: 26,
    diasProgramados: 26,
    cuotaMensual: 0,
    cuotaIndividual: 0,
    dias: [],
    ...patch,
  };
}

describe('planeacionMasivaPdv', () => {
  it('libera todas las asignaciones vigentes de los PDVs seleccionados', () => {
    const result = buildPlaneacionMasivaPdvOperations({
      rows: [
        row({}),
        row({
          segmentoClave: 'segmento-2',
          empleadoId: 'dc-2',
          asignacionId: 'asignacion-2',
        }),
      ],
      pdvIds: ['pdv-1'],
      tipo: 'LIBERAR_DCS',
      fechaInicio: '2026-09-01',
      motivo: 'Liberación masiva',
    });

    expect(result.issues).toEqual([]);
    expect(result.operations).toHaveLength(2);
    expect(result.operations.every((operation) => operation.tipoOperacion === 'LIBERAR_DC')).toBe(
      true
    );
  });

  it('crea una reasignación explícita por PDV aunque existan supervisores distintos', () => {
    const result = buildPlaneacionMasivaPdvOperations({
      rows: [
        row({}),
        row({ pdvId: 'pdv-2', supervisorId: 'supervisor-2', asignacionId: 'asignacion-2' }),
      ],
      pdvIds: ['pdv-1', 'pdv-2'],
      tipo: 'REASIGNAR_SUPERVISOR',
      fechaInicio: '2026-09-01',
      motivo: 'Redistribución de cartera',
      supervisorDestinoId: 'supervisor-3',
    });

    expect(result.issues).toEqual([]);
    expect(result.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pdvOrigenId: 'pdv-1',
          payload: expect.objectContaining({ supervisorOrigenId: 'supervisor-1' }),
        }),
        expect.objectContaining({
          pdvOrigenId: 'pdv-2',
          payload: expect.objectContaining({ supervisorOrigenId: 'supervisor-2' }),
        }),
      ])
    );
  });

  it('bloquea tiendas vacantes y reasignaciones que no cambian supervisor', () => {
    const vacancy = row({
      segmentoTipo: 'VACANTE',
      empleadoId: null,
      asignacionId: null,
      empleadoNombre: 'POR CUBRIR',
    });
    const release = buildPlaneacionMasivaPdvOperations({
      rows: [vacancy],
      pdvIds: ['pdv-1'],
      tipo: 'LIBERAR_DCS',
      fechaInicio: '2026-09-01',
      motivo: 'Liberación masiva',
    });
    const supervisor = buildPlaneacionMasivaPdvOperations({
      rows: [row({})],
      pdvIds: ['pdv-1'],
      tipo: 'REASIGNAR_SUPERVISOR',
      fechaInicio: '2026-09-01',
      motivo: 'Sin cambio',
      supervisorDestinoId: 'supervisor-1',
    });

    expect(release.issues).toContainEqual({ code: 'PDV_SIN_DC_VIGENTE', pdvId: 'pdv-1' });
    expect(supervisor.issues).toContainEqual({ code: 'SUPERVISOR_SIN_CAMBIO', pdvId: 'pdv-1' });
  });

  it('permite liberar asignación cuando el colaborador asignado fue promovido de rol', () => {
    const promotedRow = row({
      pdvId: 'pdv-aragon',
      rangoFechaInicio: '2026-10-01',
      rangoFechaFin: '2026-10-31',
      empleadoId: 'angel-uriel',
      empleadoNombre: 'ANGEL URIEL ALANIS ALARCON',
      supervisorNombre: 'LILIANA REYES AYBAR',
      asignacionId: 'asig-aragon-1',
    });
    const release = buildPlaneacionMasivaPdvOperations({
      rows: [promotedRow],
      pdvIds: ['pdv-aragon'],
      tipo: 'LIBERAR_DCS',
      fechaInicio: '2026-10-04',
      motivo: 'PROMOCIÓN',
    });

    expect(release.issues).toEqual([]);
    expect(release.operations).toHaveLength(1);
    expect(release.operations[0]).toEqual({
      tipoOperacion: 'LIBERAR_DC',
      empleadoId: 'angel-uriel',
      pdvOrigenId: 'pdv-aragon',
      pdvDestinoId: null,
      fechaInicio: '2026-10-04',
      fechaFin: null,
      motivo: 'PROMOCIÓN',
      payload: { asignacionId: 'asig-aragon-1' },
    });
  });
});

