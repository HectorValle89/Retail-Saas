import { describe, expect, it } from 'vitest';
import { filterPdvsForOperationalMap, type PdvMapFilterOptions } from './pdvMapFilters';
import type { PdvListadoItem } from '../services/pdvService';

function buildMockPdv(overrides: Partial<PdvListadoItem> = {}): PdvListadoItem {
  return {
    id: 'pdv-1',
    claveBtl: 'BTL-001',
    nombre: 'Farmacia San Pablo',
    cadenaId: 'cad-1',
    idCadena: 'SAN',
    cadenaCodigo: 'SAN',
    cadena: 'San Pablo',
    ciudadId: 'cdmx',
    ciudad: 'CDMX',
    estado: 'Ciudad de México',
    zona: 'Centro',
    direccion: 'Av Reforma 123',
    formato: 'FARMACIA',
    horarioEntrada: '08:00',
    horarioSalida: '16:00',
    horarioMode: 'BASE_PDV',
    supervisorActualId: 'sup-1',
    supervisorActual: 'Supervisor Uno',
    supervisorVigenteDesde: '2026-01-01',
    latitud: 19.4326,
    longitud: -99.1332,
    radioMetros: 100,
    permiteCheckinConJustificacion: true,
    geocercaCompleta: true,
    estatus: 'ACTIVO',
    alertarGeocercaFueraDeRango: false,
    metadata: {},
    publicacionMensualEstado: 'ASIGNADO',
    publicacionMensualDiasAsignados: 26,
    publicacionMensualDiasFaltantes: 0,
    publicacionMensualCoberturaPct: 100,
    publicacionMensualEtiqueta: 'Asignado 26/26 días',
    ...overrides,
  };
}

