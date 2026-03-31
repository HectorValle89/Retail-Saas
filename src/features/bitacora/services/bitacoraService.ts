import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { calcularHashPayload, stableSerialize } from '@/lib/audit/integrity'

type AuditLogRow = {
  id: number
  tabla: string
  registro_id: string | null
  accion: 'INSERT' | 'UPDATE' | 'DELETE' | 'EVENTO'
  payload: unknown
  hash_sha256: string
  created_at: string
  usuario_id: string | null
  cuenta_cliente_id: string | null
  usuario: { username: string | null } | Array<{ username: string | null }> | null
  cuenta_cliente: { nombre: string | null; identificador: string | null } | Array<{ nombre: string | null; identificador: string | null }> | null
}

type ConfiguracionRow = {
  clave: string
  valor: unknown
}

export interface BitacoraFiltros {
  usuario: string
  modulo: string
  accion: string
  fechaDesde: string
  fechaHasta: string
  cursor: number | null
  history: number[]
  pageSize: number
}

export interface BitacoraResumen {
  registros: number
  integridadValida: number
  integridadInvalida: number
}

export interface BitacoraPaginacion {
  page: number
  pageSize: number
  totalItems: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  previousCursor: number | null
  nextCursor: number | null
  previousHistory: number[]
}

export interface BitacoraIntegrityAlert {
  activa: boolean
  totalInvalidos: number
  ids: number[]
  ultimaFecha: string | null
  mensaje: string
}

export interface BitacoraItem {
  id: number
  fecha: string
  tabla: string
  accion: string
  registroId: string | null
  usuario: string | null
  cuentaCliente: string | null
  resumen: string
  hashGuardado: string
  hashCalculado: string
  integridad: 'VALIDO' | 'INVALIDO'
}

export interface BitacoraPanelData {
  filtros: BitacoraFiltros
  paginacion: BitacoraPaginacion
  resumen: BitacoraResumen
  alertaIntegridad: BitacoraIntegrityAlert | null
  retencion: Array<{
    key: string
    label: string
    dias: number
  }>
  items: BitacoraItem[]
}

export interface BitacoraExportPayload {
  filenameBase: string
  headers: string[]
  rows: Array<Array<string | number | null>>
  signature: {
    algorithm: 'SHA-256'
    digest: string
    generatedAt: string
    totalRows: number
    invalidRows: number
  }
}

interface ObtenerBitacoraOptions {
  actor: ActorActual
  usuario?: string
  modulo?: string
  accion?: string
  fechaDesde?: string
  fechaHasta?: string
  cursor?: string
  history?: string
  pageSize?: number
}

const MAX_PAGE_SIZE = 50
const EXPORT_BATCH_SIZE = 500
const AUDIT_RETENTION_CONFIG = [
  { key: 'audit.retencion.operacion_dias', label: 'Operacion', defaultDays: 730 },
  { key: 'audit.retencion.configuracion_dias', label: 'Configuracion', defaultDays: 730 },
  { key: 'audit.retencion.seguridad_dias', label: 'Seguridad', defaultDays: 730 },
] as const

function normalizePageSize(value?: number) {
  if (!value || Number.isNaN(value)) {
    return MAX_PAGE_SIZE
  }

  return Math.min(MAX_PAGE_SIZE, Math.max(10, Math.floor(value)))
}

function normalizeDate(value?: string) {
  if (!value) {
    return ''
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

function normalizeText(value?: string) {
  return value?.trim() ?? ''
}

function normalizeCursor(value?: string) {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.floor(parsed)
}

function normalizeHistory(value?: string) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .map((item) => Math.floor(item))
}

function getFirst<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function resumirPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const serialized = JSON.stringify(payload)
    return serialized.length > 160 ? `${serialized.slice(0, 157)}...` : serialized
  }

  const record = payload as Record<string, unknown>
  const resumen = typeof record.resumen === 'string' ? record.resumen : null
  if (resumen && resumen.trim()) {
    return resumen
  }

  const evento = typeof record.evento === 'string' ? record.evento : null
  if (evento && evento.trim()) {
    return evento
  }

  const serialized = stableSerialize(record)
  return serialized.length > 160 ? `${serialized.slice(0, 157)}...` : serialized
}

function buildFiltros(options: ObtenerBitacoraOptions): BitacoraFiltros {
  return {
    usuario: normalizeText(options.usuario),
    modulo: normalizeText(options.modulo),
    accion: normalizeText(options.accion),
    fechaDesde: normalizeDate(options.fechaDesde),
    fechaHasta: normalizeDate(options.fechaHasta),
    cursor: normalizeCursor(options.cursor),
    history: normalizeHistory(options.history),
    pageSize: normalizePageSize(options.pageSize),
  }
}

