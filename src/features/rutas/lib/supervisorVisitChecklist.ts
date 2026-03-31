export const SUPERVISOR_CHECKLIST_ITEMS = [
  { key: 'registro_supervisor_pdv', label: 'Realice mi registro en el PDV' },
  { key: 'acceso_gerente_solicitado', label: 'Solicite acceso con gerente o encargado' },
  { key: 'feedback_dc_solicitada', label: 'Solicite retroalimentacion directa de la DC' },
  { key: 'saludo_personalizado_dc', label: 'Salude a la DC por su nombre' },
  { key: 'selfie_con_dc', label: 'Tome selfie con la DC' },
  { key: 'horario_dc_registrado', label: 'Registre el horario de la DC' },
  { key: 'feedback_gerente_registrado', label: 'Registre feedback del gerente o encargado' },
  { key: 'observaciones_operativas_registradas', label: 'Registre uniforme, faltantes, competencia y hallazgos' },
  { key: 'retroalimentacion_venta_entregada', label: 'Brinde retroalimentacion y recomendaciones de venta' },
  { key: 'proceso_venta_verificado', label: 'Observe y verifique el proceso de venta de la DC' },
  { key: 'pronunciacion_reforzada', label: 'Refuerce la pronunciacion correcta de productos' },
  { key: 'feedback_dc_recibida', label: 'Escuche la retroalimentacion de la DC' },
  { key: 'cierre_profesional', label: 'Cierre la visita con despedida profesional' },
] as const

export type SupervisorChecklistKey = (typeof SUPERVISOR_CHECKLIST_ITEMS)[number]['key']
