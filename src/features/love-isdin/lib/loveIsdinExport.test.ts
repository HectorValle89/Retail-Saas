import { describe, it, expect } from 'vitest';
import { exportarLoveIsdinKpisToExcel } from './loveIsdinExport';

describe('loveIsdinExport Excel generation', () => {
  it('should run successfully without errors', async () => {
    // Mock the DOM elements used at the end of the export function
    const mockLink = {
      href: '',
      download: '',
      click: () => {},
    };
    
    global.document = {
      createElement: (tag: string) => {
        if (tag === 'a') return mockLink;
        return {};
      },
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
    } as any;
    
    global.URL = {
      createObjectURL: () => 'blob:mock-url',
    } as any;
    
    global.Blob = class {
      constructor(parts: any[], options: any) {}
    } as any;

    const mockData: any = {
      range: 'mes',
      filters: {},
      kpiSummary: {
        total: 10,
        objetivo: 20,
        validas: 8,
        pendientes: 2,
        rechazadas: 0,
        duplicadas: 0,
        cumplimientoPct: 50,
        restante: 10,
      },
      kpiDataset: [
        {
          fechaOperacion: '2026-07-01',
          weekBucket: 'SEM 1',
          pdvId: 'pdv-1',
          pdvLabel: 'Sanapiel Oblatos',
          empleadoId: 'emp-1',
          empleadoLabel: 'Dermo Uno',
          supervisorId: 'sup-1',
          supervisorLabel: 'Super Uno',
          zona: 'Centro',
          cadena: 'Sanapiel',
          total: 2,
          objetivo: 3,
          validas: 2,
          pendientes: 0,
          rechazadas: 0,
          duplicadas: 0,
          ausenciaTipo: null,
          ausenciaObservacion: null,
          estatusLaboral: 'ACTIVO',
        },
        {
          fechaOperacion: '2026-07-08',
          weekBucket: 'SEM 2',
          pdvId: 'pdv-2',
          pdvLabel: 'Farmacia Normal',
          empleadoId: 'emp-2',
          empleadoLabel: 'Dermo Dos',
          supervisorId: 'sup-1',
          supervisorLabel: 'Super Uno',
          zona: 'Centro',
          cadena: 'Otros',
          total: 5,
          objetivo: 6,
          validas: 5,
          pendientes: 0,
          rechazadas: 0,
          duplicadas: 0,
          ausenciaTipo: 'VACACIONES',
          ausenciaObservacion: 'Vacaciones parciales',
          estatusLaboral: 'ACTIVO',
        }
      ],
      porPdv: [
        { id: 'pdv-1', label: 'Sanapiel Oblatos', helper: 'Centro', total: 2, objetivo: 0, validas: 2, pendientes: 0, rechazadas: 0, duplicadas: 0 },
        { id: 'pdv-2', label: 'Farmacia Normal', helper: 'Centro', total: 5, objetivo: 6, validas: 5, pendientes: 0, rechazadas: 0, duplicadas: 0 }
      ],
      porDc: [
        { id: 'emp-1', label: 'Dermo Uno', helper: 'Centro', total: 2, objetivo: 0, validas: 2, pendientes: 0, rechazadas: 0, duplicadas: 0 },
        { id: 'emp-2', label: 'Dermo Dos', helper: 'Centro', total: 5, objetivo: 6, validas: 5, pendientes: 0, rechazadas: 0, duplicadas: 0 }
      ],
      porSupervisor: [
        { id: 'sup-1', label: 'Super Uno', helper: 'Centro', total: 7, objetivo: 6, validas: 7, pendientes: 0, rechazadas: 0, duplicadas: 0 }
      ],
      porCadena: [
        { id: 'cadena-1', label: 'Sanapiel', helper: null, total: 2, objetivo: 0, validas: 2, pendientes: 0, rechazadas: 0, duplicadas: 0 },
        { id: 'cadena-2', label: 'Otros', helper: null, total: 5, objetivo: 6, validas: 5, pendientes: 0, rechazadas: 0, duplicadas: 0 }
      ],
      diaria: [],
      semanal: [],
    };

    console.log('Starting export test execution...');
    await exportarLoveIsdinKpisToExcel(mockData);
    console.log('Export test execution finished successfully!');
  });
});
