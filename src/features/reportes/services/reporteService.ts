import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Asistencia,
  CuentaCliente,
  CuotaEmpleadoPeriodo,
  Empleado,
  NominaLedger,
  Venta,
} from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre' | 'identificador'>
type EmpleadoRelacion = Pick<Empleado, 'id_nomina' | 'nombre_completo' | 'puesto'>

type AsistenciaQueryRow = Pick<Asistencia, 'id' | 'cuenta_cliente_id' | 'empleado_id' | 'estatus'> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
}

type VentaQueryRow = Pick<
  Venta,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'total_monto' | 'total_unidades' | 'confirmada'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
}

type CuotaQueryRow = Pick<
  CuotaEmpleadoPeriodo,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'cumplimiento_porcentaje' | 'bono_estimado' | 'estado'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
}

type LedgerQueryRow = Pick<
  NominaLedger,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'tipo_movimiento' | 'monto'
> & {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
}

interface UsuarioAuditRelacion {
  username: string | null
}

interface AuditLogQueryRow {
  id: number
  tabla: string
  registro_id: string | null
  accion: 'INSERT' | 'UPDATE' | 'DELETE' | 'EVENTO'
  payload: Record<string, unknown>
  created_at: string
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  usuario: MaybeMany<UsuarioAuditRelacion>
}

export interface ReportesResumen {
  jornadasValidas: number
  jornadasPendientes: number
  ventasConfirmadas: number
  montoConfirmado: number
  cuotasCumplidas: number
  netoNominaEstimado: number
}

export interface ClienteReporteItem {
  cuentaCliente: string
  identificador: string | null
  jornadasValidas: number
  jornadasPendientes: number
  ventasConfirmadas: number
  montoConfirmado: number
  cuotasCumplidas: number
  netoNominaEstimado: number
}

export interface RankingVentasItem {
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
}

export interface RankingCuotaItem {
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  cuotaEstado: string
  cumplimiento: number
  bonoEstimado: number
  jornadasValidas: number
  jornadasPendientes: number
}

export interface BitacoraItem {
  id: number
  fecha: string
  tabla: string
  accion: string
  registroId: string | null
  cuentaCliente: string | null
  usuario: string | null
  resumen: string
}

