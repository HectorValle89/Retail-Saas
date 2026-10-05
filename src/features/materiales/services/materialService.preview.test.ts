import { describe, expect, it } from 'vitest';
import { obtenerPanelMateriales, resolveEvidenceStorageUrl } from './materialService';
import { SINGLE_TENANT_ACCOUNT_ID } from '@/lib/tenant/singleTenant';

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null;
  error: { message: string } | null;
};

type FakeResults = Record<string, QueryResult>;

function createFakeMaterialesClient(results: FakeResults, touchedTables: string[] = []) {
  return {
    from(table: string) {
      touchedTables.push(table);
      const entry = results[table] ?? { data: [], error: null };

      const chain = {
        select() {
          return chain;
        },
        update() {
          return chain;
        },
        eq() {
          return chain;
        },
        in() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        maybeSingle() {
          if (Array.isArray(entry.data)) {
            return Promise.resolve({ data: entry.data[0] ?? null, error: entry.error });
          }
          return Promise.resolve(entry);
        },
        then(resolve: (value: QueryResult) => void) {
          return Promise.resolve(entry).then(resolve);
        },
      };

      return chain;
    },
  };
}

const actor = {
  authUserId: 'auth-1',
  usuarioId: 'user-1',
  empleadoId: 'emp-1',
  cuentaClienteId: SINGLE_TENANT_ACCOUNT_ID,
  username: 'dc_1',
  correoElectronico: 'dc@test.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA' as const,
  nombreCompleto: 'DC Uno',
  puesto: 'ADMINISTRADOR' as const,
};

