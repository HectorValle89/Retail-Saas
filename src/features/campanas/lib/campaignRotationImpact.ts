import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildAssignmentTransitionPlan,
  resolveAssignmentsForDate,
  type AssignmentEngineDraft,
  type AssignmentEngineRow,
} from '@/features/asignaciones/lib/assignmentEngine'
import {
  evaluateRotationMasterImpact,
  loadAssignmentRotationValidationData,
  type AssignmentRotationValidationData,
  type AssignmentRotationValidationMember,
} from '@/features/asignaciones/lib/assignmentRotationValidation'
import type { AssignmentIssue } from '@/features/asignaciones/lib/assignmentValidation'

type TypedSupabaseClient = SupabaseClient<any>

type PdvLiteRow = {
  id: string
  clave_btl: string
  nombre: string
  cadena_id: string | null
}

type EmployeeLiteRow = {
  id: string
  nombre_completo: string
}

type CampanaPdvPreviewRow = {
  id: string
  pdv_id: string
  dc_empleado_id: string | null
  metadata: Record<string, unknown> | null
}

export interface CampaignRotationAssignmentRow extends AssignmentEngineRow {
  created_at: string
}

export interface CampaignRotationSuggestedCandidate {
  empleadoId: string
  empleado: string
  currentPdvId: string | null
  currentPdv: string | null
  currentPdvClave: string | null
  rankingBucket: 'MISMA_CADENA_MISMO_SUPERVISOR' | 'MISMA_CADENA_OTRO_SUPERVISOR' | 'OTRA_CADENA'
  issues: AssignmentIssue[]
}

export interface CampaignRotationImpactNode {
  nodeId: string
  grupoRotacionCodigo: string
  primaryPdvId: string
  primaryPdv: string
  primaryPdvClave: string
  primaryEmpleadoId: string | null
  primaryEmpleado: string | null
  impactedPdvId: string
  impactedPdv: string
  impactedPdvClave: string
  impactedCampanaPdvId: string | null
  reservedEmployeeId: string | null
  reservedEmployee: string | null
  suggestedCandidates: CampaignRotationSuggestedCandidate[]
  selectedDecision?: 'ASIGNAR' | 'RESERVAR' | null
  selectedEmployeeId?: string | null
}

export interface CampaignRotationImpactPreview {
  campanaId: string
  accountId: string
  fechaInicio: string
  fechaFin: string
  totalGroups: number
  totalNodes: number
  nodes: CampaignRotationImpactNode[]
}

export interface CampaignRotationDecision {
  nodeId: string
  decision: 'ASIGNAR' | 'RESERVAR'
  empleadoId: string | null
}

export interface CampaignRotationResolvedDecision extends CampaignRotationDecision {
  node: CampaignRotationImpactNode
}

function rangesOverlapIso(leftStart: string, leftEnd: string | null, rightStart: string, rightEnd: string | null) {
  const normalizedLeftEnd = leftEnd ?? '9999-12-31'
  const normalizedRightEnd = rightEnd ?? '9999-12-31'
  return leftStart <= normalizedRightEnd && rightStart <= normalizedLeftEnd
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>
  }

  return value as Record<string, unknown>
}

function readPriorityValue(metadata: unknown) {
  const record = asRecord(metadata)
  const raw = record.prioridad_operativa ?? record.priority ?? 100
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 100
}

function buildCoverageDaysFromRestDay(restDay: string | null | undefined) {
  const days = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM']
  const normalizedRestDay = String(restDay ?? '').trim().toUpperCase()
  const effective = days.filter((day) => day !== normalizedRestDay)
  return effective.join(',')
}

function sortMembersByPriority(
  members: AssignmentRotationValidationMember[],
  campaignRowsByPdvId: Map<string, CampanaPdvPreviewRow>,
  pdvById: Map<string, PdvLiteRow>
) {
  return [...members].sort((left, right) => {
    const leftPriority = readPriorityValue(campaignRowsByPdvId.get(left.pdvId)?.metadata)
    const rightPriority = readPriorityValue(campaignRowsByPdvId.get(right.pdvId)?.metadata)

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    return (pdvById.get(left.pdvId)?.clave_btl ?? left.pdvId).localeCompare(
      pdvById.get(right.pdvId)?.clave_btl ?? right.pdvId,
      'es-MX'
    )
  })
}

