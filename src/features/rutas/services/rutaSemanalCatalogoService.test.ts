import { describe, expect, it } from 'vitest';
import type { ActorActual } from '@/lib/auth/session';
import {
  obtenerCatalogoPdvsRutaSupervisorMes,
  obtenerCatalogoPdvsRutaSupervisorSemana,
  obtenerPlaneacionRutaSupervisorMes,
} from './rutaSemanalCatalogoService';

type QueryResult = { data: unknown[]; error: { message: string } | null };

function createFakeClient(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const result = results[table] ?? { data: [], error: null };
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        lte() {
          return builder;
        },
        or() {
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve(result);
        },
        then<TResult1 = QueryResult, TResult2 = never>(
          onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
  };
}

const actor: ActorActual = {
  authUserId: 'auth-supervisor',
  usuarioId: 'usuario-supervisor',
  empleadoId: 'supervisor-nuevo',
  cuentaClienteId: 'cuenta-1',
  username: 'supervisor.nuevo',
  correoElectronico: 'nuevo@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Supervisor Nuevo',
  puesto: 'SUPERVISOR',
};

describe('catálogo efectivo de PDVs para Ruta Semanal', () => {
  it('reconstruye el borrador mensual por fecha aunque la semana cruce de mes', async () => {
    const submission = {
      id: 'envio-septiembre',
      estado: 'PENDIENTE_COORDINACION',
      revision: 2,
      total_visitas: 1,
      total_dias_planeados: 1,
      enviado_en: '2026-09-03T10:00:00.000Z',
      revisado_en: null,
    };
    const visits = [
      {
        id: 'visita-1',
        pdv_id: 'pdv-1',
        dia_semana: 2,
        orden: 1,
        estatus: 'CANCELADA',
        comentarios: 'Abrir con gerente',
        completada_en: null,
        ruta: { semana_inicio: '2026-08-31' },
        pdv: { nombre: 'Tienda Centro', clave_btl: 'PDV-001', zona: 'CENTRO' },
      },
    ];
    const client = {
      from(table: string) {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          order() {
            return builder;
          },
          maybeSingle() {
            return Promise.resolve({ data: submission, error: null });
          },
          limit() {
            return Promise.resolve({
              data: table === 'ruta_semanal_visita' ? visits : [],
              error: null,
            });
          },
        };
        return builder;
      },
    };

    const plan = await obtenerPlaneacionRutaSupervisorMes(client as never, actor, '2026-09');

    expect(plan).toMatchObject({
      envioId: 'envio-septiembre',
      estado: 'PENDIENTE_COORDINACION',
      revision: 2,
    });
    expect(plan.visitas).toEqual([
      expect.objectContaining({
        id: 'visita-1',
        fecha: '2026-09-01',
        pdvId: 'pdv-1',
        estatus: 'CANCELADA',
      }),
    ]);
  });

  it('resuelve una sola cartera acotada a todas las fechas del mes', async () => {
    const client = createFakeClient({
      supervisor_pdv: {
        data: [{ pdv_id: 'pdv-1', fecha_inicio: '2026-09-10', fecha_fin: '2026-09-12' }],
        error: null,
      },
      asignacion: { data: [], error: null },
      cuenta_cliente_pdv: {
        data: [{ pdv_id: 'pdv-1', fecha_inicio: '2026-01-01', fecha_fin: null }],
        error: null,
      },
      pdv: {
        data: [
          {
            id: 'pdv-1',
            clave_btl: 'PDV-001',
            nombre: 'Tienda Centro',
            zona: 'CENTRO',
            direccion: null,
            estatus: 'ACTIVO',
            formato: 'FIJO',
          },
        ],
        error: null,
      },
      geocerca_pdv: { data: [], error: null },
      pdv_estado_vigencia: { data: [], error: null },
    });

    const catalog = await obtenerCatalogoPdvsRutaSupervisorMes(client as never, actor, '2026-09');

    expect(catalog[0]?.diasDisponibles).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
  });

  it('mantiene la cartera saliente solamente hasta el cierre de agosto', async () => {
    const client = createFakeClient({
      supervisor_pdv: {
        data: [{ pdv_id: 'pdv-1', fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' }],
        error: null,
      },
      asignacion: { data: [], error: null },
      cuenta_cliente_pdv: {
        data: [{ pdv_id: 'pdv-1', fecha_inicio: '2026-01-01', fecha_fin: null }],
        error: null,
      },
      pdv: {
        data: [
          {
            id: 'pdv-1',
            clave_btl: 'PDV-001',
            nombre: 'Tienda Centro',
            zona: 'CENTRO',
            direccion: null,
            estatus: 'ACTIVO',
            formato: 'FIJO',
          },
        ],
        error: null,
      },
      geocerca_pdv: { data: [], error: null },
      pdv_estado_vigencia: { data: [], error: null },
    });

    const catalog = await obtenerCatalogoPdvsRutaSupervisorSemana(
      client as never,
      { ...actor, empleadoId: 'supervisor-saliente' },
      '2026-08-31'
    );

    expect(catalog[0]?.diasDisponibles).toEqual(['2026-08-31']);
  });

  it('expone al sucesor solamente los días posteriores a la fecha efectiva', async () => {
    const client = createFakeClient({
      supervisor_pdv: {
        data: [{ pdv_id: 'pdv-1', fecha_inicio: '2026-09-01', fecha_fin: null }],
        error: null,
      },
      asignacion: {
        data: [
          {
            id: 'asignacion-1',
            cuenta_cliente_id: 'cuenta-1',
            pdv_id: 'pdv-1',
            fecha_inicio: '2026-09-01',
            fecha_fin: null,
            horario_referencia: 'TC',
          },
        ],
        error: null,
      },
      cuenta_cliente_pdv: {
        data: [{ pdv_id: 'pdv-1', fecha_inicio: '2026-01-01', fecha_fin: null }],
        error: null,
      },
      pdv: {
        data: [
          {
            id: 'pdv-1',
            clave_btl: 'PDV-001',
            nombre: 'Tienda Centro',
            zona: 'CENTRO',
            direccion: null,
            estatus: 'ACTIVO',
            formato: 'FIJO',
          },
        ],
        error: null,
      },
      geocerca_pdv: { data: [], error: null },
      pdv_estado_vigencia: { data: [], error: null },
    });

    const catalog = await obtenerCatalogoPdvsRutaSupervisorSemana(
      client as never,
      actor,
      '2026-08-31'
    );

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      id: 'pdv-1',
      vigenteDesde: '2026-09-01',
      vigenteHasta: '2026-09-06',
      diasDisponibles: [
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-09-06',
      ],
    });
  });

  it('mantiene una relación sin fecha final en semanas posteriores', async () => {
    const client = createFakeClient({
      supervisor_pdv: {
        data: [{ pdv_id: 'pdv-1', fecha_inicio: '2026-09-01', fecha_fin: null }],
        error: null,
      },
      asignacion: { data: [], error: null },
      cuenta_cliente_pdv: {
        data: [{ pdv_id: 'pdv-1', fecha_inicio: '2026-01-01', fecha_fin: null }],
        error: null,
      },
      pdv: {
        data: [
          {
            id: 'pdv-1',
            clave_btl: 'PDV-001',
            nombre: 'Tienda Centro',
            zona: 'CENTRO',
            direccion: null,
            estatus: 'ACTIVO',
            formato: 'FIJO',
          },
        ],
        error: null,
      },
      geocerca_pdv: { data: [], error: null },
      pdv_estado_vigencia: { data: [], error: null },
    });

    const catalog = await obtenerCatalogoPdvsRutaSupervisorSemana(
      client as never,
      actor,
      '2026-09-14'
    );

    expect(catalog[0]?.diasDisponibles).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
  });
});
