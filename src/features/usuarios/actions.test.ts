import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  revalidatePathMock,
  revalidateTagMock,
  requerirAdministradorActivoMock,
  obtenerClienteAdminMock,
  obtenerUrlBaseAplicacionMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  requerirAdministradorActivoMock: vi.fn(),
  obtenerClienteAdminMock: vi.fn(),
  obtenerUrlBaseAplicacionMock: vi.fn(),
}))

const { canSendProvisionalCredentialsEmailMock, sendProvisionalCredentialsEmailMock } = vi.hoisted(
  () => ({
    canSendProvisionalCredentialsEmailMock: vi.fn(),
    sendProvisionalCredentialsEmailMock: vi.fn(),
  })
)

const { sendWorkflowTransitionEmailMock } = vi.hoisted(() => ({
  sendWorkflowTransitionEmailMock: vi.fn(),
}))

const { createClientMock, createServiceClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}))

const { publishUiChangesMock } = vi.hoisted(() => ({
  publishUiChangesMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
  unstable_cache: vi.fn((fn) => fn),
}))

vi.mock('@/lib/auth/session', () => ({
  requerirAdministradorActivo: requerirAdministradorActivoMock,
}))

vi.mock('@/lib/auth/admin', () => ({
  obtenerClienteAdmin: obtenerClienteAdminMock,
  obtenerUrlBaseAplicacion: obtenerUrlBaseAplicacionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
  createServiceClient: createServiceClientMock,
}))

vi.mock('@/lib/ui-change/server', () => ({
  publishUiChanges: publishUiChangesMock,
}))

vi.mock('@/lib/notifications/provisionalCredentialsEmail', () => ({
  canSendProvisionalCredentialsEmail: canSendProvisionalCredentialsEmailMock,
  sendProvisionalCredentialsEmail: sendProvisionalCredentialsEmailMock,
}))

vi.mock('@/lib/notifications/workflowTransitionEmail', () => ({
  sendWorkflowTransitionEmail: sendWorkflowTransitionEmailMock,
}))

import {
  actualizarUsernameUsuario,
  actualizarEstadoCuentaUsuario,
  actualizarPuestoUsuario,
  crearUsuarioAdministrativo,
  enviarResetPasswordUsuario,
} from './actions'
import { ESTADO_USUARIO_ADMIN_INICIAL } from './state'