function buildCandidateRankingBucket(
  targetPdv: PdvLiteRow | null,
  targetSupervisorId: string | null,
  assignment: CampaignRotationAssignmentRow,
  pdvById: Map<string, PdvLiteRow>
): CampaignRotationSuggestedCandidate['rankingBucket'] {
  const currentPdv = pdvById.get(assignment.pdv_id) ?? null
  const sameChain = Boolean(targetPdv?.cadena_id && currentPdv?.cadena_id && targetPdv.cadena_id === currentPdv.cadena_id)
  const sameSupervisor = Boolean(targetSupervisorId && assignment.supervisor_empleado_id && targetSupervisorId === assignment.supervisor_empleado_id)

  if (sameChain && sameSupervisor) {
    return 'MISMA_CADENA_MISMO_SUPERVISOR'
  }

  if (sameChain) {
    return 'MISMA_CADENA_OTRO_SUPERVISOR'
  }

  return 'OTRA_CADENA'
}

function sortSuggestedCandidates(left: CampaignRotationSuggestedCandidate, right: CampaignRotationSuggestedCandidate) {
  const bucketWeight = {
    MISMA_CADENA_MISMO_SUPERVISOR: 0,
    MISMA_CADENA_OTRO_SUPERVISOR: 1,
    OTRA_CADENA: 2,
  } as const

  const leftWeight = bucketWeight[left.rankingBucket]
  const rightWeight = bucketWeight[right.rankingBucket]

  if (leftWeight !== rightWeight) {
    return leftWeight - rightWeight
  }

  if (left.issues.length !== right.issues.length) {
    return left.issues.length - right.issues.length
  }

  return left.empleado.localeCompare(right.empleado, 'es-MX')
}

function buildSuggestedCandidates(options: {
  accountId: string
  fechaInicio: string
  fechaFin: string
  rotationData: AssignmentRotationValidationData
  activeAssignments: CampaignRotationAssignmentRow[]
  employeesById: Map<string, EmployeeLiteRow>
  pdvById: Map<string, PdvLiteRow>
  primaryEmpleadoId: string | null
  impactedMember: AssignmentRotationValidationMember
  targetSupervisorId: string | null
}) {
  const effectiveAssignments = resolveAssignmentsForDate(options.activeAssignments, options.fechaInicio)
  const usedEmployees = new Set<string>()
  const suggested: CampaignRotationSuggestedCandidate[] = []
  const targetPdv = options.pdvById.get(options.impactedMember.pdvId) ?? null

  for (const assignment of effectiveAssignments) {
    if (!assignment.empleado_id || usedEmployees.has(assignment.empleado_id)) {
      continue
    }

    if (options.primaryEmpleadoId && assignment.empleado_id === options.primaryEmpleadoId) {
      continue
    }

    if (assignment.pdv_id === options.impactedMember.pdvId) {
      continue
    }

    usedEmployees.add(assignment.empleado_id)
    const employee = options.employeesById.get(assignment.empleado_id)
    const currentPdv = options.pdvById.get(assignment.pdv_id) ?? null
    const draft = {
      id: null,
      cuenta_cliente_id: options.accountId,
      empleado_id: assignment.empleado_id,
      pdv_id: options.impactedMember.pdvId,
      supervisor_empleado_id: options.targetSupervisorId ?? assignment.supervisor_empleado_id,
      tipo: 'COBERTURA',
      fecha_inicio: options.fechaInicio,
      fecha_fin: options.fechaFin,
      dias_laborales: buildCoverageDaysFromRestDay(assignment.dia_descanso),
      dia_descanso: assignment.dia_descanso,
      horario_referencia: assignment.horario_referencia,
    }
    const issues = evaluateRotationMasterImpact(draft, {
      rotationData: options.rotationData,
      previousPdvId: assignment.pdv_id,
    })

    suggested.push({
      empleadoId: assignment.empleado_id,
      empleado: employee?.nombre_completo ?? assignment.empleado_id,
      currentPdvId: currentPdv?.id ?? assignment.pdv_id,
      currentPdv: currentPdv?.nombre ?? null,
      currentPdvClave: currentPdv?.clave_btl ?? null,
      rankingBucket: buildCandidateRankingBucket(targetPdv, options.targetSupervisorId, assignment, options.pdvById),
      issues,
    })
  }

  return suggested.sort(sortSuggestedCandidates).slice(0, 6)
}

