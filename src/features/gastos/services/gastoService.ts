import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente, Empleado, FormacionEvento, Gasto, Pdv } from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'id' | 'nombre'>
type EmpleadoRelacion = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>
type PdvRelacion = Pick<Pdv, 'id' | 'clave_btl' | 'nombre'>
type FormacionRelacion = Pick<FormacionEvento, 'id' | 'nombre'>

interface GastoQueryRow
  extends Pick<
    Gasto,
    | 'id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'supervisor_empleado_id'
    | 'pdv_id'
    | 'formacion_evento_id'
    | 'tipo'
    | 'monto'
    | 'moneda'
    | 'fecha_gasto'
    | 'comprobante_url'
    | 'comprobante_hash'
    | 'estatus'
    | 'notas'
    | 'metadata'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  empleado: MaybeMany<EmpleadoRelacion>
  supervisor: MaybeMany<EmpleadoRelacion>
  pdv: MaybeMany<PdvRelacion>
  formacion_evento: MaybeMany<FormacionRelacion>
}

export interface SelectorOption {
  id: string
  label: string
}

export interface GastoResumen {
  total: number
  montoSolicitado: number
  pendientes: number
  aprobados: number
}

export interface GastoListadoItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  empleado: string
  supervisor: string | null
  pdv: string | null
  formacion: string | null
  tipo: string
  monto: number
  moneda: string
  fechaGasto: string
  comprobanteUrl: string | null
  comprobanteHash: string | null
  tieneComprobante: boolean
  estatus: string
  approvalStage: string
  notas: string | null
}

export interface GastoReporteEmpleadoItem {
  key: string
  periodo: string
  empleado: string
  tipo: string
  registros: number
  montoSolicitado: number
  montoAprobado: number
  montoReembolsado: number
}

export interface GastosPanelData {
  resumen: GastoResumen
  gastos: GastoListadoItem[]
  reporteEmpleado: GastoReporteEmpleadoItem[]
  cuentas: SelectorOption[]
  empleados: SelectorOption[]
  supervisores: SelectorOption[]
  pdvs: SelectorOption[]
  formaciones: SelectorOption[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function getApprovalStage(metadata: unknown, estatus: string) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const approvalStage = (metadata as Record<string, unknown>).approval_stage
    if (typeof approvalStage === 'string' && approvalStage.trim()) {
      return approvalStage
    }
  }

  if (estatus === 'REEMBOLSADO') {
    return 'REEMBOLSADO'
  }

  if (estatus === 'APROBADO') {
    return 'APROBADO'
  }

  if (estatus === 'RECHAZADO') {
    return 'RECHAZADO'
  }

  return 'PENDIENTE_SUPERVISOR'
}

