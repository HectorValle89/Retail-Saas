import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { getSingleTenantAccountId } from '@/lib/tenant/singleTenant'
import { isOperablePdvStatus } from '@/features/pdvs/lib/pdvStatus'
import type { Pdv } from '@/types/database'
import type { PdvRotationTemplateRow } from '../lib/pdvRotationTemplate'

type TypedSupabaseClient = SupabaseClient<any>
type MaybeMany<T> = T | T[] | null

export type PdvRotacionClasificacionMaestra = 'FIJO' | 'ROTATIVO'
export type PdvRotacionFuente = 'SUGERIDA' | 'IMPORTADA'
export type PdvRotacionSlot = 'A' | 'B' | 'C'
export type PdvRotacionFilter = 'ALL' | 'FIJO' | 'ROTATIVO' | 'PENDIENTE' | 'INCOMPLETO'

interface CuentaClienteRow {
  id: string
  identificador: string
  nombre: string
}

interface CuentaClientePdvRow {
  pdv_id: string
  cuenta_cliente_id: string
  activo: boolean
  fecha_inicio: string
  fecha_fin: string | null
  pdv: MaybeMany<{
    id: string
    clave_btl: string
    nombre: string
    zona: string | null
    estatus: Pdv['estatus']
    cadena: MaybeMany<{ nombre: string | null }>
    ciudad: MaybeMany<{ nombre: string | null }>
  }>
}

interface AsignacionActivaRow {
  id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  pdv_id: string
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  naturaleza: 'BASE' | 'COBERTURA_TEMPORAL' | 'COBERTURA_PERMANENTE' | 'MOVIMIENTO'
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
  fecha_inicio: string
  fecha_fin: string | null
}

interface EmpleadoRow {
  id: string
  nombre_completo: string
}

interface PdvRotacionMaestraRow {
  id: string
  cuenta_cliente_id: string
  pdv_id: string
  clasificacion_maestra: PdvRotacionClasificacionMaestra
  grupo_rotacion_codigo: string | null
  grupo_tamano: 2 | 3 | null
  slot_rotacion: PdvRotacionSlot | null
  fuente: PdvRotacionFuente
  vigente: boolean
  observaciones: string | null
  metadata: Record<string, unknown> | null
}

export interface PdvRotacionBoardItem {
  pdvId: string
  claveBtl: string
  nombre: string
  cadena: string | null
  ciudad: string | null
  zona: string | null
  estadoMaestro: Pdv['estatus']
  clasificacionMaestra: PdvRotacionClasificacionMaestra | null
  grupoRotacionCodigo: string | null
  grupoTamano: 2 | 3 | null
  slotRotacion: PdvRotacionSlot | null
  fuente: PdvRotacionFuente | null
  observaciones: string | null
  referenciaDcActual: string | null
  relacionados: string[]
  pendienteRevision: boolean
  grupoIncompleto: boolean
}

export interface PdvRotacionBoardGroup {
  codigo: string
  tamano: 2 | 3
  completo: boolean
  miembros: PdvRotacionBoardItem[]
}

export interface PdvRotacionBoardSummary {
  operables: number
  fijos: number
  rotativos: number
  pendientes: number
  gruposIncompletos: number
}

export interface PdvRotacionBoardData {
  summary: PdvRotacionBoardSummary
  items: PdvRotacionBoardItem[]
  groups: PdvRotacionBoardGroup[]
}

interface ProposalSeed {
  clasificacionMaestra: PdvRotacionClasificacionMaestra | null
  grupoRotacion: string | null
  tamanoGrupo: 2 | 3 | null
  posicion: PdvRotacionSlot | null
}