export async function buildCampaignRotationImpactPreview(
  supabase: TypedSupabaseClient,
  options: {
    campanaId: string
    accountId: string
    fechaInicio: string
    fechaFin: string
    campaignPdvs: CampanaPdvPreviewRow[]
  }
): Promise<CampaignRotationImpactPreview | null> {
  const pdvIds = Array.from(new Set(options.campaignPdvs.map((item) => item.pdv_id)))
  const rotationData = await loadAssignmentRotationValidationData(supabase, {
    accountId: options.accountId,
    pdvIds,
  })

  const impactedGroupCodes = Array.from(
    new Set(
      pdvIds
        .map((pdvId) => rotationData.rotationByPdvId[pdvId]?.grupoRotacionCodigo ?? null)
        .filter((item): item is string => Boolean(item))
    )
  )

  if (impactedGroupCodes.length === 0) {
    return null
  }

  const groupMembers = impactedGroupCodes.flatMap((code) => rotationData.groupsByCode[code] ?? [])
  const groupPdvIds = Array.from(new Set(groupMembers.map((item) => item.pdvId)))

  const [pdvsResult, groupAssignmentsResult, candidateAssignmentsResult] = await Promise.all([
    supabase
      .from('pdv')
      .select('id, clave_btl, nombre, cadena_id')
      .in('id', groupPdvIds),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, supervisor_empleado_id, cuenta_cliente_id, tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, estado_publicacion, created_at')
      .eq('cuenta_cliente_id', options.accountId)
      .eq('estado_publicacion', 'PUBLICADA')
      .in('pdv_id', groupPdvIds)
      .lte('fecha_inicio', options.fechaFin)
      .or(`fecha_fin.is.null,fecha_fin.gte.${options.fechaInicio}`),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, supervisor_empleado_id, cuenta_cliente_id, tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, estado_publicacion, created_at')
      .eq('cuenta_cliente_id', options.accountId)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', options.fechaFin)
      .or(`fecha_fin.is.null,fecha_fin.gte.${options.fechaInicio}`)
      .limit(2500),
  ])

  const infraError = pdvsResult.error?.message ?? groupAssignmentsResult.error?.message ?? candidateAssignmentsResult.error?.message
  if (infraError) {
    throw new Error(infraError)
  }

  const pdvs = (pdvsResult.data ?? []) as PdvLiteRow[]
  const groupAssignments = (groupAssignmentsResult.data ?? []) as CampaignRotationAssignmentRow[]
  const candidateAssignments = (candidateAssignmentsResult.data ?? []) as CampaignRotationAssignmentRow[]
  const employeeIds = Array.from(new Set(candidateAssignments.map((item) => item.empleado_id).filter(Boolean)))
  const { data: employeeRows, error: employeeError } = employeeIds.length === 0
    ? { data: [], error: null }
    : await supabase.from('empleado').select('id, nombre_completo').in('id', employeeIds)

  if (employeeError) {
    throw new Error(employeeError.message)
  }

  const pdvById = new Map(pdvs.map((item) => [item.id, item]))
  const employeesById = new Map(((employeeRows ?? []) as EmployeeLiteRow[]).map((item) => [item.id, item]))
  const campaignRowsByPdvId = new Map(options.campaignPdvs.map((item) => [item.pdv_id, item]))
  const effectiveGroupAssignments = resolveAssignmentsForDate(groupAssignments, options.fechaInicio)
  const effectiveByPdvId = new Map(effectiveGroupAssignments.map((item) => [item.pdv_id, item]))
  const nodes: CampaignRotationImpactNode[] = []

  for (const groupCode of impactedGroupCodes) {
    const members = rotationData.groupsByCode[groupCode] ?? []
    const campaignMembers = sortMembersByPriority(
      members.filter((member) => campaignRowsByPdvId.has(member.pdvId)),
      campaignRowsByPdvId,
      pdvById
    )

    if (campaignMembers.length === 0) {
      continue
    }

    const primaryMember = campaignMembers[0]
    const primaryAssignment = effectiveByPdvId.get(primaryMember.pdvId) ?? null
    const primaryEmployeeId = primaryAssignment?.empleado_id ?? campaignRowsByPdvId.get(primaryMember.pdvId)?.dc_empleado_id ?? null
    const primaryEmployee = primaryEmployeeId ? employeesById.get(primaryEmployeeId)?.nombre_completo ?? null : null
    const primaryPdv = pdvById.get(primaryMember.pdvId) ?? null

    for (const member of members) {
      if (member.pdvId === primaryMember.pdvId) {
        continue
      }

      const existingAssignment = effectiveByPdvId.get(member.pdvId) ?? null
      const isActuallyDisplaced = !existingAssignment || Boolean(primaryEmployeeId && existingAssignment.empleado_id === primaryEmployeeId)
      if (!isActuallyDisplaced) {
        continue
      }

      const impactedPdv = pdvById.get(member.pdvId) ?? null
      const suggestedCandidates = buildSuggestedCandidates({
        accountId: options.accountId,
        fechaInicio: options.fechaInicio,
        fechaFin: options.fechaFin,
        rotationData,
        activeAssignments: candidateAssignments,
        employeesById,
        pdvById,
        primaryEmpleadoId: primaryEmployeeId,
        impactedMember: member,
        targetSupervisorId: existingAssignment?.supervisor_empleado_id ?? primaryAssignment?.supervisor_empleado_id ?? null,
      })

      nodes.push({
        nodeId: member.pdvId,
        grupoRotacionCodigo: groupCode,
        primaryPdvId: member.pdvId === primaryMember.pdvId ? primaryMember.pdvId : primaryMember.pdvId,
        primaryPdv: primaryPdv?.nombre ?? primaryMember.pdvId,
        primaryPdvClave: primaryPdv?.clave_btl ?? primaryMember.pdvId,
        primaryEmpleadoId: primaryEmployeeId,
        primaryEmpleado: primaryEmployee,
        impactedPdvId: member.pdvId,
        impactedPdv: impactedPdv?.nombre ?? member.pdvId,
        impactedPdvClave: impactedPdv?.clave_btl ?? member.pdvId,
        impactedCampanaPdvId: campaignRowsByPdvId.get(member.pdvId)?.id ?? null,
        reservedEmployeeId: primaryEmployeeId,
        reservedEmployee: primaryEmployee,
        suggestedCandidates,
      })
    }
  }

  if (nodes.length === 0) {
    return null
  }

  return {
    campanaId: options.campanaId,
    accountId: options.accountId,
    fechaInicio: options.fechaInicio,
    fechaFin: options.fechaFin,
    totalGroups: impactedGroupCodes.length,
    totalNodes: nodes.length,
    nodes,
  }
}