function createServiceDouble() {
  const auditInserts: Array<Record<string, unknown>> = []
  const usuarioInserts: Array<Record<string, unknown>> = []
  const usuarioUpdates: Array<Record<string, unknown>> = []
  const empleadoUpdates: Array<Record<string, unknown>> = []
  const authResetCalls: Array<Record<string, unknown>> = []
  const authUpdateCalls: Array<Record<string, unknown>> = []
  const authFlowUpdates: Array<Record<string, unknown>> = []

  const state = {
    empleado: {
      id: 'emp-1',
      id_nomina: 'EMP-001',
      nombre_completo: 'Ana Torres',
      puesto: 'DERMOCONSEJERO',
      correo_electronico: 'ana@empresa.com',
      estatus_laboral: 'ACTIVO',
      metadata: {
        workflow_stage: 'ONBOARDING',
        admin_access_pending: true,
        onboarding_operativo: {
          expediente_completo_recibido: true,
          contrato_status: 'FIRMADO',
        },
      },
      updated_at: '2026-03-19T16:00:00.000Z',
    },
    usuario: {
      id: 'usuario-1',
      auth_user_id: 'auth-1',
      empleado_id: 'emp-1',
      cuenta_cliente_id: null,
      username: 'ana.torres',
      estado_cuenta: 'ACTIVA',
      correo_verificado: true,
      correo_electronico: 'ana@empresa.com',
      empleado: {
        nombre_completo: 'Ana Torres',
        puesto: 'DERMOCONSEJERO',
        metadata: {
          workflow_stage: 'ONBOARDING',
          admin_access_pending: true,
          onboarding_operativo: {
            expediente_completo_recibido: true,
            contrato_status: 'FIRMADO',
          },
        },
      },
      cuenta_cliente: null,
    },
    authUser: {
      id: 'auth-1',
      email: 'ana@empresa.com',
      user_metadata: {
        username: 'ana.torres',
        provisional_email: false,
        allow_username_login: true,
      },
    },
    cuentaCliente: {
      id: 'cuenta-1',
      activa: true,
    },
    duplicateUsername: null as { id: string } | null,
  }

  const service = {
    from(table: string) {
      if (table === 'configuracion') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle() {
            return Promise.resolve({ data: { valor: 72 }, error: null })
          },
        }
      }

      if (table === 'empleado') {
        let recipientMode = false
        return {
          select() {
            return this
          },
          in() {
            recipientMode = true
            return this
          },
          eq() {
            return this
          },
          order() {
            if (recipientMode) {
              return Promise.resolve({
                data: [
                  { id: 'admin-1', nombre_completo: 'Admin Uno', correo_electronico: 'admin@empresa.com' },
                  {
                    id: 'reclut-1',
                    nombre_completo: 'Recruit Uno',
                    correo_electronico: 'reclut@empresa.com',
                  },
                ],
                error: null,
              })
            }

            return this
          },
          maybeSingle() {
            return Promise.resolve({ data: { ...state.empleado }, error: null })
          },
          update(payload: Record<string, unknown>) {
            empleadoUpdates.push(payload)
            state.empleado = { ...state.empleado, ...payload }
            if (payload.puesto && typeof payload.puesto === 'string') {
              state.usuario = {
                ...state.usuario,
                empleado: { ...state.usuario.empleado, puesto: payload.puesto },
              }
            }
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      }

      if (table === 'usuario') {
        let lastEqField: string | null = null
        let lastEqValue: unknown = null

        return {
          select() {
            return this
          },
          eq(field?: string, value?: unknown) {
            lastEqField = field ?? null
            lastEqValue = value

            if (field === 'username') {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: state.duplicateUsername, error: null })
                },
              }
            }
            return this
          },
          maybeSingle() {
            if (lastEqField === 'empleado_id' && lastEqValue === state.empleado.id) {
              return Promise.resolve({ data: null, error: null })
            }

            return Promise.resolve({ data: { ...state.usuario }, error: null })
          },
          in() {
            return this
          },
          order() {
            return {
              data: [
                {
                  id: 'emp-admin-1',
                  nombre_completo: 'Ana Torres',
                  correo_electronico: 'ana@empresa.com',
                },
              ],
              error: null,
            }
          },
          insert(payload: Record<string, unknown>) {
            usuarioInserts.push(payload)
            return {
              select() {
                return this
              },
              maybeSingle() {
                state.usuario = {
                  ...state.usuario,
                  ...payload,
                  id: 'usuario-creado',
                  empleado: {
                    nombre_completo: state.empleado.nombre_completo,
                    puesto: state.empleado.puesto,
                  },
                }
                return Promise.resolve({ data: { id: 'usuario-creado' }, error: null })
              },
            }
          },
          update(payload: Record<string, unknown>) {
            usuarioUpdates.push(payload)
            state.usuario = { ...state.usuario, ...payload }
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      }

      if (table === 'cuenta_cliente') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle() {
            return Promise.resolve({ data: { ...state.cuentaCliente }, error: null })
          },
        }
      }

      if (table === 'audit_log') {
        return {
          insert(payload: Record<string, unknown>) {
            auditInserts.push(payload)
            return Promise.resolve({ error: null })
          },
        }
      }

      if (table === 'auth_activation_flow') {
        let query: any

        query = {
          eq() {
            return query
          },
          in() {
            return query
          },
          then(resolve) {
            return Promise.resolve({ error: null }).then(resolve)
          },
        }

        return {
          update(payload: Record<string, unknown>) {
            authFlowUpdates.push(payload)
            return query
          },
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
    rpc() {
      return Promise.resolve({
        data: { touched: true },
        error: null,
      })
    },
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'auth-creado', email: 'ana.torres@provisional.fieldforce.invalid' } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
        getUserById: vi.fn().mockImplementation(() =>
          Promise.resolve({
            data: { user: { ...state.authUser } },
            error: null,
          })
        ),
        updateUserById: vi.fn().mockImplementation((_id: string, payload: Record<string, unknown>) => {
          authUpdateCalls.push(payload)
          state.authUser = {
            ...state.authUser,
            ...payload,
            email: typeof payload.email === 'string' ? payload.email : state.authUser.email,
            user_metadata:
              payload.user_metadata && typeof payload.user_metadata === 'object'
                ? { ...state.authUser.user_metadata, ...payload.user_metadata }
                : state.authUser.user_metadata,
          }

          return Promise.resolve({ data: { user: { ...state.authUser } }, error: null })
        }),
      },
      resetPasswordForEmail: vi.fn().mockImplementation((email: string, options: Record<string, unknown>) => {
        authResetCalls.push({ email, options })
        return Promise.resolve({ error: null })
      }),
    },
  }

  return {
    service,
    state,
    auditInserts,
    usuarioInserts,
    usuarioUpdates,
    empleadoUpdates,
    authResetCalls,
    authUpdateCalls,
    authFlowUpdates,
  }
}

