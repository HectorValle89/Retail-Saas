import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pdv } from '@/types/database'
import {
  rangesOverlap,
} from './assignmentPlanning'
import type {
  AsignacionValidable,
  AssignmentComparableRow,
  AssignmentIssue,
  AssignmentIssueSeverity,
} from './assignmentValidation'

type TypedSupabaseClient = SupabaseClient<any>

export type AssignmentRotationClassification = 'FIJO' | 'ROTATIVO'
export type AssignmentRotationSlot = 'A' | 'B' | 'C'

export interface AssignmentRotationValidationMember {
  pdvId: string
  claveBtl: string
  clasificacionMaestra: AssignmentRotationClassification
  grupoRotacionCodigo: string | null
  grupoTamano: 2 | 3 | null
  slotRotacion: AssignmentRotationSlot | null
}

export interface AssignmentRotationValidationData {
  rotationByPdvId: Record<string, AssignmentRotationValidationMember>
  groupsByCode: Record<string, AssignmentRotationValidationMember[]>
  assignmentsByPdv: Record<string, AssignmentComparableRow[]>
}

function createIssue(
  severity: AssignmentIssueSeverity,
  code: string,
  label: string,
  message: string
): AssignmentIssue {
  return { severity, code, label, message }
}

export async function loadAssignmentRotationValidationData(
  supabase: TypedSupabaseClient,
  options: {
    accountId: string
    pdvIds: string[]
    fechaInicio?: string | null
    fechaFin?: string | null
  }
): Promise<AssignmentRotationValidationData> {
  const uniquePdvIds = Array.from(new Set(options.pdvIds.filter(Boolean)))

  if (uniquePdvIds.length === 0) {
    return {
      rotationByPdvId: {},
      groupsByCode: {},
      assignmentsByPdv: {},
    }
  }

  const { data: seedRows, error: seedError } = await supabase
    .from('pdv_rotacion_maestra')
    .select('pdv_id, clasificacion_maestra, grupo_rotacion_codigo, grupo_tamano, slot_rotacion')
    .eq('cuenta_cliente_id', options.accountId)
    .eq('vigente', true)
    .in('pdv_id', uniquePdvIds)

  if (seedError) {
    throw new Error(seedError.message)
  }

  const seedRotationRows = (seedRows ?? []) as Array<{
    pdv_id: string
    clasificacion_maestra: AssignmentRotationClassification
    grupo_rotacion_codigo: string | null
    grupo_tamano: 2 | 3 | null
    slot_rotacion: AssignmentRotationSlot | null
  }>

  const rotativeGroupCodes = Array.from(
    new Set(
      seedRotationRows
        .filter((item) => item.clasificacion_maestra === 'ROTATIVO' && item.grupo_rotacion_codigo)
        .map((item) => item.grupo_rotacion_codigo as string)
    )
  )

  if (rotativeGroupCodes.length === 0) {
    return {
      rotationByPdvId: {},
      groupsByCode: {},
      assignmentsByPdv: {},
    }
  }

  const { data: groupRows, error: groupError } = await supabase
    .from('pdv_rotacion_maestra')
    .select('pdv_id, clasificacion_maestra, grupo_rotacion_codigo, grupo_tamano, slot_rotacion')
    .eq('cuenta_cliente_id', options.accountId)
    .eq('vigente', true)
    .in('grupo_rotacion_codigo', rotativeGroupCodes)

  if (groupError) {
    throw new Error(groupError.message)
  }

  const groupRotationRows = (groupRows ?? []) as Array<{
    pdv_id: string
    clasificacion_maestra: AssignmentRotationClassification
    grupo_rotacion_codigo: string | null
    grupo_tamano: 2 | 3 | null
    slot_rotacion: AssignmentRotationSlot | null
  }>
  const groupPdvIds = Array.from(new Set(groupRotationRows.map((item) => item.pdv_id)))

  let assignmentsQuery = supabase
    .from('asignacion')
    .select('id, empleado_id, pdv_id, supervisor_empleado_id, tipo, fecha_inicio, fecha_fin, dias_laborales')
    .eq('cuenta_cliente_id', options.accountId)
    .in('pdv_id', groupPdvIds)

  if (options.fechaFin) {
    assignmentsQuery = assignmentsQuery.lte('fecha_inicio', options.fechaFin)
  }

  if (options.fechaInicio) {
    assignmentsQuery = assignmentsQuery.or(`fecha_fin.is.null,fecha_fin.gte.${options.fechaInicio}`)
  }

  const [pdvsResult, assignmentsResult] = await Promise.all([
    supabase.from('pdv').select('id, clave_btl').in('id', groupPdvIds),
    assignmentsQuery,
  ])

  const infraError = pdvsResult.error?.message ?? assignmentsResult.error?.message
  if (infraError) {
    throw new Error(infraError)
  }

  const pdvById = new Map(
    ((pdvsResult.data ?? []) as Array<Pick<Pdv, 'id' | 'clave_btl'>>).map((item) => [item.id, item])
  )

  const rotationByPdvId = groupRotationRows.reduce<Record<string, AssignmentRotationValidationMember>>(
    (acc, item) => {
      const pdv = pdvById.get(item.pdv_id)
      if (!pdv) {
        return acc
      }

      acc[item.pdv_id] = {
        pdvId: item.pdv_id,
        claveBtl: pdv.clave_btl,
        clasificacionMaestra: item.clasificacion_maestra,
        grupoRotacionCodigo: item.grupo_rotacion_codigo,
        grupoTamano: item.grupo_tamano,
        slotRotacion: item.slot_rotacion,
      }
      return acc
    },
    {}
  )

  const groupsByCode = Object.values(rotationByPdvId).reduce<Record<string, AssignmentRotationValidationMember[]>>(
    (acc, item) => {
      if (!item.grupoRotacionCodigo) {
        return acc
      }

      const current = acc[item.grupoRotacionCodigo] ?? []
      current.push(item)
      acc[item.grupoRotacionCodigo] = current
      return acc
    },
    {}
  )

  const assignmentsByPdv = ((assignmentsResult.data ?? []) as AssignmentComparableRow[]).reduce<
    Record<string, AssignmentComparableRow[]>
  >((acc, item) => {
    const current = acc[item.pdv_id] ?? []
    current.push(item)
    acc[item.pdv_id] = current
    return acc
  }, {})

  return {
    rotationByPdvId,
    groupsByCode: Object.fromEntries(
      Object.entries(groupsByCode).map(([code, members]) => [
        code,
        members.sort((left, right) => (left.slotRotacion ?? '').localeCompare(right.slotRotacion ?? '', 'es-MX')),
      ])
    ),
    assignmentsByPdv,
  }
}

