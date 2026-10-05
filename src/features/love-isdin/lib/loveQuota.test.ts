import { describe, expect, it, vi } from 'vitest';
import { fetchLoveQuotaTargetRows } from './loveQuota';

describe('loveQuota', () => {
  it('realiza paginacion automatica de asignaciones cuando superan las 1000 filas', async () => {
    // Mocking the Supabase chain for fetchLoveQuotaTargetRows
    // We want the query on asignacion_diaria_resuelta to return 1000 rows first, then 500 rows.
    let callCount = 0;
    const mockFrom = vi.fn((table: string) => {
      if (table === 'asignacion_diaria_resuelta') {
        const chain = {
          select: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          range: vi.fn((fromOffset: number, toOffset: number) => {
            const size = toOffset - fromOffset + 1;
            const data: any[] = [];
            
            // Generate mock assignments
            const count = callCount === 0 ? 1000 : 500;
            for (let i = 0; i < count; i++) {
              data.push({
                fecha: '2026-06-01',
                empleado_id: `emp-${fromOffset + i}`,
                pdv_id: 'pdv-1',
                supervisor_empleado_id: 'sup-1',
                cuenta_cliente_id: 'cuenta-1',
                trabaja_en_tienda: true,
              });
            }
            callCount++;
            
            return Promise.resolve({ data, error: null });
          }),
        };
        return chain;
      }
      
      if (table === 'configuracion') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [{ clave: 'love_isdin.cuota_diaria_default', valor: 3 }], error: null }),
            }),
          }),
        };
      }

      if (table === 'empleado') {
        return {
          select: () => ({
            in: () => ({
              limit: () => Promise.resolve({
                data: [
                  { id: 'sup-1', id_nomina: '100', nombre_completo: 'Supervisor Lopez', puesto: 'SUPERVISOR' },
                  ...Array.from({ length: 1500 }, (_, i) => ({
                    id: `emp-${i}`,
                    id_nomina: String(i),
                    nombre_completo: `Emp ${i}`,
                    puesto: 'DERMOCONSEJERO',
                    supervisor_empleado_id: 'sup-1',
                    zona: 'Centro',
                    estatus_laboral: 'ACTIVO',
                  })),
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'pdv') {
        return {
          select: () => ({
            in: () => ({
              limit: () => Promise.resolve({ data: [{ id: 'pdv-1', clave_btl: 'BTL-1', nombre: 'PDV 1', zona: 'Centro', cadena_id: 'cadena-1' }], error: null }),
            }),
          }),
        };
      }

      if (table === 'cuota_empleado_periodo') {
        const chain = {
          in: () => chain,
          limit: () => chain,
          eq: () => chain,
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
        return {
          select: () => chain,
        };
      }

      if (table === 'cadena') {
        return {
          select: () => ({
            in: () => ({
              limit: () => Promise.resolve({ data: [{ id: 'cadena-1', nombre: 'Cadena A' }], error: null }),
            }),
          }),
        };
      }

      if (table === 'captura_publica_registro') {
        const chain = {
          select: () => chain,
          in: () => chain,
          gte: () => chain,
          lte: () => chain,
          limit: () => Promise.resolve({ data: [], error: null }),
        };
        return chain;
      }

      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    });

    const mockSupabase = {
      from: mockFrom,
    };

    const result = await fetchLoveQuotaTargetRows(mockSupabase as any, {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      accountId: 'cuenta-1',
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1500);
    expect(callCount).toBe(2);
  });

  it('aplica el descuento de meta (-3 registros) cuando hay vacaciones o incapacidad', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'asignacion_diaria_resuelta') {
        const chain = {
          select: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          range: vi.fn(() => Promise.resolve({
            data: [
              {
                fecha: '2026-06-01',
                empleado_id: 'emp-1',
                pdv_id: 'pdv-1',
                supervisor_empleado_id: 'sup-1',
                cuenta_cliente_id: 'cuenta-1',
                trabaja_en_tienda: true,
              },
              {
                fecha: '2026-06-02',
                empleado_id: 'emp-1',
                pdv_id: 'pdv-1',
                supervisor_empleado_id: 'sup-1',
                cuenta_cliente_id: 'cuenta-1',
                trabaja_en_tienda: true,
              }
            ],
            error: null
          })),
        };
        return chain;
      }

      if (table === 'captura_publica_registro') {
        const chain = {
          select: vi.fn(() => chain),
          in: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          limit: vi.fn(() => Promise.resolve({
            data: [
              { empleado_id: 'emp-1', fecha_operativa: '2026-06-02', subtipo_registro: 'VACACIONES' }
            ],
            error: null
          })),
        };
        return chain;
      }
      
      if (table === 'configuracion') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [{ clave: 'love_isdin.cuota_diaria_default', valor: 3 }], error: null }),
            }),
          }),
        };
      }

      if (table === 'empleado') {
        return {
          select: () => ({
            in: () => ({
              limit: () => Promise.resolve({
                data: [
                  { id: 'sup-1', id_nomina: '100', nombre_completo: 'Supervisor Lopez', puesto: 'SUPERVISOR' },
                  { id: 'emp-1', id_nomina: '1', nombre_completo: 'Dermo Uno', puesto: 'DERMOCONSEJERO', supervisor_empleado_id: 'sup-1', zona: 'Centro', estatus_laboral: 'ACTIVO' }
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'pdv') {
        return {
          select: () => ({
            in: () => ({
              limit: () => Promise.resolve({ data: [{ id: 'pdv-1', clave_btl: 'BTL-1', nombre: 'PDV 1', zona: 'Centro', cadena_id: 'cadena-1' }], error: null }),
            }),
          }),
        };
      }

      if (table === 'cuota_empleado_periodo') {
        const chain = {
          in: () => chain,
          limit: () => chain,
          eq: () => chain,
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
        return {
          select: () => chain,
        };
      }

      if (table === 'cadena') {
        return {
          select: () => ({
            in: () => ({
              limit: () => Promise.resolve({ data: [{ id: 'cadena-1', nombre: 'Cadena A' }], error: null }),
            }),
          }),
        };
      }

      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    });

    const mockSupabase = {
      from: mockFrom,
    };

    const result = await fetchLoveQuotaTargetRows(mockSupabase as any, {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      accountId: 'cuenta-1',
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
    
    // El dia 1 no tiene vacaciones, cuota completa = 3
    expect(result.data[0].fechaOperacion).toBe('2026-06-01');
    expect(result.data[0].objetivo).toBe(3);
    expect(result.data[0].ausenciaTipo).toBeNull();
    
    // El dia 2 tiene vacaciones, cuota descontada 3 - 3 = 0
    expect(result.data[1].fechaOperacion).toBe('2026-06-02');
    expect(result.data[1].objetivo).toBe(0);
    expect(result.data[1].ausenciaTipo).toBe('VACACIONES');
  });

  it('excluye metas y cuotas para colaboradores con estatus BAJA en fechas posteriores a su fecha_baja pero mantiene fechas activas', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'asignacion_diaria_resuelta') {
        const chain = {
          select: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          range: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  fecha: '2026-08-31',
                  empleado_id: 'emp-baja',
                  pdv_id: 'pdv-1',
                  supervisor_empleado_id: 'sup-1',
                  cuenta_cliente_id: 'cuenta-1',
                  trabaja_en_tienda: true,
                },
                {
                  fecha: '2026-09-01',
                  empleado_id: 'emp-baja',
                  pdv_id: 'pdv-1',
                  supervisor_empleado_id: 'sup-1',
                  cuenta_cliente_id: 'cuenta-1',
                  trabaja_en_tienda: true,
                },
              ],
              error: null,
            })
          ),
        };
        return chain;
      }

      if (table === 'configuracion') {
        return {
          select: () => ({
            eq: () => ({
              limit: () =>
                Promise.resolve({
                  data: [{ clave: 'love_isdin.cuota_diaria_default', valor: 3 }],
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === 'empleado') {
        return {
          select: () => ({
            in: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'emp-baja',
                      id_nomina: '99',
                      nombre_completo: 'Dermo Baja',
                      puesto: 'DERMOCONSEJERO',
                      supervisor_empleado_id: 'sup-1',
                      zona: 'Centro',
                      estatus_laboral: 'BAJA',
                      fecha_baja: '2026-08-31',
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === 'pdv') {
        return {
          select: () => ({
            in: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'pdv-1',
                      clave_btl: 'BTL-1',
                      nombre: 'PDV 1',
                      zona: 'Centro',
                      cadena_id: 'cadena-1',
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === 'cuota_empleado_periodo') {
        const chain = {
          in: () => chain,
          limit: () => chain,
          eq: () => chain,
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
        return {
          select: () => chain,
        };
      }

      if (table === 'cadena') {
        return {
          select: () => ({
            in: () => ({
              limit: () =>
                Promise.resolve({
                  data: [{ id: 'cadena-1', nombre: 'Cadena A' }],
                  error: null,
                }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          in: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
            gte: () => ({
              lte: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
          gte: () => ({
            lte: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      };
    });

    const result = await fetchLoveQuotaTargetRows({ from: mockFrom } as any, {
      dateFrom: '2026-08-31',
      dateTo: '2026-09-05',
      accountId: 'cuenta-1',
    });

    expect(result.error).toBeNull();
    // Debe incluir el día 2026-08-31 (su último día activo o fecha_baja)
    // pero DEBE EXCLUIR el 2026-09-01 porque es posterior a su fecha_baja
    expect(result.data).toHaveLength(1);
    expect(result.data[0].fechaOperacion).toBe('2026-08-31');
    expect(result.data[0].empleadoId).toBe('emp-baja');
  });
});