describe('materialService preview lifecycle', () => {
  it('firma referencias privadas de evidencia antes de enviarlas al visor', async () => {
    const signedUrl = await resolveEvidenceStorageUrl(
      {
        storage: {
          from(bucket: string) {
            return {
              createSignedUrl(route: string, expiresIn: number) {
                return Promise.resolve({
                  data: {
                    signedUrl: `https://storage.test/${bucket}/${route}?expires=${expiresIn}`,
                  },
                  error: null,
                });
              },
            };
          },
        },
      } as never,
      'operacion-evidencias/materiales/ultima-milla/foto.jpg',
      'operacion-evidencias',
      'materiales/ultima-milla/foto.jpg'
    );

    expect(signedUrl).toBe(
      '/api/reportes/imagen-proxy?bucket=operacion-evidencias&route=materiales%2Fultima-milla%2Ffoto.jpg'
    );
  });

  it('oculta previews en borrador y deja visibles solo los lotes confirmados', async () => {
    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: {
        data: [
          {
            id: 'lot-draft',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            mes_operacion: '2026-03-01',
            estado: 'BORRADOR_PREVIEW',
            archivo_nombre: 'preview.xlsx',
            archivo_url: null,
            gemini_status: 'SIN_INTENTO',
            advertencias: [],
            resumen: {},
            preview_data: {},
            confirmado_en: null,
            created_at: '2026-03-27T10:00:00Z',
            cuenta_cliente: {
              id: SINGLE_TENANT_ACCOUNT_ID,
              nombre: 'ISDIN',
              identificador: 'isdin_mexico',
            },
          },
          {
            id: 'lot-confirmed',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            mes_operacion: '2026-03-01',
            estado: 'CONFIRMADO',
            archivo_nombre: 'confirmado.xlsx',
            archivo_url: null,
            gemini_status: 'OK',
            advertencias: [],
            resumen: {},
            preview_data: {},
            confirmado_en: '2026-03-27T11:00:00Z',
            created_at: '2026-03-27T11:00:00Z',
            cuenta_cliente: {
              id: SINGLE_TENANT_ACCOUNT_ID,
              nombre: 'ISDIN',
              identificador: 'isdin_mexico',
            },
          },
        ],
        error: null,
      },
      material_distribucion_mensual: { data: [], error: null },
      material_distribucion_detalle: { data: [], error: null },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      pdv: { data: [], error: null },
      cuenta_cliente: {
        data: [
          {
            id: SINGLE_TENANT_ACCOUNT_ID,
            nombre: 'ISDIN',
            identificador: 'isdin_mexico',
          },
        ],
        error: null,
      },
      cadena: { data: [], error: null },
    });

    const data = await obtenerPanelMateriales(fakeClient as never, actor);

    expect(data.draftLots).toEqual([]);
    expect(data.confirmedLots).toHaveLength(1);
    expect(data.confirmedLots[0]?.id).toBe('lot-confirmed');
  });

  it('prepara opciones de receptor para ultima milla con asignadas al PDV primero y fallback por usuarios de la cuenta', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const supervisorActor = {
      ...actor,
      empleadoId: 'sup-1',
      puesto: 'SUPERVISOR' as const,
    };
    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: { data: [], error: null },
      material_distribucion_mensual: {
        data: [
          {
            id: 'dist-1',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            lote_id: 'lot-1',
            pdv_id: 'pdv-1',
            supervisor_empleado_id: 'sup-1',
            confirmado_por_empleado_id: null,
            mes_operacion: currentMonth,
            estado: 'PENDIENTE_RECEPCION',
            cadena_snapshot: 'HEB',
            id_pdv_cadena_snapshot: '2987',
            sucursal_snapshot: 'LAS FUENTES',
            nombre_dc_snapshot: null,
            territorio_snapshot: null,
            hoja_origen: 'Bloque HEB',
            firma_recepcion_url: null,
            firma_recepcion_hash: null,
            foto_recepcion_url: null,
            foto_recepcion_hash: null,
            foto_recepcion_capturada_en: null,
            confirmado_en: null,
            observaciones: null,
            metadata: {},
            cuenta_cliente: {
              id: SINGLE_TENANT_ACCOUNT_ID,
              nombre: 'ISDIN',
              identificador: 'isdin_mexico',
            },
            pdv: {
              id: 'pdv-1',
              clave_btl: 'BTL-HEB-1',
              nombre: 'LAS FUENTES',
              zona: 'NORTE',
              cadena_id: null,
              id_cadena: '2987',
            },
          },
        ],
        error: null,
      },
      material_distribucion_detalle: {
        data: [
          {
            id: 'det-1',
            distribucion_id: 'dist-1',
            material_catalogo_id: 'mat-1',
            cantidad_enviada: 2,
            cantidad_recibida: 0,
            cantidad_entregada: 0,
            cantidad_observada: 0,
            material_nombre_snapshot: 'BLOQUEADOR',
            material_tipo_mes: 'MATERIAL',
            mecanica_canje: null,
            indicaciones_producto: null,
            instrucciones_mercadeo: null,
            requiere_ticket_mes: false,
            requiere_evidencia_entrega_mes: false,
            requiere_evidencia_mercadeo: false,
            es_regalo_dc: false,
            excluir_de_registrar_entrega: false,
            total_columna_hoja: 2,
            observaciones: null,
            metadata: {},
            material_catalogo: { id: 'mat-1', nombre: 'BLOQUEADOR', tipo: 'MATERIAL' },
          },
        ],
        error: null,
      },
      asignacion: {
        data: [
          {
            empleado_id: 'dc-assigned',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            pdv_id: 'pdv-1',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            estado_publicacion: 'PUBLICADA',
          },
        ],
        error: null,
      },
      empleado: {
        data: [
          {
            id: 'dc-assigned',
            nombre_completo: 'Asignada PDV',
            id_nomina: null,
            puesto: 'DERMOCONSEJERO',
            estatus_laboral: 'ACTIVO',
          },
          {
            id: 'dc-fallback',
            nombre_completo: 'Fallback Cuenta',
            id_nomina: null,
            puesto: 'DERMOCONSEJERO',
            estatus_laboral: 'ACTIVO',
          },
          {
            id: 'sup-receiver',
            nombre_completo: 'Supervisor Receptor',
            id_nomina: null,
            puesto: 'SUPERVISOR',
            estatus_laboral: 'ACTIVO',
          },
        ],
        error: null,
      },
      usuario: {
        data: [
          {
            empleado_id: 'dc-assigned',
            username: 'btl_dc_assigned',
            estado_cuenta: 'PROVISIONAL',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
          },
          {
            empleado_id: 'dc-fallback',
            username: 'btl_dc_fallback',
            estado_cuenta: 'PROVISIONAL',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
          },
          {
            empleado_id: 'sup-receiver',
            username: 'btl_sup_receiver',
            estado_cuenta: 'PROVISIONAL',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
          },
        ],
        error: null,
      },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      material_entrega_ultima_milla: { data: [], error: null },
      material_entrega_ultima_milla_detalle: { data: [], error: null },
      material_entrega_ultima_milla_evidencia: { data: [], error: null },
      pdv: {
        data: [
          {
            id: 'pdv-1',
            clave_btl: 'BTL-HEB-1',
            nombre: 'LAS FUENTES',
            zona: 'NORTE',
            cadena_id: null,
            id_cadena: '2987',
          },
        ],
        error: null,
      },
      cuenta_cliente: {
        data: [
          {
            id: SINGLE_TENANT_ACCOUNT_ID,
            nombre: 'ISDIN',
            identificador: 'isdin_mexico',
          },
        ],
        error: null,
      },
      cadena: { data: [], error: null },
    });

    const data = await obtenerPanelMateriales(fakeClient as never, supervisorActor);

    expect(data.supervisorLastMileDistributions).toHaveLength(1);
    expect(
      data.supervisorLastMileDistributions[0]?.receptorOptions.map((option) => option.scope)
    ).toEqual(['ASIGNADO_PDV', 'POR_CUBRIR', 'TODOS', 'SUPERVISOR']);
    expect(data.supervisorLastMileDistributions[0]?.receptorOptions[0]).toMatchObject({
      id: 'dc-assigned',
      username: 'btl_dc_assigned',
    });
    expect(data.supervisorLastMileDistributions[0]?.receptorOptions[1]).toMatchObject({
      id: '__POR_CUBRIR__',
      label: 'Por cubrir',
    });
    expect(data.supervisorLastMileDistributions[0]?.receptorOptions[3]).toMatchObject({
      id: 'sup-receiver',
      username: 'btl_sup_receiver',
      scope: 'SUPERVISOR',
    });
  });

  it('usa el supervisor activo del PDV cuando la dispersión no trae supervisor_empleado_id', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const supervisorActor = {
      ...actor,
      empleadoId: 'sup-1',
      puesto: 'SUPERVISOR' as const,
    };
    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: { data: [], error: null },
      material_distribucion_mensual: {
        data: [
          {
            id: 'dist-3',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            lote_id: 'lot-3',
            pdv_id: 'pdv-3',
            supervisor_empleado_id: null,
            confirmado_por_empleado_id: null,
            mes_operacion: currentMonth,
            estado: 'PENDIENTE_RECEPCION',
            cadena_snapshot: 'HEB',
            id_pdv_cadena_snapshot: '2999',
            sucursal_snapshot: 'LAS ROSAS',
            nombre_dc_snapshot: null,
            territorio_snapshot: null,
            hoja_origen: 'Bloque HEB',
            firma_recepcion_url: null,
            firma_recepcion_hash: null,
            foto_recepcion_url: null,
            foto_recepcion_hash: null,
            foto_recepcion_capturada_en: null,
            confirmado_en: null,
            observaciones: null,
            metadata: {},
            cuenta_cliente: {
              id: SINGLE_TENANT_ACCOUNT_ID,
              nombre: 'ISDIN',
              identificador: 'isdin_mexico',
            },
            pdv: {
              id: 'pdv-3',
              clave_btl: 'BTL-HEB-3',
              nombre: 'LAS ROSAS',
              zona: 'NORTE',
              cadena_id: null,
              id_cadena: '2999',
            },
          },
        ],
        error: null,
      },
      material_distribucion_detalle: {
        data: [
          {
            id: 'det-3',
            distribucion_id: 'dist-3',
            material_catalogo_id: 'mat-3',
            cantidad_enviada: 2,
            cantidad_recibida: 0,
            cantidad_entregada: 0,
            cantidad_observada: 0,
            material_nombre_snapshot: 'BLOQUEADOR',
            material_tipo_mes: 'MATERIAL',
            mecanica_canje: null,
            indicaciones_producto: null,
            instrucciones_mercadeo: null,
            requiere_ticket_mes: false,
            requiere_evidencia_entrega_mes: false,
            requiere_evidencia_mercadeo: false,
            es_regalo_dc: false,
            excluir_de_registrar_entrega: false,
            total_columna_hoja: 2,
            observaciones: null,
            metadata: {},
            material_catalogo: { id: 'mat-3', nombre: 'BLOQUEADOR', tipo: 'MATERIAL' },
          },
        ],
        error: null,
      },
      asignacion: { data: [], error: null },
      supervisor_pdv: {
        data: [
          {
            pdv_id: 'pdv-3',
            empleado_id: 'sup-1',
            activo: true,
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
          },
        ],
        error: null,
      },
      empleado: {
        data: [
          {
            id: 'sup-1',
            nombre_completo: 'Supervisor Uno',
            id_nomina: '9001',
            puesto: 'SUPERVISOR',
            estatus_laboral: 'ACTIVO',
          },
        ],
        error: null,
      },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      material_entrega_ultima_milla: { data: [], error: null },
      material_entrega_ultima_milla_detalle: { data: [], error: null },
      material_entrega_ultima_milla_evidencia: { data: [], error: null },
      pdv: { data: [], error: null },
      cuenta_cliente: {
        data: [
          {
            id: SINGLE_TENANT_ACCOUNT_ID,
            nombre: 'ISDIN',
            identificador: 'isdin_mexico',
          },
        ],
        error: null,
      },
      cadena: { data: [], error: null },
      usuario: { data: [], error: null },
    });

    const data = await obtenerPanelMateriales(fakeClient as never, supervisorActor);

    expect(data.supervisorLastMileDistributions).toHaveLength(1);
    expect(data.supervisorLastMileDistributions[0]?.supervisorEmpleadoId).toBe('sup-1');
    expect(data.supervisorLastMileDistributions[0]?.supervisorNombre).toBe('Supervisor Uno');
  });

  it('limita el panel de supervisor a entregas de sus PDV activos', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const supervisorActor = {
      ...actor,
      empleadoId: 'sup-1',
      puesto: 'SUPERVISOR' as const,
    };
    const baseDistribution = {
      cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
      lote_id: 'lot-scope',
      supervisor_empleado_id: null,
      confirmado_por_empleado_id: null,
      mes_operacion: currentMonth,
      estado: 'PENDIENTE_RECEPCION',
      cadena_snapshot: 'HEB',
      id_pdv_cadena_snapshot: null,
      nombre_dc_snapshot: null,
      territorio_snapshot: null,
      hoja_origen: 'Bloque HEB',
      firma_recepcion_url: null,
      firma_recepcion_hash: null,
      foto_recepcion_url: null,
      foto_recepcion_hash: null,
      foto_recepcion_capturada_en: null,
      confirmado_en: null,
      observaciones: null,
      metadata: {},
      cuenta_cliente: {
        id: SINGLE_TENANT_ACCOUNT_ID,
        nombre: 'ISDIN',
        identificador: 'isdin_mexico',
      },
    };
    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: { data: [], error: null },
      material_distribucion_mensual: {
        data: [
          {
            ...baseDistribution,
            id: 'dist-owned',
            pdv_id: 'pdv-owned',
            sucursal_snapshot: 'PDV PROPIO',
            pdv: {
              id: 'pdv-owned',
              clave_btl: 'BTL-OWN',
              nombre: 'PDV PROPIO',
              zona: 'NORTE',
              cadena_id: null,
              id_cadena: 'OWN',
            },
          },
          {
            ...baseDistribution,
            id: 'dist-other',
            pdv_id: 'pdv-other',
            sucursal_snapshot: 'PDV AJENO',
            pdv: {
              id: 'pdv-other',
              clave_btl: 'BTL-OTHER',
              nombre: 'PDV AJENO',
              zona: 'SUR',
              cadena_id: null,
              id_cadena: 'OTHER',
            },
          },
        ],
        error: null,
      },
      material_distribucion_detalle: {
        data: [
          {
            id: 'det-owned',
            distribucion_id: 'dist-owned',
            material_catalogo_id: 'mat-owned',
            cantidad_enviada: 5,
            cantidad_recibida: 0,
            cantidad_entregada: 0,
            cantidad_observada: 0,
            material_nombre_snapshot: 'MATERIAL PROPIO',
            material_tipo_mes: 'MATERIAL',
            mecanica_canje: null,
            indicaciones_producto: null,
            instrucciones_mercadeo: null,
            requiere_ticket_mes: false,
            requiere_evidencia_entrega_mes: false,
            requiere_evidencia_mercadeo: false,
            es_regalo_dc: false,
            excluir_de_registrar_entrega: false,
            total_columna_hoja: 5,
            observaciones: null,
            metadata: {},
            material_catalogo: { id: 'mat-owned', nombre: 'MATERIAL PROPIO', tipo: 'MATERIAL' },
          },
          {
            id: 'det-other',
            distribucion_id: 'dist-other',
            material_catalogo_id: 'mat-other',
            cantidad_enviada: 8,
            cantidad_recibida: 0,
            cantidad_entregada: 0,
            cantidad_observada: 0,
            material_nombre_snapshot: 'MATERIAL AJENO',
            material_tipo_mes: 'MATERIAL',
            mecanica_canje: null,
            indicaciones_producto: null,
            instrucciones_mercadeo: null,
            requiere_ticket_mes: false,
            requiere_evidencia_entrega_mes: false,
            requiere_evidencia_mercadeo: false,
            es_regalo_dc: false,
            excluir_de_registrar_entrega: false,
            total_columna_hoja: 8,
            observaciones: null,
            metadata: {},
            material_catalogo: { id: 'mat-other', nombre: 'MATERIAL AJENO', tipo: 'MATERIAL' },
          },
        ],
        error: null,
      },
      supervisor_pdv: {
        data: [
          {
            pdv_id: 'pdv-owned',
            empleado_id: 'sup-1',
            activo: true,
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
          },
        ],
        error: null,
      },
      empleado: {
        data: [
          {
            id: 'sup-1',
            nombre_completo: 'Supervisor Uno',
            id_nomina: '9001',
            puesto: 'SUPERVISOR',
            estatus_laboral: 'ACTIVO',
          },
        ],
        error: null,
      },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      material_entrega_ultima_milla: { data: [], error: null },
      material_entrega_ultima_milla_detalle: { data: [], error: null },
      material_entrega_ultima_milla_evidencia: { data: [], error: null },
      asignacion: { data: [], error: null },
      usuario: { data: [], error: null },
      pdv: {
        data: [
          {
            id: 'pdv-owned',
            clave_btl: 'BTL-OWN',
            nombre: 'PDV PROPIO',
            zona: 'NORTE',
            cadena_id: null,
            id_cadena: 'OWN',
          },
          {
            id: 'pdv-other',
            clave_btl: 'BTL-OTHER',
            nombre: 'PDV AJENO',
            zona: 'SUR',
            cadena_id: null,
            id_cadena: 'OTHER',
          },
        ],
        error: null,
      },
      cuenta_cliente: {
        data: [
          {
            id: SINGLE_TENANT_ACCOUNT_ID,
            nombre: 'ISDIN',
            identificador: 'isdin_mexico',
          },
        ],
        error: null,
      },
      cadena: { data: [], error: null },
    });

    const data = await obtenerPanelMateriales(fakeClient as never, supervisorActor);

    expect(data.distributions.map((item) => item.pdvId)).toEqual(['pdv-owned']);
    expect(data.supervisorView.map((item) => item.pdvNombre)).toEqual(['PDV PROPIO']);
    expect(data.supervisorLastMileDistributions.map((item) => item.pdvId)).toEqual(['pdv-owned']);
  });

  it('usa una carga ligera para supervisor sin leer tablas administrativas pesadas', async () => {
    const touchedTables: string[] = [];
    const supervisorActor = {
      ...actor,
      empleadoId: 'sup-fast',
      puesto: 'SUPERVISOR' as const,
    };
    const fakeClient = createFakeMaterialesClient(
      {
        supervisor_pdv: { data: [], error: null },
        cuenta_cliente: {
          data: [
            {
              id: SINGLE_TENANT_ACCOUNT_ID,
              nombre: 'ISDIN',
              identificador: 'isdin_mexico',
            },
          ],
          error: null,
        },
        empleado: {
          data: [
            {
              id: 'sup-fast',
              nombre_completo: 'Supervisor Rapida',
              id_nomina: '9003',
              puesto: 'SUPERVISOR',
              estatus_laboral: 'ACTIVO',
            },
          ],
          error: null,
        },
        material_distribucion_mensual: { data: [], error: null },
      },
      touchedTables
    );

    const data = await obtenerPanelMateriales(fakeClient as never, supervisorActor);

    expect(data.actorRole).toBe('SUPERVISOR');
    expect(data.distributions).toEqual([]);
    expect(new Set(touchedTables)).not.toContain('material_catalogo');
    expect(new Set(touchedTables)).not.toContain('material_distribucion_lote');
    expect(new Set(touchedTables)).not.toContain('material_entrega_promocional');
    expect(new Set(touchedTables)).not.toContain('material_inventario_movimiento');
    expect(new Set(touchedTables)).not.toContain('material_evidencia_mercadeo');
    expect(new Set(touchedTables)).not.toContain('material_conteo_jornada');
    expect(new Set(touchedTables)).not.toContain('pdv');
  });

  it('resuelve el estado actual de entrega y expone supervisores para el filtro administrativo', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: { data: [], error: null },
      material_distribucion_mensual: {
        data: [
          {
            id: 'dist-2',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            lote_id: 'lot-2',
            pdv_id: 'pdv-2',
            supervisor_empleado_id: 'sup-2',
            confirmado_por_empleado_id: null,
            mes_operacion: currentMonth,
            estado: 'PENDIENTE_RECEPCION',
            cadena_snapshot: 'HEB',
            id_pdv_cadena_snapshot: '2988',
            sucursal_snapshot: 'LAS NUBES',
            nombre_dc_snapshot: null,
            territorio_snapshot: null,
            hoja_origen: 'Bloque HEB',
            firma_recepcion_url: null,
            firma_recepcion_hash: null,
            foto_recepcion_url: null,
            foto_recepcion_hash: null,
            foto_recepcion_capturada_en: null,
            confirmado_en: null,
            observaciones: null,
            metadata: {},
            cuenta_cliente: {
              id: SINGLE_TENANT_ACCOUNT_ID,
              nombre: 'ISDIN',
              identificador: 'isdin_mexico',
            },
            pdv: {
              id: 'pdv-2',
              clave_btl: 'BTL-HEB-2',
              nombre: 'LAS NUBES',
              zona: 'NORTE',
              cadena_id: null,
              id_cadena: '2988',
            },
          },
        ],
        error: null,
      },
      material_distribucion_detalle: {
        data: [
          {
            id: 'det-2',
            distribucion_id: 'dist-2',
            material_catalogo_id: 'mat-2',
            cantidad_enviada: 4,
            cantidad_recibida: 0,
            cantidad_entregada: 0,
            cantidad_observada: 0,
            material_nombre_snapshot: 'KIT PROMOCIONAL',
            material_tipo_mes: 'PROMOCIONAL',
            mecanica_canje: null,
            indicaciones_producto: null,
            instrucciones_mercadeo: null,
            requiere_ticket_mes: false,
            requiere_evidencia_entrega_mes: false,
            requiere_evidencia_mercadeo: false,
            es_regalo_dc: false,
            excluir_de_registrar_entrega: false,
            total_columna_hoja: 4,
            observaciones: null,
            metadata: {},
            material_catalogo: { id: 'mat-2', nombre: 'KIT PROMOCIONAL', tipo: 'PROMOCIONAL' },
          },
        ],
        error: null,
      },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      material_entrega_ultima_milla: { data: [], error: null },
      material_entrega_ultima_milla_detalle: { data: [], error: null },
      material_entrega_ultima_milla_evidencia: { data: [], error: null },
      empleado: {
        data: [
          {
            id: 'sup-2',
            nombre_completo: 'Supervisor Dos',
            id_nomina: '9002',
            puesto: 'SUPERVISOR',
            estatus_laboral: 'ACTIVO',
          },
        ],
        error: null,
      },
      pdv: {
        data: [
          {
            id: 'pdv-2',
            clave_btl: 'BTL-HEB-2',
            nombre: 'LAS NUBES',
            zona: 'NORTE',
            cadena_id: null,
            id_cadena: '2988',
          },
        ],
        error: null,
      },
      cuenta_cliente: {
        data: [
          {
            id: SINGLE_TENANT_ACCOUNT_ID,
            nombre: 'ISDIN',
            identificador: 'isdin_mexico',
          },
        ],
        error: null,
      },
      cadena: { data: [], error: null },
    });

    const data = await obtenerPanelMateriales(fakeClient as never, actor);

    expect(data.supervisorOptions).toEqual([
      { id: 'sup-2', label: 'Supervisor Dos / Nómina 9002' },
    ]);
    expect(data.distributions[0]?.estadoEntregaActual).toBe('NO_ENTREGADO');
    expect(data.reportRows[0]?.estadoEntregaActual).toBe('NO_ENTREGADO');
  });

  it('refleja ultima milla sincronizada como 100% entregada en panel y reportes de materiales', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: { data: [], error: null },
      material_distribucion_mensual: {
        data: [
          {
            id: 'dist-delivered',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            lote_id: 'lot-delivered',
            pdv_id: 'pdv-delivered',
            supervisor_empleado_id: 'sup-delivered',
            confirmado_por_empleado_id: null,
            mes_operacion: currentMonth,
            estado: 'RECIBIDA_CONFORME',
            cadena_snapshot: 'HEB',
            id_pdv_cadena_snapshot: 'HECT-01',
            sucursal_snapshot: 'HECT TES 1',
            nombre_dc_snapshot: null,
            territorio_snapshot: null,
            hoja_origen: 'Bloque HEB',
            firma_recepcion_url: null,
            firma_recepcion_hash: null,
            foto_recepcion_url: null,
            foto_recepcion_hash: null,
            foto_recepcion_capturada_en: null,
            confirmado_en: '2026-05-05T14:25:00.000Z',
            observaciones: null,
            metadata: {},
            cuenta_cliente: {
              id: SINGLE_TENANT_ACCOUNT_ID,
              nombre: 'ISDIN',
              identificador: 'isdin_mexico',
            },
            pdv: {
              id: 'pdv-delivered',
              clave_btl: 'BTL-TST-HECT-01',
              nombre: 'HECT TES 1',
              zona: 'NORTE',
              cadena_id: null,
              id_cadena: 'HECT-01',
            },
          },
        ],
        error: null,
      },
      material_distribucion_detalle: {
        data: [
          {
            id: 'det-delivered',
            distribucion_id: 'dist-delivered',
            material_catalogo_id: 'mat-delivered',
            cantidad_enviada: 12,
            cantidad_recibida: 0,
            cantidad_entregada: 0,
            cantidad_observada: 0,
            material_nombre_snapshot: 'KIT ISDIN',
            material_tipo_mes: 'PROMOCIONAL',
            mecanica_canje: null,
            indicaciones_producto: null,
            instrucciones_mercadeo: null,
            requiere_ticket_mes: false,
            requiere_evidencia_entrega_mes: false,
            requiere_evidencia_mercadeo: false,
            es_regalo_dc: false,
            excluir_de_registrar_entrega: false,
            total_columna_hoja: 12,
            observaciones: null,
            metadata: {},
            material_catalogo: { id: 'mat-delivered', nombre: 'KIT ISDIN', tipo: 'PROMOCIONAL' },
          },
        ],
        error: null,
      },
      material_entrega_ultima_milla: {
        data: [
          {
            id: 'last-mile-1',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            distribucion_id: 'dist-delivered',
            pdv_id: 'pdv-delivered',
            cadena_id: null,
            supervisor_empleado_id: 'sup-delivered',
            dermoconsejero_empleado_id: 'dc-delivered',
            estado: 'SINCRONIZADA',
            pdv_snapshot: { nombre: 'HECT TES 1', clave_btl: 'BTL-TST-HECT-01' },
            cadena_snapshot: { nombre: 'HEB' },
            dermoconsejero_snapshot: { nombre: 'ALONDRA MIRIAM GARCIA LARIOS' },
            correccion_solicitada: {},
            latitud: null,
            longitud: null,
            gps_accuracy_metros: null,
            capturado_en: '2026-05-05T14:25:00.000Z',
            sincronizado_en: '2026-05-05T14:25:03.000Z',
            offline_client_id: 'material-ultima-milla-last-mile-1',
            metadata: {},
          },
        ],
        error: null,
      },
      material_entrega_ultima_milla_detalle: {
        data: [
          {
            id: 'last-mile-detail-1',
            entrega_id: 'last-mile-1',
            distribucion_detalle_id: 'det-delivered',
            material_catalogo_id: 'mat-delivered',
            cantidad_teorica: 12,
            estado_item: 'COMPLETO',
            cantidad_real_recibida: 12,
            diferencia: 0,
            observaciones: null,
            material_catalogo: { id: 'mat-delivered', nombre: 'KIT ISDIN', tipo: 'PROMOCIONAL' },
          },
        ],
        error: null,
      },
      material_entrega_ultima_milla_evidencia: { data: [], error: null },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      empleado: {
        data: [
          {
            id: 'sup-delivered',
            nombre_completo: 'Supervisor Entregas',
            id_nomina: '9004',
            puesto: 'SUPERVISOR',
            estatus_laboral: 'ACTIVO',
          },
        ],
        error: null,
      },
      pdv: {
        data: [
          {
            id: 'pdv-delivered',
            clave_btl: 'BTL-TST-HECT-01',
            nombre: 'HECT TES 1',
            zona: 'NORTE',
            cadena_id: null,
            id_cadena: 'HECT-01',
          },
        ],
        error: null,
      },
      cuenta_cliente: {
        data: [
          {
            id: SINGLE_TENANT_ACCOUNT_ID,
            nombre: 'ISDIN',
            identificador: 'isdin_mexico',
          },
        ],
        error: null,
      },
      cadena: { data: [], error: null },
    });

    const data = await obtenerPanelMateriales(fakeClient as never, actor);

    expect(data.distributions[0]).toMatchObject({
      estadoEntregaActual: 'ENTREGADO',
      totalEnviado: 12,
      totalRecibido: 12,
      totalEntregado: 12,
      totalDisponible: 0,
    });
    expect(data.reportRows[0]).toMatchObject({
      estadoEntregaActual: 'ENTREGADO',
      enviado: 12,
      recibido: 12,
      entregado: 12,
      restante: 0,
    });
  });

  it('incluye el mes anterior (mayo de 2026 en este caso) en las opciones de mes y en la lista de dispersiones para ultima milla', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const date = new Date(`${currentMonth.slice(0, 7)}-01T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() - 1);
    const prevMonthValue = date.toISOString().slice(0, 7) + '-01';

    const supervisorActor = {
      ...actor,
      empleadoId: 'sup-prev',
      puesto: 'SUPERVISOR' as const,
    };

    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: { data: [], error: null },
      material_distribucion_mensual: {
        data: [
          {
            id: 'dist-prev',
            cuenta_cliente_id: SINGLE_TENANT_ACCOUNT_ID,
            lote_id: 'lot-prev',
            pdv_id: 'pdv-prev',
            supervisor_empleado_id: 'sup-prev',
            mes_operacion: prevMonthValue,
            estado: 'PENDIENTE_RECEPCION',
            cadena_snapshot: 'HEB',
            sucursal_snapshot: 'LAS FUENTES',
            cuenta_cliente: { id: SINGLE_TENANT_ACCOUNT_ID, nombre: 'ISDIN' },
            pdv: { id: 'pdv-prev', clave_btl: 'BTL-HEB-1', nombre: 'LAS FUENTES' },
          },
        ],
        error: null,
      },
      material_distribucion_detalle: { data: [], error: null },
      supervisor_pdv: {
        data: [
          {
            pdv_id: 'pdv-prev',
            empleado_id: 'sup-prev',
            activo: true,
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
          },
        ],
        error: null,
      },
      empleado: {
        data: [
          {
            id: 'sup-prev',
            nombre_completo: 'Supervisor Anterior',
            id_nomina: '9005',
            puesto: 'SUPERVISOR',
            estatus_laboral: 'ACTIVO',
          },
        ],
        error: null,
      },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      material_entrega_ultima_milla: { data: [], error: null },
      material_entrega_ultima_milla_detalle: { data: [], error: null },
      material_entrega_ultima_milla_evidencia: { data: [], error: null },
      pdv: { data: [], error: null },
      cuenta_cliente: {
        data: [
          {
            id: SINGLE_TENANT_ACCOUNT_ID,
            nombre: 'ISDIN',
            identificador: 'isdin_mexico',
          },
        ],
        error: null,
      },
      cadena: { data: [], error: null },
      usuario: { data: [], error: null },
    });

    const data = await obtenerPanelMateriales(fakeClient as never, supervisorActor);

    expect(data.monthOptions).toContain(prevMonthValue);
    expect(data.supervisorLastMileDistributions).toHaveLength(1);
    expect(data.supervisorLastMileDistributions[0].id).toBe('dist-prev');
  });

  it('fija ISDIN como cuenta operativa aunque el actor traiga otra cuenta y el query no la devuelva', async () => {
    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: { data: [], error: null },
      material_distribucion_mensual: { data: [], error: null },
      material_distribucion_detalle: { data: [], error: null },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      material_entrega_ultima_milla: { data: [], error: null },
      material_entrega_ultima_milla_detalle: { data: [], error: null },
      material_entrega_ultima_milla_evidencia: { data: [], error: null },
      pdv: { data: [], error: null },
      cuenta_cliente: {
        data: [
          {
            id: 'demo-id',
            nombre: 'be te ele demo',
            identificador: 'be_te_ele_demo',
            activa: true,
          },
        ],
        error: null,
      },
      cadena: { data: [], error: null },
    });

    const data = await obtenerPanelMateriales(
      fakeClient as never,
      {
        ...actor,
        cuentaClienteId: 'demo-id',
      } as never
    );

    expect(data.accountOptions).toEqual([{ id: SINGLE_TENANT_ACCOUNT_ID, label: 'ISDIN' }]);
  });
});
