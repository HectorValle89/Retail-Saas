import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import type {
  Asignacion,
  Empleado,
  Pdv,
  VacanteOperativaFutura,
  VacanteOperativaFuturaSeguimiento,
  VacanteOperativaFuturaTipo,
} from '@/types/database'

type TypedSupabaseClient = SupabaseClient<any>
type MaybeMany<T> = T | T[] | null

type CadenaRelacion = {
  nombre: string | null
}

type CiudadRelacion = {
  nombre: string | null
}

interface VacanteOperativaFuturaRow
  extends Pick<
    VacanteOperativaFutura,
    | 'id'
    | 'cuenta_cliente_id'
    | 'empleado_origen_id'
    | 'asignacion_origen_id'
    | 'asignacion_cancelada_id'
    | 'pdv_id'
    | 'tipo_vacante'
    | 'fecha_vacante_desde'
    | 'fecha_baja_efectiva'
    | 'motivo'
    | 'estado_seguimiento'
    | 'accion_recomendada'
    | 'metadata'
    | 'created_at'
    | 'updated_at'
  > {}

interface EmpleadoMiniRow extends Pick<Empleado, 'id' | 'nombre_completo'> {}

interface PdvMiniRow extends Pick<Pdv, 'id' | 'nombre' | 'clave_btl' | 'zona'> {
  cadena: MaybeMany<CadenaRelacion>
  ciudad: MaybeMany<CiudadRelacion>
}

interface AsignacionMiniRow
  extends Pick<Asignacion, 'id' | 'pdv_id' | 'fecha_inicio' | 'fecha_fin' | 'motivo_movimiento'> {}

export interface VacanteOperativaFuturaListItem {
  id: string
  cuentaClienteId: string | null
  empleadoOrigenId: string
  empleadoOrigenNombre: string | null
  asignacionOrigenId: string | null
  asignacionCanceladaId: string | null
  pdvId: string
  pdvNombre: string | null
  pdvClaveBtl: string | null
  cadena: string | null
  ciudad: string | null
  zona: string | null
  tipoVacante: VacanteOperativaFuturaTipo
  fechaVacanteDesde: string
  fechaBajaEfectiva: string
  motivo: string | null
  estadoSeguimiento: VacanteOperativaFuturaSeguimiento
  accionRecomendada: string | null
  metadata: Record<string, unknown>
  movimientoCanceladoFechaInicio: string | null
  movimientoCanceladoFechaFin: string | null
  movimientoCanceladoMotivo: string | null
  asignacionOrigenFechaInicio: string | null
  asignacionOrigenFechaFin: string | null
  updatedAt: string
  createdAt: string
}

export interface VacantesOperativasFuturasData {
  summary: {
    total: number
    nuevas: number
    enRevision: number
    enReasignacion: number
    resueltas: number
    descartadas: number
    vacantesActuales: number
    vacantesFuturas: number
  }
  items: VacanteOperativaFuturaListItem[]
}

function first<T>(value: MaybeMany<T>): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

async function resolveActorZone(
  supabase: TypedSupabaseClient,
  actor: ActorActual
) {
  if (actor.puesto !== 'COORDINADOR') {
    return null
  }

  const { data, error } = await supabase
    .from('empleado')
    .select('zona')
    .eq('id', actor.empleadoId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as { zona: string | null } | null)?.zona ?? null
}

