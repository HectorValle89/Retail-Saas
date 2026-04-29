import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  clearFlowLinkTokenMetadata,
  findAuthFlowById,
  issueActivationTicket,
  markFlowExpired,
  normalizeEmail,
  updateAuthFlow,
  validateFlowLinkToken,
} from '@/lib/auth/accessFlow'
import {
  buildManagedFlowContinuationRoute,
  canResumeManagedFlow,
} from '@/lib/auth/flowRouting'
import { createClient } from '@/lib/supabase/server'

function redirectTo(request: NextRequest, pathname: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url))
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const flowId = searchParams.get('flow_id')
  const flowToken = searchParams.get('flow_token')

  if (flowId && flowToken) {
    const flow = await findAuthFlowById(flowId)

    if (!flow) {
      return redirectTo(
        request,
        `/enlace-caducado?flow_id=${encodeURIComponent(flowId)}`
      )
    }

    const validation = await validateFlowLinkToken(flow, flowToken)

    if (!validation.valid) {
      if (canResumeManagedFlow(flow)) {
        return redirectTo(request, buildManagedFlowContinuationRoute(flow))
      }

      if (validation.expired) {
        await markFlowExpired(flow.id)
      }

      return redirectTo(request, `/enlace-caducado?flow_id=${encodeURIComponent(flow.id)}`)
    }

    if (flow.tipo_flujo === 'RESET_PASSWORD') {
      const updatedFlow = await updateAuthFlow(flow.id, {
        estado: 'RESET_PASSWORD_PENDING',
        email_confirmed_at: new Date().toISOString(),
        metadata: clearFlowLinkTokenMetadata(flow),
      })

      await issueActivationTicket(updatedFlow)
      return redirectTo(request, `/update-password?flow_id=${encodeURIComponent(flow.id)}&mode=reset-password`)
    }

    const updatedFlow = await updateAuthFlow(flow.id, {
      estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
      correo_confirmado: normalizeEmail(flow.correo_confirmado ?? flow.correo_pendiente),
      email_confirmed_at: new Date().toISOString(),
      metadata: clearFlowLinkTokenMetadata(flow),
    })

    await issueActivationTicket(updatedFlow)
    return redirectTo(
      request,
      `/update-password?flow_id=${encodeURIComponent(flow.id)}&mode=credential-transition`
    )
  }

  if (!tokenHash || !type) {
    return redirectTo(
      request,
      '/login?error=' + encodeURIComponent('No encontramos un token valido para confirmar tu acceso.')
    )
  }

  const supabase = await createClient()
  const flow = flowId ? await findAuthFlowById(flowId) : null
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  })

  if (error) {
    if (flow) {
      if (canResumeManagedFlow(flow)) {
        return redirectTo(request, buildManagedFlowContinuationRoute(flow))
      }

      await markFlowExpired(flow.id)
      return redirectTo(request, `/enlace-caducado?flow_id=${encodeURIComponent(flow.id)}`)
    }

    return redirectTo(
      request,
      '/login?error=' + encodeURIComponent('No fue posible verificar tu correo o el enlace ya expiro.')
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!flow) {
    return redirectTo(request, '/update-password')
  }

  if (flow.tipo_flujo === 'RESET_PASSWORD') {
    const updatedFlow = await updateAuthFlow(flow.id, {
      estado: 'RESET_PASSWORD_PENDING',
      email_confirmed_at: new Date().toISOString(),
    })

    await issueActivationTicket(updatedFlow)
    return redirectTo(request, `/update-password?flow_id=${encodeURIComponent(flow.id)}&mode=reset-password`)
  }

  const correoConfirmado = normalizeEmail(user?.email) ?? normalizeEmail(flow.correo_pendiente)

  const updatedFlow = await updateAuthFlow(flow.id, {
    estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
    correo_confirmado: correoConfirmado,
    email_confirmed_at: new Date().toISOString(),
  })

  await issueActivationTicket(updatedFlow)
  return redirectTo(
    request,
    `/update-password?flow_id=${encodeURIComponent(flow.id)}&mode=credential-transition`
  )
}
