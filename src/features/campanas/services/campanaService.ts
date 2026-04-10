import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import { isOperablePdvStatus } from '@/features/pdvs/lib/pdvStatus'
import type {
  Asignacion,
  Campana,
  CampanaPdv,
  CampanaPdvProductoMeta,
  CuentaCliente,
  CuentaClientePdv,
  Empleado,
  Pdv,
  Producto,
} from '@/types/database'
import {
  buildCampaignProgress,
  readCampaignEvidenceTemplate,
  readCampaignManualDocument,
  readCampaignProductGoals,
  dedupeStringArray,
  ensureVisitTaskSession,
  getPendingVisitTaskLabels,
  getResolvedVisitTaskLabels,
  getVisitTaskExecutionMinutes,
  isCampaignWindowActive,
  readCampaignTaskVariability,
  readVisitTaskTemplate,
  rangesOverlapIso,
  type CampaignEvidenceRequirement,
  type CampaignManualDocument,
  type CampaignProductGoal,
  type CampaignItemStatus,
  type VisitTaskTemplateItem,
  type VisitTaskSession,
  type VisitTaskSessionTask,
} from '../lib/campaignProgress'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type CuentaRow = Pick<CuentaCliente, 'id' | 'identificador' | 'nombre' | 'activa'>
type CadenaRow = {
  id: string
  codigo: string | null
  nombre: string | null
}
type ProductoRow = Pick<Producto, 'id' | 'sku' | 'nombre' | 'nombre_corto' | 'activo'>
type PdvRow = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'direccion' | 'cadena_id' | 'estatus'>
type CuentaClientePdvRow = Pick<CuentaClientePdv, 'id' | 'cuenta_cliente_id' | 'pdv_id' | 'activo' | 'fecha_fin'>
type CampanaRow = Pick<
  Campana,
  | 'id'
  | 'cuenta_cliente_id'
  | 'cadena_id'
  | 'nombre'
  | 'descripcion'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'estado'
  | 'productos_foco'
  | 'cuota_adicional'
  | 'instrucciones'
  | 'evidencias_requeridas'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>
type CampanaPdvRow = Pick<
  CampanaPdv,
  | 'id'
  | 'campana_id'
  | 'cuenta_cliente_id'
  | 'pdv_id'
  | 'dc_empleado_id'
  | 'tareas_requeridas'
  | 'tareas_cumplidas'
  | 'estatus_cumplimiento'
  | 'avance_porcentaje'
  | 'evidencias_cargadas'
  | 'comentarios'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>
type CampanaPdvProductoMetaRow = Pick<
  CampanaPdvProductoMeta,
  | 'id'
  | 'campana_id'
  | 'campana_pdv_id'
  | 'cuenta_cliente_id'
  | 'pdv_id'
  | 'producto_id'
  | 'cuota'
  | 'tipo_meta'
  | 'observaciones'
>
type AsignacionRow = Pick<
  Asignacion,
  | 'id'
  | 'cuenta_cliente_id'
  | 'empleado_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'estado_publicacion'
  | 'created_at'
>
type AsistenciaRow = {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  pdv_id: string
  fecha_operacion: string
  estatus: string
  check_out_utc: string | null
  check_in_utc: string | null
}
type EmpleadoRow = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto'>
type CampanaInicioRow = Pick<
  Campana,
  | 'id'
  | 'cuenta_cliente_id'
  | 'nombre'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'estado'
  | 'cuota_adicional'
  | 'created_at'
>
type CampanaPdvInicioRow = Pick<
  CampanaPdv,
  | 'id'
  | 'campana_id'
  | 'cuenta_cliente_id'
  | 'pdv_id'
  | 'dc_empleado_id'
  | 'tareas_requeridas'
  | 'tareas_cumplidas'
  | 'estatus_cumplimiento'
  | 'avance_porcentaje'
>

export interface CampanaResumen {
  totalCampanas: number
  activas: number
  pdvsObjetivo: number
  pdvsCumplidos: number
  avancePromedio: number
  tareasPendientes: number
  cuotaAdicionalTotal: number
}

export interface CampanaCuentaOption {
  id: string
  nombre: string
  identificador: string
}

export interface CampanaCadenaOption {
  id: string
  codigo: string | null
  nombre: string
}

export interface CampanaProductoOption {
  id: string
  sku: string
  nombre: string
  nombreCorto: string
}

export interface CampanaProductGoalItem extends CampaignProductGoal {
  productLabel: string
  productSku: string | null
}

export interface CampanaPdvOption {
  id: string
  cuentaClienteId: string
  cuentaCliente: string
  claveBtl: string
  nombre: string
  zona: string | null
  cadenaId: string | null
  cadena: string | null
  dcEmpleadoId: string | null
  dcNombre: string | null
  supervisorNombre: string | null
}

export interface CampanaPdvItem {
  id: string
  pdvId: string
  pdv: string
  claveBtl: string
  zona: string | null
  cadena: string | null
  cuentaCliente: string | null
  dcEmpleadoId: string | null
  dcNombre: string | null
  supervisorNombre: string | null
  productGoals: CampanaProductGoalItem[]
  tareasRequeridas: string[]
  tareasCumplidas: string[]
  tareasPendientes: number
  evidenciasRequeridas: string[]
  evidenciasCargadas: number
  avancePorcentaje: number
  estatus: CampaignItemStatus
  comentarios: string | null
  activeAttendanceId?: string | null
  activeVisitSession?: {
    attendanceId: string
    generatedAt: string
    executionMinutes: number | null
    tasks: VisitTaskSessionTask[]
  } | null
}