describe('usuarios actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requerirAdministradorActivoMock.mockResolvedValue({ usuarioId: 'admin-1' })
    obtenerUrlBaseAplicacionMock.mockResolvedValue('http://localhost:3000')
    canSendProvisionalCredentialsEmailMock.mockReturnValue(true)
    sendProvisionalCredentialsEmailMock.mockResolvedValue(undefined)
  })

  it('crea usuario provisional vinculado a un empleado existente', async () => {
    const adminDouble = createServiceDouble()
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('empleado_id', 'emp-1')
    formData.set('username', 'ana.torres')

    const result = await crearUsuarioAdministrativo(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(result.generatedUsername).toBe('ana.torres')
    expect(result.temporaryPassword).toBeTruthy()
    expect(result.message).toContain('credenciales provisionales enviadas')
    expect(adminDouble.usuarioInserts).toHaveLength(1)
    expect(adminDouble.usuarioInserts[0]).toMatchObject({
      empleado_id: 'emp-1',
      username: 'ana.torres',
      estado_cuenta: 'PROVISIONAL',
      correo_verificado: false,
    })
    expect(adminDouble.auditInserts).toHaveLength(3)
    expect(adminDouble.auditInserts[0]).toMatchObject({
      tabla: 'usuario',
      accion: 'EVENTO',
      usuario_id: 'admin-1',
    })
    expect(sendProvisionalCredentialsEmailMock).toHaveBeenCalledWith({
      to: 'ana@empresa.com',
      employeeName: 'Ana Torres',
      username: 'ana.torres',
      temporaryPassword: result.temporaryPassword,
      loginUrl: 'http://localhost:3000/login',
    })
    expect(adminDouble.empleadoUpdates).toHaveLength(1)
    expect(adminDouble.empleadoUpdates[0]).toMatchObject({
      metadata: {
        workflow_stage: 'ALTA_IMSS_CERRADA',
        admin_access_pending: false,
      },
    })
    expect(sendWorkflowTransitionEmailMock).toHaveBeenCalled()
  })

  it.each([
    'ADMINISTRADOR',
    'COORDINADOR',
    'SUPERVISOR',
    'DERMOCONSEJERO',
    'RECLUTAMIENTO',
    'NOMINA',
    'LOGISTICA',
    'VENTAS',
    'LOVE_IS',
    'CLIENTE',
  ])('mantiene el mismo flujo provisional para %s', async (puesto) => {
    const adminDouble = createServiceDouble()
    adminDouble.state.empleado.puesto = puesto
    adminDouble.state.usuario.empleado.puesto = puesto
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('empleado_id', 'emp-1')
    formData.set('username', 'ana.torres')
    formData.set('cuenta_cliente_id', 'cuenta-1')

    const result = await crearUsuarioAdministrativo(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(result.generatedUsername).toBe('ana.torres')
    expect(adminDouble.usuarioInserts).toHaveLength(1)
    expect(adminDouble.usuarioInserts[0]).toMatchObject({
      empleado_id: 'emp-1',
      username: 'ana.torres',
      estado_cuenta: 'PROVISIONAL',
      correo_verificado: false,
    })
    expect(sendProvisionalCredentialsEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@empresa.com',
        employeeName: 'Ana Torres',
        username: 'ana.torres',
      })
    )
  })

  it('genera username provisional desde nombre y uuid aunque exista id_nomina', async () => {
    const adminDouble = createServiceDouble()
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('empleado_id', 'emp-1')
    formData.set('username', '')

    const result = await crearUsuarioAdministrativo(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(result.generatedUsername).toBe('ana_torres_emp1')
    expect(result.generatedUsername).not.toBe('EMP-001')
  })

  it('no revierte el alta si el email de credenciales falla', async () => {
    const adminDouble = createServiceDouble()
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })
    sendProvisionalCredentialsEmailMock.mockRejectedValue(new Error('resend unavailable'))

    const formData = new FormData()
    formData.set('empleado_id', 'emp-1')
    formData.set('username', 'ana.torres')

    const result = await crearUsuarioAdministrativo(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(result.message).toContain('envio de credenciales por correo fallo')
    expect(adminDouble.usuarioInserts).toHaveLength(1)
    expect(adminDouble.auditInserts).toHaveLength(3)
    expect(adminDouble.auditInserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            evento: 'usuario_credenciales_provisionales_error_email',
            destino: 'ana@empresa.com',
          }),
        }),
      ])
    )
  })

  it('cambia puesto con registro en audit_log', async () => {
    const adminDouble = createServiceDouble()
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('usuario_id', 'usuario-1')
    formData.set('puesto_destino', 'SUPERVISOR')

    const result = await actualizarPuestoUsuario(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(adminDouble.empleadoUpdates).toHaveLength(1)
    expect(adminDouble.empleadoUpdates[0]).toMatchObject({
      puesto: 'SUPERVISOR',
    })
    expect(adminDouble.auditInserts).toHaveLength(1)
    expect(adminDouble.auditInserts[0].payload).toMatchObject({
      evento: 'usuario_cambio_puesto_admin',
      puesto_anterior: 'DERMOCONSEJERO',
      puesto_nuevo: 'SUPERVISOR',
    })
  })

  it('cambia username provisional y sincroniza auth', async () => {
    const adminDouble = createServiceDouble()
    adminDouble.state.usuario.estado_cuenta = 'PROVISIONAL'
    adminDouble.state.authUser.email = 'ana.torres@provisional.fieldforce.invalid'
    adminDouble.state.authUser.user_metadata = {
      username: 'ana.torres',
      provisional_email: true,
      allow_username_login: true,
    }
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('usuario_id', 'usuario-1')
    formData.set('username_destino', 'ana.supervisora')

    const result = await actualizarUsernameUsuario(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(result.generatedUsername).toBe('ana.supervisora')
    expect(result.temporaryEmail).toBe('ana.supervisora@provisional.fieldforce.invalid')
    expect(adminDouble.usuarioUpdates).toContainEqual(
      expect.objectContaining({
        username: 'ana.supervisora',
      })
    )
    expect(adminDouble.authUpdateCalls).toHaveLength(1)
    expect(adminDouble.authUpdateCalls[0]).toMatchObject({
      email: 'ana.supervisora@provisional.fieldforce.invalid',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        username: 'ana.supervisora',
        previous_username: 'ana.torres',
        username_updated_by_admin: true,
      }),
    })
    expect(adminDouble.auditInserts).toHaveLength(1)
    expect(adminDouble.auditInserts[0].payload).toMatchObject({
      evento: 'usuario_cambio_username_admin',
      username_anterior: 'ana.torres',
      username_nuevo: 'ana.supervisora',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/users')
  })

  it('permite cambiar username cuando la cuenta esta pendiente de primer login', async () => {
    const adminDouble = createServiceDouble()
    adminDouble.state.usuario.estado_cuenta = 'PENDIENTE_PRIMER_LOGIN'
    adminDouble.state.authUser.email = 'ana.torres@empresa.com'
    adminDouble.state.authUser.user_metadata = {
      username: 'ana.torres',
      provisional_email: false,
      allow_username_login: false,
    }
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('usuario_id', 'usuario-1')
    formData.set('username_destino', 'ana.primer.login')

    const result = await actualizarUsernameUsuario(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(adminDouble.usuarioUpdates).toContainEqual(
      expect.objectContaining({
        username: 'ana.primer.login',
      })
    )
  })

  it('rechaza username duplicado en cuentas provisionales', async () => {
    const adminDouble = createServiceDouble()
    adminDouble.state.usuario.estado_cuenta = 'PROVISIONAL'
    adminDouble.state.duplicateUsername = { id: 'usuario-ocupado' }
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('usuario_id', 'usuario-1')
    formData.set('username_destino', 'ana.ocupada')

    const result = await actualizarUsernameUsuario(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('ya esta ocupado')
    expect(adminDouble.authUpdateCalls).toHaveLength(0)
  })

  it('suspende y reactiva cuenta segun correo verificado', async () => {
    const adminDouble = createServiceDouble()
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const suspendForm = new FormData()
    suspendForm.set('usuario_id', 'usuario-1')
    suspendForm.set('accion_cuenta', 'SUSPENDER')

    const suspendResult = await actualizarEstadoCuentaUsuario(
      ESTADO_USUARIO_ADMIN_INICIAL,
      suspendForm
    )

    expect(suspendResult.ok).toBe(true)
    expect(adminDouble.usuarioUpdates[0]).toMatchObject({ estado_cuenta: 'SUSPENDIDA' })

    adminDouble.state.usuario.estado_cuenta = 'SUSPENDIDA'

    const reactivateForm = new FormData()
    reactivateForm.set('usuario_id', 'usuario-1')
    reactivateForm.set('accion_cuenta', 'REACTIVAR')

    const reactivateResult = await actualizarEstadoCuentaUsuario(
      ESTADO_USUARIO_ADMIN_INICIAL,
      reactivateForm
    )

    expect(reactivateResult.ok).toBe(true)
    expect(adminDouble.usuarioUpdates[1]).toMatchObject({ estado_cuenta: 'ACTIVA' })
    expect(adminDouble.auditInserts).toHaveLength(2)
  })

  it('reinicia el acceso provisional y regenera credenciales para primer login', async () => {
    const adminDouble = createServiceDouble()
    adminDouble.state.usuario.estado_cuenta = 'PENDIENTE_PRIMER_LOGIN'
    adminDouble.state.usuario.correo_electronico = 'ana@empresa.com'
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('usuario_id', 'usuario-1')
    formData.set('accion_cuenta', 'PENDIENTE_PRIMER_LOGIN')

    const result = await actualizarEstadoCuentaUsuario(
      ESTADO_USUARIO_ADMIN_INICIAL,
      formData
    )

    expect(result.ok).toBe(true)
    expect(result.generatedUsername).toBe('ana.torres')
    expect(result.temporaryPassword).toBeTruthy()
    expect(result.temporaryEmail).toBe('ana.torres@provisional.fieldforce.invalid')
    expect(adminDouble.authUpdateCalls).toHaveLength(1)
    expect(adminDouble.authUpdateCalls[0]).toMatchObject({
      email: 'ana.torres@provisional.fieldforce.invalid',
      email_confirm: true,
      password: expect.any(String),
      user_metadata: expect.objectContaining({
        username: 'ana.torres',
        source: 'admin_users_module',
        provisional_email: true,
        allow_username_login: true,
        pending_email: null,
        email_verified: false,
        first_access_password: true,
        confirmed_email: 'ana.torres@provisional.fieldforce.invalid',
      }),
    })
    expect(adminDouble.usuarioUpdates).toContainEqual(
      expect.objectContaining({
        estado_cuenta: 'PROVISIONAL',
        correo_electronico: null,
        correo_verificado: false,
        password_temporal_generada_en: expect.any(String),
        password_temporal_expira_en: expect.any(String),
        ultimo_acceso_en: null,
      })
    )
    expect(adminDouble.empleadoUpdates).toHaveLength(1)
    expect(adminDouble.empleadoUpdates[0]).toMatchObject({
      metadata: expect.objectContaining({
        onboarding_inicial: expect.objectContaining({
          primer_acceso: expect.objectContaining({
            required: true,
            estado: 'PENDIENTE',
            source: 'admin_users_module',
          }),
        }),
      }),
    })
    expect(adminDouble.auditInserts).toHaveLength(1)
    expect(adminDouble.auditInserts[0]).toMatchObject({
      tabla: 'usuario',
      payload: expect.objectContaining({
        evento: 'usuario_reinicio_acceso_provisional_admin',
        estado_anterior: 'PENDIENTE_PRIMER_LOGIN',
        estado_nuevo: 'PROVISIONAL',
      }),
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/users')
  })

  it('envia reset de password para cuentas activas y deja trazabilidad', async () => {
    const adminDouble = createServiceDouble()
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('usuario_id', 'usuario-1')

    const result = await enviarResetPasswordUsuario(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(adminDouble.authResetCalls).toHaveLength(1)
    expect(adminDouble.authResetCalls[0]).toMatchObject({
      email: 'ana@empresa.com',
      options: { redirectTo: 'http://localhost:3000/api/auth/confirm?next=/update-password' },
    })
    expect(adminDouble.auditInserts).toHaveLength(1)
    expect(adminDouble.auditInserts[0].payload).toMatchObject({
      evento: 'usuario_reset_password_admin',
      username: 'ana.torres',
      destino: 'ana@empresa.com',
    })
  })

  it('reconcilia el auth email antes de enviar reset administrativo', async () => {
    const adminDouble = createServiceDouble()
    adminDouble.state.authUser.email = 'ana.torres@provisional.fieldforce.invalid'
    adminDouble.state.authUser.user_metadata = {
      username: 'ana.torres',
      provisional_email: true,
      allow_username_login: true,
      pending_email: 'ana@empresa.com',
    }
    obtenerClienteAdminMock.mockReturnValue({ service: adminDouble.service, error: null })

    const formData = new FormData()
    formData.set('usuario_id', 'usuario-1')

    const result = await enviarResetPasswordUsuario(ESTADO_USUARIO_ADMIN_INICIAL, formData)

    expect(result.ok).toBe(true)
    expect(adminDouble.authUpdateCalls).toContainEqual({
      email: 'ana@empresa.com',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        provisional_email: false,
        allow_username_login: false,
        pending_email: null,
        confirmed_email: 'ana@empresa.com',
      }),
    })
    expect(adminDouble.authResetCalls).toHaveLength(1)
    expect(adminDouble.authResetCalls[0]).toMatchObject({
      email: 'ana@empresa.com',
    })
  })
})
