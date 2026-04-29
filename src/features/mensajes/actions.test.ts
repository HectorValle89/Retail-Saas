import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClientMock,
  createServiceClientMock,
  requerirActorActivoMock,
  obtenerUrlBaseAplicacionMock,
  readRequestAccountScopeMock,
  publishUiChangesMock,
  sendOperationalPushNotificationMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  requerirActorActivoMock: vi.fn(),
  obtenerUrlBaseAplicacionMock: vi.fn(),
  readRequestAccountScopeMock: vi.fn(),
  publishUiChangesMock: vi.fn(),
  sendOperationalPushNotificationMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
  createServiceClient: createServiceClientMock,
}))

vi.mock('@/lib/auth/session', () => ({
  requerirActorActivo: requerirActorActivoMock,
}))

vi.mock('@/lib/auth/admin', () => ({
  obtenerUrlBaseAplicacion: obtenerUrlBaseAplicacionMock,
}))

vi.mock('@/lib/tenant/accountScope', () => ({
  normalizeRequestedAccountId: (value: unknown) => String(value ?? '').trim() || null,
  readRequestAccountScope: readRequestAccountScopeMock,
}))

vi.mock('@/lib/ui-change/server', () => ({
  publishUiChanges: publishUiChangesMock,
}))

vi.mock('@/lib/push/pushFanout', () => ({
  sendOperationalPushNotification: sendOperationalPushNotificationMock,
}))

vi.mock('@/lib/storage/directR2Server', () => ({
  readDirectR2Manifest: vi.fn(() => []),
  registerDirectR2EvidenceList: vi.fn(async () => []),
}))

import { ESTADO_MENSAJE_INICIAL } from './state'
import { solicitarCorreccionPerfilDermoconsejo } from './actions'

describe('mensajes actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    requerirActorActivoMock.mockResolvedValue({
      usuarioId: 'usuario-1',
      empleadoId: 'emp-1',
      puesto: 'DERMOCONSEJERO',
      nombreCompleto: 'Reina Bautista Corona',
      cuentaClienteId: 'cuenta-1',
      zona: 'Zona Norte',
      supervisorEmpleadoId: 'sup-1',
    })

    obtenerUrlBaseAplicacionMock.mockResolvedValue('http://localhost:3000')
    readRequestAccountScopeMock.mockResolvedValue({ accountId: 'cuenta-1' })
    publishUiChangesMock.mockResolvedValue(undefined)
    sendOperationalPushNotificationMock.mockResolvedValue(undefined)
  })

  it('redirige la correccion de correo al callback de verificacion antes de continuar', async () => {
    const authUpdateUserMock = vi.fn().mockResolvedValue({ error: null })
    const authClient = {
      auth: {
        updateUser: authUpdateUserMock,
      },
    }

    createClientMock.mockResolvedValue(authClient)

    const insertedMessages: Array<Record<string, unknown>> = []
    const insertedRecipients: Array<Record<string, unknown>> = []
    const insertedAudits: Array<Record<string, unknown>> = []

    const service = {
      from(table: string) {
        if (table === 'cuenta_cliente') {
          return {
            select() {
              return this
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: { id: 'cuenta-1', activa: true }, error: null })
                },
              }
            },
          }
        }

        if (table === 'empleado') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            in() {
              return this
            },
            order() {
              return Promise.resolve({
                data: [
                  { id: 'emp-coord-1', nombre_completo: 'Coord Uno', puesto: 'COORDINADOR' },
                  { id: 'emp-admin-1', nombre_completo: 'Admin Uno', puesto: 'ADMINISTRADOR' },
                ],
                error: null,
              })
            },
          }
        }

        if (table === 'mensaje_interno') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedMessages.push(payload)
              return {
                select() {
                  return this
                },
                maybeSingle() {
                  return Promise.resolve({ data: { id: 'mensaje-1' }, error: null })
                },
              }
            },
          }
        }

        if (table === 'mensaje_receptor') {
          return {
            insert(payload: Record<string, unknown>[]) {
              insertedRecipients.push(...payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedAudits.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    }

    createServiceClientMock.mockReturnValue(service)

    const formData = new FormData()
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('campo', 'CORREO_ELECTRONICO')
    formData.set('valor_actual', 'viejo@empresa.com')
    formData.set('valor_nuevo', 'nuevo@empresa.com')
    formData.set('detalle', 'Cambio solicitado por correccion de contacto')

    const result = await solicitarCorreccionPerfilDermoconsejo(ESTADO_MENSAJE_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(result.message).toBe(
      'Solicitud enviada. El equipo revisara el cambio de correo antes de actualizar tu perfil.'
    )
    expect(authUpdateUserMock).not.toHaveBeenCalled()
    expect(insertedMessages).toHaveLength(1)
    expect(insertedRecipients).toHaveLength(2)
    expect(insertedAudits).toHaveLength(1)
  })
})