async function resolveUsuarioIds(supabase: SupabaseClient, usuario: string) {
  if (!usuario) {
    return null
  }

  const { data, error } = await supabase
    .from('usuario')
    .select('id')
    .ilike('username', `%${usuario}%`)
    .limit(100)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((item) => item.id)
}

async function obtenerPoliticaRetencion(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('configuracion')
    .select('clave, valor')
    .in(
      'clave',
      AUDIT_RETENTION_CONFIG.map((item) => item.key)
    )

  if (error) {
    throw new Error(error.message)
  }

  const rows = new Map(((data ?? []) as ConfiguracionRow[]).map((item) => [item.clave, item.valor]))

  return AUDIT_RETENTION_CONFIG.map((item) => {
    const configuredValue = rows.get(item.key)
    const parsed = typeof configuredValue === 'number' ? configuredValue : Number(configuredValue)
    return {
      key: item.key,
      label: item.label,
      dias: Number.isFinite(parsed) && parsed > 0 ? parsed : item.defaultDays,
    }
  })
}

function applyAuditFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  actor: ActorActual,
  filtros: BitacoraFiltros,
  usuarioIds: string[] | null
) {
  if (actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
  }

  if (filtros.modulo) {
    query = query.ilike('tabla', `%${filtros.modulo}%`)
  }

  if (filtros.accion) {
    query = query.eq('accion', filtros.accion)
  }

  if (filtros.fechaDesde) {
    query = query.gte('created_at', `${filtros.fechaDesde}T00:00:00.000Z`)
  }

  if (filtros.fechaHasta) {
    query = query.lte('created_at', `${filtros.fechaHasta}T23:59:59.999Z`)
  }

  if (usuarioIds) {
    query = query.in(
      'usuario_id',
      usuarioIds.length === 0 ? ['00000000-0000-0000-0000-000000000000'] : usuarioIds
    )
  }

  return query
}

function buildAuditCountQuery(supabase: SupabaseClient, actor: ActorActual, filtros: BitacoraFiltros, usuarioIds: string[] | null) {
  return applyAuditFilters(
    supabase.from('audit_log').select('id', { count: 'exact', head: true }),
    actor,
    filtros,
    usuarioIds
  )
}

function buildAuditDataQuery(supabase: SupabaseClient, actor: ActorActual, filtros: BitacoraFiltros, usuarioIds: string[] | null) {
  return applyAuditFilters(
    supabase.from('audit_log').select(`
      id,
      tabla,
      registro_id,
      accion,
      payload,
      hash_sha256,
      created_at,
      usuario_id,
      cuenta_cliente_id,
      usuario:usuario_id(username),
      cuenta_cliente:cuenta_cliente_id(nombre, identificador)
    `),
    actor,
    filtros,
    usuarioIds
  )
}

function mapAuditRow(row: AuditLogRow): BitacoraItem {
  const hashCalculado = calcularHashPayload(row.payload ?? {})
  return {
    id: row.id,
    fecha: row.created_at,
    tabla: row.tabla,
    accion: row.accion,
    registroId: row.registro_id,
    usuario: getFirst(row.usuario)?.username ?? null,
    cuentaCliente: getFirst(row.cuenta_cliente)?.nombre ?? null,
    resumen: resumirPayload(row.payload ?? {}),
    hashGuardado: row.hash_sha256,
    hashCalculado,
    integridad: hashCalculado === row.hash_sha256 ? 'VALIDO' : 'INVALIDO',
  }
}

function buildIntegrityAlert(items: BitacoraItem[]): BitacoraIntegrityAlert | null {
  const invalidItems = items.filter((item) => item.integridad === 'INVALIDO')
  if (invalidItems.length === 0) {
    return null
  }

  const latestInvalid = invalidItems
    .map((item) => item.fecha)
    .sort((left, right) => right.localeCompare(left))[0] ?? null

  return {
    activa: true,
    totalInvalidos: invalidItems.length,
    ids: invalidItems.map((item) => item.id),
    ultimaFecha: latestInvalid,
    mensaje:
      invalidItems.length === 1
        ? 'Se detecto 1 discrepancia de hash en el tramo visible de auditoria.'
        : `Se detectaron ${invalidItems.length} discrepancias de hash en el tramo visible de auditoria.`,
  }
}

