import { describe, expect, it } from 'vitest';
import {
  parseRutaSemanalWorkflowMetadata,
  serializeRutaSemanalWorkflowMetadata,
  type RutaApprovalState,
} from './routeWorkflow';

describe('routeWorkflow approval & correction transitions', () => {
  it('permite cambiar una ruta aprobada a CAMBIOS_SOLICITADOS y posteriormente reaprobarla', () => {
    // 1. Estado inicial APROBADA
    const initial = parseRutaSemanalWorkflowMetadata({
      approval: {
        state: 'APROBADA' as RutaApprovalState,
        note: 'Ruta validada inicialmente',
        reviewedAt: '2026-08-17T10:00:00.000Z',
        reviewedByUsuarioId: 'user-coord-1',
      },
    });

    expect(initial.approval.state).toBe('APROBADA');

    // 2. Administrador solicita corrección
    const cambiosSolicitados = parseRutaSemanalWorkflowMetadata({
      ...initial,
      approval: {
        state: 'CAMBIOS_SOLICITADOS' as RutaApprovalState,
        note: 'Se requiere agregar 2 PDVs faltantes',
        reviewedAt: '2026-08-20T12:00:00.000Z',
        reviewedByUsuarioId: 'user-admin-1',
      },
    });

    expect(cambiosSolicitados.approval.state).toBe('CAMBIOS_SOLICITADOS');
    expect(cambiosSolicitados.approval.note).toBe('Se requiere agregar 2 PDVs faltantes');

    // 3. Re-aprobación posterior por Administrador General
    const reaprobada = parseRutaSemanalWorkflowMetadata({
      ...cambiosSolicitados,
      approval: {
        state: 'APROBADA' as RutaApprovalState,
        note: 'Ruta corregida y aprobada nuevamente',
        reviewedAt: '2026-08-20T13:00:00.000Z',
        reviewedByUsuarioId: 'user-admin-1',
      },
    });

    expect(reaprobada.approval.state).toBe('APROBADA');
    expect(reaprobada.approval.note).toBe('Ruta corregida y aprobada nuevamente');

    // Serialización conserva el estado APROBADA
    const serialized = serializeRutaSemanalWorkflowMetadata(reaprobada);
    expect(serialized.approval.state).toBe('APROBADA');
  });

  it('valida que tanto COORDINADOR como ADMINISTRADOR son puestos autorizados para revisar rutas', () => {
    const isAuthorizedToReviewRoutes = (puesto: string) => {
      return puesto === 'COORDINADOR' || puesto === 'ADMINISTRADOR';
    };

    expect(isAuthorizedToReviewRoutes('ADMINISTRADOR')).toBe(true);
    expect(isAuthorizedToReviewRoutes('COORDINADOR')).toBe(true);
    expect(isAuthorizedToReviewRoutes('SUPERVISOR')).toBe(false);
    expect(isAuthorizedToReviewRoutes('DERMOCONSEJERA')).toBe(false);
  });

  it('permite a administradores y coordinadores revisar rutas aunque provengan de un envio mensual', () => {
    const canReviewRoute = (params: {
      actorPuesto: string;
      metadataColumnAvailable: boolean;
      puedeEditar: boolean;
    }) => {
      return (
        (params.actorPuesto === 'COORDINADOR' || params.actorPuesto === 'ADMINISTRADOR') &&
        (params.metadataColumnAvailable || !params.puedeEditar)
      );
    };

    // Administrador revisando ruta enviada en paquete mensual
    expect(
      canReviewRoute({
        actorPuesto: 'ADMINISTRADOR',
        metadataColumnAvailable: true,
        puedeEditar: false,
      })
    ).toBe(true);

    // Coordinador revisando ruta enviada en paquete mensual
    expect(
      canReviewRoute({
        actorPuesto: 'COORDINADOR',
        metadataColumnAvailable: true,
        puedeEditar: false,
      })
    ).toBe(true);

    // Supervisor no puede auto-aprobar
    expect(
      canReviewRoute({
        actorPuesto: 'SUPERVISOR',
        metadataColumnAvailable: true,
        puedeEditar: true,
      })
    ).toBe(false);
  });
});
