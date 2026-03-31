import { beforeEach, describe, expect, it, vi } from 'vitest'

const { revalidatePathMock, requerirAdministradorActivoMock, obtenerClienteAdminMock, obtenerUrlBaseAplicacionMock } =
  vi.hoisted(() => ({
    revalidatePathMock: vi.fn(),
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

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/auth/session', () => ({
  requerirAdministradorActivo: requerirAdministradorActivoMock,
}))

vi.mock('@/lib/auth/admin', () => ({
  obtenerClienteAdmin: obtenerClienteAdminMock,
  obtenerUrlBaseAplicacion: obtenerUrlBaseAplicacionMock,
}))

vi.mock('@/lib/notifications/provisionalCredentialsEmail', () => ({
  canSendProvisionalCredentialsEmail: canSendProvisionalCredentialsEmailMock,
  sendProvisionalCredentialsEmail: sendProvisionalCredentialsEmailMock,
}))

import {
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

  const state = {
    empleado: {
      id: 'emp-1',
      id_nomina: 'EMP-001',
      nombre_completo: 'Ana Torres',
      puesto: 'DERMOCONSEJERO',
      correo_electronico: 'ana@empresa.com',
      estatus_laboral: 'ACTIVO',
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
      empleado: { nombre_completo: 'Ana Torres', puesto: 'DERMOCONSEJERO' },
      cuenta_cliente: null,
    },
    cuentaCliente: {
      id: 'cuenta-1',
      activa: true,
    },
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
        return {
          select() {
            return this
          },
          eq() {
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
                  return Promise.resolve({ data: null, error: null })
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

      throw new Error(`Unexpected table ${table}`)
    },
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'auth-creado', email: 'ana.torres@provisional.fieldforce.invalid' } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { email: 'ana@empresa.com' } },
          error: null,
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
    expect(adminDouble.auditInserts).toHaveLength(2)
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
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/users')
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
    expect(adminDouble.auditInserts).toHaveLength(2)
    expect(adminDouble.auditInserts[1].payload).toMatchObject({
      evento: 'usuario_credenciales_provisionales_error_email',
      destino: 'ana@empresa.com',
    })
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
      options: { redirectTo: 'http://localhost:3000/update-password' },
    })
    expect(adminDouble.auditInserts).toHaveLength(1)
    expect(adminDouble.auditInserts[0].payload).toMatchObject({
      evento: 'usuario_reset_password_admin',
      username: 'ana.torres',
      destino: 'ana@empresa.com',
    })
  })
})
