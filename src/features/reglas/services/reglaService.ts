import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReglaNegocio } from '@/types/database'
import {
  APPROVAL_FLOW_RULE_CODES,
  SCHEDULE_PRIORITY_RULE_CODE,
  SUPERVISOR_INHERITANCE_RULE_CODE,
  buildApprovalFlowDefinitions,
  readSchedulePriorityRule,
  readSupervisorInheritanceRule,
  type ApprovalFlowDefinition,
  type BusinessRuleRow,
  type SchedulePriorityRuleDefinition,
  type SupervisorInheritanceRuleDefinition,
} from '../lib/businessRules'

export interface ReglasResumen {
  total: number
  activas: number
  errores: number
  alertas: number
  approvalFlows: number
  operativas: number
}

export interface ReglaInventarioItem {
  id: string
  code: string
  module: string
  description: string
  severity: ReglaNegocio['severidad']
  priority: number
  active: boolean
  conditionJson: string
  actionJson: string
}

export interface ReglasPanelData {
  resumen: ReglasResumen
  supervisorRule: SupervisorInheritanceRuleDefinition
  scheduleRule: SchedulePriorityRuleDefinition
  approvalFlows: ApprovalFlowDefinition[]
  inventory: ReglaInventarioItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

export async function obtenerPanelReglas(
  supabase: SupabaseClient
): Promise<ReglasPanelData> {
  const { data, error } = await supabase
    .from('regla_negocio')
    .select('id, codigo, modulo, descripcion, severidad, prioridad, condicion, accion, activa')
    .order('prioridad', { ascending: true })
    .order('codigo', { ascending: true })

  const rows = (data ?? []) as BusinessRuleRow[]
  const supervisorRule = readSupervisorInheritanceRule(
    rows.find((item) => item.codigo === SUPERVISOR_INHERITANCE_RULE_CODE) ?? null
  )
  const scheduleRule = readSchedulePriorityRule(
    rows.find((item) => item.codigo === SCHEDULE_PRIORITY_RULE_CODE) ?? null
  )
  const approvalFlows = buildApprovalFlowDefinitions(rows)
  const inventory = rows.map((item) => ({
    id: item.id,
    code: item.codigo,
    module: item.modulo,
    description: item.descripcion,
    severity: item.severidad,
    priority: item.prioridad,
    active: item.activa,
    conditionJson: stringifyJson(item.condicion),
    actionJson: stringifyJson(item.accion),
  }))

  return {
    resumen: {
      total: rows.length,
      activas: rows.filter((item) => item.activa).length,
      errores: rows.filter((item) => item.severidad === 'ERROR').length,
      alertas: rows.filter((item) => item.severidad === 'ALERTA').length,
      approvalFlows: approvalFlows.length,
      operativas: [
        SUPERVISOR_INHERITANCE_RULE_CODE,
        SCHEDULE_PRIORITY_RULE_CODE,
        ...Object.values(APPROVAL_FLOW_RULE_CODES),
      ].filter((code) => rows.some((item) => item.codigo === code)).length,
    },
    supervisorRule,
    scheduleRule,
    approvalFlows,
    inventory,
    infraestructuraLista: !error,
    mensajeInfraestructura: error?.message,
  }
}