describe('filterPdvsForOperationalMap', () => {
  const baseOptions: PdvMapFilterOptions = {
    territoryScope: 'ALL',
    cdmxSupervisorIds: new Set(['sup-cdmx-1']),
    selectedSupervisorIds: new Set(['ALL']),
    statusFilter: 'ALL',
    coverageFilter: 'ALL',
  };

  it('excluye PDVs sin coordenadas o geocerca incompleta', () => {
    const pdvValido = buildMockPdv({ id: 'valido' });
    const pdvSinLat = buildMockPdv({ id: 'sin-lat', latitud: null });
    const pdvSinGeo = buildMockPdv({ id: 'sin-geo', geocercaCompleta: false });

    const result = filterPdvsForOperationalMap([pdvValido, pdvSinLat, pdvSinGeo], baseOptions);
    expect(result.map((p) => p.id)).toEqual(['valido']);
  });

  it('filtra por supervisores específicos (selección múltiple)', () => {
    const pdvSup1 = buildMockPdv({ id: 'pdv-sup1', supervisorActualId: 'sup-1' });
    const pdvSup2 = buildMockPdv({ id: 'pdv-sup2', supervisorActualId: 'sup-2' });
    const pdvSup3 = buildMockPdv({ id: 'pdv-sup3', supervisorActualId: 'sup-3' });
    const pdvSinSup = buildMockPdv({ id: 'pdv-sin-sup', supervisorActualId: null });

    // Seleccionar solo sup-1 y sup-3
    const options: PdvMapFilterOptions = {
      ...baseOptions,
      selectedSupervisorIds: new Set(['sup-1', 'sup-3']),
    };

    const result = filterPdvsForOperationalMap([pdvSup1, pdvSup2, pdvSup3, pdvSinSup], options);
    expect(result.map((p) => p.id)).toEqual(['pdv-sup1', 'pdv-sup3']);
  });

  it('soporta seleccionar "UNASSIGNED" junto con supervisores específicos', () => {
    const pdvSup1 = buildMockPdv({ id: 'pdv-sup1', supervisorActualId: 'sup-1' });
    const pdvSup2 = buildMockPdv({ id: 'pdv-sup2', supervisorActualId: 'sup-2' });
    const pdvSinSup = buildMockPdv({ id: 'pdv-sin-sup', supervisorActualId: null });

    const options: PdvMapFilterOptions = {
      ...baseOptions,
      selectedSupervisorIds: new Set(['sup-1', 'UNASSIGNED']),
    };

    const result = filterPdvsForOperationalMap([pdvSup1, pdvSup2, pdvSinSup], options);
    expect(result.map((p) => p.id)).toEqual(['pdv-sup1', 'pdv-sin-sup']);
  });

  it('filtra por estatus: solo activos vs solo inactivos', () => {
    const pdvActivo = buildMockPdv({ id: 'activo', estatus: 'ACTIVO' });
    const pdvTemporal = buildMockPdv({ id: 'temporal', estatus: 'TEMPORAL' });
    const pdvInactivo = buildMockPdv({ id: 'inactivo', estatus: 'INACTIVO' });

    const activos = filterPdvsForOperationalMap(
      [pdvActivo, pdvTemporal, pdvInactivo],
      { ...baseOptions, statusFilter: 'ACTIVO' }
    );
    expect(activos.map((p) => p.id)).toEqual(['activo', 'temporal']);

    const inactivos = filterPdvsForOperationalMap(
      [pdvActivo, pdvTemporal, pdvInactivo],
      { ...baseOptions, statusFilter: 'INACTIVO' }
    );
    expect(inactivos.map((p) => p.id)).toEqual(['inactivo']);
  });

  it('filtra por cobertura DC: con DC vs vacantes', () => {
    const pdvConDc = buildMockPdv({
      id: 'con-dc',
      publicacionMensualEstado: 'ASIGNADO',
      publicacionMensualDiasAsignados: 26,
    });
    const pdvParcial = buildMockPdv({
      id: 'parcial',
      publicacionMensualEstado: 'PARCIAL',
      publicacionMensualDiasAsignados: 12,
    });
    const pdvVacante = buildMockPdv({
      id: 'vacante',
      publicacionMensualEstado: 'SIN_ASIGNACION',
      publicacionMensualDiasAsignados: 0,
    });

    const conDc = filterPdvsForOperationalMap(
      [pdvConDc, pdvParcial, pdvVacante],
      { ...baseOptions, coverageFilter: 'CON_DC' }
    );
    expect(conDc.map((p) => p.id)).toEqual(['con-dc', 'parcial']);

    const vacantes = filterPdvsForOperationalMap(
      [pdvConDc, pdvParcial, pdvVacante],
      { ...baseOptions, coverageFilter: 'VACANTE' }
    );
    expect(vacantes.map((p) => p.id)).toEqual(['vacante']);
  });

  it('combina filtros de territorio, estatus y vacantes correctamente', () => {
    const cdmxActivoVacante = buildMockPdv({
      id: 'cdmx-act-vac',
      supervisorActualId: 'sup-cdmx-1',
      estatus: 'ACTIVO',
      publicacionMensualEstado: 'SIN_ASIGNACION',
      publicacionMensualDiasAsignados: 0,
    });
    const cdmxActivoConDc = buildMockPdv({
      id: 'cdmx-act-dc',
      supervisorActualId: 'sup-cdmx-1',
      estatus: 'ACTIVO',
      publicacionMensualEstado: 'ASIGNADO',
      publicacionMensualDiasAsignados: 26,
    });
    const cdmxInactivoVacante = buildMockPdv({
      id: 'cdmx-inact-vac',
      supervisorActualId: 'sup-cdmx-1',
      estatus: 'INACTIVO',
      publicacionMensualEstado: 'SIN_ASIGNACION',
      publicacionMensualDiasAsignados: 0,
    });
    const foraneoActivoVacante = buildMockPdv({
      id: 'foraneo-act-vac',
      supervisorActualId: 'sup-foraneo-1',
      estatus: 'ACTIVO',
      publicacionMensualEstado: 'SIN_ASIGNACION',
      publicacionMensualDiasAsignados: 0,
    });

    const result = filterPdvsForOperationalMap(
      [cdmxActivoVacante, cdmxActivoConDc, cdmxInactivoVacante, foraneoActivoVacante],
      {
        territoryScope: 'CDMX',
        cdmxSupervisorIds: new Set(['sup-cdmx-1']),
        selectedSupervisorIds: new Set(['ALL']),
        statusFilter: 'ACTIVO',
        coverageFilter: 'VACANTE',
      }
    );

    expect(result.map((p) => p.id)).toEqual(['cdmx-act-vac']);
  });
});
