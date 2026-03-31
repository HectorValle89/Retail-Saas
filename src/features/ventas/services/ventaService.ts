import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asistencia, CuentaCliente, CuotaEmpleadoPeriodo, Producto, Venta } from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre'>

interface AsistenciaRelacion {
  estatus: string
  check_out_utc: string | null
}

interface VentaQueryRow
  extends Pick<
    Venta,
    | 'id'
    | 'cuenta_cliente_id'
    | 'asistencia_id'
    | 'empleado_id'
    | 'pdv_id'
    | 'producto_id'
    | 'producto_sku'
    | 'producto_nombre'
    | 'producto_nombre_corto'
    | 'fecha_utc'
    | 'total_unidades'
    | 'total_monto'
    | 'confirmada'
    | 'observaciones'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  asistencia: MaybeMany<AsistenciaRelacion>
}

interface JornadaContextoQueryRow
  extends Pick<
    Asistencia,
    | 'id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'pdv_id'
    | 'fecha_operacion'
    | 'empleado_nombre'
    | 'pdv_clave_btl'
    | 'pdv_nombre'
    | 'estatus'
    | 'check_out_utc'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

type NominaPeriodoVentaRow = {
  id: string
  fecha_inicio: string
  fecha_fin: string
  estado: 'BORRADOR' | 'ABIERTO' | 'APROBADO' | 'DISPERSADO'
}
type CuotaVentaRow = Pick<
  CuotaEmpleadoPeriodo,
  | 'id'
  | 'periodo_id'
  | 'cuenta_cliente_id'
  | 'empleado_id'
  | 'objetivo_monto'
  | 'avance_monto'
  | 'cumplimiento_porcentaje'
  | 'estado'
>
type VentaDiariaRow = Pick<Venta, 'empleado_id' | 'cuenta_cliente_id' | 'total_monto' | 'confirmada' | 'fecha_utc'>

export interface VentaResumen {
  total: number
  confirmadas: number
  pendientesConfirmacion: number
  unidades: number
  monto: number
}

export interface VentaListadoItem {
  id: string
  cuentaClienteId: string
  asistenciaId: string
  empleadoId: string
  pdvId: string
  productoId: string | null
  productoSku: string | null
  cuentaCliente: string | null
  producto: string
  productoCorto: string | null
  fechaUtc: string
  totalUnidades: number
  totalMonto: number
  confirmada: boolean
  jornadaEstatus: string | null
  jornadaAbierta: boolean
  observaciones: string | null
}

export interface VentaJornadaContexto {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  empleadoId: string
  empleado: string
  pdvId: string
  pdvClaveBtl: string
  pdvNombre: string
  fechaOperacion: string
  estatus: string
  abierta: boolean
  cuotaDiaria: VentaCuotaDiariaIndicador | null
}

export interface VentaCatalogoProductoItem {
  id: string
  sku: string
  nombre: string
  nombreCorto: string
  categoria: string
  top30: boolean
}

export interface VentaCuotaDiariaIndicador {
  periodoId: string
  periodoInicio: string
  periodoFin: string
  objetivoDiarioMonto: number
  avanceHoyMonto: number
  cumplimientoHoyPct: number
  cumplimientoPeriodoPct: number
  cuotaEstado: CuotaVentaRow['estado']
  semaforo: 'ROJO' | 'AMARILLO' | 'VERDE'
}

export interface VentasPanelData {
  resumen: VentaResumen
  ventas: VentaListadoItem[]
  jornadasContexto: VentaJornadaContexto[]
  catalogoProductos: VentaCatalogoProductoItem[]
  paginacion: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

interface ObtenerVentasOptions {
  page?: number
  pageSize?: number
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizePage(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 1
  }

  return Math.max(1, Math.floor(value))
}

function normalizePageSize(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 50
  }

  return Math.min(50, Math.max(10, Math.floor(value)))
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10)
}

function roundToTwo(value: number) {
  return Number(value.toFixed(2))
}

function resolveTrafficLight(cumplimiento: number): VentaCuotaDiariaIndicador['semaforo'] {
  if (cumplimiento >= 100) {
    return 'VERDE'
  }

  if (cumplimiento >= 70) {
    return 'AMARILLO'
  }

  return 'ROJO'
}