function formatPeriodo(fecha: string) {
  return fecha.slice(0, 7)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

export async function obtenerPanelGastos(
  supabase: TypedSupabaseClient,
  options?: {
    serviceClient?: TypedSupabaseClient
  }
): Promise<GastosPanelData> {
  const client = options?.serviceClient ?? supabase

  const [gastosResult, cuentasResult, empleadosResult, supervisoresResult, pdvsResult, formacionesResult] =
    await Promise.all([
      client
        .from('gasto')
        .select(`
          id,
          cuenta_cliente_id,
          empleado_id,
          supervisor_empleado_id,
          pdv_id,
          formacion_evento_id,
          tipo,
          monto,
          moneda,
          fecha_gasto,
          comprobante_url,
          comprobante_hash,
          estatus,
          notas,
          metadata,
          cuenta_cliente:cuenta_cliente_id(id, nombre),
          empleado:empleado_id(id, nombre_completo, puesto),
          supervisor:supervisor_empleado_id(id, nombre_completo, puesto),
          pdv:pdv_id(id, clave_btl, nombre),
          formacion_evento:formacion_evento_id(id, nombre)
        `)
        .order('fecha_gasto', { ascending: false })
        .limit(80),
      client.from('cuenta_cliente').select('id, nombre').eq('activa', true).order('nombre'),
      client.from('empleado').select('id, nombre_completo, puesto').eq('estatus_laboral', 'ACTIVO').order('nombre_completo').limit(40),
      client
        .from('empleado')
        .select('id, nombre_completo, puesto')
        .in('puesto', ['SUPERVISOR', 'COORDINADOR', 'ADMINISTRADOR'])
        .eq('estatus_laboral', 'ACTIVO')
        .order('nombre_completo')
        .limit(40),
      client.from('pdv').select('id, clave_btl, nombre').eq('estatus', 'ACTIVO').order('nombre').limit(40),
      client.from('formacion_evento').select('id, nombre').order('fecha_inicio', { ascending: false }).limit(24),
    ])

  if (gastosResult.error) {
    return {
      resumen: { total: 0, montoSolicitado: 0, pendientes: 0, aprobados: 0 },
      gastos: [],
      reporteEmpleado: [],
      cuentas: [],
      empleados: [],
      supervisores: [],
      pdvs: [],
      formaciones: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `gasto` aun no esta disponible en Supabase. Ejecuta la migracion de control operativo.',
    }
  }

  const gastos = ((gastosResult.data ?? []) as GastoQueryRow[]).map((item) => ({
    id: item.id,
    cuentaClienteId: item.cuenta_cliente_id,
    cuentaCliente: obtenerPrimero(item.cuenta_cliente)?.nombre ?? null,
    empleado: obtenerPrimero(item.empleado)?.nombre_completo ?? 'Sin empleado',
    supervisor: obtenerPrimero(item.supervisor)?.nombre_completo ?? null,
    pdv: obtenerPrimero(item.pdv)?.nombre ?? null,
    formacion: obtenerPrimero(item.formacion_evento)?.nombre ?? null,
    tipo: item.tipo,
    monto: item.monto,
    moneda: item.moneda,
    fechaGasto: item.fecha_gasto,
    comprobanteUrl: item.comprobante_url,
    comprobanteHash: item.comprobante_hash,
    tieneComprobante: Boolean(item.comprobante_url),
    estatus: item.estatus,
    approvalStage: getApprovalStage(item.metadata, item.estatus),
    notas: item.notas,
  }))

  const reporteEmpleadoMap = new Map<string, GastoReporteEmpleadoItem>()

  for (const item of gastos) {
    const periodo = formatPeriodo(item.fechaGasto)
    const key = `${periodo}::${item.empleado}::${item.tipo}`
    const actual = reporteEmpleadoMap.get(key) ?? {
      key,
      periodo,
      empleado: item.empleado,
      tipo: item.tipo,
      registros: 0,
      montoSolicitado: 0,
      montoAprobado: 0,
      montoReembolsado: 0,
    }

    actual.registros += 1
    actual.montoSolicitado += item.monto

    if (item.estatus === 'APROBADO' || item.estatus === 'REEMBOLSADO') {
      actual.montoAprobado += item.monto
    }

    if (item.estatus === 'REEMBOLSADO') {
      actual.montoReembolsado += item.monto
    }

    reporteEmpleadoMap.set(key, actual)
  }

  return {
    resumen: {
      total: gastos.length,
      montoSolicitado: gastos.reduce((total, item) => total + item.monto, 0),
      pendientes: gastos.filter((item) => ['PENDIENTE', 'SOLICITADO'].includes(String(item.estatus))).length,
      aprobados: gastos.filter((item) => item.estatus === 'APROBADO' || item.estatus === 'REEMBOLSADO').length,
    },
    gastos,
    reporteEmpleado: Array.from(reporteEmpleadoMap.values()).sort(
      (left, right) => right.montoSolicitado - left.montoSolicitado
    ),
    cuentas: ((cuentasResult.data ?? []) as Pick<CuentaCliente, 'id' | 'nombre'>[]).map((item) => ({
      id: item.id,
      label: item.nombre,
    })),
    empleados: ((empleadosResult.data ?? []) as Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>[]).map((item) => ({
      id: item.id,
      label: `${item.nombre_completo} · ${item.puesto}`,
    })),
    supervisores: ((supervisoresResult.data ?? []) as Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>[]).map((item) => ({
      id: item.id,
      label: `${item.nombre_completo} · ${item.puesto}`,
    })),
    pdvs: ((pdvsResult.data ?? []) as Pick<Pdv, 'id' | 'clave_btl' | 'nombre'>[]).map((item) => ({
      id: item.id,
      label: `${item.clave_btl} · ${item.nombre}`,
    })),
    formaciones: ((formacionesResult.data ?? []) as Pick<FormacionEvento, 'id' | 'nombre'>[]).map((item) => ({
      id: item.id,
      label: item.nombre,
    })),
    infraestructuraLista: true,
  }
}