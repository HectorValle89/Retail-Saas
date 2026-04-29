import 'server-only'
import { TypedSupabaseClient } from '@/lib/supabase/server'
import { sendWorkflowTransitionEmail } from '../workflowTransitionEmail'
import { 
  getTodosEmpleadosActivos, 
  getEmpleadoEmail,
  getCoordinadoresYAdmin
} from './recipientLookup'

import { readAppUrl } from '@/lib/runtime/env'

const getAppUrl = () => readAppUrl()

export async function notificarNominaPublicada(
  supabase: TypedSupabaseClient,
  params: {
    cuentaClienteId: string
    periodo: string
    inicio: string
    fin: string
  }
) {
  const recipients = await getTodosEmpleadosActivos(supabase, params.cuentaClienteId)
  if (recipients.length === 0) return

  await sendWorkflowTransitionEmail({
    recipients,
    subject: `Tu recibo de nómina del ${params.periodo} está disponible`,
    body: `Tu recibo de nómina del periodo ${params.inicio} al ${params.fin} ya está disponible para consulta.`,
    ctaLabel: 'Ver mi nómina',
    ctaUrl: `${getAppUrl()}/mi-nomina`
  })
}

export async function notificarReciboAccionEmpleado(
  supabase: TypedSupabaseClient,
  params: {
    empleadoId: string
    periodo: string
    aprobado: boolean
    nota?: string
    cuentaClienteId: string
  }
) {
  const recipients = await getCoordinadoresYAdmin(supabase, params.cuentaClienteId)
  if (recipients.length === 0) return

  const subject = params.aprobado 
    ? 'Un colaborador validó su recibo de nómina' 
    : 'Un colaborador rechazó su recibo de nómina'
  
  const body = params.aprobado
    ? `El colaborador con ID ${params.empleadoId} ha validado su recibo del periodo ${params.periodo}.`
    : `El colaborador con ID ${params.empleadoId} ha rechazado su recibo del periodo ${params.periodo}. ${params.nota ? `Observación: ${params.nota}` : ''}`

  await sendWorkflowTransitionEmail({
    recipients,
    subject,
    body,
    ctaLabel: 'Ir a nómina',
    ctaUrl: `${getAppUrl()}/nomina`
  })
}