export async function obtenerBitacoraPanel(
  supabase: SupabaseClient,
  options: ObtenerBitacoraOptions
): Promise<BitacoraPanelData> {
  const filtros = buildFiltros(options)
  const [usuarioIds, retencion] = await Promise.all([
    resolveUsuarioIds(supabase, filtros.usuario),
    obtenerPoliticaRetencion(supabase),
  ])

  const { count, error: countError } = await buildAuditCountQuery(supabase, options.actor, filtros, usuarioIds)

  if (countError) {
    throw new Error(countError.message)
  }

  const totalItems = count ?? 0
  let rowsQuery = buildAuditDataQuery(supabase, options.actor, filtros, usuarioIds)
    .order('id', { ascending: false })

  if (filtros.cursor) {
    rowsQuery = rowsQuery.lt('id', filtros.cursor)
  }

  const { data, error } = await rowsQuery.limit(filtros.pageSize + 1)

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AuditLogRow[]
  const hasNextPage = rows.length > filtros.pageSize
  const visibleRows = hasNextPage ? rows.slice(0, filtros.pageSize) : rows
  const items = visibleRows.map(mapAuditRow)
  const currentPage = filtros.history.length + 1
  const previousCursorToken = filtros.history.at(-1) ?? null

  return {
    filtros,
    paginacion: {
      page: currentPage,
      pageSize: filtros.pageSize,
      totalItems,
      hasPreviousPage: filtros.history.length > 0,
      hasNextPage,
      previousCursor: previousCursorToken && previousCursorToken > 0 ? previousCursorToken : null,
      nextCursor: hasNextPage ? visibleRows.at(-1)?.id ?? null : null,
      previousHistory: filtros.history.slice(0, -1),
    },
    resumen: {
      registros: totalItems,
      integridadValida: items.filter((item) => item.integridad === 'VALIDO').length,
      integridadInvalida: items.filter((item) => item.integridad === 'INVALIDO').length,
    },
    alertaIntegridad: buildIntegrityAlert(items),
    retencion,
    items,
  }
}

async function obtenerBitacoraLote(
  supabase: SupabaseClient,
  actor: ActorActual,
  filtros: BitacoraFiltros,
  usuarioIds: string[] | null,
  offset: number,
  limit: number
) {
  const { data, error } = await buildAuditDataQuery(supabase, actor, filtros, usuarioIds)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as AuditLogRow[]).map(mapAuditRow)
}

export async function collectBitacoraExportPayload(
  supabase: SupabaseClient,
  options: Omit<ObtenerBitacoraOptions, 'cursor' | 'history' | 'pageSize'>
): Promise<BitacoraExportPayload> {
  const filtros = buildFiltros({ ...options, cursor: undefined, history: undefined, pageSize: MAX_PAGE_SIZE })
  const usuarioIds = await resolveUsuarioIds(supabase, filtros.usuario)
  const rows: BitacoraItem[] = []
  let offset = 0

  while (true) {
    const chunk = await obtenerBitacoraLote(supabase, options.actor, filtros, usuarioIds, offset, EXPORT_BATCH_SIZE)
    rows.push(...chunk)

    if (chunk.length < EXPORT_BATCH_SIZE) {
      break
    }

    offset += EXPORT_BATCH_SIZE
  }

  const generatedAt = new Date().toISOString()
  const headers = ['fecha', 'tabla', 'accion', 'registro_id', 'usuario', 'cuenta_cliente', 'integridad', 'hash_guardado', 'hash_calculado', 'resumen']
  const exportedRows = rows.map((item) => [
    item.fecha,
    item.tabla,
    item.accion,
    item.registroId,
    item.usuario,
    item.cuentaCliente,
    item.integridad,
    item.hashGuardado,
    item.hashCalculado,
    item.resumen,
  ])
  const digest = createHash('sha256')
    .update(
      stableSerialize({
        filenameBase: `bitacora-${filtros.fechaDesde || 'inicio'}-${filtros.fechaHasta || 'hoy'}`,
        headers,
        rows: exportedRows,
      })
    )
    .digest('hex')

  return {
    filenameBase: `bitacora-${filtros.fechaDesde || 'inicio'}-${filtros.fechaHasta || 'hoy'}`,
    headers,
    rows: exportedRows,
    signature: {
      algorithm: 'SHA-256',
      digest,
      generatedAt,
      totalRows: exportedRows.length,
      invalidRows: rows.filter((item) => item.integridad === 'INVALIDO').length,
    },
  }
}
