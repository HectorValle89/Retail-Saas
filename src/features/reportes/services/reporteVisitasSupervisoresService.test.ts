import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({}),
}));

import {
  buildVisitasSupervisoresDetalle,
  obtenerVisitasSupervisoresDetalle,
} from './reporteVisitasSupervisoresService';

describe('reporteVisitasSupervisoresService', () => {
  it('agrega detalle de visitas y evidencia por supervisor', () => {
    const data = buildVisitasSupervisoresDetalle(
      [
        {
          id: 'route-1',
          cuenta_cliente_id: 'account-1',
          supervisor_empleado_id: 'sup-1',
          semana_inicio: '2026-04-06',
          estatus: 'PUBLICADA',
          supervisor: [
            {
              id_nomina: 'SUP-001',
              nombre_completo: 'Supervisor Uno',
              puesto: 'SUPERVISOR',
            },
          ],
        },
        {
          id: 'route-2',
          cuenta_cliente_id: 'account-1',
          supervisor_empleado_id: 'sup-2',
          semana_inicio: '2026-04-06',
          estatus: 'BORRADOR',
          supervisor: [
            {
              id_nomina: 'SUP-002',
              nombre_completo: 'Supervisor Dos',
              puesto: 'SUPERVISOR',
            },
          ],
        },
      ],
      [
        {
          id: 'visit-1',
          ruta_semanal_id: 'route-1',
          cuenta_cliente_id: 'account-1',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-1',
          dia_semana: 2,
          orden: 1,
          estatus: 'COMPLETADA',
          selfie_url: 'https://example.com/selfie.jpg',
          selfie_hash: null,
          selfie_thumbnail_url: 'https://example.com/selfie-thumb.jpg',
          selfie_thumbnail_hash: null,
          evidencia_url: 'https://example.com/evidencia.jpg',
          evidencia_hash: null,
          evidencia_thumbnail_url: 'https://example.com/evidencia-thumb.jpg',
          evidencia_thumbnail_hash: null,
          checklist_calidad: {
            foto_anaquel: true,
            precio_visible: true,
          },
          comentarios: 'Visita concluida',
          completada_en: '2026-04-07T18:30:00Z',
          pdv: [
            {
              nombre: 'Sucursal Uno',
              clave_btl: 'BTL-001',
              zona: 'CENTRO',
            },
          ],
        },
        {
          id: 'visit-2',
          ruta_semanal_id: 'route-1',
          cuenta_cliente_id: 'account-1',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-1',
          dia_semana: 3,
          orden: 2,
          estatus: 'PLANIFICADA',
          selfie_url: null,
          selfie_hash: null,
          selfie_thumbnail_url: null,
          selfie_thumbnail_hash: null,
          evidencia_url: null,
          evidencia_hash: null,
          evidencia_thumbnail_url: null,
          evidencia_thumbnail_hash: null,
          checklist_calidad: {},
          comentarios: null,
          completada_en: null,
          pdv: [
            {
              nombre: 'Sucursal Uno',
              clave_btl: 'BTL-001',
              zona: 'CENTRO',
            },
          ],
        },
        {
          id: 'visit-3',
          ruta_semanal_id: 'route-2',
          cuenta_cliente_id: 'account-1',
          supervisor_empleado_id: 'sup-2',
          pdv_id: 'pdv-2',
          dia_semana: 4,
          orden: 1,
          estatus: 'COMPLETADA',
          selfie_url: 'https://example.com/ignored-selfie.jpg',
          selfie_hash: null,
          selfie_thumbnail_url: 'https://example.com/ignored-selfie-thumb.jpg',
          selfie_thumbnail_hash: null,
          evidencia_url: 'https://example.com/ignored-evidence.jpg',
          evidencia_hash: null,
          evidencia_thumbnail_url: 'https://example.com/ignored-evidence-thumb.jpg',
          evidencia_thumbnail_hash: null,
          checklist_calidad: {
            otro: true,
          },
          comentarios: 'No debe entrar porque la ruta está en borrador',
          completada_en: '2026-04-08T18:30:00Z',
          pdv: [
            {
              nombre: 'Sucursal Dos',
              clave_btl: 'BTL-002',
              zona: 'NORTE',
            },
          ],
        },
      ],
      {
        periodo: '2026-04',
        estadoFiltro: 'COMPLETADA',
        limit: 25,
      }
    );

    expect(data.resumen.supervisores).toBe(1);
    expect(data.resumen.rutas).toBe(1);
    expect(data.resumen.visitas).toBe(1);
    expect(data.resumen.completadas).toBe(1);
    expect(data.resumen.selfies).toBe(1);
    expect(data.resumen.evidencias).toBe(1);
    expect(data.resumen.checklistPromedio).toBe(100);
    expect(data.supervisores).toHaveLength(1);
    expect(data.supervisores[0]?.supervisor).toBe('Supervisor Uno');
    expect(data.supervisores[0]?.rutas).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.pdv).toBe('Sucursal Uno');
    expect(data.items[0]?.selfieThumbnailUrl).toBe('https://example.com/selfie-thumb.jpg');
    expect(data.items[0]?.evidenciaThumbnailUrl).toBe('https://example.com/evidencia-thumb.jpg');
    expect(data.items[0]?.checklistCompletado).toBe(2);
    expect(data.items[0]?.checklistTotal).toBe(2);
  });

  it('degrada a lectura base cuando la infraestructura de miniaturas no esta aplicada', async () => {
    const routeRows = [
      {
        id: 'route-1',
        cuenta_cliente_id: 'account-1',
        supervisor_empleado_id: 'sup-1',
        semana_inicio: '2026-04-06',
        estatus: 'PUBLICADA',
        supervisor: {
          id_nomina: 'SUP-001',
          nombre_completo: 'Supervisor Uno',
          puesto: 'SUPERVISOR',
        },
      },
    ];
    const visitRows = [
      {
        id: 'visit-1',
        ruta_semanal_id: 'route-1',
        cuenta_cliente_id: 'account-1',
        supervisor_empleado_id: 'sup-1',
        pdv_id: 'pdv-1',
        dia_semana: 2,
        orden: 1,
        estatus: 'COMPLETADA',
        selfie_url: 'https://example.com/selfie.jpg',
        selfie_hash: null,
        evidencia_url: 'https://example.com/evidencia.jpg',
        evidencia_hash: null,
        checklist_calidad: {
          foto_anaquel: true,
        },
        comentarios: null,
        completada_en: '2026-04-07T18:30:00Z',
        pdv: {
          nombre: 'Sucursal Uno',
          clave_btl: 'BTL-001',
          zona: 'CENTRO',
        },
      },
    ];
    let visitasQueryCount = 0;

    const makeQuery = (response: unknown) => ({
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then(resolve: (value: unknown) => void) {
        return Promise.resolve(response).then(resolve);
      },
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'ruta_semanal') {
          return makeQuery({ data: routeRows, error: null });
        }

        if (table === 'ruta_semanal_visita') {
          visitasQueryCount += 1;
          return makeQuery(
            visitasQueryCount === 1
              ? {
                  data: null,
                  error: {
                    message: 'column ruta_semanal_visita.selfie_thumbnail_url does not exist',
                  },
                }
              : { data: visitRows, error: null }
          );
        }

        return makeQuery({ data: [], error: null });
      }),
    };

    const data = await obtenerVisitasSupervisoresDetalle(
      {
        cuentaClienteId: 'account-1',
        empleadoId: 'coord-1',
        puesto: 'COORDINADOR',
      } as never,
      {
        periodo: '2026-04',
        estadoFiltro: 'COMPLETADA',
        limit: 25,
      },
      supabase as never
    );

    expect(visitasQueryCount).toBe(2);
    expect(data.infraestructuraLista).toBe(false);
    expect(data.mensajeInfraestructura).toContain('ruta_semanal_visita_thumbnails.sql');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.selfieUrl).toBe('https://example.com/selfie.jpg');
    expect(data.items[0]?.selfieThumbnailUrl).toBeNull();
  });
});