export function parseCampaignRotationDecisions(
  formData: FormData,
  preview: CampaignRotationImpactPreview
): CampaignRotationResolvedDecision[] {
  return preview.nodes.map((node) => {
    const decisionRaw = String(formData.get(`rotation_decision__${node.nodeId}`) ?? '').trim().toUpperCase()
    const empleadoId = String(formData.get(`rotation_employee__${node.nodeId}`) ?? '').trim() || null
    const decision = decisionRaw === 'ASIGNAR' ? 'ASIGNAR' : 'RESERVAR'

    return {
      nodeId: node.nodeId,
      decision,
      empleadoId,
      node,
    }
  })
}

function applySelectedDecisionsToPreview(
  preview: CampaignRotationImpactPreview,
  decisions: CampaignRotationResolvedDecision[]
): CampaignRotationImpactPreview {
  const decisionByNodeId = new Map(decisions.map((item) => [item.nodeId, item]))

  return {
    ...preview,
    nodes: preview.nodes.map((node) => {
      const decision = decisionByNodeId.get(node.nodeId)
      return {
        ...node,
        selectedDecision: decision?.decision ?? node.selectedDecision ?? null,
        selectedEmployeeId: decision?.empleadoId ?? node.selectedEmployeeId ?? null,
      }
    }),
  }
}