export async function loadVacantesOperativasFuturas(
  supabase: TypedSupabaseClient,
  options: {
    actor: ActorActual
  }
): Promise<VacantesOperativasFuturasData> {
  const actorZone = await resolveActorZone(supabase, options.actor)
  let query = supabase
    .from('vacante_operativa_futura')
    .select(
      'id, cuenta_cliente_id, empleado_origen_id, asignacion_origen_id, asignacion_cancelada_id, pdv_id, tipo_vacante, fecha_vacante_desde, fecha_baja_efectiva, motivo, estado_seguimiento, accion_recomendada, metadata, created_at, updated_at'
    )
    .order('fecha_vacante_desde', { ascending: true })
    .order('created_at', { ascending: false })

  if (options.actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', options.actor.cuentaClienteId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const vacancyRows = (data ?? []) as VacanteOperativaFuturaRow[]
  const empleadoIds = Array.from(new Set(vacancyRows.map((item) => item.empleado_origen_id).filter(Boolean)))
  const pdvIds = Array.from(new Set(vacancyRows.map((item) => item.pdv_id).filter(Boolean)))
  const asignacionIds = Array.from(
    new Set(
      vacancyRows
        .flatMap((item) => [item.asignacion_cancelada_id, item.asignacion_origen_id])
        .filter((value): value is string => Boolean(value))
    )
  )

  const [empleadosResult, pdvsResult, asignacionesResult] = await Promise.all([
    empleadoIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('empleado')
          .select('id, nombre_completo')
          .in('id', empleadoIds),
    pdvIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('pdv')
          .select('id, nombre, clave_btl, zona, cadena:cadena_id(nombre), ciudad:ciudad_id(nombre)')
          .in('id', pdvIds),
    asignacionIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('asignacion')
          .select('id, pdv_id, fecha_inicio, fecha_fin, motivo_movimiento')
          .in('id', asignacionIds),
  ])

  if (empleadosResult.error || pdvsResult.error || asignacionesResult.error) {
    throw new Error(
      empleadosResult.error?.message ??
        pdvsResult.error?.message ??
        asignacionesResult.error?.message ??
        'No fue posible cargar el contexto de las vacantes operativas futuras.'
    )
  }

  const empleadosById = new Map(
    ((empleadosResult.data ?? []) as EmpleadoMiniRow[]).map((item) => [item.id, item])
  )
  const pdvsById = new Map(
    ((pdvsResult.data ?? []) as PdvMiniRow[]).map((item) => [item.id, item])
  )
  const asignacionesById = new Map(
    ((asignacionesResult.data ?? []) as AsignacionMiniRow[]).map((item) => [item.id, item])
  )

  const items = vacancyRows.reduce<VacanteOperativaFuturaListItem[]>((acc, item) => {
      const pdv = pdvsById.get(item.pdv_id) ?? null
      if (actorZone && pdv?.zona && pdv.zona !== actorZone) {
        return acc
      }

      const empleado = empleadosById.get(item.empleado_origen_id) ?? null
      const asignacionCancelada = item.asignacion_cancelada_id
        ? asignacionesById.get(item.asignacion_cancelada_id) ?? null
        : null
      const asignacionOrigen = item.asignacion_origen_id
        ? asignacionesById.get(item.asignacion_origen_id) ?? null
        : null

      acc.push({
        id: item.id,
        cuentaClienteId: item.cuenta_cliente_id,
        empleadoOrigenId: item.empleado_origen_id,
        empleadoOrigenNombre: empleado?.nombre_completo ?? null,
        asignacionOrigenId: item.asignacion_origen_id,
        asignacionCanceladaId: item.asignacion_cancelada_id,
        pdvId: item.pdv_id,
        pdvNombre: pdv?.nombre ?? null,
        pdvClaveBtl: pdv?.clave_btl ?? null,
        cadena: first(pdv?.cadena ?? null)?.nombre ?? null,
        ciudad: first(pdv?.ciudad ?? null)?.nombre ?? null,
        zona: pdv?.zona ?? null,
        tipoVacante: item.tipo_vacante,
        fechaVacanteDesde: item.fecha_vacante_desde,
        fechaBajaEfectiva: item.fecha_baja_efectiva,
        motivo: item.motivo,
        estadoSeguimiento: item.estado_seguimiento,
        accionRecomendada: item.accion_recomendada,
        metadata: normalizeMetadata(item.metadata),
        movimientoCanceladoFechaInicio: asignacionCancelada?.fecha_inicio ?? null,
        movimientoCanceladoFechaFin: asignacionCancelada?.fecha_fin ?? null,
        movimientoCanceladoMotivo: asignacionCancelada?.motivo_movimiento ?? null,
        asignacionOrigenFechaInicio: asignacionOrigen?.fecha_inicio ?? null,
        asignacionOrigenFechaFin: asignacionOrigen?.fecha_fin ?? null,
        updatedAt: item.updated_at,
        createdAt: item.created_at,
      } satisfies VacanteOperativaFuturaListItem)

      return acc
    }, [])

  return {
    summary: {
      total: items.length,
      nuevas: items.filter((item) => item.estadoSeguimiento === 'NUEVA').length,
      enRevision: items.filter((item) => item.estadoSeguimiento === 'EN_REVISION').length,
      enReasignacion: items.filter((item) => item.estadoSeguimiento === 'EN_REASIGNACION').length,
      resueltas: items.filter((item) => item.estadoSeguimiento === 'RESUELTA').length,
      descartadas: items.filter((item) => item.estadoSeguimiento === 'DESCARTADA').length,
      vacantesActuales: items.filter((item) => item.tipoVacante === 'VACANTE_ACTUAL_POR_BAJA').length,
      vacantesFuturas: items.filter((item) => item.tipoVacante === 'VACANTE_FUTURA_POR_MOVIMIENTO_CANCELADO').length,
    },
    items,
  }
}
