import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import type {
  Asignacion,
  Database,
  Empleado,
  GeocercaPdv,
  Pdv,
  RutaSemanal,
  RutaSemanalVisita,
} from '@/types/database'
import {
  getWeekDayLabel,
  getWeekDayShortLabel,
  getWeekEndIso,
  getWeekStartIso,
  isAssignmentActiveForWeek,
  sortWeeklyVisits,
} from '../lib/weeklyRoute'

type MaybeMany<T> = T | T[] | null

type TypedSupabaseClient = SupabaseClient<Database>

type EmpleadoMiniRow = Pick<Empleado, 'id' | 'nombre_completo' | 'zona'>
type PdvMiniRow = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'direccion' | 'estatus'>
type GeocercaMiniRow = Pick<GeocercaPdv, 'pdv_id' | 'latitud' | 'longitud'>
type AsignacionRutaRow = Pick<
  Asignacion,
  'id' | 'cuenta_cliente_id' | 'supervisor_empleado_id' | 'pdv_id' | 'fecha_inicio' | 'fecha_fin' | 'estado_publicacion'
>
type RutaQueryRow = Pick<
  RutaSemanal,
  'id' | 'cuenta_cliente_id' | 'supervisor_empleado_id' | 'semana_inicio' | 'estatus' | 'notas' | 'created_at' | 'updated_at'
> & {
  supervisor: MaybeMany<EmpleadoMiniRow>
}

type RutaVisitaQueryRow = Pick<
  RutaSemanalVisita,
  | 'id'
  | 'ruta_semanal_id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'asignacion_id'
  | 'dia_semana'
  | 'orden'
  | 'estatus'
  | 'selfie_url'
  | 'evidencia_url'
  | 'checklist_calidad'
  | 'comentarios'
  | 'completada_en'
  | 'created_at'
  | 'updated_at'
>

export interface RutaSemanalResumen {
  totalRutas: number
  totalVisitas: number
  visitasPlanificadas: number
  visitasCompletadas: number
  pdvsAsignables: number
}

export interface RutaSemanalPdvOption {
  id: string
  asignacionId: string
  cuentaClienteId: string | null
  nombre: string
  claveBtl: string
  zona: string | null
  direccion: string | null
  latitud: number | null
  longitud: number | null
}

export interface RutaSemanalVisitItem {
  id: string
  rutaId: string
  cuentaClienteId: string
  supervisorEmpleadoId: string
  pdvId: string
  asignacionId: string | null
  diaSemana: number
  diaLabel: string
  diaShortLabel: string
  orden: number
  estatus: 'PLANIFICADA' | 'COMPLETADA' | 'CANCELADA'
  pdv: string | null
  pdvClaveBtl: string | null
  zona: string | null
  direccion: string | null
  latitud: number | null
  longitud: number | null
  selfieUrl: string | null
  evidenciaUrl: string | null
  checklistCalidad: Record<string, boolean>
  comentarios: string | null
  completadaEn: string | null
}

export interface RutaSemanalItem {
  id: string
  cuentaClienteId: string
  supervisorEmpleadoId: string
  supervisor: string | null
  supervisorZona: string | null
  semanaInicio: string
  semanaFin: string
  estatus: 'BORRADOR' | 'PUBLICADA' | 'EN_PROGRESO' | 'CERRADA'
  notas: string | null
  createdAt: string
  updatedAt: string
  totalVisitas: number
  visitasCompletadas: number
  visitas: RutaSemanalVisitItem[]
}

