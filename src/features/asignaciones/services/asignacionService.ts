import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asignacion } from '@/types/database'
import {
  evaluarValidacionesAsignacion,
  type SupervisorAsignacionRow,
} from '../lib/assignmentValidation'

export interface AsignacionResumen {
  total: number
  borrador: number
  publicada: number
  coberturas: number
  conBloqueo: number
  publicadasInvalidas: number
}

export interface AsignacionListadoItem {
  id: string
  empleado: string | null
  pdv: string | null
  tipo: string
  fechaInicio: string
  fechaFin: string | null
  estadoPublicacion: string
  validaciones: string[]
  bloqueada: boolean
}

export interface AsignacionesPanelData {
  resumen: AsignacionResumen
  asignaciones: AsignacionListadoItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

interface EmpleadoRelacion {
  nombre_completo: string | null
}

interface PdvRelacion {
  nombre: string | null
}

interface AsignacionQueryRow
  extends Pick<
    Asignacion,
    | 'id'
    | 'cuenta_cliente_id'
    | 'pdv_id'
    | 'tipo'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'estado_publicacion'
  > {
  empleado: EmpleadoRelacion[] | null
  pdv: PdvRelacion[] | null
}

interface GeocercaAsignacionRow {
  pdv_id: string
}

const obtenerNombreEmpleado = (empleado: EmpleadoRelacion[] | null | undefined) =>
  empleado?.[0]?.nombre_completo ?? null

const obtenerNombrePdv = (pdv: PdvRelacion[] | null | undefined) => pdv?.[0]?.nombre ?? null

export async function obtenerPanelAsignaciones(
  supabase: SupabaseClient
): Promise<AsignacionesPanelData> {
  const { data, error } = await supabase
    .from('asignacion')
    .select(`
      id,
      cuenta_cliente_id,
      pdv_id,
      tipo,
      fecha_inicio,
      fecha_fin,
      estado_publicacion,
      empleado:empleado_id(nombre_completo),
      pdv:pdv_id(nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return {
      resumen: {
        total: 0,
        borrador: 0,
        publicada: 0,
        coberturas: 0,
        conBloqueo: 0,
        publicadasInvalidas: 0,
      },
      asignaciones: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `asignacion` aun no existe en Supabase. Ejecuta la migracion de Fase 1.',
    }
  }

  const asignacionesBase = (data ?? []) as unknown as AsignacionQueryRow[]
  const pdvIds = Array.from(new Set(asignacionesBase.map((item) => item.pdv_id)))

  const [geocercasResult, supervisoresResult] = await Promise.all([
    pdvIds.length > 0
      ? supabase.from('geocerca_pdv').select('pdv_id').in('pdv_id', pdvIds)
      : Promise.resolve({ data: [] as GeocercaAsignacionRow[], error: null }),
    pdvIds.length > 0
      ? supabase
          .from('supervisor_pdv')
          .select('pdv_id, activo, fecha_fin')
          .in('pdv_id', pdvIds)
      : Promise.resolve({ data: [] as SupervisorAsignacionRow[], error: null }),
  ])

  if (geocercasResult.error || supervisoresResult.error) {
    return {
      resumen: {
        total: 0,
        borrador: 0,
        publicada: 0,
        coberturas: 0,
        conBloqueo: 0,
        publicadasInvalidas: 0,
      },
      asignaciones: [],
      infraestructuraLista: false,
      mensajeInfraestructura:
        geocercasResult.error?.message ??
        supervisoresResult.error?.message ??
        'No fue posible calcular las validaciones de asignacion.',
    }
  }

  const pdvsConGeocerca = new Set(
    ((geocercasResult.data ?? []) as GeocercaAsignacionRow[]).map((item) => item.pdv_id)
  )

  const supervisoresPorPdv = ((supervisoresResult.data ?? []) as SupervisorAsignacionRow[]).reduce<
    Record<string, SupervisorAsignacionRow[]>
  >((acumulado, item) => {
    const actuales = acumulado[item.pdv_id] ?? []
    actuales.push(item)
    acumulado[item.pdv_id] = actuales
    return acumulado
  }, {})

  const asignaciones = asignacionesBase.map((asignacion) => {
    const validaciones = evaluarValidacionesAsignacion(asignacion, {
      pdvsConGeocerca,
      supervisoresPorPdv,
    })

    return {
      id: asignacion.id,
      empleado: obtenerNombreEmpleado(asignacion.empleado),
      pdv: obtenerNombrePdv(asignacion.pdv),
      tipo: asignacion.tipo,
      fechaInicio: asignacion.fecha_inicio,
      fechaFin: asignacion.fecha_fin,
      estadoPublicacion: asignacion.estado_publicacion,
      validaciones,
      bloqueada: validaciones.length > 0,
    }
  })

  return {
    resumen: {
      total: asignaciones.length,
      borrador: asignaciones.filter((item) => item.estadoPublicacion === 'BORRADOR').length,
      publicada: asignaciones.filter((item) => item.estadoPublicacion === 'PUBLICADA').length,
      coberturas: asignaciones.filter((item) => item.tipo === 'COBERTURA').length,
      conBloqueo: asignaciones.filter((item) => item.bloqueada).length,
      publicadasInvalidas: asignaciones.filter(
        (item) => item.bloqueada && item.estadoPublicacion === 'PUBLICADA'
      ).length,
    },
    asignaciones,
    infraestructuraLista: true,
  }
}
