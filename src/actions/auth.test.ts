import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  redirectMock,
  revalidatePathMock,
  createClientMock,
  obtenerClienteAdminMock,
  obtenerUrlBaseAplicacionMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  createClientMock: vi.fn(),
  obtenerClienteAdminMock: vi.fn(),
  obtenerUrlBaseAplicacionMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/auth/admin', () => ({
  obtenerClienteAdmin: obtenerClienteAdminMock,
  obtenerUrlBaseAplicacion: obtenerUrlBaseAplicacionMock,
}))

import {
  confirmarPrimerAccesoDatos,
  iniciarActivacionCuenta,
  solicitarCorreccionPrimerAcceso,
  updatePassword,
} from './auth'

function createAdminServiceDouble(options: {
  usuarioSesion?: {
    id: string
    estado_cuenta?: string
    empleado_id?: string
    cuenta_cliente_id?: string | null
    auth_user_id?: string | null
    username?: string | null
    correo_electronico?: string | null
  }
  empleadoSesion?: {
    id?: string
    nombre_completo?: string
    puesto?: string
    metadata?: Record<string, unknown> | null
  }
  duplicateVerifiedUser?: {
    id: string
    correo_verificado?: boolean
    estado_cuenta?: string | null
    correo_electronico?: string | null
  } | null
}) {
  const usuarioState = {
    id: options.usuarioSesion?.id ?? 'usuario-1',
    estado_cuenta: options.usuarioSesion?.estado_cuenta,
    empleado_id: options.usuarioSesion?.empleado_id,
    cuenta_cliente_id: options.usuarioSesion?.cuenta_cliente_id ?? 'c1',
    auth_user_id: options.usuarioSesion?.auth_user_id ?? 'auth-1',
    username: options.usuarioSesion?.username ?? 'usuario.temporal',
    correo_electronico: options.usuarioSesion?.correo_electronico ?? null,
  }
  const empleadoState = {
    id: options.empleadoSesion?.id ?? options.usuarioSesion?.empleado_id ?? 'emp-1',
    nombre_completo: options.empleadoSesion?.nombre_completo ?? 'Ana Demo',
    puesto: options.empleadoSesion?.puesto ?? 'DERMOCONSEJERO',
    metadata: options.empleadoSesion?.metadata ?? null,
  }
  const usuarioUpdates: Array<Record<string, unknown>> = []
  const empleadoUpdates: Array<Record<string, unknown>> = []
  const auditRows: Array<Record<string, unknown>> = []
  const mensajeRows: Array<Record<string, unknown>> = []
  const receptorRows: Array<Record<string, unknown>> = []

  return {
    service: {
      from(table: string) {
        if (table === 'usuario') {
          const filters: Record<string, unknown> = {}
          return {
            select() {
              return this
            },
            eq(column: string, value: unknown) {
              filters[column] = value
              return this
            },
            neq(column: string, value: unknown) {
              filters[`neq:${column}`] = value
              return this
            },
            limit() {
              return this
            },
            maybeSingle() {
              if (filters.correo_electronico && filters.correo_verificado === true) {
                const duplicate = options.duplicateVerifiedUser ?? null
                const excludedId = filters['neq:id']

                if (duplicate && duplicate.id !== excludedId) {
                  return Promise.resolve({
                    data: {
                      id: duplicate.id,
                      correo_verificado: duplicate.correo_verificado ?? true,
                      estado_cuenta: duplicate.estado_cuenta ?? 'ACTIVA',
                    },
                    error: null,
                  })
                }

                return Promise.resolve({
                  data: null,
                  error: null,
                })
              }

              return Promise.resolve({
                data: { ...usuarioState },
                error: null,
              })
            },
            update(payload: Record<string, unknown>) {
              usuarioUpdates.push(payload)
              Object.assign(usuarioState, payload)

              return {
                eq() {
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        }

        if (table === 'empleado') {
          let recipientMode = false
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            in() {
              recipientMode = true
              return this
            },
            order() {
              if (recipientMode) {
                return Promise.resolve({
                  data: [
                    { id: 'admin-1', nombre_completo: 'Admin Uno', puesto: 'ADMINISTRADOR' },
                    { id: 'reclut-1', nombre_completo: 'Recruit Uno', puesto: 'RECLUTAMIENTO' },
                  ],
                  error: null,
                })
              }

              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: { ...empleadoState },
                error: null,
              })
            },
            update(payload: Record<string, unknown>) {
              empleadoUpdates.push(payload)
              Object.assign(empleadoState, payload)
              return {
                eq() {
                  return Promise.resolve({ error: null })
                },
              }
            },
            then: undefined,
          }
        }

        if (table === 'audit_log') {
          return {
            insert(payload: Record<string, unknown>) {
              auditRows.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'mensaje_interno') {
          return {
            insert(payload: Record<string, unknown>) {
              mensajeRows.push(payload)
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
              receptorRows.push(...payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected admin table ${table}`)
      },
      auth: {
        admin: {
          getUserById: vi.fn(),
        },
      },
    },
    usuarioState,
    empleadoState,
    usuarioUpdates,
    empleadoUpdates,
    auditRows,
    mensajeRows,
    receptorRows,
  }
}

describe('auth actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    obtenerUrlBaseAplicacionMock.mockResolvedValue('http://localhost:3000')
  })

  it('mantiene el flujo de activacion desde PROVISIONAL hacia PENDIENTE_VERIFICACION_EMAIL', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: { id: 'usuario-1', estado_cuenta: 'PROVISIONAL' },
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'temp@example.com',
            },
          },
        }),
        updateUser: vi.fn().mockResolvedValue({ error: null }),
      },
      from(table: string) {
        if (table !== 'usuario') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'usuario-1', estado_cuenta: 'PROVISIONAL' },
              error: null,
            })
          },
        }
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('correo_electronico', 'activacion@example.com')

    const result = await iniciarActivacionCuenta(formData)

    expect(result).toBeUndefined()
    expect(supabase.auth.updateUser).toHaveBeenCalledWith(
      {
        email: 'activacion@example.com',
      },
      {
        emailRedirectTo: 'http://localhost:3000/update-password',
      }
    )
    expect(adminDouble.usuarioUpdates).toHaveLength(1)
    expect(adminDouble.usuarioUpdates[0]).toMatchObject({
      correo_electronico: 'activacion@example.com',
      estado_cuenta: 'PENDIENTE_VERIFICACION_EMAIL',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout')
    expect(redirectMock).toHaveBeenCalledWith('/check-email')
  })

  it('completa la activacion y deja la cuenta ACTIVA al definir contrasena', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: { id: 'usuario-1', empleado_id: 'emp-1' },
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'ana@example.com',
              email_confirmed_at: '2026-03-16T20:00:00.000Z',
            },
          },
        }),
        updateUser: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('password', '12345678')

    const result = await updatePassword(formData)

    expect(result).toBeUndefined()
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: '12345678' })
    expect(adminDouble.usuarioUpdates).toHaveLength(1)
    expect(adminDouble.usuarioUpdates[0]).toMatchObject({
      estado_cuenta: 'ACTIVA',
      correo_verificado: true,
      correo_electronico: 'ana@example.com',
    })
    expect(adminDouble.empleadoUpdates).toHaveLength(1)
    expect(adminDouble.empleadoUpdates[0]).toMatchObject({
      correo_electronico: 'ana@example.com',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout')
    expect(redirectMock).toHaveBeenCalledWith('/dashboard')
  })

  it('bloquea la activacion si el correo ya pertenece a otra cuenta verificada', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: { id: 'usuario-1', estado_cuenta: 'PROVISIONAL' },
      duplicateVerifiedUser: {
        id: 'usuario-duplicado',
        correo_verificado: true,
        estado_cuenta: 'ACTIVA',
        correo_electronico: 'ana@example.com',
      },
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'temp@example.com',
            },
          },
        }),
        updateUser: vi.fn().mockResolvedValue({ error: null }),
      },
      from(table: string) {
        if (table !== 'usuario') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'usuario-1', estado_cuenta: 'PROVISIONAL' },
              error: null,
            })
          },
        }
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('correo_electronico', 'ana@example.com')

    const result = await iniciarActivacionCuenta(formData)

    expect(result).toEqual({
      error:
        'Ese correo ya pertenece a otra cuenta verificada. Usa un correo distinto o solicita correccion administrativa.',
    })
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
    expect(adminDouble.usuarioUpdates).toHaveLength(0)
  })

  it('despues de definir contrasena redirige a primer acceso si el padron lo exige', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: { id: 'usuario-1', empleado_id: 'emp-1' },
      empleadoSesion: {
        metadata: {
          onboarding_inicial: {
            primer_acceso: {
              required: true,
              estado: 'PENDIENTE',
            },
          },
        },
      },
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'ana@example.com',
              email_confirmed_at: '2026-03-16T20:00:00.000Z',
            },
          },
        }),
        updateUser: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('password', '12345678')

    const result = await updatePassword(formData)

    expect(result).toBeUndefined()
    expect(redirectMock).toHaveBeenCalledWith('/primer-acceso')
  })

  it('bloquea la activacion final si el correo ya fue verificado por otra persona', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: { id: 'usuario-1', empleado_id: 'emp-1' },
      duplicateVerifiedUser: {
        id: 'usuario-duplicado',
        correo_verificado: true,
        estado_cuenta: 'ACTIVA',
        correo_electronico: 'ana@example.com',
      },
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'ana@example.com',
              email_confirmed_at: '2026-03-16T20:00:00.000Z',
            },
          },
        }),
        updateUser: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('password', '12345678')

    const result = await updatePassword(formData)

    expect(result).toEqual({
      error:
        'Ese correo ya fue verificado por otra persona. Contacta al administrador para corregir tu acceso antes de continuar.',
    })
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
    expect(adminDouble.usuarioUpdates).toHaveLength(0)
    expect(adminDouble.empleadoUpdates).toHaveLength(0)
  })

  it('cubre de punta a punta PROVISIONAL -> PENDIENTE_VERIFICACION_EMAIL -> ACTIVA con correo verificado', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        estado_cuenta: 'PROVISIONAL',
        empleado_id: 'emp-1',
        correo_electronico: 'temp@example.com',
      },
    })

    const authGetUserMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 'auth-1',
            email: 'temp@example.com',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 'auth-1',
            email: 'ana@example.com',
            email_confirmed_at: '2026-03-16T20:00:00.000Z',
          },
        },
      })

    const supabase = {
      auth: {
        getUser: authGetUserMock,
        updateUser: vi.fn().mockResolvedValue({ error: null }),
      },
      from(table: string) {
        if (table !== 'usuario') {
          throw new Error(`Unexpected table ${table}`)
        }

        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle() {
            return Promise.resolve({
              data: { ...adminDouble.usuarioState },
              error: null,
            })
          },
        }
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const activationForm = new FormData()
    activationForm.set('correo_electronico', 'ana@example.com')

    const activationResult = await iniciarActivacionCuenta(activationForm)

    expect(activationResult).toBeUndefined()
    expect(adminDouble.usuarioState.estado_cuenta).toBe('PENDIENTE_VERIFICACION_EMAIL')
    expect(adminDouble.usuarioState.correo_electronico).toBe('ana@example.com')
    expect(supabase.auth.updateUser).toHaveBeenNthCalledWith(
      1,
      { email: 'ana@example.com' },
      { emailRedirectTo: 'http://localhost:3000/update-password' }
    )
    expect(redirectMock).toHaveBeenNthCalledWith(1, '/check-email')

    const passwordForm = new FormData()
    passwordForm.set('password', '12345678')

    const passwordResult = await updatePassword(passwordForm)

    expect(passwordResult).toBeUndefined()
    expect(supabase.auth.updateUser).toHaveBeenNthCalledWith(2, { password: '12345678' })
    expect(adminDouble.usuarioState.estado_cuenta).toBe('ACTIVA')
    expect(adminDouble.usuarioUpdates).toHaveLength(2)
    expect(adminDouble.empleadoUpdates).toHaveLength(1)
    expect(adminDouble.empleadoUpdates[0]).toMatchObject({
      correo_electronico: 'ana@example.com',
    })
    expect(redirectMock).toHaveBeenNthCalledWith(2, '/dashboard')
  })

  it('confirma el primer acceso y libera el dashboard', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        empleado_id: 'emp-1',
        cuenta_cliente_id: 'c1',
        estado_cuenta: 'ACTIVA',
      },
      empleadoSesion: {
        id: 'emp-1',
        metadata: {
          onboarding_inicial: {
            primer_acceso: {
              required: true,
              estado: 'PENDIENTE',
            },
          },
        },
      },
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'ana@example.com',
              email_confirmed_at: '2026-03-16T20:00:00.000Z',
            },
          },
        }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const result = await confirmarPrimerAccesoDatos({ error: null }, new FormData())

    expect(result).toBeUndefined()
    expect(adminDouble.empleadoUpdates).toHaveLength(1)
    expect(adminDouble.empleadoState.metadata).toMatchObject({
      onboarding_inicial: {
        primer_acceso: {
          required: false,
          estado: 'CONFIRMADO',
        },
      },
    })
    expect(adminDouble.auditRows).toHaveLength(1)
    expect(redirectMock).toHaveBeenCalledWith('/dashboard')
  })

  it('permite solicitar correccion durante primer acceso y deja trazabilidad', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        empleado_id: 'emp-1',
        cuenta_cliente_id: 'c1',
        username: 'ana.temp',
        correo_electronico: 'ana@correo.com',
        estado_cuenta: 'ACTIVA',
      },
      empleadoSesion: {
        id: 'emp-1',
        nombre_completo: 'Ana Demo',
        puesto: 'DERMOCONSEJERO',
        metadata: {
          onboarding_inicial: {
            primer_acceso: {
              required: true,
              estado: 'PENDIENTE',
            },
          },
        },
      },
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'ana@example.com',
              email_confirmed_at: '2026-03-16T20:00:00.000Z',
            },
          },
        }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('detalle', 'Mi telefono y mi domicilio necesitan actualizacion.')

    const result = await solicitarCorreccionPrimerAcceso({ error: null }, formData)

    expect(result).toBeUndefined()
    expect(adminDouble.mensajeRows).toHaveLength(1)
    expect(adminDouble.receptorRows.length).toBeGreaterThan(0)
    expect(adminDouble.empleadoState.metadata).toMatchObject({
      onboarding_inicial: {
        primer_acceso: {
          required: false,
          estado: 'CORRECCION_SOLICITADA',
          correctionMessageId: 'mensaje-1',
        },
      },
    })
    expect(adminDouble.auditRows).toHaveLength(1)
    expect(redirectMock).toHaveBeenCalledWith('/dashboard')
  })
})
