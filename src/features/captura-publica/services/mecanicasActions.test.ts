import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServiceClientMock, obtenerCapturaPublicaLinkMock } = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  obtenerCapturaPublicaLinkMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock('./capturaPublicaService', () => ({
  obtenerCapturaPublicaLinkParaRegistro: obtenerCapturaPublicaLinkMock,
}));

vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve(
      new Map([
        ['host', 'test-uniformes.com'],
        ['user-agent', 'test-agent'],
      ])
    ),
}));

import { registrarPropuestaMecanica } from './mecanicasActions';

describe('registrarPropuestaMecanica (Levantamiento de Uniformes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    obtenerCapturaPublicaLinkMock.mockResolvedValue({
      cuentaClienteId: 'cuenta-isdin',
      slug: 'isdin-mexico',
      nombre: 'Link ISDIN México',
      cuentaClienteNombre: 'ISDIN México',
    });
  });

  it('registra exitosamente prendas de uniformes para un supervisor autorizado con ciudad y recibe_nombre', async () => {
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'levantamiento_uniforme') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({ data: null, error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(payload: any) {
              inserts.push(payload);
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'registro-123' }, error: null });
                    },
                  };
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
    formData.set('supervisor_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formData.set('ciudad_envio', 'Guadalajara');
    formData.set('recibe_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formData.set('direccion_envio', 'Av. Vallarta 1234, Col. Americana, CP 44160');
    formData.set(
      'prendas_json',
      JSON.stringify([
        { prenda: 'Filipina blanca', genero: 'Caballero', talla: 'CH', cantidad: 2 },
        { prenda: 'Pantalón', genero: 'Caballero', talla: 'M', cantidad: 1 },
      ])
    );

    const result = await registrarPropuestaMecanica('isdin-mexico', { ok: false, message: '' }, formData);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('¡Registro de uniforme enviado con éxito!');
    expect(inserts.length).toBe(1);
    expect(inserts[0].supervisor_nombre).toBe('MIGUEL ANGEL MONTAGNER OLIVARES');
    expect(inserts[0].ciudad_envio).toBe('GUADALAJARA');
    expect(inserts[0].recibe_nombre).toBe('MIGUEL ANGEL MONTAGNER OLIVARES');
    expect(inserts[0].direccion_envio).toBe('Av. Vallarta 1234, Col. Americana, CP 44160');
    expect(inserts[0].prendas).toHaveLength(2);
    expect(inserts[0].cuenta_cliente_id).toBe('cuenta-isdin');
  });

  it('falla si falta la ciudad de envío o el destinatario', async () => {
    const serviceMock = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle() {
                        return Promise.resolve({ data: null, error: null });
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

    createServiceClientMock.mockReturnValue(serviceMock);

    // Caso: Sin ciudad de envío
    const formDataNoCity = new FormData();
    formDataNoCity.set('supervisor_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formDataNoCity.set('recibe_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formDataNoCity.set('direccion_envio', 'Av. Vallarta 1234');
    formDataNoCity.set('prendas_json', JSON.stringify([{ prenda: 'Filipina blanca', genero: 'Caballero', talla: 'CH', cantidad: 1 }]));

    const resultNoCity = await registrarPropuestaMecanica('isdin-mexico', { ok: false, message: '' }, formDataNoCity);
    expect(resultNoCity.ok).toBe(false);
    expect(resultNoCity.message).toContain('La ciudad de envío es obligatoria');

    // Caso: Sin destinatario que recibe
    const formDataNoReceiver = new FormData();
    formDataNoReceiver.set('supervisor_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formDataNoReceiver.set('ciudad_envio', 'Guadalajara');
    formDataNoReceiver.set('direccion_envio', 'Av. Vallarta 1234');
    formDataNoReceiver.set('prendas_json', JSON.stringify([{ prenda: 'Filipina blanca', genero: 'Caballero', talla: 'CH', cantidad: 1 }]));

    const resultNoReceiver = await registrarPropuestaMecanica('isdin-mexico', { ok: false, message: '' }, formDataNoReceiver);
    expect(resultNoReceiver.ok).toBe(false);
    expect(resultNoReceiver.message).toContain('El nombre de quien recibe es obligatorio');

    // Caso: Ciudad foránea sin dirección de envío
    const formDataNoAddress = new FormData();
    formDataNoAddress.set('supervisor_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formDataNoAddress.set('ciudad_envio', 'Guadalajara');
    formDataNoAddress.set('recibe_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formDataNoAddress.set('prendas_json', JSON.stringify([{ prenda: 'Filipina blanca', genero: 'Caballero', talla: 'CH', cantidad: 1 }]));

    const resultNoAddress = await registrarPropuestaMecanica('isdin-mexico', { ok: false, message: '' }, formDataNoAddress);
    expect(resultNoAddress.ok).toBe(false);
    expect(resultNoAddress.message).toContain('La dirección completa de envío es obligatoria para ciudades foráneas');
  });

  it('falla si el supervisor ya cuenta con un registro en el sistema para la misma ciudad', async () => {
    const serviceMock = {
      from(table: string) {
        if (table === 'levantamiento_uniforme') {
          return {
            select() {
              return {
                eq(col: string, val: string) {
                  expect(col).toBe('supervisor_nombre');
                  expect(val).toBe('MIGUEL ANGEL MONTAGNER OLIVARES');
                  return {
                    eq(col2: string, val2: string) {
                      expect(col2).toBe('ciudad_envio');
                      expect(val2).toBe('GUADALAJARA');
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: { id: 'registro-previo', supervisor_nombre: 'MIGUEL ANGEL MONTAGNER OLIVARES', ciudad_envio: 'Guadalajara' },
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
        throw new Error(`Unexpected table ${table}`);
      },
    };

    createServiceClientMock.mockReturnValue(serviceMock);

    const formData = new FormData();
    formData.set('supervisor_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formData.set('ciudad_envio', 'Guadalajara');
    formData.set('recibe_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formData.set('direccion_envio', 'Av. Vallarta 1234');
    formData.set(
      'prendas_json',
      JSON.stringify([
        { prenda: 'Filipina blanca', genero: 'Caballero', talla: 'CH', cantidad: 2 },
      ])
    );

    const result = await registrarPropuestaMecanica('isdin-mexico', { ok: false, message: '' }, formData);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('ya registró su uniforme para la ciudad');
  });

  it('registra exitosamente si el supervisor ya tiene registro en otra ciudad distinta', async () => {
    const inserts: Array<any> = [];

    const serviceMock = {
      from(table: string) {
        if (table === 'levantamiento_uniforme') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle() {
                          // Simular que no hay registro para esta ciudad en específico
                          return Promise.resolve({ data: null, error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(payload: any) {
              inserts.push(payload);
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'registro-124' }, error: null });
                    },
                  };
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
    formData.set('supervisor_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formData.set('ciudad_envio', 'Monterrey'); // Ciudad distinta a Guadalajara
    formData.set('recibe_nombre', 'LILIANA REYES AYBAR');
    formData.set('direccion_envio', 'Av. Constitucion 456');
    formData.set(
      'prendas_json',
      JSON.stringify([
        { prenda: 'Pantalón', genero: 'Caballero', talla: 'G', cantidad: 2 },
      ])
    );

    const result = await registrarPropuestaMecanica('isdin-mexico', { ok: false, message: '' }, formData);

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(1);
    expect(inserts[0].ciudad_envio).toBe('MONTERREY');
  });

  it('registra exitosamente en CDMX con dirección vacía y asigna default presencial', async () => {
    const inserts: Array<any> = [];
    const serviceMock = {
      from(table: string) {
        if (table === 'levantamiento_uniforme') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({ data: null, error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(payload: any) {
              inserts.push(payload);
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: 'registro-cdmx-123' }, error: null });
                    },
                  };
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
    formData.set('supervisor_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    formData.set('ciudad_envio', 'Ciudad de México');
    formData.set('recibe_nombre', 'MIGUEL ANGEL MONTAGNER OLIVARES');
    // Dejar direccion_envio vacía para simular que no se rellenó (entrega presencial)
    formData.set('direccion_envio', '');
    formData.set(
      'prendas_json',
      JSON.stringify([
        { prenda: 'Filipina blanca', genero: 'Caballero', talla: 'CH', cantidad: 1 },
      ])
    );

    const result = await registrarPropuestaMecanica('isdin-mexico', { ok: false, message: '' }, formData);

    expect(result.ok).toBe(true);
    expect(inserts.length).toBe(1);
    expect(inserts[0].ciudad_envio).toBe('CIUDAD DE MÉXICO');
    expect(inserts[0].direccion_envio).toBe('ENTREGA PRESENCIAL (RECIBO EN PERSONA)');
  });
});