function buildImpactedGroupCodes(
  asignacion: AsignacionValidable,
  rotationData: AssignmentRotationValidationData,
  previousPdvId?: string | null
) {
  const groupCodes = new Set<string>()
  const target = rotationData.rotationByPdvId[asignacion.pdv_id]
  if (target?.clasificacionMaestra === 'ROTATIVO' && target.grupoRotacionCodigo) {
    groupCodes.add(target.grupoRotacionCodigo)
  }

  if (previousPdvId && previousPdvId !== asignacion.pdv_id) {
    const previous = rotationData.rotationByPdvId[previousPdvId]
    if (previous?.clasificacionMaestra === 'ROTATIVO' && previous.grupoRotacionCodigo) {
      groupCodes.add(previous.grupoRotacionCodigo)
    }
  }

  return Array.from(groupCodes)
}

function buildSimulatedEmployeesByPdv(
  asignacion: AsignacionValidable,
  members: AssignmentRotationValidationMember[],
  rotationData: AssignmentRotationValidationData
) {
  const simulated = new Map<string, Set<string>>()

  for (const member of members) {
    const activeEmployees = new Set(
      (rotationData.assignmentsByPdv[member.pdvId] ?? [])
        .filter((item) => item.id !== asignacion.id)
        .filter((item) => rangesOverlap(asignacion.fecha_inicio, asignacion.fecha_fin, item.fecha_inicio, item.fecha_fin))
        .map((item) => item.empleado_id)
        .filter(Boolean)
    )

    simulated.set(member.pdvId, activeEmployees)
  }

  if (members.some((member) => member.pdvId === asignacion.pdv_id) && asignacion.empleado_id) {
    const current = simulated.get(asignacion.pdv_id) ?? new Set<string>()
    current.add(asignacion.empleado_id)
    simulated.set(asignacion.pdv_id, current)
  }

  return simulated
}

export function evaluateRotationMasterImpact(
  asignacion: AsignacionValidable,
  options: {
    rotationData: AssignmentRotationValidationData | null
    previousPdvId?: string | null
  }
): AssignmentIssue[] {
  const rotationData = options.rotationData
  if (!rotationData) {
    return []
  }

  const issues: AssignmentIssue[] = []
  const impactedGroups = buildImpactedGroupCodes(asignacion, rotationData, options.previousPdvId)

  for (const groupCode of impactedGroups) {
    const members = rotationData.groupsByCode[groupCode] ?? []
    if (members.length === 0) {
      continue
    }

    const simulated = buildSimulatedEmployeesByPdv(asignacion, members, rotationData)
    const uncoveredMembers = members.filter((member) => (simulated.get(member.pdvId)?.size ?? 0) === 0)
    const distinctEmployees = new Set(
      members.flatMap((member) => Array.from(simulated.get(member.pdvId) ?? [])).filter(Boolean)
    )
    const memberClaves = members.map((member) => member.claveBtl).join(', ')

    if (uncoveredMembers.length > 0) {
      issues.push(
        createIssue(
          'ALERTA',
          'ROTACION_MAESTRA_SIN_COBERTURA',
          'Rotacion sin cobertura',
          'El grupo ' + groupCode + ' quedaria incompleto. PDVs impactados: ' + uncoveredMembers.map((member) => member.claveBtl).join(', ') + '. Grupo: ' + memberClaves + '.'
        )
      )
    }

    if (distinctEmployees.size > 1) {
      issues.push(
        createIssue(
          'ALERTA',
          'ROTACION_MAESTRA_PARTIDA',
          'Rotacion partida',
          'El grupo ' + groupCode + ' quedaria repartido entre distintas DCs. Grupo: ' + memberClaves + '.'
        )
      )
    }
  }

  return issues
}
