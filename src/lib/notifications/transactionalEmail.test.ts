import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(function () {
      return {
        emails: {
          send: resendSendMock,
        },
      }
    }),
  }
})

describe('transactionalEmail', () => {
  beforeEach(() => {
    process.env.EMAIL_NOTIFICATIONS_ENABLED = 'true'
    process.env.USUARIOS_FROM_EMAIL = 'notify@beteele-one.com'
    process.env.RESEND_API_KEY = 're_test_key'
    delete process.env.TRANSACTIONAL_EMAIL_OVERRIDE_TO
    resendSendMock.mockReset()
  })

  afterEach(() => {
    delete process.env.EMAIL_NOTIFICATIONS_ENABLED
    delete process.env.USUARIOS_FROM_EMAIL
    delete process.env.RESEND_API_KEY
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('deshabilita el canal si la bandera global esta apagada', async () => {
    process.env.EMAIL_NOTIFICATIONS_ENABLED = 'false'

    const { canSendTransactionalEmail } = await import('./transactionalEmail')

    expect(canSendTransactionalEmail()).toBe(false)
  })

  it('envia un payload compatible con Resend SDK', async () => {
    resendSendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null })

    const { sendTransactionalEmail, canSendTransactionalEmail } = await import(
      './transactionalEmail'
    )

    expect(canSendTransactionalEmail()).toBe(true)

    await sendTransactionalEmail({
      to: {
        email: 'ana@empresa.com',
        name: 'Ana Torres',
      },
      subject: 'Credenciales provisionales',
      text: 'Hola Ana',
      html: '<p>Hola Ana</p>',
    })

    expect(resendSendMock).toHaveBeenCalledTimes(1)
    expect(resendSendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'notify@beteele-one.com',
      to: ['ana@empresa.com'],
      subject: 'Credenciales provisionales',
      text: 'Hola Ana',
      html: '<p>Hola Ana</p>',
    }))
  })

  it('deshabilita el canal si falta la API Key de Resend', async () => {
    delete process.env.RESEND_API_KEY

    const { canSendTransactionalEmail } = await import('./transactionalEmail')

    expect(canSendTransactionalEmail()).toBe(false)
  })

  it('redirige el envio a un destinatario de pruebas cuando hay override configurado', async () => {
    process.env.TRANSACTIONAL_EMAIL_OVERRIDE_TO = 'hector@artolagroup.com'
    resendSendMock.mockResolvedValue({ data: { id: 'msg_456' }, error: null })

    const { sendTransactionalEmail } = await import('./transactionalEmail')

    await sendTransactionalEmail({
      to: {
        email: 'ana@empresa.com',
        name: 'Ana Torres',
      },
      subject: 'Prueba de redireccion',
      text: 'Hola Ana',
    })

    expect(resendSendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'notify@beteele-one.com',
      to: ['hector@artolagroup.com'],
      subject: 'Prueba de redireccion',
      text: 'Hola Ana',
      headers: {
        'X-Original-Recipient': 'ana@empresa.com',
        'X-Original-Recipient-Name': 'Ana Torres',
        'X-Test-Recipient': 'hector@artolagroup.com',
      }
    }))
  })
})
