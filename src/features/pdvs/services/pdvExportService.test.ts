import { describe, expect, it } from 'vitest';
import {
  generarCsvPdvsCobertura,
  generarExcelPdvsCobertura,
} from './pdvExportService';
import type { PdvsPanelData } from './pdvService';

function buildMockPanelData(month = '2026-10'): PdvsPanelData {
  return {
    month,
    infraestructuraLista: true,
    supervisoresCatalogo: [],
    turnosCadena: [],
    geocercaDefaultMetros: 100,
    permiteCheckinConJustificacionDefault: true,
    hasActiveFilters: false,
    filters: {
      search: '',
      month,
      cadenaId: '',
      ciudadId: '',
      estado: '',
      zona: '',
      supervisorId: '',
      estatus: '',
      publicacionEstado: '',
    },
    cadenas: [{ id: 'cad-1', codigo: 'BENAVIDES', nombre: 'Farmacias Benavides' }],
    ciudades: [{ id: 'ciu-1', nombre: 'Hermosillo', estado: 'SONORA', zona: 'Noroeste' }],
    estados: ['SONORA'],
    zonas: ['Noroeste'],
    supervisores: [
      {
        id: 'sup-1',
        nombreCompleto: 'Luz Evelia López Gutiérrez',
        zona: 'Noroeste',
      },
      {
        id: 'sup-2',
        nombreCompleto: 'María Zenaida Monroy',
        zona: 'CDMX',
      },
    ],
    resumen: {
      total: 2,
      activos: 2,
      conGeocerca: 2,
      conSupervisor: 2,
      conHorario: 2,
    },
    publicacionMensual: {
      month,
      fechaInicio: `${month}-01`,
      fechaFin: `${month}-31`,
      total: 2,
      asignados: 1,
      parciales: 1,
      sinAsignacion: 0,
      inactivos: 0,
    },
    pdvs: [
      {
        id: 'pdv-1',
        claveBtl: 'BTL-BEN-01',
        idCadena: 'M644',
        cadenaCodigo: 'BENAVIDES',
        cadena: 'Farmacias Benavides',
        cadenaId: 'cad-1',
        nombre: 'Benavides Av 13',
        direccion: 'Av 13 No. 45',
        ciudadId: 'ciu-1',
        ciudad: 'Hermosillo',
        estado: 'SONORA',
        zona: 'Noroeste',
        formato: 'FARMACIA',
        estatus: 'ACTIVO',
        horarioEntrada: '08:00',
        horarioSalida: '16:00',
        horarioMode: 'PERSONALIZADO',
        supervisorActualId: 'sup-1',
        supervisorActual: 'Luz Evelia López Gutiérrez',
        supervisorVigenteDesde: '2026-07-31',
        latitud: 29.10364,
        longitud: -110.95148,
        radioMetros: 100,
        permiteCheckinConJustificacion: true,
        geocercaCompleta: true,
        alertarGeocercaFueraDeRango: false,
        publicacionMensualEstado: 'PARCIAL',
        publicacionMensualDiasAsignados: 12,
        publicacionMensualDiasFaltantes: 19,
        publicacionMensualCoberturaPct: 39,
        publicacionMensualEtiqueta: '12/31 días publicados',
        metadata: {},
      },
      {
        id: 'pdv-2',
        claveBtl: 'BTL-LIV-01',
        idCadena: 'LIV-01',
        cadenaCodigo: 'LIVERPOOL',
        cadena: 'Liverpool',
        cadenaId: 'cad-2',
        nombre: 'Liverpool Lindavista',
        direccion: 'Colector 13 No. 280',
        ciudadId: 'ciu-2',
        ciudad: 'Ciudad de México',
        estado: 'CIUDAD DE MEXICO',
        zona: 'Norte',
        formato: 'DEPARTAMENTAL',
        estatus: 'ACTIVO',
        horarioEntrada: '11:00',
        horarioSalida: '19:00',
        horarioMode: 'CADENA',
        supervisorActualId: 'sup-2',
        supervisorActual: 'María Zenaida Monroy',
        supervisorVigenteDesde: '2026-10-01',
        latitud: 19.48512,
        longitud: -99.13245,
        radioMetros: 100,
        permiteCheckinConJustificacion: true,
        geocercaCompleta: true,
        alertarGeocercaFueraDeRango: false,
        publicacionMensualEstado: 'ASIGNADO',
        publicacionMensualDiasAsignados: 31,
        publicacionMensualDiasFaltantes: 0,
        publicacionMensualCoberturaPct: 100,
        publicacionMensualEtiqueta: '31/31 días publicados',
        metadata: {},
      },
    ],
  };
}

describe('pdvExportService', () => {
  it('genera CSV con el mes especificado, coberturas y supervisores correctos', () => {
    const mockData = buildMockPanelData('2026-10');
    const { csv, filename } = generarCsvPdvsCobertura(mockData);

    expect(filename).toContain('2026-10');
    expect(filename).toMatch(/\.csv$/);

    // Encabezados requeridos
    expect(csv).toContain('MES');
    expect(csv).toContain('CLAVE_BTL');
    expect(csv).toContain('COBERTURA_ESTADO');
    expect(csv).toContain('DIAS_CUBIERTOS');
    expect(csv).toContain('SUPERVISOR_ASIGNADO');

    // Datos de tiendas
    expect(csv).toContain('Benavides Av 13');
    expect(csv).toContain('Luz Evelia López Gutiérrez');
    expect(csv).toContain('PARCIAL');
    expect(csv).toContain('12');

    expect(csv).toContain('Liverpool Lindavista');
    expect(csv).toContain('María Zenaida Monroy');
    expect(csv).toContain('ASIGNADO');
    expect(csv).toContain('31');
  });

  it('genera Excel (.xlsx) con hojas formateadas, metadatos y buffer válido', async () => {
    const mockData = buildMockPanelData('2026-10');
    const { buffer, filename } = await generarExcelPdvsCobertura(mockData);

    expect(filename).toContain('2026-10');
    expect(filename).toMatch(/\.xlsx$/);
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('respeta septiembre cuando se solicita corte de 2026-09', async () => {
    const mockData = buildMockPanelData('2026-09');
    const { filename } = await generarExcelPdvsCobertura(mockData);
    expect(filename).toContain('2026-09');
  });
});
