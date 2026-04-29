import 'server-only'
import { Puesto } from '@/types/database'

export type WorkflowNotificationType =
  // Ruta Semanal
  | 'ruta_enviada_coordinacion'
  | 'ruta_aprobada'
  | 'ruta_rechazada'
  | 'ruta_cambio_solicitado'
  | 'ruta_cambio_aprobado'
  | 'ruta_cambio_rechazado'
  // Agenda Operativa
  | 'agenda_evento_creado'
  | 'agenda_evento_aprobado'
  | 'agenda_evento_rechazado'
  // Solicitudes
  | 'solicitud_creada'
  | 'solicitud_aprobada'
  | 'solicitud_rechazada'
  // Gastos
  | 'gasto_reportado'
  | 'gasto_aprobado'
  | 'gasto_rechazado'
  // Nomina
  | 'nomina_publicada'
  | 'recibo_aprobado'
  | 'recibo_rechazado'

export interface WorkflowNotificationRecipient {
  email: string
  name: string
  empleadoId?: string
  cuentaClienteId?: string | null
  puesto?: Puesto
}

export interface WorkflowNotificationEvent<T = Record<string, unknown>> {
  type: WorkflowNotificationType
  recipients: WorkflowNotificationRecipient[]
  data: T
  subject: string
  body: string
  ctaLabel?: string
  ctaUrl?: string | null
}
