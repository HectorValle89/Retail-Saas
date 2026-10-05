import { describe, it, expect } from 'vitest';
import {
  calculateSupervisorMonthlyStatus,
  summarizeMonthlyRouteStatuses,
  type SupervisorMonthlyStatus,
} from './monthlyRouteStatus';
import type { RutaCalendarioSupervisorRow, RutaCalendarioCell } from '../services/rutaCalendarioMensualService';

function makeCell(override: Partial<RutaCalendarioCell>): RutaCalendarioCell {
  return {
    fecha: '2026-09-01',
    numero: 1,
    letra: 'M',
    routeId: 'route-1',
    routeStatus: 'PUBLICADA',
    approvalState: 'APROBADA',
    plannedCount: 4,
    completedCount: 4,
    pendingCount: 0,
    replacementPendingCount: 0,
    eventCount: 0,
    displacedCount: 0,
    tone: 'emerald',
    label: '4/4',
    ...override,
  };
}

describe('monthlyRouteStatus', () => {
  it('identifica como FALTANTE a un supervisor sin visitas planeadas', () => {
    const row: RutaCalendarioSupervisorRow = {
      supervisorEmpleadoId: 'sup-1',
      supervisor: 'Juan Perez',
      zona: 'CENTRO',
      cells: [
        makeCell({ fecha: '2026-09-01', plannedCount: 0, completedCount: 0, approvalState: 'SIN_RUTA' }),
        makeCell({ fecha: '2026-09-02', plannedCount: 0, completedCount: 0, approvalState: 'SIN_RUTA' }),
      ],
    };

    const status = calculateSupervisorMonthlyStatus(row);
    expect(status.estado).toBe('FALTANTE');
    expect(status.diasPlaneados).toBe(0);
    expect(status.totalVisitas).toBe(0);
    expect(status.porcentajeAvance).toBe(0);
  });

  it('identifica como APROBADA cuando todas las celdas planeadas están aprobadas', () => {
    const row: RutaCalendarioSupervisorRow = {
      supervisorEmpleadoId: 'sup-2',
      supervisor: 'Gloria Avila',
      zona: 'METRO',
      cells: [
        makeCell({ fecha: '2026-09-01', plannedCount: 5, completedCount: 5, approvalState: 'APROBADA' }),
        makeCell({ fecha: '2026-09-02', plannedCount: 5, completedCount: 3, pendingCount: 2, approvalState: 'APROBADA' }),
      ],
    };

    const status = calculateSupervisorMonthlyStatus(row);
    expect(status.estado).toBe('APROBADA');
    expect(status.diasPlaneados).toBe(2);
    expect(status.totalVisitas).toBe(10);
    expect(status.visitasCompletadas).toBe(8);
    expect(status.visitasPendientes).toBe(2);
    expect(status.porcentajeAvance).toBe(80);
  });

  it('identifica como CAMBIOS_SOLICITADOS si alguna celda tiene esa solicitud', () => {
    const row: RutaCalendarioSupervisorRow = {
      supervisorEmpleadoId: 'sup-3',
      supervisor: 'Carlos Mendez',
      zona: 'NORTE',
      cells: [
        makeCell({ fecha: '2026-09-01', plannedCount: 4, completedCount: 0, approvalState: 'CAMBIOS_SOLICITADOS' }),
        makeCell({ fecha: '2026-09-02', plannedCount: 4, completedCount: 0, approvalState: 'PENDIENTE_COORDINACION' }),
      ],
    };

    const status = calculateSupervisorMonthlyStatus(row);
    expect(status.estado).toBe('CAMBIOS_SOLICITADOS');
  });

  it('identifica como ENVIADA si tiene visitas y está pendiente de coordinación', () => {
    const row: RutaCalendarioSupervisorRow = {
      supervisorEmpleadoId: 'sup-4',
      supervisor: 'Laura Gomez',
      zona: 'SUR',
      cells: [
        makeCell({ fecha: '2026-09-01', plannedCount: 3, completedCount: 0, approvalState: 'PENDIENTE_COORDINACION' }),
        makeCell({ fecha: '2026-09-02', plannedCount: 3, completedCount: 0, approvalState: 'PENDIENTE_COORDINACION' }),
      ],
    };

    const status = calculateSupervisorMonthlyStatus(row);
    expect(status.estado).toBe('ENVIADA');
    expect(status.totalVisitas).toBe(6);
  });

  it('resume correctamente las métricas y conteos del tablero mensual', () => {
    const items: SupervisorMonthlyStatus[] = [
      {
        supervisorEmpleadoId: 's1',
        supervisor: 'Sup 1',
        zona: 'A',
        estado: 'FALTANTE',
        diasPlaneados: 0,
        totalVisitas: 0,
        visitasCompletadas: 0,
        visitasPendientes: 0,
        porcentajeAvance: 0,
        cells: [],
      },
      {
        supervisorEmpleadoId: 's2',
        supervisor: 'Sup 2',
        zona: 'B',
        estado: 'ENVIADA',
        diasPlaneados: 20,
        totalVisitas: 80,
        visitasCompletadas: 0,
        visitasPendientes: 80,
        porcentajeAvance: 0,
        cells: [],
      },
      {
        supervisorEmpleadoId: 's3',
        supervisor: 'Sup 3',
        zona: 'C',
        estado: 'APROBADA',
        diasPlaneados: 22,
        totalVisitas: 100,
        visitasCompletadas: 50,
        visitasPendientes: 50,
        porcentajeAvance: 50,
        cells: [],
      },
      {
        supervisorEmpleadoId: 's4',
        supervisor: 'Sup 4',
        zona: 'D',
        estado: 'CAMBIOS_SOLICITADOS',
        diasPlaneados: 18,
        totalVisitas: 70,
        visitasCompletadas: 0,
        visitasPendientes: 70,
        porcentajeAvance: 0,
        cells: [],
      },
    ];

    const summary = summarizeMonthlyRouteStatuses(items);
    expect(summary.totalSupervisores).toBe(4);
    expect(summary.faltantes).toBe(1);
    expect(summary.enviadas).toBe(1);
    expect(summary.aprobadas).toBe(1);
    expect(summary.cambiosSolicitados).toBe(1);
    expect(summary.totalVisitasPlaneadas).toBe(250);
  });
});
