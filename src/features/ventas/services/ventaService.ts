import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asistencia, CuentaCliente, Venta } from '@/types/database'

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
}

export interface VentasPanelData {
  resumen: VentaResumen
  ventas: VentaListadoItem[]
  jornadasContexto: VentaJornadaContexto[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

export async function obtenerPanelVentas(
  supabase: SupabaseClient
): Promise<VentasPanelData> {
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
    .limit(24)

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

  const jornadasContexto = ((jornadasData ?? []) as unknown as JornadaContextoQueryRow[]).map(
    (jornada) => ({
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
    })
  )

  return {
    resumen: {
      total: ventas.length,
      confirmadas: ventas.filter((item) => item.confirmada).length,
      pendientesConfirmacion: ventas.filter((item) => !item.confirmada).length,
      unidades: ventas.reduce((total, item) => total + item.totalUnidades, 0),
      monto: ventas.reduce((total, item) => total + item.totalMonto, 0),
    },
    ventas,
    jornadasContexto,
    infraestructuraLista: true,
  }
}
