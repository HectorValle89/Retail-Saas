import { expect, test } from 'vitest';
import type { ActorActual } from '@/lib/auth/session';
import { obtenerPdvsWorkspaceData } from './asignacionService';

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null;
  error: { message: string } | null;
};

function createFakeClient(
  results: Record<string, QueryResult>,
  options?: { onFrom?: (table: string) => void }
) {
  return {
    from(table: string) {
      options?.onFrom?.(table);
      const entry = results[table] ?? { data: [], error: null };

      let headRequested = false;
      let countRequested = false;

      const buildPayload = () => {
        const count = Array.isArray(entry.data) ? entry.data.length : 0;
        if (headRequested) {
          return {
            data: null,
            error: entry.error,
            count,
          };
        }

        return countRequested
          ? {
              ...entry,
              count,
            }
          : entry;
      };

      const chain = {
        select(
          _columns?: string,
          queryOptions?: {
            count?: 'exact' | 'planned' | 'estimated';
            head?: boolean;
          }
        ) {
          headRequested = queryOptions?.head === true;
          countRequested = Boolean(queryOptions?.count);
          return chain;
        },
        eq() {
          return chain;
        },
        neq() {
          return chain;
        },
        in() {
          return chain;
        },
        not() {
          return chain;
        },
        gte() {
          return chain;
        },
        lte() {
          return chain;
        },
        lt() {
          return chain;
        },
        or() {
          return chain;
        },
        order() {
          return Promise.resolve(buildPayload());
        },
        limit() {
          return Promise.resolve(buildPayload());
        },
        maybeSingle() {
          return Promise.resolve(buildPayload());
        },
        then(
          resolve: (
            value:
              | (QueryResult & { count?: number | null })
              | { data: null; error: { message: string } | null; count: number }
          ) => void
        ) {
          return Promise.resolve(buildPayload()).then(resolve);
        },
      };

      return chain;
    },
  };
}

const adminActor: ActorActual = {
  authUserId: 'auth-admin',
  usuarioId: 'user-admin',
  empleadoId: 'emp-admin',
  cuentaClienteId: null,
  username: 'admin',
  correoElectronico: 'admin@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Admin Principal',
  puesto: 'ADMINISTRADOR',
};

test('abre PDVs en rotacion maestra por defecto y no carga cobertura reclutamiento al inicio', async () => {
  const queriedTables: string[] = [];
  const tenantActor: ActorActual = {
    ...adminActor,
    cuentaClienteId: 'c1',
  };

  const client = createFakeClient(
    {
      cuenta_cliente: {
        data: { id: 'c1', identificador: 'isdin_mexico', nombre: 'ISDIN Mexico' },
        error: null,
      },
      cuenta_cliente_pdv: {
        data: [
          {
            pdv_id: 'pdv-1',
            cuenta_cliente_id: 'c1',
            activo: true,
            fecha_inicio: '2026-03-01',
            fecha_fin: null,
            pdv: {
              id: 'pdv-1',
              clave_btl: 'ROT-001',
              nombre: 'PDV Rotacion',
              zona: 'Norte',
              estatus: 'ACTIVO',
              cadena: [{ nombre: 'Cadena Norte' }],
              ciudad: [{ nombre: 'Monterrey' }],
            },
          },
        ],
        error: null,
      },
      asignacion: {
        data: [
          {
            id: 'asg-1',
            cuenta_cliente_id: 'c1',
            empleado_id: 'emp-1',
            pdv_id: 'pdv-1',
            tipo: 'FIJA',
            naturaleza: 'BASE',
            estado_publicacion: 'PUBLICADA',
            fecha_inicio: '2026-03-01',
            fecha_fin: null,
          },
        ],
        error: null,
      },
      pdv_rotacion_maestra: {
        data: [
          {
            id: 'rot-1',
            cuenta_cliente_id: 'c1',
            pdv_id: 'pdv-1',
            clasificacion_maestra: 'ROTATIVO',
            grupo_rotacion_codigo: 'ROT-001',
            grupo_tamano: 2,
            slot_rotacion: 'A',
            fuente: 'IMPORTADA',
            vigente: true,
            observaciones: null,
            metadata: null,
          },
        ],
        error: null,
      },
      empleado: {
        data: [{ id: 'emp-1', nombre_completo: 'Ana Uno' }],
        error: null,
      },
    },
    {
      onFrom(table) {
        queriedTables.push(table);

        if (table === 'pdv_cobertura_operativa') {
          throw new Error('La cobertura no debe cargarse por defecto en PDVs.');
        }
      },
    }
  );

  const data = await obtenerPdvsWorkspaceData(client as never, tenantActor);

  expect(data.activeView).toBe('pdvs');
  expect(data.pdvsView?.panel).toBe('ROTACION');
  expect(data.pdvsView?.rotacion?.items[0]).toMatchObject({
    pdvId: 'pdv-1',
    clasificacionMaestra: 'ROTATIVO',
    grupoRotacionCodigo: 'ROT-001',
  });
  expect(queriedTables).not.toContain('pdv_cobertura_operativa');
});
