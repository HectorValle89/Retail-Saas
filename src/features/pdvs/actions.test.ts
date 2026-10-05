import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  revalidateTagMock,
  requerirAdministradorActivoMock,
  requerirPuestosActivosMock,
  obtenerClienteAdminMock,
  sincronizarReasignacionSupervisorCascadaMock,
  publishUiChangesMock,
} = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  requerirAdministradorActivoMock: vi.fn(),
  requerirPuestosActivosMock: vi.fn(),
  obtenerClienteAdminMock: vi.fn(),
  sincronizarReasignacionSupervisorCascadaMock: vi.fn(),
  publishUiChangesMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}));

vi.mock('@/lib/auth/session', () => ({
  requerirAdministradorActivo: requerirAdministradorActivoMock,
  requerirPuestosActivos: requerirPuestosActivosMock,
}));

vi.mock('@/lib/auth/admin', () => ({
  obtenerClienteAdmin: obtenerClienteAdminMock,
}));

vi.mock('@/lib/ui-change/server', () => ({
  publishUiChanges: publishUiChangesMock,
}));

vi.mock('@/features/asignaciones/services/operationalLifecycleService', () => ({
  sincronizarReasignacionSupervisorCascada: sincronizarReasignacionSupervisorCascadaMock,
  sincronizarAltaPdvCascada: vi.fn(),
  sincronizarInactivacionPdvCascada: vi.fn(),
}));

vi.mock('@/features/asignaciones/services/planeacionMensualReadService', () => ({
  getPlaneacionMensualCacheTag: vi.fn().mockReturnValue('tag'),
  refrescarPlaneacionMensualSnapshot: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/features/asignaciones/services/planeacionCuotaResumenService', () => ({
  refrescarCuotaMensualResumen: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/features/asignaciones/services/asignacionMaterializationService', () => ({
  processMaterializationDirtyQueue: vi.fn().mockResolvedValue(0),
}));

import { reasignarSupervisoresMasivoDesdeMapa } from './actions';

describe('reasignarSupervisoresMasivoDesdeMapa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requerirAdministradorActivoMock.mockResolvedValue({
      usuarioId: 'admin-1',
      puesto: 'ADMINISTRADOR',
      cuentaClienteId: 'cuenta-isdin',
      nombreCompleto: 'Admin User',
    });
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'admin-1',
      puesto: 'ADMINISTRADOR',
      cuentaClienteId: 'cuenta-isdin',
      nombreCompleto: 'Admin User',
    });
  });

  it('rechaza la petición si la lista de PDVs está vacía', async () => {
    const result = await reasignarSupervisoresMasivoDesdeMapa({
      pdvIds: [],
      nuevoSupervisorId: 'sup-1',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Debes seleccionar al menos un punto de venta');
  });

  it('rechaza la petición si no se especifica supervisor destino', async () => {
    const result = await reasignarSupervisoresMasivoDesdeMapa({
      pdvIds: ['pdv-1', 'pdv-2'],
      nuevoSupervisorId: '',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Debes seleccionar un supervisor válido');
  });

  it('reasigna exitosamente en lote ejecutando la cascada aguas arriba y aguas abajo', async () => {
    const fakeService = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      from: vi.fn((table: string) => {
        if (table === 'empleado') {
          const query: any = {
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'sup-1',
                nombre_completo: 'María Zenaida Monroy',
                estatus_laboral: 'ACTIVO',
                puesto: 'SUPERVISOR',
              },
              error: null,
            }),
          };
          query.eq = () => query;
          return {
            select: () => query,
          };
        }
        if (table === 'audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        };
      }),
    };

    obtenerClienteAdminMock.mockReturnValue({
      service: fakeService,
    });

    sincronizarReasignacionSupervisorCascadaMock.mockResolvedValue({
      ok: true,
      pdvsActualizados: 2,
      cuotasTransferidas: 2,
    });

    const result = await reasignarSupervisoresMasivoDesdeMapa({
      pdvIds: ['pdv-1', 'pdv-2'],
      nuevoSupervisorId: 'sup-1',
      fechaEfectiva: '2026-10-01',
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(result.message).toContain('María Zenaida Monroy');
    expect(result.message).toContain('a partir del 2026-10-01');

    // Verifica ejecución de la cascada completa con fecha efectiva
    expect(sincronizarReasignacionSupervisorCascadaMock).toHaveBeenCalledWith(
      fakeService,
      expect.objectContaining({
        pdvIds: ['pdv-1', 'pdv-2'],
        nuevoSupervisorId: 'sup-1',
        fechaEfectiva: '2026-10-01',
      })
    );

    // Verifica revalidación de caché
    expect(revalidateTagMock).toHaveBeenCalledWith('pdvs', 'max');
    expect(revalidateTagMock).toHaveBeenCalledWith('planeacion-mensual', 'max');
  });
});