export interface CampanaItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  cadenaId: string | null
  cadena: string | null
  nombre: string
  descripcion: string | null
  fechaInicio: string
  fechaFin: string
  estado: Campana['estado']
  ventanaActiva: boolean
  productosFoco: string[]
  productoIds: string[]
  cuotaAdicional: number
  instrucciones: string | null
  evidenciasRequeridas: string[]
  evidenceTemplate?: CampaignEvidenceRequirement[]
  manualMercadeo?: (CampaignManualDocument & { signedUrl: string | null }) | null
  productGoals?: CampanaProductGoalItem[]
  variabilidadTareas?: number
  taskTemplate?: VisitTaskTemplateItem[]
  totalPdvs: number
  pdvsCumplidos: number
  avancePromedio: number
  tareasPendientes: number
  pdvs: CampanaPdvItem[]
}

export interface CampanaReporteDcItem {
  empleadoId: string
  empleado: string
  puesto: string | null
  campanasActivas: number
  pdvsObjetivo: number
  pdvsCumplidos: number
  avancePromedio: number
}

export interface CampanaReportePdvItem {
  campanaId: string
  campana: string
  pdvId: string
  pdv: string
  claveBtl: string
  dc: string | null
  estatus: CampaignItemStatus
  avancePorcentaje: number
  tareasPendientes: number
  evidenciasPendientes: number
}

export interface CampanasPanelData {
  puedeGestionar: boolean
  puedeVerDc: boolean
  resumen: CampanaResumen
  campanas: CampanaItem[]
  reportePorDc: CampanaReporteDcItem[]
  reportePorPdv: CampanaReportePdvItem[]
  cuentasDisponibles: CampanaCuentaOption[]
  cadenasDisponibles: CampanaCadenaOption[]
  productosDisponibles: CampanaProductoOption[]
  pdvsDisponibles: CampanaPdvOption[]
  cuentaSeleccionadaId: string | null
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

export interface CampanaOverviewItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  nombre: string
  fechaInicio: string
  fechaFin: string
  estado: Campana['estado']
  ventanaActiva: boolean
  totalPdvs: number
  pdvsCumplidos: number
  avancePromedio: number
  tareasPendientes: number
  cuotaAdicional: number
}