export interface RutaSemanalPanelData {
  semanaActualInicio: string
  semanaActualFin: string
  puedeEditar: boolean
  resumen: RutaSemanalResumen
  rutas: RutaSemanalItem[]
  pdvsDisponibles: RutaSemanalPdvOption[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const EMPTY_DATA: RutaSemanalPanelData = {
  semanaActualInicio: getWeekStartIso(),
  semanaActualFin: getWeekEndIso(getWeekStartIso()),
  puedeEditar: false,
  resumen: {
    totalRutas: 0,
    totalVisitas: 0,
    visitasPlanificadas: 0,
    visitasCompletadas: 0,
    pdvsAsignables: 0,
  },
  rutas: [],
  pdvsDisponibles: [],
  infraestructuraLista: false,
}

function obtenerPrimero<T>(value: MaybeMany<T>) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function buildInfrastructureError(message: string, puedeEditar: boolean): RutaSemanalPanelData {
  return {
    ...EMPTY_DATA,
    puedeEditar,
    infraestructuraLista: false,
    mensajeInfraestructura: message,
  }
}

export async function obtenerPanelRutaSemanal(
  supabase: TypedSupabaseClient,
  actor: ActorActual
): Promise<RutaSemanalPanelData> {
  const semanaActualInicio = getWeekStartIso()
  const semanaActualFin = getWeekEndIso(semanaActualInicio)
  const puedeEditar = actor.puesto === 'SUPERVISOR'
  const allowGlobalScope = actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId

  const rutasQuery = puedeEditar
    ? supabase
        .from('ruta_semanal')
        .select(`
          id,
          cuenta_cliente_id,
          supervisor_empleado_id,
          semana_inicio,
          estatus,
          notas,
          created_at,
          updated_at,
          supervisor:supervisor_empleado_id(id, nombre_completo, zona)
        `)
        .eq('supervisor_empleado_id', actor.empleadoId)
        .order('semana_inicio', { ascending: false })
        .limit(12)
    : supabase
        .from('ruta_semanal')
        .select(`
          id,
          cuenta_cliente_id,
          supervisor_empleado_id,
          semana_inicio,
          estatus,
          notas,
          created_at,
          updated_at,
          supervisor:supervisor_empleado_id(id, nombre_completo, zona)
        `)
        .order('semana_inicio', { ascending: false })
        .limit(24)

  const [rutasResult, visitasResult, pdvsResult, geocercasResult, asignacionesResult] =
    await Promise.all([
      rutasQuery,
      supabase
        .from('ruta_semanal_visita')
        .select(`
          id,
          ruta_semanal_id,
          cuenta_cliente_id,
          supervisor_empleado_id,
          pdv_id,
          asignacion_id,
          dia_semana,
          orden,
          estatus,
          selfie_url,
          evidencia_url,
          checklist_calidad,
          comentarios,
          completada_en,
          created_at,
          updated_at
        `)
        .order('dia_semana', { ascending: true })
        .limit(400),
      supabase
        .from('pdv')
        .select('id, clave_btl, nombre, zona, direccion, estatus')
        .order('nombre', { ascending: true })
        .limit(400),
      supabase
        .from('geocerca_pdv')
        .select('pdv_id, latitud, longitud')
        .limit(500),
      puedeEditar
        ? supabase
            .from('asignacion')
            .select('id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion')
            .eq('supervisor_empleado_id', actor.empleadoId)
            .order('created_at', { ascending: false })
            .limit(240)
        : Promise.resolve({ data: [], error: null }),
    ])

  const errorMessage =
    rutasResult.error?.message ??
    visitasResult.error?.message ??
    pdvsResult.error?.message ??
    geocercasResult.error?.message ??
    (asignacionesResult as { error?: { message?: string } | null }).error?.message ??
    null

  if (errorMessage) {
    return buildInfrastructureError(errorMessage, puedeEditar)
  }

  const rutasRaw = ((rutasResult.data ?? []) as RutaQueryRow[]).filter((item) => {
    if (allowGlobalScope) {
      return true
    }

    if (actor.cuentaClienteId) {
      return item.cuenta_cliente_id === actor.cuentaClienteId
    }

    return true
  })

  const rutaIds = new Set(rutasRaw.map((item) => item.id))
  const visitasRaw = ((visitasResult.data ?? []) as RutaVisitaQueryRow[]).filter((item) =>
    rutaIds.has(item.ruta_semanal_id)
  )
  const pdvsRaw = (pdvsResult.data ?? []) as PdvMiniRow[]
  const geocercasRaw = (geocercasResult.data ?? []) as GeocercaMiniRow[]
  const asignacionesRaw = ((asignacionesResult as { data?: unknown[] | null }).data ?? []) as AsignacionRutaRow[]

  const pdvMap = new Map(pdvsRaw.map((item) => [item.id, item]))
  const geocercaMap = new Map(geocercasRaw.map((item) => [item.pdv_id, item]))
  const visitasPorRuta = new Map<string, RutaSemanalVisitItem[]>()

  for (const visita of visitasRaw) {
    const pdv = pdvMap.get(visita.pdv_id)
    const geocerca = geocercaMap.get(visita.pdv_id)
    const current = visitasPorRuta.get(visita.ruta_semanal_id) ?? []

    current.push({
      id: visita.id,
      rutaId: visita.ruta_semanal_id,
      cuentaClienteId: visita.cuenta_cliente_id,
      supervisorEmpleadoId: visita.supervisor_empleado_id,
      pdvId: visita.pdv_id,
      asignacionId: visita.asignacion_id,
      diaSemana: visita.dia_semana,
      diaLabel: getWeekDayLabel(visita.dia_semana),
      diaShortLabel: getWeekDayShortLabel(visita.dia_semana),
      orden: visita.orden,
      estatus: visita.estatus,
      pdv: pdv?.nombre ?? null,
      pdvClaveBtl: pdv?.clave_btl ?? null,
      zona: pdv?.zona ?? null,
      direccion: pdv?.direccion ?? null,
      latitud: geocerca?.latitud ?? null,
      longitud: geocerca?.longitud ?? null,
      selfieUrl: visita.selfie_url,
      evidenciaUrl: visita.evidencia_url,
      checklistCalidad: (visita.checklist_calidad ?? {}) as Record<string, boolean>,
      comentarios: visita.comentarios,
      completadaEn: visita.completada_en,
    })

    visitasPorRuta.set(visita.ruta_semanal_id, current)
  }

  const rutas = rutasRaw.map((ruta) => {
    const supervisor = obtenerPrimero(ruta.supervisor)
    const visitas = sortWeeklyVisits(visitasPorRuta.get(ruta.id) ?? [])

    return {
      id: ruta.id,
      cuentaClienteId: ruta.cuenta_cliente_id,
      supervisorEmpleadoId: ruta.supervisor_empleado_id,
      supervisor: supervisor?.nombre_completo ?? null,
      supervisorZona: supervisor?.zona ?? null,
      semanaInicio: ruta.semana_inicio,
      semanaFin: getWeekEndIso(ruta.semana_inicio),
      estatus: ruta.estatus,
      notas: ruta.notas,
      createdAt: ruta.created_at,
      updatedAt: ruta.updated_at,
      totalVisitas: visitas.length,
      visitasCompletadas: visitas.filter((item) => item.estatus === 'COMPLETADA').length,
      visitas,
    } satisfies RutaSemanalItem
  })

  const activeAssignments = asignacionesRaw.filter((item) =>
    isAssignmentActiveForWeek(item, semanaActualInicio, semanaActualFin)
  )
  const pdvsDisponibles = Array.from(
    new Map(
      activeAssignments
        .map((item) => {
          const pdv = pdvMap.get(item.pdv_id)
          const geocerca = geocercaMap.get(item.pdv_id)

          if (!pdv || pdv.estatus !== 'ACTIVO') {
            return null
          }

          return [
            item.pdv_id,
            {
              id: pdv.id,
              asignacionId: item.id,
              cuentaClienteId: item.cuenta_cliente_id,
              nombre: pdv.nombre,
              claveBtl: pdv.clave_btl,
              zona: pdv.zona,
              direccion: pdv.direccion,
              latitud: geocerca?.latitud ?? null,
              longitud: geocerca?.longitud ?? null,
            } satisfies RutaSemanalPdvOption,
          ] as const
        })
        .filter((item): item is readonly [string, RutaSemanalPdvOption] => Boolean(item))
    ).values()
  ).sort((left, right) => left.nombre.localeCompare(right.nombre))

  return {
    semanaActualInicio,
    semanaActualFin,
    puedeEditar,
    resumen: {
      totalRutas: rutas.length,
      totalVisitas: rutas.reduce((acc, item) => acc + item.totalVisitas, 0),
      visitasPlanificadas: rutas.reduce(
        (acc, item) => acc + item.visitas.filter((visita) => visita.estatus === 'PLANIFICADA').length,
        0
      ),
      visitasCompletadas: rutas.reduce((acc, item) => acc + item.visitasCompletadas, 0),
      pdvsAsignables: pdvsDisponibles.length,
    },
    rutas,
    pdvsDisponibles,
    infraestructuraLista: true,
  }
}