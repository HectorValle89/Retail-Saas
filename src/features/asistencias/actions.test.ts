import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requerirPuestosActivosMock,
  createServiceClientMock,
  publishUiChangesMock,
  resolveMaterializationImpactRangeMock,
  enqueueAndProcessMaterializedAssignmentsMock,
} = vi.hoisted(() => ({
  requerirPuestosActivosMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  publishUiChangesMock: vi.fn().mockResolvedValue(undefined),
  resolveMaterializationImpactRangeMock: vi.fn(),
  enqueueAndProcessMaterializedAssignmentsMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/session', () => ({
  requerirPuestosActivos: requerirPuestosActivosMock,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock('@/lib/ui-change/server', () => ({
  publishUiChanges: publishUiChangesMock,
}));

vi.mock('@/features/asignaciones/services/asignacionMaterializationService', () => ({
  resolveMaterializationImpactRange: resolveMaterializationImpactRangeMock,
  enqueueAndProcessMaterializedAssignments: enqueueAndProcessMaterializedAssignmentsMock,
}));

import { registrarAsistenciaManualSupervisor } from './actions';
import { ESTADO_SUPERVISOR_ASISTENCIA_INICIAL } from './state';

describe('registrarAsistenciaManualSupervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'usr-sup-1',
      empleadoId: 'emp-sup-1',
      puesto: 'SUPERVISOR',
      cuentaClienteId: 'cta-1',
    });
  });

  it('permite registrar entrada puntual de una DC con reloj de entrada', async () => {
    let insertedAttendance: any = null;
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'empleado') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    nombre_completo: 'Maribel Ramirez',
                    supervisor_empleado_id: 'emp-sup-1',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'asignacion') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    lte: vi.fn().mockReturnValue({
                      or: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({
                            data: { id: 'asig-1', supervisor_empleado_id: 'emp-sup-1' },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    clave_btl: 'PDV-001',
                    nombre: 'Benavides Plaza Bosques',
                    zona: 'Norte',
                    cadena: { nombre: 'Benavides' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'cuenta_cliente_pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { cuenta_cliente_id: 'cta-1' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'asistencia') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null, // no existing attendance yet
                    error: null,
                  }),
                }),
              }),
            }),
            insert: vi.fn((payload) => {
              insertedAttendance = payload;
              return {
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'asist-1' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };
    createServiceClientMock.mockReturnValue(mockSupabase);

    const formData = new FormData();
    formData.set('empleado_id', 'emp-dc-1');
    formData.set('pdv_id', 'pdv-1');
    formData.set('fecha_operacion', '2026-10-01');
    formData.set('tipo_registro', 'PUNTUAL');
    formData.set('check_in_time', '11:00');

    const result = await registrarAsistenciaManualSupervisor(
      ESTADO_SUPERVISOR_ASISTENCIA_INICIAL,
      formData
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('puntual');
    expect(insertedAttendance).toBeTruthy();
    expect(insertedAttendance.estatus).toBe('VALIDA');
    expect(insertedAttendance.check_in_utc).toBeTruthy();
    expect(insertedAttendance.check_out_utc).toBeNull();
  });

  it('permite registrar INCAPACIDAD medica directamente', async () => {
    let insertedSolicitud: any = null;
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'empleado') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    nombre_completo: 'Maribel Ramirez',
                    supervisor_empleado_id: 'emp-sup-1',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'asignacion') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    lte: vi.fn().mockReturnValue({
                      or: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({
                            data: { id: 'asig-1', supervisor_empleado_id: 'emp-sup-1' },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    clave_btl: 'PDV-001',
                    nombre: 'Benavides Plaza Bosques',
                    zona: 'Norte',
                    cadena: { nombre: 'Benavides' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'cuenta_cliente_pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { cuenta_cliente_id: 'cta-1' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'solicitud') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null, // no existing solicitud
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            insert: vi.fn((payload) => {
              insertedSolicitud = payload;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'asistencia') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      }),
    };
    createServiceClientMock.mockReturnValue(mockSupabase);

    const formData = new FormData();
    formData.set('empleado_id', 'emp-dc-1');
    formData.set('pdv_id', 'pdv-1');
    formData.set('fecha_operacion', '2026-10-01');
    formData.set('tipo_registro', 'INCAPACIDAD');
    formData.set('comentarios', 'Incapacidad médica 3 días IMSS');

    const result = await registrarAsistenciaManualSupervisor(
      ESTADO_SUPERVISOR_ASISTENCIA_INICIAL,
      formData
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Incapacidad');
    expect(insertedSolicitud).toBeTruthy();
    expect(insertedSolicitud.tipo).toBe('INCAPACIDAD');
    expect(insertedSolicitud.estatus).toBe('REGISTRADA');
    expect(insertedSolicitud.metadata.justifica_asistencia).toBe(true);
  });

  it('permite registrar VACACIONES directamente creando solicitud aprobada y asistencia', async () => {
    let insertedSolicitud: any = null;
    let insertedAsistencia: any = null;
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'empleado') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    nombre_completo: 'Maribel Ramirez',
                    cuenta_cliente_id: 'cta-1',
                    supervisor_empleado_id: 'emp-sup-1',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'pdv-1',
                    nombre: 'Farmacia San Pablo',
                    clave_btl: 'BTL-01',
                    zona: 'Centro',
                    cadena: { nombre: 'San Pablo' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'cuenta_cliente_pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { cuenta_cliente_id: 'cta-1' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'solicitud') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            insert: vi.fn((payload) => {
              insertedSolicitud = payload;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'asistencia') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
            insert: vi.fn((payload) => {
              insertedAsistencia = payload;
              return {
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'asist-vac-1' },
                    error: null,
                  }),
                }),
              };
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        const chainable: any = {
          select: vi.fn(() => chainable),
          eq: vi.fn(() => chainable),
          in: vi.fn(() => chainable),
          lte: vi.fn(() => chainable),
          gte: vi.fn(() => chainable),
          or: vi.fn(() => chainable),
          order: vi.fn(() => chainable),
          limit: vi.fn(() => chainable),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          insert: vi.fn(() => Promise.resolve({ error: null })),
          update: vi.fn(() => chainable),
          upsert: vi.fn(() => Promise.resolve({ error: null })),
          delete: vi.fn(() => chainable),
          then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return chainable;
      }),
    };
    createServiceClientMock.mockReturnValue(mockSupabase);

    const formData = new FormData();
    formData.set('empleado_id', 'emp-dc-1');
    formData.set('pdv_id', 'pdv-1');
    formData.set('fecha_operacion', '2026-10-01');
    formData.set('tipo_registro', 'VACACIONES');
    formData.set('comentarios', 'Vacaciones solicitadas');

    const result = await registrarAsistenciaManualSupervisor(
      ESTADO_SUPERVISOR_ASISTENCIA_INICIAL,
      formData
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Vacaciones');
    expect(insertedSolicitud).toBeTruthy();
    expect(insertedSolicitud.tipo).toBe('VACACIONES');
    expect(insertedSolicitud.estatus).toBe('APROBADA');
    expect(insertedSolicitud.metadata.justifica_asistencia).toBe(true);
    expect(insertedAsistencia).toBeTruthy();
    expect(insertedAsistencia.metadata.subtipo_captura).toBe('VACACIONES');
  });

  it('permite registrar SALIDA cuando ya existe entrada previa', async () => {
    let updatedAttendance: any = null;
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'empleado') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    nombre_completo: 'Maribel Ramirez',
                    supervisor_empleado_id: 'emp-sup-1',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'asignacion') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    lte: vi.fn().mockReturnValue({
                      or: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({
                            data: { id: 'asig-1', supervisor_empleado_id: 'emp-sup-1' },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    clave_btl: 'PDV-001',
                    nombre: 'Benavides Plaza Bosques',
                    zona: 'Norte',
                    cadena: { nombre: 'Benavides' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'cuenta_cliente_pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { cuenta_cliente_id: 'cta-1' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'asistencia') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'asist-1',
                      check_in_utc: '2026-10-01T17:00:00.000Z',
                      check_out_utc: null,
                      metadata: { supervision: { entry_status: 'VALIDA' } },
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn((payload) => {
              updatedAttendance = payload;
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        if (table === 'audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };
    createServiceClientMock.mockReturnValue(mockSupabase);

    const formData = new FormData();
    formData.set('empleado_id', 'emp-dc-1');
    formData.set('pdv_id', 'pdv-1');
    formData.set('fecha_operacion', '2026-10-01');
    formData.set('tipo_registro', 'SALIDA');
    formData.set('check_out_time', '19:00');

    const result = await registrarAsistenciaManualSupervisor(
      ESTADO_SUPERVISOR_ASISTENCIA_INICIAL,
      formData
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Salida');
    expect(updatedAttendance).toBeTruthy();
    expect(updatedAttendance.estatus).toBe('CERRADA');
    expect(updatedAttendance.check_in_utc).toBe('2026-10-01T17:00:00.000Z');
    expect(updatedAttendance.check_out_utc).toBeTruthy();
  });

  it('rechaza registrar SALIDA si no existe entrada previa registrada', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'empleado') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    nombre_completo: 'Maribel Ramirez',
                    supervisor_empleado_id: 'emp-sup-1',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'asignacion') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    lte: vi.fn().mockReturnValue({
                      or: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({
                            data: { id: 'asig-1', supervisor_empleado_id: 'emp-sup-1' },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    clave_btl: 'PDV-001',
                    nombre: 'Benavides Plaza Bosques',
                    zona: 'Norte',
                    cadena: { nombre: 'Benavides' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'cuenta_cliente_pdv') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { cuenta_cliente_id: 'cta-1' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'asistencia') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null, // No attendance record
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    createServiceClientMock.mockReturnValue(mockSupabase);

    const formData = new FormData();
    formData.set('empleado_id', 'emp-dc-1');
    formData.set('pdv_id', 'pdv-1');
    formData.set('fecha_operacion', '2026-10-01');
    formData.set('tipo_registro', 'SALIDA');
    formData.set('check_out_time', '19:00');

    const result = await registrarAsistenciaManualSupervisor(
      ESTADO_SUPERVISOR_ASISTENCIA_INICIAL,
      formData
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('No es posible registrar salida sin una entrada previa');
  });
});
