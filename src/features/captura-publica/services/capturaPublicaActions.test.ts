import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createServiceClientMock,
  loadCapturaPublicaAssignmentsForDateMock,
  loadCapturaPublicaPdvsForDateMock,
} = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  loadCapturaPublicaAssignmentsForDateMock: vi.fn(),
  loadCapturaPublicaPdvsForDateMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve(
      new Map([
        ['host', 'test.com'],
        ['user-agent', 'test-agent'],
      ])
    ),
}));

vi.mock('@/lib/files/evidenceStorage', () => ({
  storeOptimizedEvidence: vi.fn().mockResolvedValue({
    archivo: {
      url: 'https://storage/foto1.jpg',
      hash: 'hash123',
    },
  }),
}));

vi.mock('./capturaPublicaService', async (importOriginal) => {
  const original = await importOriginal<typeof import('./capturaPublicaService')>();
  return {
    ...original,
    loadCapturaPublicaAssignmentsForDate: loadCapturaPublicaAssignmentsForDateMock,
    loadCapturaPublicaPdvsForDate: loadCapturaPublicaPdvsForDateMock,
  };
});

import { registrarCapturaPublica } from './capturaPublicaActions';

describe('capturaPublicaActions - Simplificación de Ventas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadCapturaPublicaAssignmentsForDateMock.mockResolvedValue([
      {
        pdvId: 'pdv-1',
        estado: 'SELECCIONABLE',
        empleadoId: null,
        empleadoNombre: null,
        asignacionId: null,
        origen: null,
        candidatos: [
          { empleadoId: 'emp-1', empleadoNombre: 'Dermoconsejera Uno' },
          { empleadoId: 'emp-2', empleadoNombre: 'Dermoconsejera Dos' },
        ],
      },
    ]);
    loadCapturaPublicaPdvsForDateMock.mockResolvedValue([
      { id: 'pdv-1', nombre: 'Punto de venta 1' },
    ]);
  });

  it('fuerza monto a null cuando el registro es de tipo VENTA en modo batch', async () => {
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['VENTA', 'CANJE'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: {
                        nombre: 'ISDIN México',
                        activa: true,
                      },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              empleado_id: 'emp-1',
                              empleado: {
                                id: 'emp-1',
                                nombre_completo: 'Dermo 1',
                                puesto: 'DERMOCONSEJERO',
                                estatus_laboral: 'ACTIVO',
                              },
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'producto') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'prod-1', nombre: 'Fusion Water', activo: true },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            insert(payload: any) {
              if (Array.isArray(payload)) {
                inserts.push(...payload);
              } else {
                inserts.push(payload);
              }
              return {
                select() {
                  return Promise.resolve({ data: [{ id: 'reg-1' }], error: null });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'VENTA');
    formData.set('fecha_operativa', '2026-05-23');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-1');

    // Batch items with leftover monto values in client state
    const items = [
      {
        id: 'row-1',
        producto_id: 'prod-1',
        cantidad: 5,
        monto: 1500, // Should be nulled
      },
    ];
    formData.set('items_json', JSON.stringify(items));

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(1);

    // Validate database columns in inserts
    expect(inserts[0].monto).toBeNull();
    // Validate custom payload metadata
    expect(inserts[0].payload.monto).toBeNull();
    expect(inserts[0].payload.cantidad).toBe(5);
    expect(inserts[0].payload.producto_id).toBe('prod-1');
  });

  it('registra correctamente LOVE_ISDIN con su respectivo subtipo y cantidad en modo batch', async () => {
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['VENTA', 'CANJE', 'LOVE_ISDIN'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: {
                        nombre: 'ISDIN México',
                        activa: true,
                      },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              empleado_id: 'emp-1',
                              empleado: {
                                id: 'emp-1',
                                nombre_completo: 'Dermo 1',
                                puesto: 'DERMOCONSEJERO',
                                estatus_laboral: 'ACTIVO',
                              },
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            insert(payload: any) {
              if (Array.isArray(payload)) {
                inserts.push(...payload);
              } else {
                inserts.push(payload);
              }
              return {
                select() {
                  return Promise.resolve({ data: [{ id: 'reg-2' }], error: null });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'LOVE_ISDIN');
    formData.set('fecha_operativa', '2026-05-23');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-1');

    const items = [
      {
        id: 'row-love-1',
        subtipo_registro: 'LOVE_EXITOSO',
        cantidad: 1,
      },
    ];
    formData.set('items_json', JSON.stringify(items));

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(1);
    expect(inserts[0].tipo_registro).toBe('LOVE_ISDIN');
    expect(inserts[0].subtipo_registro).toBe('LOVE_EXITOSO');
    expect(inserts[0].cantidad).toBe(1);
  });

  it('permite a personal con puesto LOVE_IS registrar LOVE_ISDIN correctamente', async () => {
    loadCapturaPublicaAssignmentsForDateMock.mockResolvedValue([
      {
        pdvId: 'pdv-1',
        estado: 'ASIGNADA',
        empleadoId: 'emp-love-1',
        empleadoNombre: 'Love IS Uno',
        asignacionId: 'assignment-love-1',
        origen: 'BASE',
        candidatos: [{ empleadoId: 'emp-love-1', empleadoNombre: 'Love IS Uno' }],
      },
    ]);
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['LOVE_ISDIN'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: { nombre: 'ISDIN México', activa: true },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              empleado_id: 'emp-love-1',
                              empleado: {
                                id: 'emp-love-1',
                                nombre_completo: 'Promotora Love 1',
                                puesto: 'LOVE_IS',
                                estatus_laboral: 'ACTIVO',
                              },
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        eq() {
                          return {
                            eq() {
                              return {
                                gte() {
                                  return Promise.resolve({ data: [], error: null });
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(payload: any) {
              if (Array.isArray(payload)) {
                inserts.push(...payload);
              } else {
                inserts.push(payload);
              }
              return {
                select() {
                  return Promise.resolve({ data: [{ id: 'reg-love-1' }], error: null });
                },
              };
            },
          };
        }

        return {};
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'LOVE_ISDIN');
    formData.set('fecha_operativa', '2026-08-01');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-love-1');
    formData.set(
      'items_json',
      JSON.stringify([
        {
          id: 'row-love-1',
          subtipo_registro: 'LOVE_EXITOSO',
          cantidad: 3,
        },
      ])
    );

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(1);
    expect(inserts[0].tipo_registro).toBe('LOVE_ISDIN');
    expect(inserts[0].subtipo_registro).toBe('LOVE_EXITOSO');
    expect(inserts[0].cantidad).toBe(3);
  });

  it('registra multiples canjes individuales con diferentes subtipos para el mismo material', async () => {
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['VENTA', 'CANJE'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: {
                        nombre: 'ISDIN México',
                        activa: true,
                      },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              empleado_id: 'emp-1',
                              empleado: {
                                id: 'emp-1',
                                nombre_completo: 'Dermo 1',
                                puesto: 'DERMOCONSEJERO',
                                estatus_laboral: 'ACTIVO',
                              },
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'material_catalogo') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: { id: 'mat-1', nombre: 'Material A', activo: true },
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            insert(payload: any) {
              if (Array.isArray(payload)) {
                inserts.push(...payload);
              } else {
                inserts.push(payload);
              }
              return {
                select() {
                  return Promise.resolve({
                    data: [{ id: 'reg-canje-1' }, { id: 'reg-canje-2' }],
                    error: null,
                  });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'CANJE');
    formData.set('fecha_operativa', '2026-05-23');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-1');

    const items = [
      {
        id: 'row-canje-tarjeta-1',
        material_catalogo_id: 'mat-1',
        subtipo_registro: 'CANJE_CON_TICKET',
        cantidad: 2,
      },
      {
        id: 'row-canje-tarjeta-1',
        material_catalogo_id: 'mat-1',
        subtipo_registro: 'CANJE_SIN_TICKET',
        cantidad: 3,
      },
    ];
    formData.set('items_json', JSON.stringify(items));

    const fakeFile = new File(['fake-image'], 'ticket.jpg', { type: 'image/jpeg' });
    formData.append('foto_evidencia__row-canje-tarjeta-1-con_ticket', fakeFile);

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(2);

    expect(inserts[0].material_catalogo_id).toBe('mat-1');
    expect(inserts[0].subtipo_registro).toBe('CANJE_CON_TICKET');
    expect(inserts[0].cantidad).toBe(2);

    expect(inserts[1].material_catalogo_id).toBe('mat-1');
    expect(inserts[1].subtipo_registro).toBe('CANJE_SIN_TICKET');
    expect(inserts[1].cantidad).toBe(3);
  });

  it('normaliza automaticamente un canje con ticket a CANJE_SIN_TICKET si no se adjunta evidencia fotografica', async () => {
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['CANJE'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: {
                        nombre: 'ISDIN México',
                        activa: true,
                      },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              empleado_id: 'emp-1',
                              empleado: {
                                id: 'emp-1',
                                nombre_completo: 'Dermo 1',
                                puesto: 'DERMOCONSEJERO',
                                estatus_laboral: 'ACTIVO',
                              },
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'material_catalogo') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: { id: 'mat-1', nombre: 'Material A', activo: true },
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            insert(payload: any) {
              if (Array.isArray(payload)) {
                inserts.push(...payload);
              } else {
                inserts.push(payload);
              }
              return {
                select() {
                  return Promise.resolve({ data: [{ id: 'reg-canje-sin-foto' }], error: null });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'CANJE');
    formData.set('fecha_operativa', '2026-08-05');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-1');

    const items = [
      {
        id: 'row-sin-foto',
        material_catalogo_id: 'mat-1',
        subtipo_registro: 'CANJE_CON_TICKET',
        cantidad: 1,
      },
    ];
    formData.set('items_json', JSON.stringify(items));

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(1);
    expect(inserts[0].subtipo_registro).toBe('CANJE_SIN_TICKET');
  });

  it('registra multiples actividades Love ISDIN individuales con exitosos y fallidos desglosados del cliente', async () => {
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['VENTA', 'CANJE', 'LOVE_ISDIN'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: {
                        nombre: 'ISDIN México',
                        activa: true,
                      },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              empleado_id: 'emp-1',
                              empleado: {
                                id: 'emp-1',
                                nombre_completo: 'Dermo 1',
                                puesto: 'DERMOCONSEJERO',
                                estatus_laboral: 'ACTIVO',
                              },
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            insert(payload: any) {
              if (Array.isArray(payload)) {
                inserts.push(...payload);
              } else {
                inserts.push(payload);
              }
              return {
                select() {
                  return Promise.resolve({
                    data: [{ id: 'reg-love-ex-1' }, { id: 'reg-love-fa-1' }],
                    error: null,
                  });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'LOVE_ISDIN');
    formData.set('fecha_operativa', '2026-05-23');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-1');

    const items = [
      {
        id: 'row-love-tarjeta-1',
        subtipo_registro: 'LOVE_EXITOSO',
        cantidad: 3,
      },
      {
        id: 'row-love-tarjeta-1',
        subtipo_registro: 'LOVE_FALLIDO',
        cantidad: 2,
      },
    ];
    formData.set('items_json', JSON.stringify(items));

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(2);

    expect(inserts[0].tipo_registro).toBe('LOVE_ISDIN');
    expect(inserts[0].subtipo_registro).toBe('LOVE_EXITOSO');
    expect(inserts[0].cantidad).toBe(3);

    expect(inserts[1].tipo_registro).toBe('LOVE_ISDIN');
    expect(inserts[1].subtipo_registro).toBe('LOVE_FALLIDO');
    expect(inserts[1].cantidad).toBe(2);
  });

  it('omite la insercion y retorna ok: true si el registro enviado es un duplicado del lote enviado en los ultimos 15 segundos', async () => {
    let insertCalled = false;

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['VENTA'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: {
                        nombre: 'ISDIN México',
                        activa: true,
                      },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              empleado_id: 'emp-1',
                              empleado: {
                                id: 'emp-1',
                                nombre_completo: 'Dermo 1',
                                puesto: 'DERMOCONSEJERO',
                                estatus_laboral: 'ACTIVO',
                              },
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'producto') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'prod-1', nombre: 'Fusion Water', activo: true },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            select(fields: string) {
              expect(fields).toContain('producto_id');
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        eq() {
                          return {
                            eq() {
                              return {
                                gte() {
                                  return Promise.resolve({
                                    data: [
                                      {
                                        producto_id: 'prod-1',
                                        material_catalogo_id: null,
                                        cantidad: 5,
                                        subtipo_registro: null,
                                        observaciones: 'Duplicado de prueba',
                                      },
                                    ],
                                    error: null,
                                  });
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(payload: any) {
              insertCalled = true;
              return {
                select() {
                  return Promise.resolve({ data: [{ id: 'reg-duplicate' }], error: null });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'VENTA');
    formData.set('fecha_operativa', '2026-05-23');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-1');

    const items = [
      {
        id: 'row-1',
        producto_id: 'prod-1',
        cantidad: 5,
        observaciones: 'Duplicado de prueba',
      },
    ];
    formData.set('items_json', JSON.stringify(items));

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(result.registroId).toBe('DUPLICATE_OMITTED');
    expect(insertCalled).toBe(false);
  });

  it('registra VENTA con subtipo INCAPACIDAD sin requerir producto ni cantidad', async () => {
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['VENTA'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: { nombre: 'ISDIN México', activa: true },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              empleado_id: 'emp-1',
                              empleado: {
                                id: 'emp-1',
                                nombre_completo: 'Dermo 1',
                                puesto: 'DERMOCONSEJERO',
                                estatus_laboral: 'ACTIVO',
                              },
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            select(fields?: string) {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        eq() {
                          return {
                            eq() {
                              return {
                                gte() {
                                  return Promise.resolve({ data: [], error: null });
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(payload: any) {
              if (Array.isArray(payload)) {
                inserts.push(...payload);
              } else {
                inserts.push(payload);
              }
              return {
                select() {
                  return Promise.resolve({ data: [{ id: 'reg-1' }], error: null });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'VENTA');
    formData.set('fecha_operativa', '2026-05-23');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-1');

    const items = [
      {
        id: 'incapacidad-row',
        subtipo_registro: 'INCAPACIDAD',
        producto_id: null,
        cantidad: null,
      },
    ];
    formData.set('items_json', JSON.stringify(items));

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(1);
    expect(inserts[0].subtipo_registro).toBe('INCAPACIDAD');
    expect(inserts[0].producto_id).toBeNull();
    expect(inserts[0].cantidad).toBeNull();
  });

  it('acepta una DC activa declarada manualmente y conserva evidencia de la excepción', async () => {
    const inserts: Array<Record<string, unknown>> = [];
    loadCapturaPublicaAssignmentsForDateMock.mockResolvedValue([
      {
        pdvId: 'pdv-1',
        estado: 'ASIGNADA',
        empleadoId: 'emp-publicada',
        empleadoNombre: 'DC Publicada',
        asignacionId: 'asig-publicada',
        origen: 'BASE',
        candidatos: [{ empleadoId: 'emp-publicada', empleadoNombre: 'DC Publicada' }],
      },
    ]);

    const serviceMock = {
      from(table: string) {
        if (table === 'captura_publica_link') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'link-1',
                      cuenta_cliente_id: 'cuenta-1',
                      slug: 'isdin-mexico',
                      nombre: 'ISDIN Captura',
                      activo: true,
                      acciones_habilitadas: ['VENTA'],
                      pdv_ids_permitidos: [],
                      empleado_ids_permitidos: [],
                      vigente_desde: '2026-01-01T00:00:00Z',
                      vigente_hasta: null,
                      cuenta_cliente: { nombre: 'ISDIN México', activa: true },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'cuenta_cliente_pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        lte() {
                          return {
                            or() {
                              return {
                                limit() {
                                  return {
                                    maybeSingle() {
                                      return Promise.resolve({
                                        data: { id: 'rel-1' },
                                        error: null,
                                      });
                                    },
                                  };
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'pdv') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'pdv-1', nombre: 'Farmacia 1', estatus: 'ACTIVO' },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'usuario') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            limit() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'usuario-declarada',
                      empleado_id: 'emp-declarada',
                      empleado: {
                        id: 'emp-declarada',
                        nombre_completo: 'DC Declarada',
                        puesto: 'DERMOCONSEJERA',
                        estatus_laboral: 'ACTIVO',
                      },
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'producto') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'prod-1', nombre: 'Fusion Water', activo: true },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'captura_publica_registro') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        eq() {
                          return {
                            eq() {
                              return {
                                gte() {
                                  return Promise.resolve({ data: [], error: null });
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(payload: Record<string, unknown>[]) {
              inserts.push(...payload);
              return {
                select() {
                  return Promise.resolve({ data: [{ id: 'registro-1' }], error: null });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('tipo_registro', 'VENTA');
    formData.set('fecha_operativa', '2026-09-14');
    formData.set('pdv_id', 'pdv-1');
    formData.set('empleado_id', 'emp-declarada');
    formData.set('atribucion_manual_dc', 'true');
    formData.set(
      'items_json',
      JSON.stringify([
        { id: 'row-1', producto_id: 'prod-1', cantidad: 1, observaciones: 'Jornada real' },
      ])
    );

    const result = await registrarCapturaPublica(
      'isdin-mexico',
      { ok: false, message: '' },
      formData
    );

    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      empleado_id: 'emp-declarada',
      metadata: expect.objectContaining({
        atribucion_manual_declarada: true,
        atribucion_captura: expect.objectContaining({
          origen: 'DC_DECLARADA_EN_FORMULARIO_PUBLICO',
          empleado_publicado_id: 'emp-publicada',
          empleado_declarado_id: 'emp-declarada',
          asignacion_publicada_id: 'asig-publicada',
        }),
      }),
    });
  });
});
