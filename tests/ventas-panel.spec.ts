import { expect, test } from '@playwright/test'
import { obtenerPanelVentas } from '../src/features/ventas/services/ventaService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

function createFakeVentasClient(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: [], error: null }

      const chain = {
        select(
          _columns?: string,
          options?: {
            count?: 'exact' | 'planned' | 'estimated'
            head?: boolean
          }
        ) {
          if (options?.head) {
            return Promise.resolve({
              data: null,
              error: entry.error,
              count: Array.isArray(entry.data) ? entry.data.length : 0,
            })
          }

          return chain
        },
        eq() {
          return chain
        },
        in() {
          return chain
        },
        gte() {
          return chain
        },
        lte() {
          return chain
        },
        order() {
          return chain
        },
        range() {
          return Promise.resolve(entry)
        },
        limit() {
          return Promise.resolve(entry)
        },
      }

      return chain
    },
  }
}

test('expone indicador visual de cuota diaria estimada para la jornada activa', async () => {
  const todayIso = new Date().toISOString().slice(0, 10)
  const client = createFakeVentasClient({
    venta: {
      data: [
        {
          id: 'venta-1',
          cuenta_cliente_id: 'c1',
          asistencia_id: 'asis-1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          producto_id: 'prod-1',
          producto_sku: 'SKU-001',
          producto_nombre: 'Fusion Water',
          producto_nombre_corto: 'Fusion',
          fecha_utc: `${todayIso}T15:00:00.000Z`,
          total_unidades: 2,
          total_monto: 800,
          confirmada: true,
          observaciones: 'Venta matutina',
          cuenta_cliente: { nombre: 'ISDIN Mexico' },
          asistencia: { estatus: 'VALIDA', check_out_utc: null },
        },
        {
          id: 'venta-2',
          cuenta_cliente_id: 'c1',
          asistencia_id: 'asis-1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          producto_id: 'prod-2',
          producto_sku: 'SKU-002',
          producto_nombre: 'Fotoprotector',
          producto_nombre_corto: 'Foto',
          fecha_utc: `${todayIso}T18:00:00.000Z`,
          total_unidades: 1,
          total_monto: 400,
          confirmada: true,
          observaciones: null,
          cuenta_cliente: { nombre: 'ISDIN Mexico' },
          asistencia: { estatus: 'VALIDA', check_out_utc: null },
        },
      ],
      error: null,
    },
    producto: {
      data: [
        {
          id: 'prod-1',
          sku: 'SKU-001',
          nombre: 'Fusion Water',
          nombre_corto: 'Fusion',
          categoria: 'FOTOPROTECCION',
          top_30: true,
          activo: true,
        },
      ],
      error: null,
    },
    asistencia: {
      data: [
        {
          id: 'asis-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          fecha_operacion: todayIso,
          empleado_nombre: 'Ana Uno',
          pdv_clave_btl: 'BTL-001',
          pdv_nombre: 'PDV Centro',
          estatus: 'VALIDA',
          check_out_utc: null,
          cuenta_cliente: { nombre: 'ISDIN Mexico' },
        },
      ],
      error: null,
    },
    nomina_periodo: {
      data: [
        {
          id: 'periodo-1',
          fecha_inicio: todayIso,
          fecha_fin: todayIso,
          estado: 'ABIERTO',
        },
      ],
      error: null,
    },
    cuota_empleado_periodo: {
      data: [
        {
          id: 'cuota-1',
          periodo_id: 'periodo-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          objetivo_monto: 1000,
          avance_monto: 1200,
          cumplimiento_porcentaje: 120,
          estado: 'CUMPLIDA',
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelVentas(client as never)

  expect(data.resumen).toMatchObject({
    total: 2,
    confirmadas: 2,
    monto: 1200,
  })
  expect(data.jornadasContexto[0]).toMatchObject({
    empleado: 'Ana Uno',
    abierta: true,
  })
  expect(data.jornadasContexto[0]?.cuotaDiaria).toMatchObject({
    objetivoDiarioMonto: 1000,
    avanceHoyMonto: 1200,
    cumplimientoHoyPct: 120,
    cumplimientoPeriodoPct: 120,
    cuotaEstado: 'CUMPLIDA',
    semaforo: 'VERDE',
  })
  expect(data.catalogoProductos[0]).toMatchObject({
    id: 'prod-1',
    sku: 'SKU-001',
    nombre: 'Fusion Water',
    nombreCorto: 'Fusion',
  })
})
