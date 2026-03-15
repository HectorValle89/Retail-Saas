import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asistencia, CuentaCliente } from '@/types/database'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre'>

interface AsistenciaQueryRow
  extends Pick<
    Asistencia,
    | 'id'
    | 'cuenta_cliente_id'
    | 'asignacion_id'
    | 'empleado_id'
    | 'supervisor_empleado_id'
    | 'pdv_id'
    | 'mision_dia_id'
    | 'fecha_operacion'
    | 'empleado_nombre'
    | 'pdv_clave_btl'
    | 'pdv_nombre'
    | 'pdv_zona'
    | 'cadena_nombre'
    | 'check_in_utc'
    | 'check_out_utc'
    | 'distancia_check_in_metros'
    | 'estado_gps'
    | 'justificacion_fuera_geocerca'
    | 'mision_codigo'
    | 'mision_instruccion'
    | 'biometria_estado'
    | 'estatus'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

interface GeocercaContextRow {
  pdv_id: string
  latitud: number
  longitud: number
  radio_tolerancia_metros: number
  permite_checkin_con_justificacion: boolean
}

export interface AsistenciaResumen {
  total: number
  abiertas: number
  pendientesValidacion: number
  fueraGeocerca: number
  cerradas: number
}

export interface AsistenciaListadoItem {
  id: string
  cuentaClienteId: string
  asignacionId: string | null
  empleadoId: string
  supervisorEmpleadoId: string | null
  pdvId: string
  misionDiaId: string | null
  fechaOperacion: string
  cuentaCliente: string | null
  empleado: string
  pdvClaveBtl: string
  pdvNombre: string
  zona: string | null
  cadena: string | null
  checkInUtc: string | null
  checkOutUtc: string | null
  distanciaCheckInMetros: number | null
  estadoGps: string
  biometriaEstado: string
  estatus: string
  misionCodigo: string | null
  misionInstruccion: string | null
  justificacionFueraGeocerca: string | null
  geocercaLatitud: number | null
  geocercaLongitud: number | null
  geocercaRadioMetros: number | null
  permiteCheckinConJustificacion: boolean
}

export interface AsistenciasPanelData {
  resumen: AsistenciaResumen
  asistencias: AsistenciaListadoItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

export async function obtenerPanelAsistencias(
  supabase: SupabaseClient
): Promise<AsistenciasPanelData> {
  const { data, error } = await supabase
    .from('asistencia')
    .select(`
      id,
      cuenta_cliente_id,
      asignacion_id,
      empleado_id,
      supervisor_empleado_id,
      pdv_id,
      mision_dia_id,
      fecha_operacion,
      empleado_nombre,
      pdv_clave_btl,
      pdv_nombre,
      pdv_zona,
      cadena_nombre,
      check_in_utc,
      check_out_utc,
      distancia_check_in_metros,
      estado_gps,
      justificacion_fuera_geocerca,
      mision_codigo,
      mision_instruccion,
      biometria_estado,
      estatus,
      cuenta_cliente:cuenta_cliente_id(nombre)
    `)
    .order('fecha_operacion', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(24)

  if (error) {
    return {
      resumen: {
        total: 0,
        abiertas: 0,
        pendientesValidacion: 0,
        fueraGeocerca: 0,
        cerradas: 0,
      },
      asistencias: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `asistencia` aun no esta disponible en Supabase. Ejecuta la migracion de ejecucion diaria.',
    }
  }

  const asistenciasBase = (data ?? []) as unknown as AsistenciaQueryRow[]
  const pdvIds = Array.from(new Set(asistenciasBase.map((item) => item.pdv_id)))

  const geocercasResult =
    pdvIds.length > 0
      ? await supabase
          .from('geocerca_pdv')
          .select('pdv_id, latitud, longitud, radio_tolerancia_metros, permite_checkin_con_justificacion')
          .in('pdv_id', pdvIds)
      : { data: [] as GeocercaContextRow[], error: null }

  const geocercasPorPdv = ((geocercasResult.data ?? []) as GeocercaContextRow[]).reduce<
    Record<string, GeocercaContextRow>
  >((acumulado, item) => {
    acumulado[item.pdv_id] = item
    return acumulado
  }, {})

  const asistencias = asistenciasBase.map((asistencia) => {
    const geocerca = geocercasPorPdv[asistencia.pdv_id]

    return {
      id: asistencia.id,
      cuentaClienteId: asistencia.cuenta_cliente_id,
      asignacionId: asistencia.asignacion_id,
      empleadoId: asistencia.empleado_id,
      supervisorEmpleadoId: asistencia.supervisor_empleado_id,
      pdvId: asistencia.pdv_id,
      misionDiaId: asistencia.mision_dia_id,
      fechaOperacion: asistencia.fecha_operacion,
      cuentaCliente: obtenerPrimero(asistencia.cuenta_cliente)?.nombre ?? null,
      empleado: asistencia.empleado_nombre,
      pdvClaveBtl: asistencia.pdv_clave_btl,
      pdvNombre: asistencia.pdv_nombre,
      zona: asistencia.pdv_zona,
      cadena: asistencia.cadena_nombre,
      checkInUtc: asistencia.check_in_utc,
      checkOutUtc: asistencia.check_out_utc,
      distanciaCheckInMetros: asistencia.distancia_check_in_metros,
      estadoGps: asistencia.estado_gps,
      biometriaEstado: asistencia.biometria_estado,
      estatus: asistencia.estatus,
      misionCodigo: asistencia.mision_codigo,
      misionInstruccion: asistencia.mision_instruccion,
      justificacionFueraGeocerca: asistencia.justificacion_fuera_geocerca,
      geocercaLatitud: geocerca?.latitud ?? null,
      geocercaLongitud: geocerca?.longitud ?? null,
      geocercaRadioMetros: geocerca?.radio_tolerancia_metros ?? null,
      permiteCheckinConJustificacion:
        geocerca?.permite_checkin_con_justificacion ?? true,
    }
  })

  return {
    resumen: {
      total: asistencias.length,
      abiertas: asistencias.filter((item) => !item.checkOutUtc && item.estatus !== 'RECHAZADA').length,
      pendientesValidacion: asistencias.filter((item) => item.estatus === 'PENDIENTE_VALIDACION').length,
      fueraGeocerca: asistencias.filter((item) => item.estadoGps === 'FUERA_GEOCERCA').length,
      cerradas: asistencias.filter((item) => item.estatus === 'CERRADA').length,
    },
    asistencias,
    infraestructuraLista: true,
  }
}
