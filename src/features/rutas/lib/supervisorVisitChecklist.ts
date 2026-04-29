export const SUPERVISOR_CHECKLIST_ITEMS = [
  { key: 'registro_supervisor_pdv', label: 'Realice mi registro en el punto de venta' },
  { key: 'acceso_gerente_solicitado', label: 'Solicite acceso con gerente o encargado' },
  {
    key: 'feedback_dc_solicitada',
    label: 'Solicite retroalimentacion directa de la DC al gerente o encargado',
    commentKey: 'feedback_dc_solicitada',
    commentLabel: 'Que dijo el gerente o encargado',
    commentInputType: 'textarea',
  },
  { key: 'dc_no_se_encuentra_en_pdv', label: 'La DC no se encuentra en su PDV' },
  { key: 'saludo_personalizado_dc', label: 'Salude a la DC por su nombre' },
  {
    key: 'horario_dc_registrado',
    label: 'Registre el horario de entrada de la DC',
    commentKey: 'horario_entrada_dc',
    commentLabel: 'Hora de entrada de la DC',
    commentInputType: 'time',
  },
  {
    key: 'observaciones_operativas_registradas',
    label: 'Registre uniforme, faltantes, competencia y hallazgos',
    commentKey: 'observaciones_operativas_registradas',
    commentLabel: 'Que encontre',
    commentInputType: 'textarea',
  },
  {
    key: 'retroalimentacion_venta_entregada',
    label: 'Brinde retroalimentacion y recomendaciones de venta',
    commentKey: 'retroalimentacion_venta_entregada',
    commentLabel: 'Que le dije a la dermoconsejera',
    commentInputType: 'textarea',
  },
  {
    key: 'proceso_venta_verificado',
    label: 'Observe y verifique el proceso de venta de la DC',
    commentKey: 'proceso_venta_verificado',
    commentLabel: 'Puntos buenos y puntos malos del proceso de venta',
    commentInputType: 'textarea',
  },
  {
    key: 'pronunciacion_reforzada',
    label: 'Refuerce la pronunciacion correcta de productos',
    commentKey: 'pronunciacion_reforzada',
    commentLabel: 'Productos reforzados',
    commentInputType: 'textarea',
  },
  {
    key: 'feedback_dc_recibida',
    label: 'Escuche la retroalimentacion de la DC',
    commentKey: 'feedback_dc_recibida',
    commentLabel: 'Que dijo la dermoconsejera',
    commentInputType: 'textarea',
  },
  { key: 'cierre_profesional', label: 'Cierre la visita con despedida profesional' },
] as const

export type SupervisorChecklistKey = (typeof SUPERVISOR_CHECKLIST_ITEMS)[number]['key']

const ABSENT_DC_CHECKLIST_KEY: SupervisorChecklistKey = 'dc_no_se_encuentra_en_pdv'

export const SUPERVISOR_DIRECT_DC_INTERACTION_KEYS = [
  'saludo_personalizado_dc',
  'horario_dc_registrado',
  'retroalimentacion_venta_entregada',
  'proceso_venta_verificado',
  'pronunciacion_reforzada',
  'feedback_dc_recibida',
  'cierre_profesional',
] as const satisfies readonly SupervisorChecklistKey[]

export interface SupervisorChecklistCompletion {
  checkedCount: number
  totalCount: number
  percentage: number
  excludedKeys: SupervisorChecklistKey[]
}

export function calculateSupervisorChecklistCompletion(
  checklist: Record<string, boolean> | null | undefined
): SupervisorChecklistCompletion {
  const normalizedChecklist = checklist ?? {}
  const excludedKeys = new Set<SupervisorChecklistKey>()
  const dcAbsent = normalizedChecklist[ABSENT_DC_CHECKLIST_KEY] === true

  if (dcAbsent) {
    for (const key of SUPERVISOR_DIRECT_DC_INTERACTION_KEYS) {
      excludedKeys.add(key)
    }
  } else {
    excludedKeys.add(ABSENT_DC_CHECKLIST_KEY)
  }

  const applicableItems = SUPERVISOR_CHECKLIST_ITEMS.filter((item) => !excludedKeys.has(item.key))
  const checkedCount = applicableItems.filter((item) => normalizedChecklist[item.key] === true).length
  const totalCount = applicableItems.length

  return {
    checkedCount,
    totalCount,
    percentage: totalCount === 0 ? 0 : Math.round((checkedCount / totalCount) * 100),
    excludedKeys: Array.from(excludedKeys),
  }
}

export function isSupervisorChecklistItemNotApplicable(
  key: SupervisorChecklistKey,
  checklist: Record<string, boolean> | null | undefined
) {
  return calculateSupervisorChecklistCompletion(checklist).excludedKeys.includes(key)
}