export async function expandCampaignRotationCascadePreview(
  supabase: TypedSupabaseClient,
  options: {
    accountId: string
    fechaInicio: string
    fechaFin: string
    preview: CampaignRotationImpactPreview
    decisions: CampaignRotationResolvedDecision[]
  }
): Promise<CampaignRotationImpactPreview> {
  const selectedPreview = applySelectedDecisionsToPreview(options.preview, options.decisions)
  const existingNodeIds = new Set(selectedPreview.nodes.map((node) => node.nodeId))

  const sourcePdvIds = Array.from(
    new Set(
      options.decisions
        .filter((decision) => decision.decision === 'ASIGNAR' && Boolean(decision.empleadoId))
        .flatMap((decision) => {
          const selectedCandidate = decision.node.suggestedCandidates.find((item) => item.empleadoId === decision.empleadoId) ?? null
          if (!selectedCandidate || selectedCandidate.issues.length === 0 || !selectedCandidate.currentPdvId) {
            return []
          }

          if (existingNodeIds.has(selectedCandidate.currentPdvId)) {
            return []
          }

          return [selectedCandidate.currentPdvId]
        })
    )
  )

  if (sourcePdvIds.length === 0) {
    return selectedPreview
  }

  const rotationData = await loadAssignmentRotationValidationData(supabase, {
    accountId: options.accountId,
    pdvIds: sourcePdvIds,
  })
  const rotativeSourcePdvIds = sourcePdvIds.filter((pdvId) => Boolean(rotationData.rotationByPdvId[pdvId]?.grupoRotacionCodigo))

  if (rotativeSourcePdvIds.length === 0) {
    return selectedPreview
  }

  const [pdvsResult, activeAssignmentsResult, employeesResult] = await Promise.all([
    supabase.from('pdv').select('id, clave_btl, nombre, cadena_id').in('id', rotativeSourcePdvIds),
    supabase
      .from('asignacion')
      .select('id, empleado_id, pdv_id, supervisor_empleado_id, cuenta_cliente_id, tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, estado_publicacion, created_at')
      .eq('cuenta_cliente_id', options.accountId)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', options.fechaFin)
      .or(`fecha_fin.is.null,fecha_fin.gte.${options.fechaInicio}`)
      .limit(2500),
    supabase.from('empleado').select('id, nombre_completo').limit(2500),
  ])

  const infraError = pdvsResult.error?.message ?? activeAssignmentsResult.error?.message ?? employeesResult.error?.message
  if (infraError) {
    throw new Error(infraError)
  }

  const pdvById = new Map(((pdvsResult.data ?? []) as PdvLiteRow[]).map((item) => [item.id, item]))
  const activeAssignments = (activeAssignmentsResult.data ?? []) as CampaignRotationAssignmentRow[]
  const employeesById = new Map(((employeesResult.data ?? []) as EmployeeLiteRow[]).map((item) => [item.id, item]))
  const extraNodes: CampaignRotationImpactNode[] = []

  for (const decision of options.decisions) {
    if (decision.decision !== 'ASIGNAR' || !decision.empleadoId) {
      continue
    }

    const selectedCandidate = decision.node.suggestedCandidates.find((item) => item.empleadoId === decision.empleadoId) ?? null
    if (!selectedCandidate || selectedCandidate.issues.length === 0 || !selectedCandidate.currentPdvId) {
      continue
    }

    if (existingNodeIds.has(selectedCandidate.currentPdvId)) {
      continue
    }

    const sourceMember = rotationData.rotationByPdvId[selectedCandidate.currentPdvId]
    if (!sourceMember?.grupoRotacionCodigo) {
      continue
    }

    const sourceAssignment = resolveAssignmentsForDate(
      activeAssignments.filter((item) => item.empleado_id === decision.empleadoId),
      options.fechaInicio
    )[0] ?? null

    const sourcePdv = pdvById.get(selectedCandidate.currentPdvId) ?? null
    const suggestedCandidates = buildSuggestedCandidates({
      accountId: options.accountId,
      fechaInicio: options.fechaInicio,
      fechaFin: options.fechaFin,
      rotationData,
      activeAssignments,
      employeesById,
      pdvById,
      primaryEmpleadoId: decision.empleadoId,
      impactedMember: sourceMember,
      targetSupervisorId: sourceAssignment?.supervisor_empleado_id ?? null,
    })

    const extraNode = {
      nodeId: sourceMember.pdvId,
      grupoRotacionCodigo: sourceMember.grupoRotacionCodigo,
      primaryPdvId: decision.node.impactedPdvId,
      primaryPdv: decision.node.impactedPdv,
      primaryPdvClave: decision.node.impactedPdvClave,
      primaryEmpleadoId: decision.empleadoId,
      primaryEmpleado: selectedCandidate.empleado,
      impactedPdvId: sourceMember.pdvId,
      impactedPdv: sourcePdv?.nombre ?? selectedCandidate.currentPdv ?? sourceMember.pdvId,
      impactedPdvClave: sourcePdv?.clave_btl ?? selectedCandidate.currentPdvClave ?? sourceMember.pdvId,
      impactedCampanaPdvId: null,
      reservedEmployeeId: decision.empleadoId,
      reservedEmployee: selectedCandidate.empleado,
      suggestedCandidates,
      selectedDecision: null,
      selectedEmployeeId: null,
    };

    extraNodes.push(extraNode)
    existingNodeIds.add(extraNode.nodeId)
  }

  if (extraNodes.length === 0) {
    return selectedPreview
  }

  const groupCodes = new Set(selectedPreview.nodes.map((node) => node.grupoRotacionCodigo))
  for (const node of extraNodes) {
    groupCodes.add(node.grupoRotacionCodigo)
  }

  return {
    ...selectedPreview,
    totalGroups: groupCodes.size,
    totalNodes: selectedPreview.nodes.length + extraNodes.length,
    nodes: [...selectedPreview.nodes, ...extraNodes],
  }
}

