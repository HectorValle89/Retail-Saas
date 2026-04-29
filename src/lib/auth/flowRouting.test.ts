import { describe, expect, it } from 'vitest'
import { buildManagedFlowContinuationRoute, canResumeManagedFlow, type ManagedFlowLike } from './flowRouting'

function createFlow(overrides: Partial<ManagedFlowLike>): ManagedFlowLike {
  return {
    id: 'flow-1',
    tipo_flujo: 'PRIMER_INGRESO',
    estado: 'AWAITING_EMAIL_CONFIRMATION',
    email_confirmed_at: null,
    ...overrides,
  }
}

describe('flowRouting helpers', () => {
  it('permite reanudar un primer ingreso ya confirmado aunque el enlace quede viejo', () => {
    const flow = createFlow({
      estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
      email_confirmed_at: '2026-04-20T12:30:00.000Z',
    })

    expect(canResumeManagedFlow(flow)).toBe(true)
    expect(buildManagedFlowContinuationRoute(flow)).toBe(
      '/update-password?flow_id=flow-1&mode=credential-transition'
    )
  })

  it('permite reanudar una recuperacion de contrasena ya confirmada', () => {
    const flow = createFlow({
      tipo_flujo: 'RESET_PASSWORD',
      estado: 'RESET_PASSWORD_PENDING',
      email_confirmed_at: '2026-04-20T12:30:00.000Z',
    })

    expect(canResumeManagedFlow(flow)).toBe(true)
    expect(buildManagedFlowContinuationRoute(flow)).toBe(
      '/update-password?flow_id=flow-1&mode=reset-password'
    )
  })

  it('no reanuda un flujo que sigue esperando la confirmacion del correo', () => {
    const flow = createFlow({})

    expect(canResumeManagedFlow(flow)).toBe(false)
  })
})
