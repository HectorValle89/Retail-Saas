import { beforeEach, describe, expect, it, vi } from 'vitest';

const { unstableCacheMock } = vi.hoisted(() => ({
  unstableCacheMock: vi.fn((callback: () => Promise<unknown>) => async () => callback()),
}));

vi.mock('next/cache', () => ({
  unstable_cache: unstableCacheMock,
}));

import {
  getPlaneacionMensualCacheTag,
  obtenerPlaneacionMensualDetalleDia,
  obtenerPlaneacionMensualResumen,
  parsePlaneacionMensualResumen,
  refrescarPlaneacionMensualSnapshot,
  type PlaneacionMensualReadRpcClient,
} from './planeacionMensualReadService';

const sampleDay = ['2026-08-01', 'I', null, null, '100.50', 0];

const sampleRow = {
  segmentoClave: 'DC:empleado-1',
  segmentoTipo: 'DC',
  cadenaId: 'cadena-1',
  cadenaNombre: 'Cadena',
  pdvId: 'pdv-1',
  pdvClave: '001',
  pdvNombre: 'Tienda',
  pdvEstatus: 'ACTIVO',
  ciudadId: 'ciudad-1',
  ciudadNombre: 'Ciudad',
  zona: 'Centro',
  empleadoId: 'empleado-1',
  empleadoNomina: '1001',
  empleadoNombre: 'DC Uno',
  rol: 'FIJA',
  factorTiempo: '1',
  naturaleza: 'BASE',
  asignacionId: 'asignacion-1',
  rangoFechaInicio: '2026-08-01',
  rangoFechaFin: '2026-08-31',
  diasLaborales: 'L-S',
  diaDescanso: 'DOMINGO',
  horarioReferencia: 'TC',
  supervisorId: 'supervisor-1',
  supervisorNombre: 'Supervisor Uno',
  diasLaborados: 0,
  diasProgramados: 26,
  cuotaMensual: '3100',
  cuotaIndividual: 0,
  dias: [sampleDay],
};

describe('planeacionMensualReadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('proyecta filas, códigos I/IS, turnos y cuotas sin usar contratos implícitos', () => {
    const result = parsePlaneacionMensualResumen({
      ok: true,
      mes: '2026-08-01',
      version: 4,
      generatedAt: '2026-08-23T10:00:00Z',
      total: 1,
      truncated: false,
      empleadosDisponibles: [{ id: 'empleado-2', label: 'DC Libre · 1002' }],
      supervisoresDisponibles: [{ id: 'supervisor-2', label: 'Supervisor Libre' }],
      rows: [sampleRow],
    });

    expect(result.rows[0]).toMatchObject({
      factorTiempo: 1,
      cuotaMensual: 3100,
      dias: [['2026-08-01', 'I', null, null, 100.5, 0]],
    });
    expect(result.empleadosDisponibles).toEqual([{ id: 'empleado-2', label: 'DC Libre · 1002' }]);
    expect(result.supervisoresDisponibles).toEqual([
      { id: 'supervisor-2', label: 'Supervisor Libre' },
    ]);
  });

  it('normaliza el estado legado TEMPORAL como PDV pausado', () => {
    const result = parsePlaneacionMensualResumen({
      ok: true,
      mes: '2026-08-01',
      version: 4,
      generatedAt: null,
      total: 1,
      truncated: false,
      rows: [{ ...sampleRow, pdvEstatus: 'TEMPORAL' }],
    });

    expect(result.rows[0]?.pdvEstatus).toBe('PAUSADO');
  });

  it('soporta días fuera de vigencia (—) y días por cubrir (PC) tras bajas en el segmento', () => {
    const vacancyRow = {
      ...sampleRow,
      segmentoClave: 'VACANTE',
      segmentoTipo: 'VACANTE',
      empleadoId: null,
      empleadoNombre: 'POR CUBRIR',
      rol: 'VACANTE',
      diasLaborados: 0,
      diasProgramados: 12,
      dias: [
        ['2026-09-18', '—', null, null, 0, 0],
        ['2026-09-19', 'PC', null, null, 0, 0],
      ],
    };

    const result = parsePlaneacionMensualResumen({
      ok: true,
      mes: '2026-09-01',
      version: 5,
      generatedAt: null,
      total: 1,
      truncated: false,
      rows: [vacancyRow],
    });

    expect(result.rows[0].segmentoTipo).toBe('VACANTE');
    expect(result.rows[0].dias).toEqual([
      ['2026-09-18', '—', null, null, 0, 0],
      ['2026-09-19', 'PC', null, null, 0, 0],
    ]);
  });

  it('resuelve la consulta general con una sola RPC y una caché sin expiración temporal', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        mes: '2026-08-01',
        version: 4,
        generatedAt: null,
        total: 1,
        truncated: false,
        rows: [sampleRow],
      },
      error: null,
    });

    const result = await obtenerPlaneacionMensualResumen(
      { rpc } as PlaneacionMensualReadRpcClient,
      'cuenta-1',
      '2026-08-01',
      {
        busqueda: ' tienda ',
        cadenaIds: ['cadena-1', 'cadena-1'],
        limit: 5000,
      }
    );

    expect(result.total).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('obtener_planeacion_mensual_resumen', {
      p_cuenta_cliente_id: 'cuenta-1',
      p_mes: '2026-08-01',
      p_busqueda: 'tienda',
      p_cadena_ids: ['cadena-1'],
      p_supervisor_ids: null,
      p_estados: null,
      p_limit: 1000,
    });
    expect(unstableCacheMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.arrayContaining(['planeacion-mensual-resumen-v2']),
      expect.objectContaining({
        revalidate: false,
        tags: ['planeacion-mensual:cuenta-1:2026-08'],
      })
    );
  });

  it('carga el detalle de una celda solamente cuando se solicita', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        fecha: '2026-08-01',
        pdv: {
          id: 'pdv-1',
          clave: '001',
          nombre: 'Tienda',
          cadenaNombre: 'Cadena',
          ciudadNombre: 'Ciudad',
        },
        cuotaDia: '100.50',
        personas: [
          {
            empleado_id: 'empleado-1',
            nombre_completo: 'DC Uno',
            estado_operativo: 'INCAPACIDAD',
            factor_tiempo: '1',
            programada: true,
          },
        ],
      },
      error: null,
    });

    const result = await obtenerPlaneacionMensualDetalleDia(
      { rpc } as PlaneacionMensualReadRpcClient,
      'cuenta-1',
      'pdv-1',
      '2026-08-01'
    );

    expect(result).toMatchObject({ cuotaDia: 100.5, personas: [{ factor_tiempo: 1 }] });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(unstableCacheMock).not.toHaveBeenCalled();
  });

  it('regenera solo PDVs afectados y elimina duplicados', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

    await refrescarPlaneacionMensualSnapshot(
      { rpc } as PlaneacionMensualReadRpcClient,
      'cuenta-1',
      '2026-08-01',
      ['pdv-1', 'pdv-1', 'pdv-2']
    );

    expect(rpc).toHaveBeenCalledWith('refrescar_planeacion_mensual_snapshot', {
      p_cuenta_cliente_id: 'cuenta-1',
      p_mes: '2026-08-01',
      p_pdv_ids: ['pdv-1', 'pdv-2'],
    });
  });

  it('construye una etiqueta estable por cuenta y mes', () => {
    expect(getPlaneacionMensualCacheTag('cuenta-1', '2026-08-01')).toBe(
      'planeacion-mensual:cuenta-1:2026-08'
    );
  });
});