export interface ReportesPanelData {
  resumen: ReportesResumen
  clientes: ClienteReporteItem[]
  rankingVentas: RankingVentasItem[]
  rankingCuotas: RankingCuotaItem[]
  bitacora: BitacoraItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

interface ClienteAcumulado {
  cuentaCliente: string
  identificador: string | null
  jornadasValidas: number
  jornadasPendientes: number
  ventasConfirmadas: number
  montoConfirmado: number
  cuotasCumplidas: number
  netoNominaEstimado: number
}

interface VentasAcumulado {
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  ventasConfirmadas: number
  unidadesConfirmadas: number
  montoConfirmado: number
}

interface CuotaAcumulado {
  empleado: string
  idNomina: string | null
  puesto: string | null
  cuentaCliente: string | null
  cuotaEstado: string
  cumplimiento: number
  bonoEstimado: number
  jornadasValidas: number
  jornadasPendientes: number
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function obtenerResumenPayload(payload: Record<string, unknown>) {
  const resumen = payload.resumen
  if (typeof resumen === 'string' && resumen.trim()) {
    return resumen
  }

  const evento = payload.evento
  if (typeof evento === 'string' && evento.trim()) {
    return evento
  }

  const serialized = JSON.stringify(payload)
  return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized
}

export async function obtenerPanelReportes(
  supabase: SupabaseClient
): Promise<ReportesPanelData> {
  const [asistenciasResult, ventasResult, cuotasResult, ledgerResult, auditResult] = await Promise.all([
    supabase
      .from('asistencia')
      .select(`
        id,
        cuenta_cliente_id,
        empleado_id,
        estatus,
        cuenta_cliente:cuenta_cliente_id(nombre, identificador),
        empleado:empleado_id(id_nomina, nombre_completo, puesto)
      `)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('venta')
      .select(`
        id,
        cuenta_cliente_id,
        empleado_id,
        total_monto,
        total_unidades,
        confirmada,
        cuenta_cliente:cuenta_cliente_id(nombre, identificador),
        empleado:empleado_id(id_nomina, nombre_completo, puesto)
      `)
      .order('fecha_utc', { ascending: false })
      .limit(200),
    supabase
      .from('cuota_empleado_periodo')
      .select(`
        id,
        cuenta_cliente_id,
        empleado_id,
        cumplimiento_porcentaje,
        bono_estimado,
        estado,
        cuenta_cliente:cuenta_cliente_id(nombre, identificador),
        empleado:empleado_id(id_nomina, nombre_completo, puesto)
      `)
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('nomina_ledger')
      .select(`
        id,
        cuenta_cliente_id,
        empleado_id,
        tipo_movimiento,
        monto,
        cuenta_cliente:cuenta_cliente_id(nombre, identificador),
        empleado:empleado_id(id_nomina, nombre_completo, puesto)
      `)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('audit_log')
      .select(`
        id,
        tabla,
        registro_id,
        accion,
        payload,
        created_at,
        cuenta_cliente:cuenta_cliente_id(nombre, identificador),
        usuario:usuario_id(username)
      `)
      .order('created_at', { ascending: false })
      .limit(24),
  ])

  if (
    asistenciasResult.error ||
    ventasResult.error ||
    cuotasResult.error ||
    ledgerResult.error ||
    auditResult.error
  ) {
    return {
      resumen: {
        jornadasValidas: 0,
        jornadasPendientes: 0,
        ventasConfirmadas: 0,
        montoConfirmado: 0,
        cuotasCumplidas: 0,
        netoNominaEstimado: 0,
      },
      clientes: [],
      rankingVentas: [],
      rankingCuotas: [],
      bitacora: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        asistenciasResult.error?.message ??
        ventasResult.error?.message ??
        cuotasResult.error?.message ??
        ledgerResult.error?.message ??
        auditResult.error?.message ??
        'No fue posible consolidar los reportes operativos.',
    }
  }

  const asistencias = (asistenciasResult.data ?? []) as unknown as AsistenciaQueryRow[]
  const ventas = (ventasResult.data ?? []) as unknown as VentaQueryRow[]
  const cuotas = (cuotasResult.data ?? []) as unknown as CuotaQueryRow[]
  const ledger = (ledgerResult.data ?? []) as unknown as LedgerQueryRow[]
  const audit = (auditResult.data ?? []) as unknown as AuditLogQueryRow[]

  const clientes = new Map<string, ClienteAcumulado>()
  const rankingVentas = new Map<string, VentasAcumulado>()
  const rankingCuotas = new Map<string, CuotaAcumulado>()

  const ensureCliente = (cuenta: CuentaClienteRelacion | null) => {
    const key = cuenta?.identificador ?? cuenta?.nombre ?? 'sin-cuenta'
    const actual = clientes.get(key) ?? {
      cuentaCliente: cuenta?.nombre ?? 'Sin cliente',
      identificador: cuenta?.identificador ?? null,
      jornadasValidas: 0,
      jornadasPendientes: 0,
      ventasConfirmadas: 0,
      montoConfirmado: 0,
      cuotasCumplidas: 0,
      netoNominaEstimado: 0,
    }
    clientes.set(key, actual)
    return actual
  }

  for (const asistencia of asistencias) {
    const cuenta = obtenerPrimero(asistencia.cuenta_cliente)
    const cliente = ensureCliente(cuenta)

    if (asistencia.estatus === 'VALIDA' || asistencia.estatus === 'CERRADA') {
      cliente.jornadasValidas += 1
    } else if (asistencia.estatus === 'PENDIENTE_VALIDACION') {
      cliente.jornadasPendientes += 1
    }
  }

  for (const venta of ventas) {
    const cuenta = obtenerPrimero(venta.cuenta_cliente)
    const empleado = obtenerPrimero(venta.empleado)
    const cliente = ensureCliente(cuenta)
    const rankingKey = `${venta.empleado_id}::${venta.cuenta_cliente_id}`
    const actual = rankingVentas.get(rankingKey) ?? {
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      cuentaCliente: cuenta?.nombre ?? null,
      ventasConfirmadas: 0,
      unidadesConfirmadas: 0,
      montoConfirmado: 0,
    }

    if (venta.confirmada) {
      actual.ventasConfirmadas += 1
      actual.unidadesConfirmadas += venta.total_unidades
      actual.montoConfirmado += venta.total_monto
      cliente.ventasConfirmadas += 1
      cliente.montoConfirmado += venta.total_monto
    }

    rankingVentas.set(rankingKey, actual)
  }

  for (const cuota of cuotas) {
    const cuenta = obtenerPrimero(cuota.cuenta_cliente)
    const empleado = obtenerPrimero(cuota.empleado)
    const cliente = ensureCliente(cuenta)
    const rankingKey = `${cuota.empleado_id}::${cuota.cuenta_cliente_id}`
    const actual = rankingCuotas.get(rankingKey) ?? {
      empleado: empleado?.nombre_completo ?? 'Sin empleado',
      idNomina: empleado?.id_nomina ?? null,
      puesto: empleado?.puesto ?? null,
      cuentaCliente: cuenta?.nombre ?? null,
      cuotaEstado: cuota.estado,
      cumplimiento: cuota.cumplimiento_porcentaje,
      bonoEstimado: cuota.bono_estimado,
      jornadasValidas: 0,
      jornadasPendientes: 0,
    }

    actual.cuotaEstado = cuota.estado
    actual.cumplimiento = cuota.cumplimiento_porcentaje
    actual.bonoEstimado = cuota.bono_estimado

    if (cuota.estado === 'CUMPLIDA') {
      cliente.cuotasCumplidas += 1
    }

    rankingCuotas.set(rankingKey, actual)
  }

  for (const asistencia of asistencias) {
    const rankingKey = `${asistencia.empleado_id}::${asistencia.cuenta_cliente_id}`
    const actual = rankingCuotas.get(rankingKey)
    if (!actual) {
      continue
    }

    if (asistencia.estatus === 'VALIDA' || asistencia.estatus === 'CERRADA') {
      actual.jornadasValidas += 1
    } else if (asistencia.estatus === 'PENDIENTE_VALIDACION') {
      actual.jornadasPendientes += 1
    }
  }

  for (const movimiento of ledger) {
    const cuenta = obtenerPrimero(movimiento.cuenta_cliente)
    const cliente = ensureCliente(cuenta)

    if (movimiento.tipo_movimiento === 'DEDUCCION') {
      cliente.netoNominaEstimado -= movimiento.monto
    } else {
      cliente.netoNominaEstimado += movimiento.monto
    }
  }

  return {
    resumen: {
      jornadasValidas: Array.from(clientes.values()).reduce((total, item) => total + item.jornadasValidas, 0),
      jornadasPendientes: Array.from(clientes.values()).reduce((total, item) => total + item.jornadasPendientes, 0),
      ventasConfirmadas: Array.from(clientes.values()).reduce((total, item) => total + item.ventasConfirmadas, 0),
      montoConfirmado: Array.from(clientes.values()).reduce((total, item) => total + item.montoConfirmado, 0),
      cuotasCumplidas: Array.from(clientes.values()).reduce((total, item) => total + item.cuotasCumplidas, 0),
      netoNominaEstimado: Array.from(clientes.values()).reduce((total, item) => total + item.netoNominaEstimado, 0),
    },
    clientes: Array.from(clientes.values()).sort((left, right) => right.montoConfirmado - left.montoConfirmado),
    rankingVentas: Array.from(rankingVentas.values())
      .filter((item) => item.ventasConfirmadas > 0)
      .sort((left, right) => right.montoConfirmado - left.montoConfirmado)
      .slice(0, 12),
    rankingCuotas: Array.from(rankingCuotas.values())
      .sort((left, right) => right.cumplimiento - left.cumplimiento)
      .slice(0, 12),
    bitacora: audit.map((item) => ({
      id: item.id,
      fecha: item.created_at,
      tabla: item.tabla,
      accion: item.accion,
      registroId: item.registro_id,
      cuentaCliente: obtenerPrimero(item.cuenta_cliente)?.nombre ?? null,
      usuario: obtenerPrimero(item.usuario)?.username ?? null,
      resumen: obtenerResumenPayload(item.payload ?? {}),
    })),
    infraestructuraLista: true,
  }
}