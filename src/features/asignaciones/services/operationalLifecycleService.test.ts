import { describe, expect, it, vi } from 'vitest';
import {
  sincronizarAltaPdvCascada,
  sincronizarInactivacionPdvCascada,
  sincronizarReasignacionSupervisorCascada,
} from './operationalLifecycleService';

describe('operationalLifecycleService', () => {
  const cuentaClienteId = '11111111-1111-4111-8111-111111111111';
  const pdvId = '22222222-2222-4222-8222-222222222222';
  const supervisorId = '33333333-3333-4333-8333-333333333333';
  const nuevoSupervisorId = '44444444-4444-4444-8444-444444444444';

  describe('sincronizarAltaPdvCascada', () => {
    it('crea la cuota del supervisor en ruta_cuota_supervisor_pdv si no existe', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });

      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'ruta_cuota_supervisor_pdv') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      maybeSingle: maybeSingleMock,
                    }),
                  }),
                }),
              }),
              insert: insertMock,
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            rpc: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      };

      const result = await sincronizarAltaPdvCascada(supabase as never, {
        pdvId,
        cuentaClienteId,
        supervisorId,
        visitasMensualesDefault: 4,
      });

      expect(result.ok).toBe(true);
      expect(result.cuotaGenerada).toBe(true);
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cuenta_cliente_id: cuentaClienteId,
          supervisor_empleado_id: supervisorId,
          pdv_id: pdvId,
          visitas_mensuales: 4,
          vigente_hasta: null,
        })
      );
    });

    it('no duplica la cuota si ya existe una activa para el supervisor', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: { id: 'existing-cuota-id' },
        error: null,
      });

      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'ruta_cuota_supervisor_pdv') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      maybeSingle: maybeSingleMock,
                    }),
                  }),
                }),
              }),
              insert: insertMock,
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            rpc: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      };

      const result = await sincronizarAltaPdvCascada(supabase as never, {
        pdvId,
        cuentaClienteId,
        supervisorId,
      });

      expect(result.ok).toBe(true);
      expect(result.cuotaGenerada).toBe(false);
      expect(insertMock).not.toHaveBeenCalled();
    });
  });

  describe('sincronizarInactivacionPdvCascada', () => {
    it('cierra asignaciones activas de DC y cuotas de supervisión', async () => {
      const updateAsignacionMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const updateCuotaMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const insertDirtyQueueMock = vi.fn().mockResolvedValue({ error: null });

      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'asignacion') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      lte: vi.fn().mockReturnValue({
                        or: vi.fn().mockResolvedValue({
                          data: [
                            {
                              id: 'asig-1',
                              fecha_inicio: '2026-09-01',
                              fecha_fin: null,
                              empleado_id: 'dc-1',
                              observaciones: null,
                            },
                          ],
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              update: updateAsignacionMock,
            };
          }
          if (table === 'ruta_cuota_supervisor_pdv') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  or: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'cuota-1',
                        vigente_desde: '2026-08-01',
                        vigente_hasta: null,
                      },
                    ],
                  }),
                }),
              }),
              update: updateCuotaMock,
              delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            };
          }
          if (table === 'asignacion_diaria_dirty_queue') {
            return {
              insert: insertDirtyQueueMock,
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            rpc: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      };

      const result = await sincronizarInactivacionPdvCascada(supabase as never, {
        pdvId,
        cuentaClienteId,
        fechaInactivacion: '2026-09-17',
        motivo: 'PDV cerrado por remodelación',
      });

      expect(result.ok).toBe(true);
      expect(result.asignacionesCerradas).toBe(1);
      expect(result.cuotasCerradas).toBe(1);
      expect(updateAsignacionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fecha_fin: '2026-09-16',
          observaciones: expect.stringContaining('PDV cerrado por remodelación'),
        })
      );
      expect(updateCuotaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          vigente_hasta: '2026-09-16',
        })
      );
    });
  });

  describe('sincronizarReasignacionSupervisorCascada', () => {
    it('sincroniza supervisor_pdv, asignacion, empleado y transfiere ruta_cuota_supervisor_pdv', async () => {
      const updateSupervisorPdvMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const insertSupervisorPdvMock = vi.fn().mockResolvedValue({ error: null });
      const updateAsignacionMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const updateEmpleadoMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const updateCuotaMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const insertCuotaMock = vi.fn().mockResolvedValue({ error: null });
      const updateDailyMock = vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'supervisor_pdv') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation((col: string, val: unknown) => {
                    if (col === 'activo') {
                      return Promise.resolve({
                        data: [
                          {
                            id: 'sp-1',
                            pdv_id: pdvId,
                            empleado_id: supervisorId,
                            fecha_inicio: '2026-08-01',
                            activo: true,
                          },
                        ],
                      });
                    }
                    if (col === 'empleado_id') {
                      return {
                        eq: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                        }),
                      };
                    }
                    return Promise.resolve({ data: [] });
                  }),
                }),
              }),
              update: updateSupervisorPdvMock,
              insert: insertSupervisorPdvMock,
            };
          }
          if (table === 'asignacion') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      or: vi.fn().mockResolvedValue({
                        data: [
                          {
                            id: 'asig-1',
                            empleado_id: 'dc-1',
                            supervisor_empleado_id: supervisorId,
                          },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
              update: updateAsignacionMock,
            };
          }
          if (table === 'empleado') {
            return {
              update: updateEmpleadoMock,
            };
          }
          if (table === 'ruta_cuota_supervisor_pdv') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  or: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'cuota-old',
                        supervisor_empleado_id: supervisorId,
                        visitas_mensuales: 4,
                        vigente_desde: '2026-08-01',
                        vigente_hasta: null,
                      },
                    ],
                  }),
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              update: updateCuotaMock,
              insert: insertCuotaMock,
              delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            };
          }
          if (table === 'asignacion_diaria_resuelta') {
            return {
              update: updateDailyMock,
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            rpc: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      };

      const result = await sincronizarReasignacionSupervisorCascada(supabase as never, {
        pdvIds: [pdvId],
        nuevoSupervisorId,
        fechaEfectiva: '2026-09-17',
        cuentaClienteId,
      });

      expect(result.ok).toBe(true);
      expect(result.pdvsActualizados).toBe(1);
      expect(result.asignacionesActualizadas).toBe(1);
      expect(result.cuotasTransferidas).toBe(1);

      expect(updateSupervisorPdvMock).toHaveBeenCalledWith(
        expect.objectContaining({
          activo: false,
          fecha_fin: '2026-09-16',
        })
      );
      expect(insertSupervisorPdvMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pdv_id: pdvId,
          empleado_id: nuevoSupervisorId,
          activo: true,
          fecha_inicio: '2026-09-17',
          fecha_fin: null,
        })
      );
      expect(updateAsignacionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          supervisor_empleado_id: nuevoSupervisorId,
        })
      );
      expect(updateEmpleadoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          supervisor_empleado_id: nuevoSupervisorId,
        })
      );
      expect(updateCuotaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          vigente_hasta: '2026-09-16',
        })
      );
      expect(insertCuotaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          supervisor_empleado_id: nuevoSupervisorId,
          pdv_id: pdvId,
          visitas_mensuales: 4,
          vigente_desde: '2026-09-01',
          vigente_hasta: null,
        })
      );
    });
  });
});