function getInclusiveDayCount(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00Z`)
  const endDate = new Date(`${end}T12:00:00Z`)
  const diffMs = endDate.getTime() - startDate.getTime()
  return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1)
}

function buildQuotaKey(empleadoId: string, cuentaClienteId: string) {
  return `${empleadoId}::${cuentaClienteId}`
}

export async function obtenerPanelVentas(
  supabase: SupabaseClient,
  options?: ObtenerVentasOptions
): Promise<VentasPanelData> {
  const page = normalizePage(options?.page)
  const pageSize = normalizePageSize(options?.pageSize)

  const { count, error: countError } = await supabase
    .from('venta')
    .select('id', { count: 'exact', head: true })

  if (countError) {
    return {
      resumen: {
        total: 0,
        confirmadas: 0,
        pendientesConfirmacion: 0,
        unidades: 0,
        monto: 0,
      },
      ventas: [],
      jornadasContexto: [],
      catalogoProductos: [],
      paginacion: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 1,
      },
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `venta` aun no esta disponible en Supabase. Ejecuta la migracion de ventas base.',
    }
  }

  const totalItems = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)
  const from = (safePage - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error } = await supabase
    .from('venta')
    .select(`
      id,
      cuenta_cliente_id,
      asistencia_id,
      empleado_id,
      pdv_id,
      producto_id,
      producto_sku,
      producto_nombre,
      producto_nombre_corto,
      fecha_utc,
      total_unidades,
      total_monto,
      confirmada,
      observaciones,
      cuenta_cliente:cuenta_cliente_id(nombre),
      asistencia:asistencia_id(estatus, check_out_utc)
    `)
    .order('fecha_utc', { ascending: false })
    .range(from, to)

  if (error) {
    return {
      resumen: {
        total: 0,
        confirmadas: 0,
        pendientesConfirmacion: 0,
        unidades: 0,
        monto: 0,
      },
      ventas: [],
      jornadasContexto: [],
      catalogoProductos: [],
      paginacion: {
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
      },
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `venta` aun no esta disponible en Supabase. Ejecuta la migracion de ventas base.',
    }
  }

  const ventas = ((data ?? []) as unknown as VentaQueryRow[]).map((venta) => {
    const cuentaCliente = obtenerPrimero(venta.cuenta_cliente)
    const asistencia = obtenerPrimero(venta.asistencia)

    return {
      id: venta.id,
      cuentaClienteId: venta.cuenta_cliente_id,
      asistenciaId: venta.asistencia_id,
      empleadoId: venta.empleado_id,
      pdvId: venta.pdv_id,
      productoId: venta.producto_id,
      productoSku: venta.producto_sku,
      cuentaCliente: cuentaCliente?.nombre ?? null,
      producto: venta.producto_nombre,
      productoCorto: venta.producto_nombre_corto,
      fechaUtc: venta.fecha_utc,
      totalUnidades: venta.total_unidades,
      totalMonto: venta.total_monto,
      confirmada: venta.confirmada,
      jornadaEstatus: asistencia?.estatus ?? null,
      jornadaAbierta: Boolean(asistencia && asistencia.check_out_utc === null),
      observaciones: venta.observaciones,
    }
  })

  const { data: productosData, error: productosError } = await supabase
    .from('producto')
    .select('id, sku, nombre, nombre_corto, categoria, top_30, activo')
    .eq('activo', true)
    .order('nombre_corto', { ascending: true })
    .limit(500)

  const catalogoProductos = productosError
    ? []
    : ((productosData ?? []) as Producto[]).map((item) => ({
        id: item.id,
        sku: item.sku,
        nombre: item.nombre,
        nombreCorto: item.nombre_corto,
        categoria: item.categoria,
        top30: item.top_30,
      }))

  const { data: jornadasData } = await supabase
    .from('asistencia')
    .select(`
      id,
      cuenta_cliente_id,
      empleado_id,
      pdv_id,
      fecha_operacion,
      empleado_nombre,
      pdv_clave_btl,
      pdv_nombre,
      estatus,
      check_out_utc,
      cuenta_cliente:cuenta_cliente_id(nombre)
    `)
    .order('fecha_operacion', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(24)

  const jornadasRaw = (jornadasData ?? []) as unknown as JornadaContextoQueryRow[]
  const employeeIds = Array.from(new Set(jornadasRaw.map((item) => item.empleado_id)))
  const today = getTodayIso()

  const activePeriodResult =
    employeeIds.length > 0
      ? await supabase
          .from('nomina_periodo')
          .select('id, fecha_inicio, fecha_fin, estado')
          .in('estado', ['BORRADOR', 'ABIERTO'])
          .lte('fecha_inicio', today)
          .gte('fecha_fin', today)
          .order('fecha_inicio', { ascending: false })
          .limit(1)
      : { data: [], error: null }

  const activePeriod = ((activePeriodResult.data ?? []) as NominaPeriodoVentaRow[])[0] ?? null

  const [quotaResult, todaySalesResult] = await Promise.all([
    activePeriod && employeeIds.length > 0
      ? supabase
          .from('cuota_empleado_periodo')
          .select('id, periodo_id, cuenta_cliente_id, empleado_id, objetivo_monto, avance_monto, cumplimiento_porcentaje, estado')
          .eq('periodo_id', activePeriod.id)
          .in('empleado_id', employeeIds)
          .limit(Math.max(employeeIds.length, 1))
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length > 0
      ? supabase
          .from('venta')
          .select('empleado_id, cuenta_cliente_id, total_monto, confirmada, fecha_utc')
          .in('empleado_id', employeeIds)
          .eq('confirmada', true)
          .gte('fecha_utc', `${today}T00:00:00.000Z`)
          .lte('fecha_utc', `${today}T23:59:59.999Z`)
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ])

  const quotasRaw = (quotaResult.data ?? []) as CuotaVentaRow[]
  const todaySalesRaw = (todaySalesResult.data ?? []) as VentaDiariaRow[]
  const todaySalesByEmployee = todaySalesRaw.reduce<Map<string, number>>((acc, item) => {
    const key = buildQuotaKey(item.empleado_id, item.cuenta_cliente_id)
    acc.set(key, (acc.get(key) ?? 0) + item.total_monto)
    return acc
  }, new Map())
  const quotaByEmployee = new Map(quotasRaw.map((item) => [buildQuotaKey(item.empleado_id, item.cuenta_cliente_id), item] as const))

  const jornadasContexto = jornadasRaw.map((jornada) => {
      const cuota = quotaByEmployee.get(buildQuotaKey(jornada.empleado_id, jornada.cuenta_cliente_id))
      const avanceHoyMonto = todaySalesByEmployee.get(
        buildQuotaKey(jornada.empleado_id, jornada.cuenta_cliente_id)
      ) ?? 0
      const totalDiasPeriodo =
        activePeriod ? getInclusiveDayCount(activePeriod.fecha_inicio, activePeriod.fecha_fin) : 1
      const objetivoDiarioMonto = cuota
        ? roundToTwo(cuota.objetivo_monto / totalDiasPeriodo)
        : 0
      const cumplimientoHoyPct =
        cuota && objetivoDiarioMonto > 0 ? roundToTwo((avanceHoyMonto / objetivoDiarioMonto) * 100) : 0

    return {
      id: jornada.id,
      cuentaClienteId: jornada.cuenta_cliente_id,
      cuentaCliente: obtenerPrimero(jornada.cuenta_cliente)?.nombre ?? null,
      empleadoId: jornada.empleado_id,
      empleado: jornada.empleado_nombre,
      pdvId: jornada.pdv_id,
      pdvClaveBtl: jornada.pdv_clave_btl,
      pdvNombre: jornada.pdv_nombre,
      fechaOperacion: jornada.fecha_operacion,
      estatus: jornada.estatus,
      abierta: jornada.check_out_utc === null,
      cuotaDiaria:
        cuota && activePeriod
          ? {
              periodoId: activePeriod.id,
              periodoInicio: activePeriod.fecha_inicio,
              periodoFin: activePeriod.fecha_fin,
              objetivoDiarioMonto,
              avanceHoyMonto: roundToTwo(avanceHoyMonto),
              cumplimientoHoyPct,
              cumplimientoPeriodoPct: roundToTwo(cuota.cumplimiento_porcentaje),
              cuotaEstado: cuota.estado,
              semaforo: resolveTrafficLight(cumplimientoHoyPct),
            }
          : null,
    }
  })

  return {
    resumen: {
      total: totalItems,
      confirmadas: ventas.filter((item) => item.confirmada).length,
      pendientesConfirmacion: ventas.filter((item) => !item.confirmada).length,
      unidades: ventas.reduce((total, item) => total + item.totalUnidades, 0),
      monto: ventas.reduce((total, item) => total + item.totalMonto, 0),
    },
    ventas,
    jornadasContexto,
    catalogoProductos,
    paginacion: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    infraestructuraLista: !productosError,
    mensajeInfraestructura: productosError
      ? 'El catalogo de productos no esta disponible para ventas. Revisa Configuracion.'
      : undefined,
  }
}
