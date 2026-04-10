import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente, CuentaClientePdv } from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaRelacion = Pick<CuentaCliente, 'id' | 'identificador' | 'nombre' | 'activa'>

interface NombreRelacion {
  nombre: string | null
}

interface PdvRelacion {
  id: string
  clave_btl: string
  nombre: string
  zona: string | null
  cadena: MaybeMany<NombreRelacion>
}

interface CuentaClientePdvQueryRow
  extends Pick<CuentaClientePdv, 'id' | 'activo' | 'fecha_inicio' | 'fecha_fin'> {
  cuenta_cliente: MaybeMany<CuentaRelacion>
  pdv: MaybeMany<PdvRelacion>
}

export interface ClientesResumen {
  total: number
  activas: number
  pdvsActivos: number
  movimientosHistoricos: number
}

export interface CuentaClienteListadoItem {
  id: string
  identificador: string
  nombre: string
  activa: boolean
  pdvsActivos: number
  pdvsHistoricos: number
  ultimoCambio: string | null
  modoOperacion: string | null
  timezone: string | null
}

export interface HistorialClienteItem {
  id: string
  cuentaCliente: string
  pdvClaveBtl: string
  pdvNombre: string
  cadena: string | null
  zona: string | null
  fechaInicio: string
  fechaFin: string | null
  activo: boolean
}

export interface ClientesPanelData {
  resumen: ClientesResumen
  cuentas: CuentaClienteListadoItem[]
  historial: HistorialClienteItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

interface CuentaClienteAcumulado {
  pdvsActivos: Set<string>
  pdvsHistoricos: Set<string>
  ultimoCambio: string | null
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

const obtenerCadena = (pdv: PdvRelacion | null) => obtenerPrimero(pdv?.cadena ?? null)?.nombre ?? null

const obtenerTextoConfiguracion = (valor: unknown, clave: string) => {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return null
  }

  const registro = valor as Record<string, unknown>
  const candidato = registro[clave]
  return typeof candidato === 'string' ? candidato : null
}

const normalizarFecha = (fecha: string | null) => fecha ?? null

export async function obtenerPanelClientes(
  supabase: SupabaseClient,
  scopeAccountId: string | null = null
): Promise<ClientesPanelData> {
  let cuentasQuery = supabase
    .from('cuenta_cliente')
    .select('id, identificador, nombre, activa, configuracion, created_at, updated_at')
    .order('nombre', { ascending: true })

  let historialQuery = supabase
    .from('cuenta_cliente_pdv')
    .select(`
      id,
      activo,
      fecha_inicio,
      fecha_fin,
      cuenta_cliente:cuenta_cliente_id(id, identificador, nombre, activa),
      pdv:pdv_id(
        id,
        clave_btl,
        nombre,
        zona,
        cadena:cadena_id(nombre)
      )
    `)
    .order('fecha_inicio', { ascending: false })

  if (scopeAccountId) {
    cuentasQuery = cuentasQuery.eq('id', scopeAccountId)
    historialQuery = historialQuery.eq('cuenta_cliente_id', scopeAccountId)
  }

  const [
    { data: cuentas, error: cuentasError },
    { data: historial, error: historialError },
  ] = await Promise.all([cuentasQuery, historialQuery])

  if (cuentasError || historialError) {
    return {
      resumen: {
        total: 0,
        activas: 0,
        pdvsActivos: 0,
        movimientosHistoricos: 0,
      },
      cuentas: [],
      historial: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        cuentasError?.message ??
        historialError?.message ??
        'Las tablas de clientes aun no estan listas en Supabase.',
    }
  }

  const historialNormalizado = ((historial ?? []) as unknown as CuentaClientePdvQueryRow[])
    .map((item) => {
      const cuenta = obtenerPrimero(item.cuenta_cliente)
      const pdv = obtenerPrimero(item.pdv)

      if (!cuenta || !pdv) {
        return null
      }

      return {
        id: item.id,
        cuentaId: cuenta.id,
        cuentaNombre: cuenta.nombre,
        pdvId: pdv.id,
        pdvClaveBtl: pdv.clave_btl,
        pdvNombre: pdv.nombre,
        cadena: obtenerCadena(pdv),
        zona: pdv.zona,
        fechaInicio: item.fecha_inicio,
        fechaFin: normalizarFecha(item.fecha_fin),
        activo: item.activo,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const acumuladoPorCuenta = new Map<string, CuentaClienteAcumulado>()

  for (const movimiento of historialNormalizado) {
    const acumulado = acumuladoPorCuenta.get(movimiento.cuentaId) ?? {
      pdvsActivos: new Set<string>(),
      pdvsHistoricos: new Set<string>(),
      ultimoCambio: null,
    }

    acumulado.pdvsHistoricos.add(movimiento.pdvId)

    if (movimiento.activo && !movimiento.fechaFin) {
      acumulado.pdvsActivos.add(movimiento.pdvId)
    }

    const fechaComparacion = movimiento.fechaFin ?? movimiento.fechaInicio

    if (!acumulado.ultimoCambio || fechaComparacion > acumulado.ultimoCambio) {
      acumulado.ultimoCambio = fechaComparacion
    }

    acumuladoPorCuenta.set(movimiento.cuentaId, acumulado)
  }

  const cuentasListadas = ((cuentas ?? []) as CuentaCliente[]).map((cuenta) => {
    const acumulado = acumuladoPorCuenta.get(cuenta.id)

    return {
      id: cuenta.id,
      identificador: cuenta.identificador,
      nombre: cuenta.nombre,
      activa: cuenta.activa,
      pdvsActivos: acumulado?.pdvsActivos.size ?? 0,
      pdvsHistoricos: acumulado?.pdvsHistoricos.size ?? 0,
      ultimoCambio: acumulado?.ultimoCambio ?? null,
      modoOperacion: obtenerTextoConfiguracion(cuenta.configuracion, 'modo'),
      timezone: obtenerTextoConfiguracion(cuenta.configuracion, 'timezone'),
    }
  })

  return {
    resumen: {
      total: cuentasListadas.length,
      activas: cuentasListadas.filter((item) => item.activa).length,
      pdvsActivos: historialNormalizado.filter((item) => item.activo && !item.fechaFin).length,
      movimientosHistoricos: historialNormalizado.length,
    },
    cuentas: cuentasListadas,
    historial: historialNormalizado.slice(0, 24).map((item) => ({
      id: item.id,
      cuentaCliente: item.cuentaNombre,
      pdvClaveBtl: item.pdvClaveBtl,
      pdvNombre: item.pdvNombre,
      cadena: item.cadena,
      zona: item.zona,
      fechaInicio: item.fechaInicio,
      fechaFin: item.fechaFin,
      activo: item.activo && !item.fechaFin,
    })),
    infraestructuraLista: true,
  }
}
