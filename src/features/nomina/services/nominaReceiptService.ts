import { calculatePayrollNet } from '../lib/payrollMath'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente, CuotaEmpleadoPeriodo, Empleado, NominaLedger, PeriodoNomina } from '@/types/database'

interface ReceiptPeriodoRow extends Pick<PeriodoNomina, 'clave' | 'fecha_inicio' | 'fecha_fin' | 'estado' | 'fecha_cierre'> {}
interface ReceiptCuentaRow extends Pick<CuentaCliente, 'nombre'> {}
interface ReceiptEmpleadoRow extends Pick<Empleado, 'id_nomina' | 'nombre_completo' | 'puesto'> {}

interface LedgerReceiptRow
  extends Pick<NominaLedger, 'id' | 'periodo_id' | 'cuenta_cliente_id' | 'tipo_movimiento' | 'concepto' | 'monto' | 'moneda' | 'notas' | 'created_at'> {
  periodo: ReceiptPeriodoRow | ReceiptPeriodoRow[] | null
  cuenta_cliente: ReceiptCuentaRow | ReceiptCuentaRow[] | null
  empleado: ReceiptEmpleadoRow | ReceiptEmpleadoRow[] | null
}

interface QuotaReceiptRow
  extends Pick<CuotaEmpleadoPeriodo, 'periodo_id' | 'cuenta_cliente_id' | 'bono_estimado' | 'cumplimiento_porcentaje' | 'estado'> {
  periodo: ReceiptPeriodoRow | ReceiptPeriodoRow[] | null
  cuenta_cliente: ReceiptCuentaRow | ReceiptCuentaRow[] | null
  empleado: ReceiptEmpleadoRow | ReceiptEmpleadoRow[] | null
}

export interface ReciboNominaMovimientoItem {
  id: string
  tipoMovimiento: 'PERCEPCION' | 'DEDUCCION' | 'AJUSTE'
  concepto: string
  monto: number
  moneda: string
  notas: string | null
  createdAt: string
}

export interface ReciboNominaItem {
  periodoId: string
  periodoClave: string
  fechaInicio: string
  fechaFin: string
  estado: 'BORRADOR' | 'APROBADO' | 'DISPERSADO'
  fechaCierre: string | null
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  cumplimiento: number
  cuotaEstado: string | null
  bonoEstimado: number
  percepciones: number
  deducciones: number
  ajustes: number
  neto: number
  movimientos: ReciboNominaMovimientoItem[]
}

function first<T>(value: T | T[] | null) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

export async function obtenerRecibosNominaEmpleado(
  supabase: SupabaseClient,
  empleadoId: string
): Promise<ReciboNominaItem[]> {
  const [ledgerResult, quotaResult] = await Promise.all([
    supabase
      .from('nomina_ledger')
      .select(`
        id,
        periodo_id,
        cuenta_cliente_id,
        tipo_movimiento,
        concepto,
        monto,
        moneda,
        notas,
        created_at,
        periodo:periodo_id(clave, fecha_inicio, fecha_fin, estado, fecha_cierre),
        cuenta_cliente:cuenta_cliente_id(nombre),
        empleado:empleado_id(id_nomina, nombre_completo, puesto)
      `)
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false })
      .limit(96),
    supabase
      .from('cuota_empleado_periodo')
      .select(`
        periodo_id,
        cuenta_cliente_id,
        bono_estimado,
        cumplimiento_porcentaje,
        estado,
        periodo:periodo_id(clave, fecha_inicio, fecha_fin, estado, fecha_cierre),
        cuenta_cliente:cuenta_cliente_id(nombre),
        empleado:empleado_id(id_nomina, nombre_completo, puesto)
      `)
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false })
      .limit(48),
  ])

  if (ledgerResult.error || quotaResult.error) {
    throw new Error(
      ledgerResult.error?.message ??
        quotaResult.error?.message ??
        'No fue posible cargar tus recibos de nomina.'
    )
  }

  const receipts = new Map<string, ReciboNominaItem>()

  for (const row of (quotaResult.data ?? []) as unknown as QuotaReceiptRow[]) {
    const periodo = first(row.periodo)
    const cuentaCliente = first(row.cuenta_cliente)
    const empleado = first(row.empleado)

    if (!periodo) {
      continue
    }

    const key = `${row.periodo_id}::${row.cuenta_cliente_id ?? 'sin-cuenta'}`
    const current = receipts.get(key) ?? {
      periodoId: row.periodo_id,
      periodoClave: periodo.clave,
      fechaInicio: periodo.fecha_inicio,
      fechaFin: periodo.fecha_fin,
      estado: periodo.estado as ReciboNominaItem['estado'],
      fechaCierre: periodo.fecha_cierre,
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      cuentaCliente: cuentaCliente?.nombre ?? null,
      cumplimiento: row.cumplimiento_porcentaje,
      cuotaEstado: row.estado,
      bonoEstimado: row.bono_estimado,
      percepciones: 0,
      deducciones: 0,
      ajustes: 0,
      neto: 0,
      movimientos: [],
    }

    current.cumplimiento = row.cumplimiento_porcentaje
    current.cuotaEstado = row.estado
    current.bonoEstimado = row.bono_estimado
    receipts.set(key, current)
  }

  for (const row of (ledgerResult.data ?? []) as unknown as LedgerReceiptRow[]) {
    const periodo = first(row.periodo)
    const cuentaCliente = first(row.cuenta_cliente)
    const empleado = first(row.empleado)

    if (!periodo) {
      continue
    }

    const key = `${row.periodo_id}::${row.cuenta_cliente_id ?? 'sin-cuenta'}`
    const current = receipts.get(key) ?? {
      periodoId: row.periodo_id,
      periodoClave: periodo.clave,
      fechaInicio: periodo.fecha_inicio,
      fechaFin: periodo.fecha_fin,
      estado: periodo.estado as ReciboNominaItem['estado'],
      fechaCierre: periodo.fecha_cierre,
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      cuentaCliente: cuentaCliente?.nombre ?? null,
      cumplimiento: 0,
      cuotaEstado: null,
      bonoEstimado: 0,
      percepciones: 0,
      deducciones: 0,
      ajustes: 0,
      neto: 0,
      movimientos: [],
    }

    current.movimientos.push({
      id: row.id,
      tipoMovimiento: row.tipo_movimiento,
      concepto: row.concepto,
      monto: row.monto,
      moneda: row.moneda,
      notas: row.notas,
      createdAt: row.created_at,
    })

    if (row.tipo_movimiento === 'PERCEPCION') {
      current.percepciones += row.monto
    } else if (row.tipo_movimiento === 'DEDUCCION') {
      current.deducciones += row.monto
    } else {
      current.ajustes += row.monto
    }

    receipts.set(key, current)
  }

  return Array.from(receipts.values())
    .map((item) => ({
      ...item,
      movimientos: item.movimientos.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      neto: calculatePayrollNet({
        percepciones: item.percepciones,
        deducciones: item.deducciones,
        ajustes: item.ajustes,
        bonoEstimado: item.bonoEstimado,
      }),
    }))
    .sort((a, b) => b.fechaFin.localeCompare(a.fechaFin))
}