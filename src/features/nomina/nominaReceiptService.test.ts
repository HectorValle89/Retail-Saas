import { describe, expect, it } from 'vitest'
import { obtenerRecibosNominaEmpleado } from './services/nominaReceiptService'

function createClient() {
  return {
    from(table: string) {
      if (table === 'nomina_ledger') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'ledger-1',
                  periodo_id: 'periodo-1',
                  cuenta_cliente_id: 'c1',
                  tipo_movimiento: 'PERCEPCION',
                  concepto: 'BONO_VENTA',
                  monto: 1000,
                  moneda: 'MXN',
                  notas: 'Bono del periodo',
                  created_at: '2026-03-15T10:00:00.000Z',
                  periodo: { clave: '2026-03-Q1', fecha_inicio: '2026-03-01', fecha_fin: '2026-03-15', estado: 'DISPERSADO', fecha_cierre: '2026-03-16T00:00:00.000Z' },
                  cuenta_cliente: { nombre: 'ISDIN Mexico' },
                  empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
                },
                {
                  id: 'ledger-2',
                  periodo_id: 'periodo-1',
                  cuenta_cliente_id: 'c1',
                  tipo_movimiento: 'DEDUCCION',
                  concepto: 'FALTA_ADMIN',
                  monto: 200,
                  moneda: 'MXN',
                  notas: 'Descuento operativo',
                  created_at: '2026-03-15T11:00:00.000Z',
                  periodo: { clave: '2026-03-Q1', fecha_inicio: '2026-03-01', fecha_fin: '2026-03-15', estado: 'DISPERSADO', fecha_cierre: '2026-03-16T00:00:00.000Z' },
                  cuenta_cliente: { nombre: 'ISDIN Mexico' },
                  empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
                },
              ],
              error: null,
            })
          },
        }
      }

      if (table === 'cuota_empleado_periodo') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  periodo_id: 'periodo-1',
                  cuenta_cliente_id: 'c1',
                  bono_estimado: 150,
                  cumplimiento_porcentaje: 110,
                  estado: 'CUMPLIDA',
                  periodo: { clave: '2026-03-Q1', fecha_inicio: '2026-03-01', fecha_fin: '2026-03-15', estado: 'DISPERSADO', fecha_cierre: '2026-03-16T00:00:00.000Z' },
                  cuenta_cliente: { nombre: 'ISDIN Mexico' },
                  empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
                },
              ],
              error: null,
            })
          },
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('obtenerRecibosNominaEmpleado', () => {
  it('construye un recibo de solo lectura para el propio empleado', async () => {
    const recibos = await obtenerRecibosNominaEmpleado(createClient() as never, 'emp-1')

    expect(recibos).toHaveLength(1)
    expect(recibos[0]).toMatchObject({
      periodoClave: '2026-03-Q1',
      estado: 'DISPERSADO',
      empleado: 'Ana Uno',
      bonoEstimado: 150,
      percepciones: 1000,
      deducciones: 200,
      neto: 950,
    })
    expect(recibos[0].movimientos).toHaveLength(2)
  })
})