interface OperablePdvInfo {
  id: string
  clave_btl: string
  nombre: string
  zona: string | null
  estatus: Pdv['estatus']
  cadena: MaybeMany<{ nombre: string | null }>
  ciudad: MaybeMany<{ nombre: string | null }>
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

function first<T>(value: MaybeMany<T>) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function getTodayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function isDateWithinRange(start: string, end: string | null, target: string) {
  return start <= target && (!end || end >= target)
}

function getAccountId(actor?: ActorActual | null, accountId?: string | null) {
  return actor?.cuentaClienteId ?? accountId ?? getSingleTenantAccountId()
}

function buildGroupCode(identifier: string, ordinal: number) {
  const normalized = identifier
    .replace(/[^A-Z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()

  return `ROT-${normalized || 'CUENTA'}-${String(ordinal).padStart(3, '0')}`
}

function relatedClaves(pdvIds: string[], pdvById: Map<string, OperablePdvInfo | null>, currentPdvId: string) {
  return pdvIds
    .filter((pdvId) => pdvId !== currentPdvId)
    .map((pdvId) => pdvById.get(pdvId)?.clave_btl ?? null)
    .filter((value): value is string => Boolean(value))
}

function groupSlots(size: number) {
  return size === 3 ? (['A', 'B', 'C'] as const) : (['A', 'B'] as const)
}

function isCompleteGroup(items: PdvRotacionBoardItem[], size: 2 | 3) {
  if (items.length !== size) {
    return false
  }

  const expectedSlots = new Set(groupSlots(size))
  const actualSlots = new Set(items.map((item) => item.slotRotacion).filter(Boolean))
  if (actualSlots.size !== expectedSlots.size) {
    return false
  }

  for (const slot of expectedSlots) {
    if (!actualSlots.has(slot)) {
      return false
    }
  }

  return true
}

async function loadRotationContext(
  supabase: TypedSupabaseClient,
  accountId: string,
  now = new Date()
) {
  const today = getTodayIso(now)

  const [accountResult, relacionesResult, assignmentsResult, rotationResult] = await Promise.all([
    supabase.from('cuenta_cliente').select('id, identificador, nombre').eq('id', accountId).maybeSingle(),
    supabase
      .from('cuenta_cliente_pdv')
      .select(`
        pdv_id,
        cuenta_cliente_id,
        activo,
        fecha_inicio,
        fecha_fin,
        pdv:pdv_id(
          id,
          clave_btl,
          nombre,
          zona,
          estatus,
          cadena:cadena_id(nombre),
          ciudad:ciudad_id(nombre)
        )
      `)
      .eq('cuenta_cliente_id', accountId)
      .eq('activo', true)
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('asignacion')
      .select('id, cuenta_cliente_id, empleado_id, pdv_id, tipo, naturaleza, estado_publicacion, fecha_inicio, fecha_fin')
      .eq('cuenta_cliente_id', accountId)
      .eq('estado_publicacion', 'PUBLICADA')
      .eq('naturaleza', 'BASE')
      .lte('fecha_inicio', today)
      .or(`fecha_fin.is.null,fecha_fin.gte.${today}`),
    supabase
      .from('pdv_rotacion_maestra')
      .select('id, cuenta_cliente_id, pdv_id, clasificacion_maestra, grupo_rotacion_codigo, grupo_tamano, slot_rotacion, fuente, vigente, observaciones, metadata')
      .eq('cuenta_cliente_id', accountId)
      .eq('vigente', true),
  ])

  const errorMessage = [
    accountResult.error?.message,
    relacionesResult.error?.message,
    assignmentsResult.error?.message,
    rotationResult.error?.message,
  ]
    .filter(Boolean)
    .join(' ')

  if (errorMessage) {
    throw new Error(errorMessage)
  }

  const account = (accountResult.data ?? null) as CuentaClienteRow | null
  const relaciones = ((relacionesResult.data ?? []) as CuentaClientePdvRow[]).filter(
    (item) => isDateWithinRange(item.fecha_inicio, item.fecha_fin, today) && isOperablePdvStatus(first(item.pdv)?.estatus ?? 'INACTIVO')
  )
  const assignments = (assignmentsResult.data ?? []) as AsignacionActivaRow[]
  const employeeIds = Array.from(new Set(assignments.map((item) => item.empleado_id).filter(Boolean)))
  const employeesResult = employeeIds.length > 0
    ? await supabase.from('empleado').select('id, nombre_completo').in('id', employeeIds)
    : { data: [], error: null }

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message)
  }

  const employees = (employeesResult.data ?? []) as EmpleadoRow[]
  const rotationRows = (rotationResult.data ?? []) as PdvRotacionMaestraRow[]

  return {
    account,
    relaciones,
    assignments,
    employees,
    rotationRows,
  }
}

export async function buildPdvRotationMasterBoard(
  supabase: TypedSupabaseClient,
  options: {
    actor?: ActorActual | null
    accountId?: string | null
    now?: Date
  } = {}
): Promise<PdvRotacionBoardData> {
  const accountId = getAccountId(options.actor, options.accountId)
  const { relaciones, assignments, employees, rotationRows } = await loadRotationContext(
    supabase,
    accountId,
    options.now
  )

  const employeeById = new Map(employees.map((item) => [item.id, item]))
  const assignmentByPdv = new Map<string, AsignacionActivaRow[]>()
  for (const assignment of assignments) {
    const current = assignmentByPdv.get(assignment.pdv_id) ?? []
    current.push(assignment)
    assignmentByPdv.set(assignment.pdv_id, current)
  }

  const pdvRelationById = new Map<string, OperablePdvInfo | null>(relaciones.map((item) => [item.pdv_id, first(item.pdv) as OperablePdvInfo | null]))
  const rotationByPdvId = new Map(rotationRows.map((item) => [item.pdv_id, item]))
  const items = relaciones
    .map((relation): PdvRotacionBoardItem | null => {
      const pdv = first(relation.pdv) as OperablePdvInfo | null
      if (!pdv) {
        return null
      }

      const rotation = rotationByPdvId.get(relation.pdv_id) ?? null
      const assignmentsForPdv = assignmentByPdv.get(relation.pdv_id) ?? []
      const currentEmployeeName = assignmentsForPdv.length === 1
        ? employeeById.get(assignmentsForPdv[0].empleado_id)?.nombre_completo ?? null
        : null

      return {
        pdvId: pdv.id,
        claveBtl: pdv.clave_btl,
        nombre: pdv.nombre,
        cadena: first(pdv.cadena)?.nombre ?? null,
        ciudad: first(pdv.ciudad)?.nombre ?? null,
        zona: pdv.zona ?? null,
        estadoMaestro: pdv.estatus,
        clasificacionMaestra: rotation?.clasificacion_maestra ?? null,
        grupoRotacionCodigo: rotation?.grupo_rotacion_codigo ?? null,
        grupoTamano: rotation?.grupo_tamano ?? null,
        slotRotacion: rotation?.slot_rotacion ?? null,
        fuente: rotation?.fuente ?? null,
        observaciones: rotation?.observaciones ?? null,
        referenciaDcActual: currentEmployeeName,
        relacionados: [],
        pendienteRevision: !rotation,
        grupoIncompleto: false,
      }
    })
    .filter(isPresent)
    .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es-MX'))

  const groupsMap = new Map<string, PdvRotacionBoardItem[]>()
  for (const item of items) {
    if (!item.grupoRotacionCodigo) {
      continue
    }

    const current = groupsMap.get(item.grupoRotacionCodigo) ?? []
    current.push(item)
    groupsMap.set(item.grupoRotacionCodigo, current)
  }

  const groups: PdvRotacionBoardGroup[] = Array.from(groupsMap.entries())
    .map(([codigo, members]) => {
      const size = members[0]?.grupoTamano ?? 2
      const completo = isCompleteGroup(members, size)
      return {
        codigo,
        tamano: size,
        completo,
        miembros: members.sort((left, right) => (left.slotRotacion ?? '').localeCompare(right.slotRotacion ?? '', 'es-MX')),
      }
    })
    .sort((left, right) => left.codigo.localeCompare(right.codigo, 'es-MX'))

  const incompleteGroupCodes = new Set(groups.filter((group) => !group.completo).map((group) => group.codigo))

  for (const item of items) {
    if (item.grupoRotacionCodigo) {
      const groupItems = groupsMap.get(item.grupoRotacionCodigo) ?? []
      item.relacionados = groupItems
        .filter((member) => member.pdvId !== item.pdvId)
        .map((member) => member.claveBtl)
      item.grupoIncompleto = incompleteGroupCodes.has(item.grupoRotacionCodigo)
    }
  }

  return {
    summary: {
      operables: items.length,
      fijos: items.filter((item) => item.clasificacionMaestra === 'FIJO').length,
      rotativos: items.filter((item) => item.clasificacionMaestra === 'ROTATIVO').length,
      pendientes: items.filter((item) => item.pendienteRevision).length,
      gruposIncompletos: incompleteGroupCodes.size,
    },
    items,
    groups,
  }
}

export async function inferPdvRotationProposalRows(
  supabase: TypedSupabaseClient,
  options: {
    actor?: ActorActual | null
    accountId?: string | null
    now?: Date
  } = {}
): Promise<PdvRotationTemplateRow[]> {
  const accountId = getAccountId(options.actor, options.accountId)
  const { account, relaciones, assignments, employees } = await loadRotationContext(
    supabase,
    accountId,
    options.now
  )

  const employeeById = new Map(employees.map((item) => [item.id, item]))
  const operablePdvIds = new Set(relaciones.map((item) => item.pdv_id))
  const assignmentsByEmployee = new Map<string, AsignacionActivaRow[]>()
  const assignmentsByPdv = new Map<string, AsignacionActivaRow[]>()

  for (const assignment of assignments) {
    if (!operablePdvIds.has(assignment.pdv_id)) {
      continue
    }

    const currentByEmployee = assignmentsByEmployee.get(assignment.empleado_id) ?? []
    currentByEmployee.push(assignment)
    assignmentsByEmployee.set(assignment.empleado_id, currentByEmployee)

    const currentByPdv = assignmentsByPdv.get(assignment.pdv_id) ?? []
    currentByPdv.push(assignment)
    assignmentsByPdv.set(assignment.pdv_id, currentByPdv)
  }

  const suggestionByPdv = new Map<string, ProposalSeed>()
  const employeeGroups = Array.from(assignmentsByEmployee.entries())
    .map(([employeeId, rows]) => {
      const pdvIds = Array.from(new Set(rows.map((row) => row.pdv_id)))
      return {
        employeeId,
        employeeName: employeeById.get(employeeId)?.nombre_completo ?? employeeId,
        pdvIds,
      }
    })
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName, 'es-MX'))

  let groupOrdinal = 1

  for (const group of employeeGroups) {
    const pdvIds = group.pdvIds.filter((pdvId) => (assignmentsByPdv.get(pdvId) ?? []).length === 1)
    if (pdvIds.length === 1) {
      suggestionByPdv.set(pdvIds[0], {
        clasificacionMaestra: 'FIJO',
        grupoRotacion: null,
        tamanoGrupo: null,
        posicion: null,
      })
      continue
    }

    if (pdvIds.length === 2 || pdvIds.length === 3) {
      const groupCode = buildGroupCode(account?.identificador ?? account?.nombre ?? 'cuenta', groupOrdinal)
      groupOrdinal += 1
      const orderedPdvIds = pdvIds.slice().sort((left, right) => {
        const leftPdv = first(relaciones.find((item) => item.pdv_id === left)?.pdv)
        const rightPdv = first(relaciones.find((item) => item.pdv_id === right)?.pdv)
        return (leftPdv?.clave_btl ?? left).localeCompare(rightPdv?.clave_btl ?? right, 'es-MX')
      })

      orderedPdvIds.forEach((pdvId, index) => {
        suggestionByPdv.set(pdvId, {
          clasificacionMaestra: 'ROTATIVO',
          grupoRotacion: groupCode,
          tamanoGrupo: orderedPdvIds.length as 2 | 3,
          posicion: groupSlots(orderedPdvIds.length)[index] ?? null,
        })
      })
    }
  }

  const relatedPdvById = new Map<string, OperablePdvInfo | null>(relaciones.map((item) => [item.pdv_id, first(item.pdv) as OperablePdvInfo | null]))

  return relaciones
    .map((relation): PdvRotationTemplateRow | null => {
      const pdv = first(relation.pdv) as OperablePdvInfo | null
      if (!pdv) {
        return null
      }

      const suggestion = suggestionByPdv.get(relation.pdv_id) ?? null
      const assignedRows = assignmentsByPdv.get(relation.pdv_id) ?? []
      const employeeName = assignedRows.length === 1
        ? employeeById.get(assignedRows[0].empleado_id)?.nombre_completo ?? null
        : null
      const related = suggestion?.clasificacionMaestra === 'ROTATIVO'
        ? relatedClaves(
            Array.from(suggestionByPdv.entries())
              .filter((entry) => entry[1].grupoRotacion === suggestion.grupoRotacion)
              .map((entry) => entry[0]),
            relatedPdvById,
            relation.pdv_id
          )
        : []

      return {
        claveBtl: pdv.clave_btl,
        nombrePdv: pdv.nombre,
        estatusPdv: pdv.estatus,
        clasificacionMaestra: suggestion?.clasificacionMaestra ?? null,
        grupoRotacion: suggestion?.grupoRotacion ?? null,
        tamanoGrupo: suggestion?.tamanoGrupo ?? null,
        posicion: suggestion?.posicion ?? null,
        pdvRelacionado1: related[0] ?? null,
        pdvRelacionado2: related[1] ?? null,
        referenciaDcActual: employeeName,
        observaciones: suggestion
          ? 'Sugerido desde asignaciones base publicadas vigentes.'
          : 'PENDIENTE_REVISION: completa la topologia de este PDV en la revision humana.',
      }
    })
    .filter(isPresent)
    .sort((left, right) => left.claveBtl.localeCompare(right.claveBtl, 'es-MX'))
}
