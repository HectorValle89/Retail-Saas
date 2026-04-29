import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  clearFlowLinkTokenMetadataMock,
  createClientMock,
  findAuthFlowByIdMock,
  issueActivationTicketMock,
  markFlowExpiredMock,
  normalizeEmailMock,
  updateAuthFlowMock,
  validateFlowLinkTokenMock,
  buildManagedFlowContinuationRouteMock,
  canResumeManagedFlowMock,
} = vi.hoisted(() => ({
  clearFlowLinkTokenMetadataMock: vi.fn((flow) => flow.metadata ?? {}),
  createClientMock: vi.fn(),
  findAuthFlowByIdMock: vi.fn(),
  issueActivationTicketMock: vi.fn(),
  markFlowExpiredMock: vi.fn(),
  normalizeEmailMock: vi.fn((value: string | null | undefined) => {
    const normalized = value?.trim().toLowerCase() ?? ''
    return normalized || null
  }),
  updateAuthFlowMock: vi.fn(),
  validateFlowLinkTokenMock: vi.fn(),
  buildManagedFlowContinuationRouteMock: vi.fn((flow) => `/update-password?flow_id=${flow.id}&mode=reset-password`),
  canResumeManagedFlowMock: vi.fn(),
}))

vi.mock('@/lib/auth/accessFlow', () => ({
  clearFlowLinkTokenMetadata: clearFlowLinkTokenMetadataMock,
  findAuthFlowById: findAuthFlowByIdMock,
  issueActivationTicket: issueActivationTicketMock,
  markFlowExpired: markFlowExpiredMock,
  normalizeEmail: normalizeEmailMock,
  updateAuthFlow: updateAuthFlowMock,
  validateFlowLinkToken: validateFlowLinkTokenMock,
}))

vi.mock('@/lib/auth/flowRouting', () => ({
  buildManagedFlowContinuationRoute: buildManagedFlowContinuationRouteMock,
  canResumeManagedFlow: canResumeManagedFlowMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

import { GET } from './route'

describe('/api/auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canResumeManagedFlowMock.mockReturnValue(false)
    validateFlowLinkTokenMock.mockResolvedValue({ valid: true, expired: false })
    createClientMock.mockResolvedValue({
      auth: {
        verifyOtp: vi.fn(),
        getUser: vi.fn(),
      },
    })
  })

  it('redirige con una respuesta HTTP limpia al paso de cambio de contrasena', async () => {
    const flow = {
      id: 'flow-1',
      tipo_flujo: 'RESET_PASSWORD',
      estado: 'RESET_LINK_SENT',
      correo_confirmado: 'ana@example.com',
      correo_pendiente: 'ana@example.com',
      metadata: {
        app_link_token_hash: 'hash',
        app_link_expires_at: '2026-04-24T00:00:00.000Z',
      },
    }

    findAuthFlowByIdMock.mockResolvedValue(flow)
    updateAuthFlowMock.mockResolvedValue({
      ...flow,
      estado: 'RESET_PASSWORD_PENDING',
      email_confirmed_at: '2026-04-23T18:00:00.000Z',
      metadata: {},
    })
    issueActivationTicketMock.mockResolvedValue({
      ...flow,
      estado: 'RESET_PASSWORD_PENDING',
    })

    const request = new NextRequest(
      'https://beteele-one.com/api/auth/confirm?flow_id=flow-1&flow_token=token-1'
    )

    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://beteele-one.com/update-password?flow_id=flow-1&mode=reset-password'
    )
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  })

  it('manda a enlace caducado si el token no es valido y el flujo ya no se puede reanudar', async () => {
    const flow = {
      id: 'flow-1',
      tipo_flujo: 'PRIMER_INGRESO',
      estado: 'AWAITING_EMAIL_CONFIRMATION',
      correo_confirmado: null,
      correo_pendiente: 'ana@example.com',
      metadata: {},
    }

    findAuthFlowByIdMock.mockResolvedValue(flow)
    validateFlowLinkTokenMock.mockResolvedValue({ valid: false, expired: true })

    const request = new NextRequest(
      'https://beteele-one.com/api/auth/confirm?flow_id=flow-1&flow_token=token-1'
    )

    const response = await GET(request)

    expect(markFlowExpiredMock).toHaveBeenCalledWith('flow-1')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://beteele-one.com/enlace-caducado?flow_id=flow-1'
    )
  })
})