export interface CampanasOverviewData {
  puedeGestionar: boolean
  resumen: CampanaResumen
  campanas: CampanaOverviewItem[]
  cuentaSeleccionadaId: string | null
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

const EMPTY_DATA: CampanasPanelData = {
  puedeGestionar: false,
  puedeVerDc: false,
  resumen: {
    totalCampanas: 0,
    activas: 0,
    pdvsObjetivo: 0,
    pdvsCumplidos: 0,
    avancePromedio: 0,
    tareasPendientes: 0,
    cuotaAdicionalTotal: 0,
  },
  campanas: [],
  reportePorDc: [],
  reportePorPdv: [],
  cuentasDisponibles: [],
  cadenasDisponibles: [],
  productosDisponibles: [],
  pdvsDisponibles: [],
  cuentaSeleccionadaId: null,
  infraestructuraLista: false,
}

const EMPTY_OVERVIEW_DATA: CampanasOverviewData = {
  puedeGestionar: false,
  resumen: {
    totalCampanas: 0,
    activas: 0,
    pdvsObjetivo: 0,
    pdvsCumplidos: 0,
    avancePromedio: 0,
    tareasPendientes: 0,
    cuotaAdicionalTotal: 0,
  },
  campanas: [],
  cuentaSeleccionadaId: null,
  infraestructuraLista: false,
}

interface ObtenerPanelCampanasOptions {
  scopeAccountId?: string | null
  serviceClient?: TypedSupabaseClient
}

function buildInfrastructureError(
  message: string,
  puedeGestionar: boolean,
  cuentaSeleccionadaId: string | null
): CampanasPanelData {
  return {
    ...EMPTY_DATA,
    puedeGestionar,
    puedeVerDc: true,
    cuentaSeleccionadaId,
    infraestructuraLista: false,
    mensajeInfraestructura: message,
  }
}

function buildOverviewInfrastructureError(
  message: string,
  puedeGestionar: boolean,
  cuentaSeleccionadaId: string | null
): CampanasOverviewData {
  return {
    ...EMPTY_OVERVIEW_DATA,
    puedeGestionar,
    cuentaSeleccionadaId,
    infraestructuraLista: false,
    mensajeInfraestructura: message,
  }
}

function buildScopedAccountId(actor: ActorActual, scopeAccountId: string | null | undefined) {
  if (actor.puesto === 'ADMINISTRADOR') {
    return scopeAccountId ?? null
  }

  return actor.cuentaClienteId ?? scopeAccountId ?? null
}

function getSupportClient(options?: ObtenerPanelCampanasOptions) {
  if (options?.serviceClient) {
    return options.serviceClient
  }

  try {
    return createServiceClient() as TypedSupabaseClient
  } catch {
    return null
  }
}

function getAssignmentsForPdv(
  assignmentsByPdv: Map<string, AsignacionRow[]>,
  pdvId: string,
  campaignStart: string,
  campaignEnd: string
) {
  return (assignmentsByPdv.get(pdvId) ?? []).filter(
    (item) =>
      item.estado_publicacion === 'PUBLICADA' &&
      rangesOverlapIso(item.fecha_inicio, item.fecha_fin, campaignStart, campaignEnd)
  )
}

function shouldIncludeCampaignPdv(
  actor: ActorActual,
  campaign: CampanaRow,
  row: CampanaPdvRow,
  assignmentsByPdv: Map<string, AsignacionRow[]>
) {
  if (actor.puesto === 'DERMOCONSEJERO') {
    return getAssignmentsForPdv(assignmentsByPdv, row.pdv_id, campaign.fecha_inicio, campaign.fecha_fin).some(
      (item) => item.empleado_id === actor.empleadoId
    )
  }

  if (actor.puesto === 'SUPERVISOR') {
    return getAssignmentsForPdv(assignmentsByPdv, row.pdv_id, campaign.fecha_inicio, campaign.fecha_fin).some(
      (item) => item.supervisor_empleado_id === actor.empleadoId
    )
  }

  return true
}

function formatProductLabels(productIds: readonly string[], productMap: Map<string, ProductoRow>) {
  return dedupeStringArray(
    productIds.map((item) => {
      const product = productMap.get(item)
      return product ? `${product.sku} - ${product.nombre_corto}` : item
    })
  )
}

function sortByName<T extends { nombre: string }>(items: T[]) {
  return [...items].sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'))
}

async function signStorageUrl(service: TypedSupabaseClient | null, rawUrl: string | null | undefined) {
  const normalized = String(rawUrl ?? '').trim()

  if (!normalized) {
    return null
  }

  const segments = normalized.split('/')
  if (segments.length < 2) {
    return normalized
  }

  if (!service?.storage) {
    return normalized
  }

  const [bucket, ...routeSegments] = segments
  const route = routeSegments.join('/')

  try {
    const result = await service.storage.from(bucket).createSignedUrl(route, 60 * 60)
    return result.data?.signedUrl ?? normalized
  } catch {
    return normalized
  }
}

export async function obtenerInicioCampanas(
  actor: ActorActual,
  options?: ObtenerPanelCampanasOptions
): Promise<CampanasOverviewData> {
  const puedeGestionar = actor.puesto === 'ADMINISTRADOR' || actor.puesto === 'VENTAS'
  const cuentaSeleccionadaId = buildScopedAccountId(actor, options?.scopeAccountId)
  const service = getSupportClient(options)

  if (!service) {
    return buildOverviewInfrastructureError(
      'SUPABASE_SERVICE_ROLE_KEY no esta disponible para consolidar campanas.',
      puedeGestionar,
      cuentaSeleccionadaId
    )
  }

  let campanasQuery = service
    .from('campana')
    .select('id, cuenta_cliente_id, nombre, fecha_inicio, fecha_fin, estado, cuota_adicional, created_at')
    .order('fecha_inicio', { ascending: false })
    .limit(120)

  let campanaPdvQuery = service
    .from('campana_pdv')
    .select('id, campana_id, cuenta_cliente_id, pdv_id, dc_empleado_id, tareas_requeridas, tareas_cumplidas, estatus_cumplimiento, avance_porcentaje')
    .order('created_at', { ascending: false })
    .limit(1000)

  let cuentasQuery = service
    .from('cuenta_cliente')
    .select('id, identificador, nombre, activa')
    .eq('activa', true)
    .order('nombre', { ascending: true })
    .limit(200)

  if (cuentaSeleccionadaId) {
    campanasQuery = campanasQuery.eq('cuenta_cliente_id', cuentaSeleccionadaId)
    campanaPdvQuery = campanaPdvQuery.eq('cuenta_cliente_id', cuentaSeleccionadaId)
    cuentasQuery = cuentasQuery.eq('id', cuentaSeleccionadaId)
  }

  const [campanasResult, campanaPdvResult, cuentasResult] = await Promise.all([
    campanasQuery,
    campanaPdvQuery,
    cuentasQuery,
  ])

  const infraestructuraError =
    campanasResult.error?.message ??
    campanaPdvResult.error?.message ??
    cuentasResult.error?.message ??
    null

  if (infraestructuraError) {
    return buildOverviewInfrastructureError(infraestructuraError, puedeGestionar, cuentaSeleccionadaId)
  }

  let campanasRaw = (campanasResult.data ?? []) as CampanaInicioRow[]
  const campanaPdvRaw = (campanaPdvResult.data ?? []) as CampanaPdvInicioRow[]
  const cuentasRaw = (cuentasResult.data ?? []) as CuentaRow[]
  const pdvIds = dedupeStringArray(campanaPdvRaw.map((item) => item.pdv_id))

  const asignacionesResult =
    (actor.puesto === 'DERMOCONSEJERO' || actor.puesto === 'SUPERVISOR') && pdvIds.length > 0
      ? await service
          .from('asignacion')
          .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion, created_at')
          .in('pdv_id', pdvIds)
          .limit(1600)
      : { data: [], error: null }

  if (asignacionesResult.error) {
    return buildOverviewInfrastructureError(
      asignacionesResult.error.message,
      puedeGestionar,
      cuentaSeleccionadaId
    )
  }

  const asignacionesRaw = (asignacionesResult.data ?? []) as AsignacionRow[]
  const assignmentByPdv = new Map<string, AsignacionRow[]>()

  for (const assignment of asignacionesRaw) {
    const current = assignmentByPdv.get(assignment.pdv_id) ?? []
    current.push(assignment)
    assignmentByPdv.set(assignment.pdv_id, current)
  }

  for (const [pdvId, items] of assignmentByPdv.entries()) {
    assignmentByPdv.set(
      pdvId,
      [...items].sort((left, right) => right.created_at.localeCompare(left.created_at))
    )
  }

  const campaignMap = new Map(campanasRaw.map((item) => [item.id, item]))
  const allowedCampaignPdvRows = campanaPdvRaw.filter((row) => {
    const campaign = campaignMap.get(row.campana_id)

    if (!campaign) {
      return false
    }

    if (cuentaSeleccionadaId && row.cuenta_cliente_id !== cuentaSeleccionadaId) {
      return false
    }

    return shouldIncludeCampaignPdv(actor, campaign as CampanaRow, row as CampanaPdvRow, assignmentByPdv)
  })

  const allowedCampaignIds = new Set(allowedCampaignPdvRows.map((item) => item.campana_id))
  const todayIso = new Date().toISOString().slice(0, 10)
  const staleCampaignIds = campanasRaw
    .filter((item) => item.estado === 'ACTIVA' && item.fecha_fin < todayIso)
    .map((item) => item.id)

  if (staleCampaignIds.length > 0) {
    const campaignTable = service.from('campana') as unknown as {
      update?: (payload: { estado: 'CERRADA'; updated_at: string }) => {
        in?: (column: string, values: string[]) => unknown
      }
    }

    const updateBuilder = campaignTable.update?.({
      estado: 'CERRADA',
      updated_at: new Date().toISOString(),
    })

    if (typeof updateBuilder?.in === 'function') {
      await Promise.resolve(updateBuilder.in('id', staleCampaignIds))
    }

    const staleSet = new Set(staleCampaignIds)
    campanasRaw = campanasRaw.map((item) =>
      staleSet.has(item.id) ? { ...item, estado: 'CERRADA' } : item
    )
  }

  const visibleCampaigns = campanasRaw.filter((campaign) => {
    if (actor.puesto === 'DERMOCONSEJERO' || actor.puesto === 'SUPERVISOR') {
      return allowedCampaignIds.has(campaign.id)
    }

    return !cuentaSeleccionadaId || campaign.cuenta_cliente_id === cuentaSeleccionadaId
  })

  const visibleCampaignIdSet = new Set(visibleCampaigns.map((item) => item.id))
  const visibleCampaignPdv = allowedCampaignPdvRows.filter((item) => visibleCampaignIdSet.has(item.campana_id))
  const cuentaMap = new Map(cuentasRaw.map((item) => [item.id, item]))
  const campanas = visibleCampaigns.map((campaign) => {
    const pdvRows = visibleCampaignPdv.filter((item) => item.campana_id === campaign.id)
    const totalPdvs = pdvRows.length
    const pdvsCumplidos = pdvRows.filter((item) => item.estatus_cumplimiento === 'CUMPLIDA').length
    const avancePromedio =
      totalPdvs === 0
        ? 0
        : Number(
            (
              pdvRows.reduce((current, item) => current + Number(item.avance_porcentaje ?? 0), 0) / totalPdvs
            ).toFixed(2)
          )
    const tareasPendientes = pdvRows.reduce(
      (current, item) =>
        current +
        Math.max(0, (item.tareas_requeridas?.length ?? 0) - (item.tareas_cumplidas?.length ?? 0)),
      0
    )

    return {
      id: campaign.id,
      cuentaClienteId: campaign.cuenta_cliente_id,
      cuentaCliente: cuentaMap.get(campaign.cuenta_cliente_id)?.nombre ?? null,
      nombre: campaign.nombre,
      fechaInicio: campaign.fecha_inicio,
      fechaFin: campaign.fecha_fin,
      estado: campaign.estado,
      ventanaActiva:
        campaign.estado !== 'CANCELADA' &&
        isCampaignWindowActive(campaign.fecha_inicio, campaign.fecha_fin, todayIso),
      totalPdvs,
      pdvsCumplidos,
      avancePromedio,
      tareasPendientes,
      cuotaAdicional: campaign.cuota_adicional,
    } satisfies CampanaOverviewItem
  })

  const totalPdvRows = campanas.reduce((current, item) => current + item.totalPdvs, 0)
  const totalProgress = campanas.reduce(
    (current, item) => current + item.avancePromedio * item.totalPdvs,
    0
  )

  return {
    puedeGestionar,
    resumen: {
      totalCampanas: campanas.length,
      activas: campanas.filter((item) => item.estado === 'ACTIVA').length,
      pdvsObjetivo: totalPdvRows,
      pdvsCumplidos: campanas.reduce((current, item) => current + item.pdvsCumplidos, 0),
      avancePromedio: totalPdvRows === 0 ? 0 : Number((totalProgress / totalPdvRows).toFixed(2)),
      tareasPendientes: campanas.reduce((current, item) => current + item.tareasPendientes, 0),
      cuotaAdicionalTotal: campanas.reduce((current, item) => current + item.cuotaAdicional, 0),
    },
    campanas,
    cuentaSeleccionadaId,
    infraestructuraLista: true,
  }
}

export async function obtenerPanelCampanas(
  actor: ActorActual,
  options?: ObtenerPanelCampanasOptions
): Promise<CampanasPanelData> {
  const puedeGestionar = actor.puesto === 'ADMINISTRADOR' || actor.puesto === 'VENTAS'
  const puedeVerDc = actor.puesto !== 'CLIENTE'
  const cuentaSeleccionadaId = buildScopedAccountId(actor, options?.scopeAccountId)
  const service = getSupportClient(options)

  if (!service) {
    return buildInfrastructureError(
      'SUPABASE_SERVICE_ROLE_KEY no esta disponible para consolidar campanas.',
      puedeGestionar,
      cuentaSeleccionadaId
    )
  }

  let campanasQuery = service
    .from('campana')
    .select('id, cuenta_cliente_id, cadena_id, nombre, descripcion, fecha_inicio, fecha_fin, estado, productos_foco, cuota_adicional, instrucciones, evidencias_requeridas, metadata, created_at, updated_at')
    .order('fecha_inicio', { ascending: false })
    .limit(120)

  let campanaPdvQuery = service
    .from('campana_pdv')
    .select('id, campana_id, cuenta_cliente_id, pdv_id, dc_empleado_id, tareas_requeridas, tareas_cumplidas, estatus_cumplimiento, avance_porcentaje, evidencias_cargadas, comentarios, metadata, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  let relacionesQuery = service
    .from('cuenta_cliente_pdv')
    .select('id, cuenta_cliente_id, pdv_id, activo, fecha_fin')
    .order('fecha_inicio', { ascending: false })
    .limit(1200)

  let cuentasQuery = service
    .from('cuenta_cliente')
    .select('id, identificador, nombre, activa')
    .eq('activa', true)
    .order('nombre', { ascending: true })
    .limit(200)

  if (cuentaSeleccionadaId) {
    campanasQuery = campanasQuery.eq('cuenta_cliente_id', cuentaSeleccionadaId)
    campanaPdvQuery = campanaPdvQuery.eq('cuenta_cliente_id', cuentaSeleccionadaId)
    relacionesQuery = relacionesQuery.eq('cuenta_cliente_id', cuentaSeleccionadaId)
    cuentasQuery = cuentasQuery.eq('id', cuentaSeleccionadaId)
  }

  const [campanasResult, campanaPdvResult, relacionesResult, cuentasResult] = await Promise.all([
    campanasQuery,
    campanaPdvQuery,
    relacionesQuery,
    cuentasQuery,
  ])

  const infraestructuraError =
    campanasResult.error?.message ??
    campanaPdvResult.error?.message ??
    relacionesResult.error?.message ??
    cuentasResult.error?.message ??
    null

  if (infraestructuraError) {
    return buildInfrastructureError(infraestructuraError, puedeGestionar, cuentaSeleccionadaId)
  }

  let campanasRaw = (campanasResult.data ?? []) as CampanaRow[]
  const campanaPdvRaw = (campanaPdvResult.data ?? []) as CampanaPdvRow[]
  const relacionesRaw = (relacionesResult.data ?? []) as CuentaClientePdvRow[]
  const cuentasRaw = (cuentasResult.data ?? []) as CuentaRow[]

  const pdvIds = dedupeStringArray([
    ...campanaPdvRaw.map((item) => item.pdv_id),
    ...relacionesRaw.map((item) => item.pdv_id),
  ])

  const campanaIds = dedupeStringArray(campanasRaw.map((item) => item.id))
  const campanaPdvIds = dedupeStringArray(campanaPdvRaw.map((item) => item.id))

  const [pdvsResult, cadenasResult, productosResult, asignacionesResult, asistenciasResult, campanaProductMetaResult] = await Promise.all([
    pdvIds.length > 0
      ? service
          .from('pdv')
          .select('id, clave_btl, nombre, zona, direccion, cadena_id, estatus')
          .in('id', pdvIds)
          .limit(Math.max(pdvIds.length, 1))
      : Promise.resolve({ data: [], error: null }),
    service
      .from('cadena')
      .select('id, codigo, nombre')
      .order('nombre', { ascending: true })
      .limit(200),
    service
      .from('producto')
      .select('id, sku, nombre, nombre_corto, activo')
      .eq('activo', true)
      .order('nombre_corto', { ascending: true })
      .limit(400),
    pdvIds.length > 0
      ? service
          .from('asignacion')
          .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion, created_at')
          .in('pdv_id', pdvIds)
          .limit(1600)
      : Promise.resolve({ data: [], error: null }),
    actor.puesto === 'DERMOCONSEJERO' && pdvIds.length > 0
      ? service
          .from('asistencia')
          .select('id, cuenta_cliente_id, empleado_id, pdv_id, fecha_operacion, estatus, check_out_utc, check_in_utc')
          .eq('empleado_id', actor.empleadoId)
          .eq('fecha_operacion', new Date().toISOString().slice(0, 10))
          .eq('estatus', 'VALIDA')
          .is('check_out_utc', null)
          .in('pdv_id', pdvIds)
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    campanaIds.length > 0 && campanaPdvIds.length > 0
      ? service
          .from('campana_pdv_producto_meta')
          .select('id, campana_id, campana_pdv_id, cuenta_cliente_id, pdv_id, producto_id, cuota, tipo_meta, observaciones')
          .in('campana_id', campanaIds)
          .in('campana_pdv_id', campanaPdvIds)
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ])

  const enrichmentError =
    (pdvsResult as { error?: { message?: string } | null }).error?.message ??
    (cadenasResult as { error?: { message?: string } | null }).error?.message ??
    (productosResult as { error?: { message?: string } | null }).error?.message ??
    (asignacionesResult as { error?: { message?: string } | null }).error?.message ??
    (asistenciasResult as { error?: { message?: string } | null }).error?.message ??
    null

  if (enrichmentError) {
    return buildInfrastructureError(enrichmentError, puedeGestionar, cuentaSeleccionadaId)
  }

  const pdvsRaw = ((pdvsResult as { data?: unknown[] | null }).data ?? []) as PdvRow[]
  const cadenasRaw = ((cadenasResult as { data?: unknown[] | null }).data ?? []) as CadenaRow[]
  const productosRaw = ((productosResult as { data?: unknown[] | null }).data ?? []) as ProductoRow[]
  const asignacionesRaw = ((asignacionesResult as { data?: unknown[] | null }).data ?? []) as AsignacionRow[]
  const asistenciasRaw = ((asistenciasResult as { data?: unknown[] | null }).data ?? []) as AsistenciaRow[]
  const campanaProductMetaRaw =
    ((campanaProductMetaResult as { data?: unknown[] | null }).data ?? []) as CampanaPdvProductoMetaRow[]

  const employeeIds = dedupeStringArray([
    ...campanaPdvRaw.map((item) => item.dc_empleado_id).filter((item): item is string => Boolean(item)),
    ...asignacionesRaw.map((item) => item.empleado_id),
    ...asignacionesRaw.map((item) => item.supervisor_empleado_id).filter((item): item is string => Boolean(item)),
  ])

  const empleadosResult =
    employeeIds.length > 0
      ? await service
          .from('empleado')
          .select('id, nombre_completo, puesto')
          .in('id', employeeIds)
          .limit(Math.max(employeeIds.length, 1))
      : { data: [], error: null }

  if (empleadosResult.error) {
    return buildInfrastructureError(empleadosResult.error.message, puedeGestionar, cuentaSeleccionadaId)
  }

  const empleadosRaw = (empleadosResult.data ?? []) as EmpleadoRow[]
  const cuentaMap = new Map(cuentasRaw.map((item) => [item.id, item]))
  const cadenaMap = new Map(cadenasRaw.map((item) => [item.id, item]))
  const productoMap = new Map(productosRaw.map((item) => [item.id, item]))
  const pdvMap = new Map(pdvsRaw.map((item) => [item.id, item]))
  const empleadoMap = new Map(empleadosRaw.map((item) => [item.id, item]))
  const assignmentByPdv = new Map<string, AsignacionRow[]>()
  const productMetaByCampanaPdv = new Map<string, CampanaProductGoalItem[]>()
  const activeAttendanceByPdv = new Map(
    asistenciasRaw.map((item) => [item.pdv_id, item])
  )

  for (const meta of campanaProductMetaRaw) {
    const product = productoMap.get(meta.producto_id)
    const current = productMetaByCampanaPdv.get(meta.campana_pdv_id) ?? []
    current.push({
      productId: meta.producto_id,
      quota: meta.cuota,
      goalType: meta.tipo_meta,
      notes: meta.observaciones,
      productLabel: product ? `${product.nombre_corto}` : meta.producto_id,
      productSku: product?.sku ?? null,
    })
    productMetaByCampanaPdv.set(meta.campana_pdv_id, current)
  }

  for (const assignment of asignacionesRaw) {
    const current = assignmentByPdv.get(assignment.pdv_id) ?? []
    current.push(assignment)
    assignmentByPdv.set(assignment.pdv_id, current)
  }

  for (const [pdvId, items] of assignmentByPdv.entries()) {
    assignmentByPdv.set(
      pdvId,
      [...items].sort((left, right) => right.created_at.localeCompare(left.created_at))
    )
  }

  const campaignMap = new Map(campanasRaw.map((item) => [item.id, item]))
  const allowedCampaignPdvRows = campanaPdvRaw.filter((row) => {
    const campaign = campaignMap.get(row.campana_id)

    if (!campaign) {
      return false
    }

    if (cuentaSeleccionadaId && row.cuenta_cliente_id !== cuentaSeleccionadaId) {
      return false
    }

    return shouldIncludeCampaignPdv(actor, campaign, row, assignmentByPdv)
  })

  const allowedCampaignIds = new Set(allowedCampaignPdvRows.map((item) => item.campana_id))
  const todayIso = new Date().toISOString().slice(0, 10)
  const staleCampaignIds = campanasRaw
    .filter((item) => item.estado === 'ACTIVA' && item.fecha_fin < todayIso)
    .map((item) => item.id)

  if (staleCampaignIds.length > 0) {
    const campaignTable = service.from('campana') as unknown as {
      update?: (payload: { estado: 'CERRADA'; updated_at: string }) => {
        in?: (column: string, values: string[]) => unknown
      }
    }

    const updateBuilder = campaignTable.update?.({
      estado: 'CERRADA',
      updated_at: new Date().toISOString(),
    })

    if (typeof updateBuilder?.in === 'function') {
      await Promise.resolve(updateBuilder.in('id', staleCampaignIds))
    }

    const staleSet = new Set(staleCampaignIds)
    campanasRaw = campanasRaw.map((item) =>
      staleSet.has(item.id) ? { ...item, estado: 'CERRADA' } : item
    )
  }

  const visibleCampaigns = campanasRaw.filter((campaign) => {
    if (actor.puesto === 'DERMOCONSEJERO' || actor.puesto === 'SUPERVISOR') {
      return allowedCampaignIds.has(campaign.id)
    }

    return !cuentaSeleccionadaId || campaign.cuenta_cliente_id === cuentaSeleccionadaId
  })

  const visibleCampaignIdSet = new Set(visibleCampaigns.map((item) => item.id))
  const visibleCampaignPdv = allowedCampaignPdvRows.filter((item) => visibleCampaignIdSet.has(item.campana_id))

  const campanas = await Promise.all(
    visibleCampaigns.map(async (campaign) => {
      const evidenciasRequeridas = dedupeStringArray(campaign.evidencias_requeridas ?? [])
      const evidenceTemplate = readCampaignEvidenceTemplate(campaign.metadata, evidenciasRequeridas)
      const productIds = dedupeStringArray(campaign.productos_foco ?? [])
      const productGoalsFromMetadata = readCampaignProductGoals(campaign.metadata)
        .map((goal) => {
          const product = productoMap.get(goal.productId)
          return {
            ...goal,
            productLabel: product ? `${product.nombre_corto}` : goal.productId,
            productSku: product?.sku ?? null,
          } satisfies CampanaProductGoalItem
        })
        .sort((left, right) => left.productLabel.localeCompare(right.productLabel, 'es'))
      const manualMercadeoRaw = readCampaignManualDocument(campaign.metadata)
      const manualMercadeo =
        manualMercadeoRaw
          ? {
              ...manualMercadeoRaw,
              signedUrl: await signStorageUrl(service, manualMercadeoRaw.url),
            }
          : null
      const pdvItems = visibleCampaignPdv
        .filter((item) => item.campana_id === campaign.id)
        .map((item) => {
        const pdv = pdvMap.get(item.pdv_id)
        const assignments = getAssignmentsForPdv(
          assignmentByPdv,
          item.pdv_id,
          campaign.fecha_inicio,
          campaign.fecha_fin
        )
        const currentAssignment = assignments[0] ?? null
        const dcId = item.dc_empleado_id ?? currentAssignment?.empleado_id ?? null
        const dc = dcId ? empleadoMap.get(dcId) ?? null : null
        const supervisor = currentAssignment?.supervisor_empleado_id
          ? empleadoMap.get(currentAssignment.supervisor_empleado_id) ?? null
          : null
        const pdvProductGoals = (productMetaByCampanaPdv.get(item.id) ?? []).sort((left, right) =>
          left.productLabel.localeCompare(right.productLabel, 'es')
        )
        const activeAttendance =
          actor.puesto === 'DERMOCONSEJERO' ? activeAttendanceByPdv.get(item.pdv_id) ?? null : null
        const variabilityCount = readCampaignTaskVariability(
          campaign.metadata,
          (item.tareas_requeridas ?? []).length
        )
        const visitTaskTemplate = readVisitTaskTemplate(campaign.metadata, item.tareas_requeridas ?? [])
        const activeVisitSession: VisitTaskSession | null =
          activeAttendance?.id
            ? ensureVisitTaskSession(item.metadata, {
                attendanceId: activeAttendance.id,
                templateTasks: visitTaskTemplate,
                variabilityCount,
                generatedAt: activeAttendance.check_in_utc ?? new Date().toISOString(),
              }).session
            : null
        const completedTasks = activeVisitSession
          ? getResolvedVisitTaskLabels(activeVisitSession)
          : item.tareas_cumplidas ?? []
        const progress = buildCampaignProgress(
          item.tareas_requeridas ?? [],
          completedTasks,
          evidenciasRequeridas.length,
          item.evidencias_cargadas,
          campaign.fecha_fin,
          todayIso
        )

          return {
            id: item.id,
            pdvId: item.pdv_id,
            pdv: pdv?.nombre ?? 'PDV sin nombre',
            claveBtl: pdv?.clave_btl ?? 'SIN-CLAVE',
            zona: pdv?.zona ?? null,
            cadena: pdv?.cadena_id ? cadenaMap.get(pdv.cadena_id)?.nombre ?? null : null,
            cuentaCliente: cuentaMap.get(item.cuenta_cliente_id)?.nombre ?? null,
            dcEmpleadoId: dcId,
            dcNombre: puedeVerDc ? dc?.nombre_completo ?? null : null,
            supervisorNombre: puedeVerDc ? supervisor?.nombre_completo ?? null : null,
            productGoals: pdvProductGoals,
            tareasRequeridas: progress.requiredTasks,
            tareasCumplidas: progress.completedTasks,
            tareasPendientes: activeVisitSession
              ? getPendingVisitTaskLabels(activeVisitSession).length
              : progress.pendingTasks,
            evidenciasRequeridas,
            evidenciasCargadas: progress.evidenceUploaded,
            avancePorcentaje: progress.progressPercentage,
            estatus: progress.status,
            comentarios: item.comentarios,
            activeAttendanceId: activeAttendance?.id ?? null,
            activeVisitSession: activeVisitSession
              ? {
                  attendanceId: activeVisitSession.attendanceId,
                  generatedAt: activeVisitSession.generatedAt,
                  executionMinutes: getVisitTaskExecutionMinutes(activeVisitSession),
                  tasks: activeVisitSession.tasks,
                }
              : null,
          } satisfies CampanaPdvItem
        })
        .sort((left, right) => left.pdv.localeCompare(right.pdv, 'es'))

      const pdvsCumplidos = pdvItems.filter((item) => item.estatus === 'CUMPLIDA').length
      const aggregatedGoalMap = new Map<string, CampanaProductGoalItem>()
      for (const pdvItem of pdvItems) {
        for (const goal of pdvItem.productGoals) {
          const key = `${goal.productId}:${goal.goalType}`
          const current = aggregatedGoalMap.get(key)
          if (current) {
            current.quota = Number((current.quota + goal.quota).toFixed(2))
          } else {
            aggregatedGoalMap.set(key, { ...goal })
          }
        }
      }
      const productGoals =
        aggregatedGoalMap.size > 0
          ? Array.from(aggregatedGoalMap.values()).sort((left, right) =>
              left.productLabel.localeCompare(right.productLabel, 'es')
            )
          : productGoalsFromMetadata
      const avancePromedio =
        pdvItems.length === 0
          ? 0
          : Number(
              (
                pdvItems.reduce((current, item) => current + item.avancePorcentaje, 0) / pdvItems.length
              ).toFixed(2)
            )

      return {
        id: campaign.id,
        cuentaClienteId: campaign.cuenta_cliente_id,
        cuentaCliente: cuentaMap.get(campaign.cuenta_cliente_id)?.nombre ?? null,
        cadenaId: campaign.cadena_id,
        cadena: campaign.cadena_id ? cadenaMap.get(campaign.cadena_id)?.nombre ?? null : null,
        nombre: campaign.nombre,
        descripcion: campaign.descripcion,
        fechaInicio: campaign.fecha_inicio,
        fechaFin: campaign.fecha_fin,
        estado: campaign.estado,
        ventanaActiva:
          campaign.estado !== 'CANCELADA' &&
          isCampaignWindowActive(campaign.fecha_inicio, campaign.fecha_fin, todayIso),
        productosFoco: formatProductLabels(productIds, productoMap),
        productoIds: productIds,
        productGoals,
        cuotaAdicional: campaign.cuota_adicional,
        instrucciones: campaign.instrucciones,
        evidenciasRequeridas,
        evidenceTemplate,
        manualMercadeo,
        variabilidadTareas: readCampaignTaskVariability(campaign.metadata, 0),
        taskTemplate: readVisitTaskTemplate(campaign.metadata, []),
        totalPdvs: pdvItems.length,
        pdvsCumplidos,
        avancePromedio,
        tareasPendientes: pdvItems.reduce((current, item) => current + item.tareasPendientes, 0),
        pdvs: pdvItems,
      } satisfies CampanaItem
    })
  )

  const visibleAccountIds = dedupeStringArray([
    ...campanas.map((item) => item.cuentaClienteId),
    ...relacionesRaw.map((item) => item.cuenta_cliente_id),
  ])
  const cuentasDisponibles = sortByName(
    cuentasRaw
      .filter((item) => visibleAccountIds.includes(item.id) || (!cuentaSeleccionadaId && puedeGestionar))
      .map((item) => ({
        id: item.id,
        nombre: item.nombre,
        identificador: item.identificador,
      }))
  )

  const pdvsDisponibles = relacionesRaw
    .filter((item) => item.activo && (!cuentaSeleccionadaId || item.cuenta_cliente_id === cuentaSeleccionadaId))
    .map((item) => {
      const pdv = pdvMap.get(item.pdv_id)
      if (!pdv || !isOperablePdvStatus(pdv.estatus)) {
        return null
      }

      const currentAssignment = (assignmentByPdv.get(item.pdv_id) ?? []).find(
        (assignment) =>
          assignment.estado_publicacion === 'PUBLICADA' &&
          rangesOverlapIso(assignment.fecha_inicio, assignment.fecha_fin, todayIso, todayIso)
      )
      const dc = currentAssignment?.empleado_id ? empleadoMap.get(currentAssignment.empleado_id) ?? null : null
      const supervisor = currentAssignment?.supervisor_empleado_id
        ? empleadoMap.get(currentAssignment.supervisor_empleado_id) ?? null
        : null

      return {
        id: pdv.id,
        cuentaClienteId: item.cuenta_cliente_id,
        cuentaCliente: cuentaMap.get(item.cuenta_cliente_id)?.nombre ?? 'Sin cliente',
        claveBtl: pdv.clave_btl,
        nombre: pdv.nombre,
        zona: pdv.zona,
        cadenaId: pdv.cadena_id,
        cadena: pdv.cadena_id ? cadenaMap.get(pdv.cadena_id)?.nombre ?? null : null,
        dcEmpleadoId: dc?.id ?? null,
        dcNombre: dc?.nombre_completo ?? null,
        supervisorNombre: supervisor?.nombre_completo ?? null,
      } satisfies CampanaPdvOption
    })
    .filter((item): item is CampanaPdvOption => item !== null)
    .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'))

  const cadenasDisponibles = sortByName(
    dedupeStringArray(pdvsDisponibles.map((item) => item.cadenaId).filter((item): item is string => Boolean(item)))
      .map((id) => {
        const cadena = cadenaMap.get(id)
        return cadena
          ? {
              id,
              codigo: cadena.codigo,
              nombre: cadena.nombre ?? 'Cadena sin nombre',
            }
          : null
      })
      .filter((item): item is CampanaCadenaOption => item !== null)
  )

  const productosDisponibles = sortByName(
    productosRaw.map((item) => ({
      id: item.id,
      sku: item.sku,
      nombre: item.nombre,
      nombreCorto: item.nombre_corto,
    }))
  )

  const reportePorPdv = campanas
    .flatMap((campaign) =>
      campaign.pdvs.map((item) => ({
        campanaId: campaign.id,
        campana: campaign.nombre,
        pdvId: item.pdvId,
        pdv: item.pdv,
        claveBtl: item.claveBtl,
        dc: item.dcNombre,
        estatus: item.estatus,
        avancePorcentaje: item.avancePorcentaje,
        tareasPendientes: item.tareasPendientes,
        evidenciasPendientes: Math.max(0, item.evidenciasRequeridas.length - item.evidenciasCargadas),
      }))
    )
    .sort((left, right) => right.avancePorcentaje - left.avancePorcentaje)

  const reportePorDcMap = new Map<string, CampanaReporteDcItem & { progressAccumulator: number }>()

  if (puedeVerDc) {
    for (const campaign of campanas) {
      const activeFlag = campaign.ventanaActiva ? 1 : 0

      for (const item of campaign.pdvs) {
        if (!item.dcEmpleadoId || !item.dcNombre) {
          continue
        }

        const current = reportePorDcMap.get(item.dcEmpleadoId) ?? {
          empleadoId: item.dcEmpleadoId,
          empleado: item.dcNombre,
          puesto: empleadoMap.get(item.dcEmpleadoId)?.puesto ?? null,
          campanasActivas: 0,
          pdvsObjetivo: 0,
          pdvsCumplidos: 0,
          avancePromedio: 0,
          progressAccumulator: 0,
        }

        current.campanasActivas += activeFlag
        current.pdvsObjetivo += 1
        current.pdvsCumplidos += item.estatus === 'CUMPLIDA' ? 1 : 0
        current.progressAccumulator += item.avancePorcentaje
        reportePorDcMap.set(item.dcEmpleadoId, current)
      }
    }
  }

  const reportePorDc = Array.from(reportePorDcMap.values())
    .map((item) => ({
      empleadoId: item.empleadoId,
      empleado: item.empleado,
      puesto: item.puesto,
      campanasActivas: item.campanasActivas,
      pdvsObjetivo: item.pdvsObjetivo,
      pdvsCumplidos: item.pdvsCumplidos,
      avancePromedio:
        item.pdvsObjetivo === 0 ? 0 : Number((item.progressAccumulator / item.pdvsObjetivo).toFixed(2)),
    }))
    .sort((left, right) => right.avancePromedio - left.avancePromedio)

  const totalPdvRows = campanas.reduce((current, item) => current + item.totalPdvs, 0)
  const totalProgress = campanas.reduce(
    (current, item) => current + item.pdvs.reduce((acc, row) => acc + row.avancePorcentaje, 0),
    0
  )

  return {
    puedeGestionar,
    puedeVerDc,
    resumen: {
      totalCampanas: campanas.length,
      activas: campanas.filter((item) => item.estado === 'ACTIVA').length,
      pdvsObjetivo: totalPdvRows,
      pdvsCumplidos: campanas.reduce((current, item) => current + item.pdvsCumplidos, 0),
      avancePromedio: totalPdvRows === 0 ? 0 : Number((totalProgress / totalPdvRows).toFixed(2)),
      tareasPendientes: campanas.reduce((current, item) => current + item.tareasPendientes, 0),
      cuotaAdicionalTotal: campanas.reduce((current, item) => current + item.cuotaAdicional, 0),
    },
    campanas,
    reportePorDc,
    reportePorPdv,
    cuentasDisponibles,
    cadenasDisponibles,
    productosDisponibles,
    pdvsDisponibles,
    cuentaSeleccionadaId,
    infraestructuraLista: true,
  }
}