export async function applyCampaignRotationDecisions(
  supabase: TypedSupabaseClient,
  options: {
    actorUsuarioId: string
    campanaId: string
    campanaNombre: string
    accountId: string
    fechaInicio: string
    fechaFin: string
    decisions: CampaignRotationResolvedDecision[]
  }
) {
  const assignDecisions = options.decisions.filter((item) => item.decision === 'ASIGNAR')
  const assigneeIds = Array.from(new Set(assignDecisions.map((item) => item.empleadoId).filter((item): item is string => Boolean(item))))
  const impactedPdvIds = Array.from(new Set(options.decisions.map((item) => item.node.impactedPdvId)))

  const [activeAssignmentsResult, pdvRowsResult] = await Promise.all([
    assigneeIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('asignacion')
          .select('id, empleado_id, pdv_id, supervisor_empleado_id, cuenta_cliente_id, tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia, fecha_inicio, fecha_fin, naturaleza, retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad, motivo_movimiento, observaciones, estado_publicacion, created_at')
          .eq('cuenta_cliente_id', options.accountId)
          .eq('estado_publicacion', 'PUBLICADA')
          .in('empleado_id', assigneeIds)
          .lte('fecha_inicio', options.fechaFin)
          .or(`fecha_fin.is.null,fecha_fin.gte.${options.fechaInicio}`),
    supabase.from('pdv').select('id, nombre, clave_btl').in('id', impactedPdvIds),
  ])

  const infraError = activeAssignmentsResult.error?.message ?? pdvRowsResult.error?.message
  if (infraError) {
    throw new Error(infraError)
  }

  const rotationData = await loadAssignmentRotationValidationData(supabase, {
    accountId: options.accountId,
    pdvIds: impactedPdvIds,
  })
  const activeAssignments = (activeAssignmentsResult.data ?? []) as CampaignRotationAssignmentRow[]
  const pdvById = new Map(((pdvRowsResult.data ?? []) as Array<{ id: string; nombre: string; clave_btl: string }>).map((item) => [item.id, item]))
  const activeAssignmentsByEmployee = activeAssignments.reduce<Record<string, CampaignRotationAssignmentRow[]>>((acc, item) => {
    const current = acc[item.empleado_id] ?? []
    current.push(item)
    acc[item.empleado_id] = current
    return acc
  }, {})

  for (const decision of options.decisions) {
    if (decision.decision === 'RESERVAR') {
      const { error } = await supabase
        .from('pdv_cobertura_operativa')
        .upsert({
          cuenta_cliente_id: options.accountId,
          pdv_id: decision.node.impactedPdvId,
          estado_operativo: 'RESERVADO_PENDIENTE_ACCESO',
          motivo_operativo: 'MOVIMIENTO_TEMPORAL',
          empleado_reservado_id: decision.node.reservedEmployeeId,
          apartado_por_usuario_id: options.actorUsuarioId,
          observaciones: `Reserva automatica por campaña ${options.campanaNombre}.`,
          metadata: {
            source_action: 'CAMPANA_ROTATIVA_RESERVA',
            campana_id: options.campanaId,
            primary_pdv_id: decision.node.primaryPdvId,
          },
        }, { onConflict: 'cuenta_cliente_id,pdv_id' })

      if (error) {
        throw new Error(error.message)
      }

      if (decision.node.impactedCampanaPdvId) {
        const { error: updateCampaignPdvError } = await supabase
          .from('campana_pdv')
          .update({
            dc_empleado_id: null,
            updated_by_usuario_id: options.actorUsuarioId,
            metadata: {
              rotation_decision: 'RESERVAR',
              primary_pdv_id: decision.node.primaryPdvId,
            },
          })
          .eq('id', decision.node.impactedCampanaPdvId)

        if (updateCampaignPdvError) {
          throw new Error(updateCampaignPdvError.message)
        }
      }

      continue
    }

    if (!decision.empleadoId) {
      throw new Error(`Debes seleccionar una DC para cubrir ${decision.node.impactedPdvClave}.`)
    }

    const employeeAssignments = activeAssignmentsByEmployee[decision.empleadoId] ?? []
    const effectiveAssignment = resolveAssignmentsForDate(employeeAssignments, options.fechaInicio)[0] ?? null

    if (!effectiveAssignment) {
      throw new Error(`No encontramos una asignacion activa para la DC seleccionada en ${decision.node.impactedPdvClave}.`)
    }

    const draft = {
      cuenta_cliente_id: options.accountId,
      empleado_id: decision.empleadoId,
      pdv_id: decision.node.impactedPdvId,
      supervisor_empleado_id: effectiveAssignment.supervisor_empleado_id,
      tipo: 'COBERTURA',
      factor_tiempo: 1,
      dias_laborales: buildCoverageDaysFromRestDay(effectiveAssignment.dia_descanso),
      dia_descanso: effectiveAssignment.dia_descanso,
      horario_referencia: effectiveAssignment.horario_referencia,
      fecha_inicio: options.fechaInicio,
      fecha_fin: options.fechaFin,
      naturaleza: 'COBERTURA_TEMPORAL',
      retorna_a_base: true,
      asignacion_base_id: effectiveAssignment.asignacion_base_id ?? effectiveAssignment.id,
      asignacion_origen_id: null,
      prioridad: 220,
      motivo_movimiento: 'CAMPANA_ROTATIVA',
      observaciones: `[AUTO CAMPANA ${options.campanaNombre}] Cobertura temporal para ${decision.node.impactedPdvClave}.`,
      id: null,
    } satisfies AssignmentEngineDraft

    const issues = evaluateRotationMasterImpact(draft, {
      rotationData,
      previousPdvId: effectiveAssignment.pdv_id,
    })

    if (issues.length > 0) {
      throw new Error(`La cobertura propuesta para ${decision.node.impactedPdvClave} rompe otra rotacion: ${issues.map((item) => item.label).join(', ')}.`)
    }

    const enginePlan = buildAssignmentTransitionPlan(draft, employeeAssignments)

    for (const update of enginePlan.updates) {
      const { error } = await supabase
        .from('asignacion')
        .update({
          ...update.patch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id)

      if (error) {
        throw new Error(error.message)
      }
    }

    const insertPayload = {
      cuenta_cliente_id: options.accountId,
      empleado_id: decision.empleadoId,
      pdv_id: decision.node.impactedPdvId,
      supervisor_empleado_id: effectiveAssignment.supervisor_empleado_id,
      tipo: 'COBERTURA',
      factor_tiempo: 1,
      dias_laborales: buildCoverageDaysFromRestDay(effectiveAssignment.dia_descanso),
      dia_descanso: effectiveAssignment.dia_descanso,
      horario_referencia: effectiveAssignment.horario_referencia,
      fecha_inicio: options.fechaInicio,
      fecha_fin: options.fechaFin,
      naturaleza: 'COBERTURA_TEMPORAL',
      retorna_a_base: true,
      asignacion_base_id: effectiveAssignment.asignacion_base_id ?? effectiveAssignment.id,
      asignacion_origen_id: null,
      prioridad: 220,
      motivo_movimiento: 'CAMPANA_ROTATIVA',
      observaciones: `[AUTO CAMPANA ${options.campanaNombre}] Cobertura temporal para ${decision.node.impactedPdvClave}.`,
      generado_automaticamente: true,
      estado_publicacion: 'PUBLICADA',
      updated_at: new Date().toISOString(),
    }

    const { error: insertError } = await supabase.from('asignacion').insert(insertPayload)
    if (insertError) {
      throw new Error(insertError.message)
    }

    if (enginePlan.continuationInsert) {
      const { error: continuationError } = await supabase
        .from('asignacion')
        .insert({
          ...enginePlan.continuationInsert,
          updated_at: new Date().toISOString(),
        })

      if (continuationError) {
        throw new Error(continuationError.message)
      }
    }

    const { error: clearReservationError } = await supabase
      .from('pdv_cobertura_operativa')
      .upsert({
        cuenta_cliente_id: options.accountId,
        pdv_id: decision.node.impactedPdvId,
        estado_operativo: 'CUBIERTO',
        motivo_operativo: null,
        empleado_reservado_id: decision.empleadoId,
        apartado_por_usuario_id: options.actorUsuarioId,
        observaciones: `Cobertura temporal generada por campaña ${options.campanaNombre}.`,
        metadata: {
          source_action: 'CAMPANA_ROTATIVA_COBERTURA',
          campana_id: options.campanaId,
          primary_pdv_id: decision.node.primaryPdvId,
        },
      }, { onConflict: 'cuenta_cliente_id,pdv_id' })

    if (clearReservationError) {
      throw new Error(clearReservationError.message)
    }

    if (decision.node.impactedCampanaPdvId) {
      const { error: updateCampaignPdvError } = await supabase
        .from('campana_pdv')
        .update({
          dc_empleado_id: decision.empleadoId,
          updated_by_usuario_id: options.actorUsuarioId,
          metadata: {
            rotation_decision: 'ASIGNAR',
            rotation_assignee_id: decision.empleadoId,
            primary_pdv_id: decision.node.primaryPdvId,
          },
        })
        .eq('id', decision.node.impactedCampanaPdvId)

      if (updateCampaignPdvError) {
        throw new Error(updateCampaignPdvError.message)
      }
    }
  }
}
