export type ManagedFlowLike = {
  id: string
  tipo_flujo: 'PRIMER_INGRESO' | 'RESET_PASSWORD' | 'CHANGE_EMAIL'
  estado:
    | 'AWAITING_EMAIL_CONFIRMATION'
    | 'EMAIL_CONFIRMED_PASSWORD_PENDING'
    | 'RESET_LINK_SENT'
    | 'RESET_PASSWORD_PENDING'
    | 'RELOGIN_REQUIRED'
    | 'COMPLETED'
    | 'EXPIRED'
    | 'CANCELLED'
  email_confirmed_at: string | null
}

export function canResumeManagedFlow(flow: ManagedFlowLike | null | undefined) {
  if (!flow) {
    return false
  }

  if (flow.tipo_flujo === 'RESET_PASSWORD') {
    return flow.estado === 'RESET_PASSWORD_PENDING' && Boolean(flow.email_confirmed_at)
  }

  return flow.estado === 'EMAIL_CONFIRMED_PASSWORD_PENDING' && Boolean(flow.email_confirmed_at)
}

export function buildManagedFlowContinuationRoute(flow: Pick<ManagedFlowLike, 'id' | 'tipo_flujo'>) {
  const mode = flow.tipo_flujo === 'RESET_PASSWORD' ? 'reset-password' : 'credential-transition'
  return `/update-password?flow_id=${encodeURIComponent(flow.id)}&mode=${mode}`
}
