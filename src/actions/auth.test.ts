import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  redirectMock,
  revalidatePathMock,
  createClientMock,
  obtenerClienteAdminMock,
  obtenerUrlBaseAplicacionMock,
  cookiesMock,
  sendCredentialTransitionLinkEmailMock,
  sendPasswordChangedNoticeEmailMock,
  sendActivationOtpEmailMock,
  sendEmailChangeNoticeToCurrentEmailMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  createClientMock: vi.fn(),
  obtenerClienteAdminMock: vi.fn(),
  obtenerUrlBaseAplicacionMock: vi.fn(),
  cookiesMock: vi.fn(),
  sendCredentialTransitionLinkEmailMock: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedNoticeEmailMock: vi.fn().mockResolvedValue(undefined),
  sendActivationOtpEmailMock: vi.fn().mockResolvedValue(undefined),
  sendEmailChangeNoticeToCurrentEmailMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/auth/admin', () => ({
  obtenerClienteAdmin: obtenerClienteAdminMock,
  obtenerUrlBaseAplicacion: obtenerUrlBaseAplicacionMock,
}))

vi.mock('@/lib/notifications/authSecurityEmail', () => ({
  sendCredentialTransitionLinkEmail: sendCredentialTransitionLinkEmailMock,
  sendPasswordChangedNoticeEmail: sendPasswordChangedNoticeEmailMock,
  sendActivationOtpEmail: sendActivationOtpEmailMock,
  sendEmailChangeNoticeToCurrentEmail: sendEmailChangeNoticeToCurrentEmailMock,
}))

import {
  confirmarPrimerAccesoDatos,
  iniciarActivacionCuenta,
  login,
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
    correo_verificado?: boolean | null
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
  flowRows?: Array<Partial<Record<string, unknown>>>
}) {
  const usuarioState = {
    id: options.usuarioSesion?.id ?? 'usuario-1',
    estado_cuenta: options.usuarioSesion?.estado_cuenta,
    empleado_id: options.usuarioSesion?.empleado_id,
    cuenta_cliente_id: options.usuarioSesion?.cuenta_cliente_id ?? 'c1',
    auth_user_id: options.usuarioSesion?.auth_user_id ?? 'auth-1',
    username: options.usuarioSesion?.username ?? 'usuario.temporal',
    correo_electronico: options.usuarioSesion?.correo_electronico ?? null,
    correo_verificado: options.usuarioSesion?.correo_verificado ?? null,
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
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = []
  const flowRows = (options.flowRows ?? []).map((row, index) => ({
    id: String(row.id ?? `flow-${index + 1}`),
    usuario_id: String(row.usuario_id ?? usuarioState.id),
    auth_user_id: (row.auth_user_id as string | null | undefined) ?? usuarioState.auth_user_id ?? 'auth-1',
    tipo_flujo: String(row.tipo_flujo ?? 'PRIMER_INGRESO'),
    estado: String(row.estado ?? 'AWAITING_EMAIL_CONFIRMATION'),
    correo_anterior: (row.correo_anterior as string | null | undefined) ?? null,
    correo_pendiente:
      (row.correo_pendiente as string | null | undefined) ??
      usuarioState.correo_electronico ??
      'ana@example.com',
    correo_confirmado: (row.correo_confirmado as string | null | undefined) ?? null,
    link_sent_at: (row.link_sent_at as string | null | undefined) ?? null,
    link_expires_at: (row.link_expires_at as string | null | undefined) ?? null,
    email_confirmed_at: (row.email_confirmed_at as string | null | undefined) ?? null,
    otp_code_hash: (row.otp_code_hash as string | null | undefined) ?? null,
    otp_expires_at: (row.otp_expires_at as string | null | undefined) ?? null,
    otp_sent_at: (row.otp_sent_at as string | null | undefined) ?? null,
    otp_attempts: Number(row.otp_attempts ?? 0),
    activation_ticket_hash: (row.activation_ticket_hash as string | null | undefined) ?? null,
    activation_ticket_expires_at:
      (row.activation_ticket_expires_at as string | null | undefined) ?? null,
    password_set_at: (row.password_set_at as string | null | undefined) ?? null,
    completed_at: (row.completed_at as string | null | undefined) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? {},
    created_at:
      (row.created_at as string | null | undefined) ?? '2026-04-20T12:00:00.000Z',
    updated_at:
      (row.updated_at as string | null | undefined) ?? '2026-04-20T12:00:00.000Z',
  }))

  function matchesFilters(row: Record<string, unknown>, filters: Record<string, unknown>) {
    return Object.entries(filters).every(([key, value]) => {
      if (key.startsWith('neq:')) {
        return row[key.slice(4)] !== value
      }

      if (key.startsWith('in:')) {
        return Array.isArray(value) && value.includes(row[key.slice(3)])
      }

      return row[key] === value
    })
  }

  function applyOrderAndLimit<T extends Record<string, unknown>>(
    rows: T[],
    orderColumn: string | null,
    ascending: boolean,
    limitCount: number | null
  ) {
    const ordered = [...rows]

    if (orderColumn) {
      ordered.sort((left, right) => {
        const leftValue = String(left[orderColumn] ?? '')
        const rightValue = String(right[orderColumn] ?? '')
        return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
      })
    }

    if (limitCount != null) {
      return ordered.slice(0, limitCount)
    }

    return ordered
  }

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
              const correoFiltrado = filters.correo_electronico
                ? String(filters.correo_electronico).toLowerCase()
                : null
              const usuarioCorreo = String(usuarioState.correo_electronico ?? '').toLowerCase()

              if (filters.auth_user_id && filters.auth_user_id !== usuarioState.auth_user_id) {
                return Promise.resolve({
                  data: null,
                  error: null,
                })
              }

              if (filters.username && filters.username !== usuarioState.username) {
                return Promise.resolve({
                  data: null,
                  error: null,
                })
              }

              if (filters.correo_electronico) {
                if (usuarioCorreo && usuarioCorreo !== correoFiltrado) {
                  return Promise.resolve({
                    data: null,
                    error: null,
                  })
                }
              }

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
                  data: [{ id: 'admin-1', nombre_completo: 'Admin Uno', puesto: 'ADMINISTRADOR' }],
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

        if (table === 'auth_activation_flow') {
          const filters: Record<string, unknown> = {}
          let orderColumn: string | null = null
          let ascending = true
          let limitCount: number | null = null

          const getRows = () =>
            applyOrderAndLimit(
              flowRows.filter((row) => matchesFilters(row, filters)),
              orderColumn,
              ascending,
              limitCount
            )

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
            in(column: string, value: unknown[]) {
              filters[`in:${column}`] = value
              return this
            },
            order(column: string, options?: { ascending?: boolean }) {
              orderColumn = column
              ascending = options?.ascending ?? true
              return this
            },
            limit(value: number) {
              limitCount = value
              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: getRows()[0] ?? null,
                error: null,
              })
            },
            single() {
              return Promise.resolve({
                data: getRows()[0] ?? null,
                error: null,
              })
            },
            insert(payload: Record<string, unknown>) {
              const row = {
                id: `flow-${flowRows.length + 1}`,
                ...payload,
              }
              flowRows.push(row)

              return {
                select() {
                  return this
                },
                single() {
                  return Promise.resolve({ data: row, error: null })
                },
              }
            },
            update(payload: Record<string, unknown>) {
              const updateFilters: Record<string, unknown> = {}
              let updateOrderColumn: string | null = null
              let updateAscending = true
              let updateLimitCount: number | null = null
              let applied = false
              let result: { data: Record<string, unknown> | null; error: null } = {
                data: null,
                error: null,
              }

              const applyUpdate = () => {
                if (applied) {
                  return result
                }

                const matched = applyOrderAndLimit(
                  flowRows.filter((row) => matchesFilters(row, updateFilters)),
                  updateOrderColumn,
                  updateAscending,
                  updateLimitCount
                )

                matched.forEach((row) => Object.assign(row, payload))
                result = {
                  data: matched[0] ?? null,
                  error: null,
                }
                applied = true
                return result
              }

              const builder = {
                eq(column: string, value: unknown) {
                  updateFilters[column] = value
                  return builder
                },
                in(column: string, value: unknown[]) {
                  updateFilters[`in:${column}`] = value
                  return builder
                },
                order(column: string, options?: { ascending?: boolean }) {
                  updateOrderColumn = column
                  updateAscending = options?.ascending ?? true
                  return builder
                },
                limit(value: number) {
                  updateLimitCount = value
                  return builder
                },
                select() {
                  return builder
                },
                single() {
                  return Promise.resolve(applyUpdate())
                },
                maybeSingle() {
                  return Promise.resolve(applyUpdate())
                },
                then(
                  resolve: (value: { data: Record<string, unknown> | null; error: null }) => unknown,
                  reject?: (reason?: unknown) => unknown
                ) {
                  return Promise.resolve(applyUpdate()).then(resolve, reject)
                },
              }

              return builder
            },
          }
        }

        throw new Error(`Unexpected admin table ${table}`)
      },
      rpc(fn: string, args?: Record<string, unknown>) {
        rpcCalls.push({ fn, args })
        return Promise.resolve({ error: null })
      },
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: usuarioState.auth_user_id ?? 'auth-1',
                email: usuarioState.correo_electronico ?? 'temp@example.com',
                user_metadata: {
                  username: usuarioState.username,
                  provisional_email: true,
                  pending_email: usuarioState.correo_electronico,
                  allow_username_login: true,
                },
              },
            },
            error: null,
          }),
          updateUserById: vi.fn().mockResolvedValue({
            data: { user: { id: usuarioState.auth_user_id ?? 'auth-1' } },
            error: null,
          }),
          generateLink: vi.fn().mockResolvedValue({
            data: {
              properties: {
                action_link: 'http://localhost:3000/mock-link',
              },
            },
            error: null,
          }),
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
    flowRows,
    rpcCalls,
  }
}

describe('auth actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    obtenerUrlBaseAplicacionMock.mockResolvedValue('http://localhost:3000')
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined),
      set: vi.fn(),
    })
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
    expect(adminDouble.usuarioUpdates).toHaveLength(1)
    expect(adminDouble.usuarioUpdates[0]).toMatchObject({
      correo_electronico: 'activacion@example.com',
      estado_cuenta: 'PENDIENTE_VERIFICACION_EMAIL',
    })
    expect(adminDouble.flowRows).toHaveLength(1)
    expect(adminDouble.flowRows[0]).toMatchObject({
      usuario_id: 'usuario-1',
      tipo_flujo: 'PRIMER_INGRESO',
      estado: 'AWAITING_EMAIL_CONFIRMATION',
      correo_pendiente: 'activacion@example.com',
    })
    expect(adminDouble.flowRows[0].metadata).toEqual(
      expect.objectContaining({
        source: 'primer_ingreso',
        app_link_token_hash: expect.any(String),
        app_link_expires_at: expect.any(String),
        resend_count: 1,
      })
    )
    expect(sendCredentialTransitionLinkEmailMock).toHaveBeenCalledWith(
      { email: 'activacion@example.com' },
      expect.objectContaining({
        actionHref: expect.stringMatching(
          /^http:\/\/localhost:3000\/api\/auth\/confirm\?flow_id=flow-\d+&flow_token=.+$/
        ),
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout')
    expect(redirectMock).toHaveBeenCalledWith('/activacion')
  })

  it('ya no depende de updateUser de Supabase para activar una cuenta provisional', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: { id: 'usuario-1', estado_cuenta: 'PROVISIONAL' },
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'btl-adm-1249@provisional.fieldforce.invalid',
            },
          },
        }),
        updateUser: vi.fn().mockResolvedValue({
          error: {
            message:
              'Email address "btl-adm-1249@provisional.fieldforce.invalid" is invalid',
          },
        }),
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
    formData.set('correo_electronico', 'hectorvalle@live.com.mx')

    const result = await iniciarActivacionCuenta(formData)

    expect(result).toBeUndefined()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
    expect(adminDouble.usuarioUpdates).toHaveLength(1)
    expect(adminDouble.usuarioUpdates[0]).toMatchObject({
      correo_electronico: 'hectorvalle@live.com.mx',
      estado_cuenta: 'PENDIENTE_VERIFICACION_EMAIL',
    })
    expect(adminDouble.flowRows).toHaveLength(1)
    expect(sendCredentialTransitionLinkEmailMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).toHaveBeenCalledWith('/activacion')
  })

  it('completa la activacion, invalida el acceso provisional y obliga re-login', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: { id: 'usuario-1', empleado_id: 'emp-1' },
      flowRows: [
        {
          id: 'flow-1',
          usuario_id: 'usuario-1',
          auth_user_id: 'auth-1',
          tipo_flujo: 'PRIMER_INGRESO',
          estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
          correo_pendiente: 'ana@example.com',
          correo_confirmado: 'ana@example.com',
          email_confirmed_at: '2026-03-16T20:00:00.000Z',
        },
      ],
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
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('flow_id', 'flow-1')
    formData.set('password', 'Nueva123')
    formData.set('confirm_password', 'Nueva123')

    const result = await updatePassword(formData)

    expect(result).toBeUndefined()
    expect(adminDouble.usuarioUpdates).toHaveLength(1)
    expect(adminDouble.usuarioUpdates[0]).toMatchObject({
      auth_user_id: 'auth-1',
      estado_cuenta: 'ACTIVA',
      correo_verificado: true,
      correo_electronico: 'ana@example.com',
      password_temporal_generada_en: null,
      password_temporal_expira_en: null,
    })
    expect(adminDouble.service.auth.admin.updateUserById).toHaveBeenCalledWith('auth-1', {
      email: 'ana@example.com',
      password: 'Nueva123',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        pending_email: null,
        provisional_email: false,
        allow_username_login: false,
        email_verified: true,
        first_access_password: false,
        confirmed_email: 'ana@example.com',
      }),
    })
    expect(adminDouble.empleadoUpdates).toHaveLength(1)
    expect(adminDouble.empleadoUpdates[0]).toMatchObject({
      correo_electronico: 'ana@example.com',
    })
    expect(adminDouble.flowRows[0]).toMatchObject({
      estado: 'COMPLETED',
      correo_confirmado: 'ana@example.com',
    })
    expect(adminDouble.rpcCalls.map((call) => call.fn)).toEqual([
      'invalidar_sesiones_auth_user',
      'refrescar_claims_auth_user',
    ])
    expect(supabase.auth.signOut).toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout')
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?notice=Tu%20acceso%20ya%20esta%20listo.%20Entra%20con%20ana%40example.com%20y%20tu%20nueva%20contrasena.'
    )
  })

  it('resuelve el correo final desde usuario.correo_electronico cuando falta pending_email', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        empleado_id: 'emp-1',
        correo_electronico: 'ana@example.com',
      },
      flowRows: [
        {
          id: 'flow-1',
          usuario_id: 'usuario-1',
          auth_user_id: 'auth-1',
          tipo_flujo: 'PRIMER_INGRESO',
          estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
          correo_pendiente: 'ana@example.com',
          correo_confirmado: null,
          email_confirmed_at: '2026-03-16T20:00:00.000Z',
        },
      ],
    })
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
              email: 'btl-sup-1229@provisional.fieldforce.invalid',
              email_confirmed_at: '2026-03-16T20:00:00.000Z',
            },
          },
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    adminDouble.service.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'auth-1',
          email: 'btl-sup-1229@provisional.fieldforce.invalid',
          user_metadata: {
            username: 'btl-sup-1229',
            provisional_email: true,
            first_access_password: true,
          },
        },
      },
      error: null,
    })

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('flow_id', 'flow-1')
    formData.set('password', 'Nueva123')
    formData.set('confirm_password', 'Nueva123')

    const result = await updatePassword(formData)

    expect(result).toBeUndefined()
    expect(adminDouble.service.auth.admin.updateUserById).toHaveBeenCalledWith('auth-1', {
      email: 'ana@example.com',
      password: 'Nueva123',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        pending_email: null,
        provisional_email: false,
        allow_username_login: false,
        email_verified: true,
        first_access_password: false,
        confirmed_email: 'ana@example.com',
      }),
    })
    expect(adminDouble.usuarioUpdates).toHaveLength(1)
    expect(adminDouble.usuarioUpdates[0]).toMatchObject({
      auth_user_id: 'auth-1',
      estado_cuenta: 'ACTIVA',
      correo_verificado: true,
      correo_electronico: 'ana@example.com',
      password_temporal_generada_en: null,
      password_temporal_expira_en: null,
    })
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?notice=Tu%20acceso%20ya%20esta%20listo.%20Entra%20con%20ana%40example.com%20y%20tu%20nueva%20contrasena.'
    )
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

  it('despues de definir contrasena obliga re-login aun si el padron exige primer acceso', async () => {
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
      flowRows: [
        {
          id: 'flow-1',
          usuario_id: 'usuario-1',
          auth_user_id: 'auth-1',
          tipo_flujo: 'PRIMER_INGRESO',
          estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
          correo_pendiente: 'ana@example.com',
          correo_confirmado: 'ana@example.com',
          email_confirmed_at: '2026-03-16T20:00:00.000Z',
        },
      ],
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
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('flow_id', 'flow-1')
    formData.set('password', 'Nueva123')
    formData.set('confirm_password', 'Nueva123')

    const result = await updatePassword(formData)

    expect(result).toBeUndefined()
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?notice=Tu%20acceso%20ya%20esta%20listo.%20Entra%20con%20ana%40example.com%20y%20tu%20nueva%20contrasena.'
    )
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
      flowRows: [
        {
          id: 'flow-1',
          usuario_id: 'usuario-1',
          auth_user_id: 'auth-1',
          tipo_flujo: 'PRIMER_INGRESO',
          estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
          correo_pendiente: 'ana@example.com',
          correo_confirmado: 'ana@example.com',
          email_confirmed_at: '2026-03-16T20:00:00.000Z',
        },
      ],
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
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('flow_id', 'flow-1')
    formData.set('password', 'Nueva123')
    formData.set('confirm_password', 'Nueva123')

    await expect(updatePassword(formData)).rejects.toThrow(
      'Ese correo ya fue verificado por otra cuenta. Contacta al administrador para corregir el acceso.'
    )
    expect(adminDouble.service.auth.admin.updateUserById).not.toHaveBeenCalled()
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
    expect(adminDouble.flowRows).toHaveLength(1)
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
    expect(sendCredentialTransitionLinkEmailMock).toHaveBeenCalledWith(
      { email: 'ana@example.com' },
      expect.objectContaining({
        actionHref: expect.stringMatching(
          /^http:\/\/localhost:3000\/api\/auth\/confirm\?flow_id=flow-\d+&flow_token=.+$/
        ),
      })
    )
    expect(redirectMock).toHaveBeenNthCalledWith(1, '/activacion')

    const passwordForm = new FormData()
    passwordForm.set('flow_id', String(adminDouble.flowRows[0].id))
    passwordForm.set('password', 'Nueva123')
    passwordForm.set('confirm_password', 'Nueva123')

    supabase.auth.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'auth-1',
          email: 'ana@example.com',
          email_confirmed_at: '2026-03-16T20:00:00.000Z',
        },
      },
    })
    supabase.auth.signOut = vi.fn().mockResolvedValue({ error: null })

    const passwordResult = await updatePassword(passwordForm)

    expect(passwordResult).toBeUndefined()
    expect(adminDouble.usuarioState.estado_cuenta).toBe('ACTIVA')
    expect(adminDouble.usuarioUpdates).toHaveLength(2)
    expect(adminDouble.empleadoUpdates).toHaveLength(1)
    expect(adminDouble.empleadoUpdates[0]).toMatchObject({
      correo_electronico: 'ana@example.com',
    })
    expect(redirectMock).toHaveBeenNthCalledWith(
      2,
      '/login?notice=Tu%20acceso%20ya%20esta%20listo.%20Entra%20con%20ana%40example.com%20y%20tu%20nueva%20contrasena.'
    )
  })

  it('permite finalizar credenciales aunque la cookie temporal no viaje si el flujo ya quedo confirmado', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        estado_cuenta: 'PROVISIONAL',
        empleado_id: 'emp-1',
        correo_electronico: 'temp@example.com',
      },
      flowRows: [
        {
          id: 'flow-confirmed',
          usuario_id: 'usuario-1',
          auth_user_id: 'auth-1',
          tipo_flujo: 'PRIMER_INGRESO',
          estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
          correo_pendiente: 'ana@example.com',
          correo_confirmado: 'ana@example.com',
          email_confirmed_at: '2026-03-16T20:00:00.000Z',
          metadata: {
            source: 'primer_ingreso',
          },
        },
      ],
    })

    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('flow_id', 'flow-confirmed')
    formData.set('password', 'Nueva123')
    formData.set('confirm_password', 'Nueva123')

    const result = await updatePassword(formData)

    expect(result).toBeUndefined()
    expect(adminDouble.service.auth.admin.updateUserById).toHaveBeenCalledWith('auth-1', {
      email: 'ana@example.com',
      password: 'Nueva123',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        pending_email: null,
        provisional_email: false,
        allow_username_login: false,
        email_verified: true,
        first_access_password: false,
        confirmed_email: 'ana@example.com',
      }),
    })
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?notice=Tu%20acceso%20ya%20esta%20listo.%20Entra%20con%20ana%40example.com%20y%20tu%20nueva%20contrasena.'
    )
  })

  it('recupera el acceso inicial usando username provisional y password BTL2026', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        estado_cuenta: 'PROVISIONAL',
        empleado_id: 'emp-1',
        auth_user_id: 'auth-1',
        username: 'btl-adm-1249',
        correo_electronico: 'admin@empresa.com',
      },
    })

    adminDouble.service.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'auth-1',
          email: 'btl-adm-1249@provisional.fieldforce.invalid',
        },
      },
      error: null,
    })

    const signInWithPasswordMock = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
      .mockResolvedValueOnce({ error: null })

    const getUserMock = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: 'auth-1',
          email: 'btl-adm-1249@provisional.fieldforce.invalid',
        },
      },
    })

    const supabase = {
      auth: {
        signInWithPassword: signInWithPasswordMock,
        getUser: getUserMock,
        signOut: vi.fn(),
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
              data: { estado_cuenta: 'PROVISIONAL' },
              error: null,
            })
          },
          update() {
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: {
        ...adminDouble.service,
        auth: {
          admin: {
            ...adminDouble.service.auth.admin,
            updateUserById: vi.fn().mockResolvedValue({
              data: { user: { id: 'auth-1' } },
              error: null,
            }),
          },
        },
      },
      error: null,
    })

    const formData = new FormData()
    formData.set('acceso', 'btl-adm-1249')
    formData.set('password', 'BTL2026')

    const result = await login(formData)

    expect(result).toEqual({ error: 'Invalid login credentials' })
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(2)
    expect(signInWithPasswordMock).toHaveBeenNthCalledWith(1, {
      email: 'btl-adm-1249@provisional.fieldforce.invalid',
      password: 'BTL2026',
    })
    expect(signInWithPasswordMock).toHaveBeenNthCalledWith(2, {
      email: 'btl-adm-1249@provisional.fieldforce.invalid',
      password: 'BTL2026',
    })
    expect(redirectMock).toHaveBeenCalledWith('/activacion')
  })

  it('convierte respuestas de autenticacion invalidas en un error amigable', async () => {
    const supabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          error: {
            message: `Unexpected token 'e', "error code: 1016" is not valid JSON`,
          },
        }),
        getUser: vi.fn(),
        signOut: vi.fn(),
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
              data: {
                estado_cuenta: 'ACTIVA',
              },
              error: null,
            })
          },
          update() {
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: null,
      error: 'backend administrativo no configurado',
    })

    const formData = new FormData()
    formData.set('acceso', 'hector@artolagroup.com')
    formData.set('password', '12345678')

    const result = await login(formData)

    expect(result).toEqual({
      error: 'No fue posible conectar con el servicio de autenticacion. Reintenta en unos minutos.',
    })
  })

  it('no intenta la recuperacion inicial cuando el auth responde con error de red', async () => {
    const supabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          error: {
            message: `Unexpected token 'e', "error code: 1016" is not valid JSON`,
          },
        }),
        getUser: vi.fn(),
        signOut: vi.fn(),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: null,
      error: null,
    })

    const formData = new FormData()
    formData.set('acceso', 'hector@artolagroup.com')
    formData.set('password', '12345678')

    const result = await login(formData)

    expect(result).toEqual({
      error: 'No fue posible conectar con el servicio de autenticacion. Reintenta en unos minutos.',
    })
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(1)
  })

  it('invalida el username provisional cuando la cuenta ya esta activa con correo final', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        estado_cuenta: 'ACTIVA',
        auth_user_id: 'auth-1',
        username: 'btl-adm-1249',
        correo_electronico: 'hector@artolagroup.com',
        correo_verificado: true,
      },
    })

    adminDouble.service.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'auth-1',
          email: 'hector@artolagroup.com',
          user_metadata: {
            username: 'btl-adm-1249',
            provisional_email: false,
            allow_username_login: false,
          },
        },
      },
      error: null,
    })

    const supabase = {
      auth: {
        signInWithPassword: vi.fn(),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('acceso', 'btl-adm-1249')
    formData.set('password', 'BTL2026')

    const result = await login(formData)

    expect(result).toEqual({
      error: 'Tu usuario provisional ya no es valido. Inicia sesion con tu correo corporativo.',
    })
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('reconcilia el correo de auth cuando una cuenta activa ya no debe usar datos provisionales', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        estado_cuenta: 'ACTIVA',
        auth_user_id: 'auth-1',
        username: 'btl-sup-1240',
        correo_electronico: 'luzevelialopezgutierrez@gmail.com',
        correo_verificado: true,
      },
    })

    adminDouble.service.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'auth-1',
          email: 'btl-sup-1240@provisional.fieldforce.invalid',
          user_metadata: {
            username: 'btl-sup-1240',
            provisional_email: true,
            allow_username_login: true,
            pending_email: 'luzevelialopezgutierrez@gmail.com',
          },
        },
      },
      error: null,
    })

    const signInWithPasswordMock = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      auth: {
        signInWithPassword: signInWithPasswordMock,
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
            },
          },
        }),
        signOut: vi.fn(),
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
              data: {
                estado_cuenta: 'ACTIVA',
              },
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
    formData.set('acceso', 'luzevelialopezgutierrez@gmail.com')
    formData.set('password', 'Segura2026')

    const result = await login(formData)

    expect(result).toBeUndefined()
    expect(adminDouble.service.auth.admin.updateUserById).toHaveBeenCalledWith('auth-1', {
      email: 'luzevelialopezgutierrez@gmail.com',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        provisional_email: false,
        allow_username_login: false,
        pending_email: null,
        confirmed_email: 'luzevelialopezgutierrez@gmail.com',
        email_verified: true,
      }),
    })
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'luzevelialopezgutierrez@gmail.com',
      password: 'Segura2026',
    })
  })

  it('redirige al enlace caducado si el ultimo flujo de primer ingreso expiro', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        estado_cuenta: 'PROVISIONAL',
        auth_user_id: 'auth-1',
        username: 'btl-sup-1229',
        correo_electronico: 'btl-sup-1229@provisional.fieldforce.invalid',
        correo_verificado: false,
      },
      flowRows: [
        {
          id: 'flow-expired',
          usuario_id: 'usuario-1',
          auth_user_id: 'auth-1',
          tipo_flujo: 'PRIMER_INGRESO',
          estado: 'EXPIRED',
          correo_pendiente: 'ana@example.com',
          correo_confirmado: 'ana@example.com',
          email_confirmed_at: '2026-04-20T10:00:00.000Z',
          metadata: {
            source: 'primer_ingreso',
          },
        },
      ],
    })

    const signInWithPasswordMock = vi.fn()
    const supabase = {
      auth: {
        signInWithPassword: signInWithPasswordMock,
        getUser: vi.fn(),
        signOut: vi.fn(),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('acceso', 'btl-sup-1229')
    formData.set('password', 'BTL2026')

    const result = await login(formData)

    expect(result).toEqual({ error: null })
    expect(signInWithPasswordMock).not.toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith('/enlace-caducado?flow_id=flow-expired')
  })

  it('permite entrar con correo final aunque el auth siga provisional si la cuenta ya existe en usuario', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        estado_cuenta: 'PROVISIONAL',
        auth_user_id: 'auth-1',
        username: 'btl-sup-1229',
        correo_electronico: 'ana@example.com',
        correo_verificado: false,
      },
    })

    adminDouble.service.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'auth-1',
          email: 'btl-sup-1229@provisional.fieldforce.invalid',
          user_metadata: {
            username: 'btl-sup-1229',
            provisional_email: true,
            allow_username_login: true,
          },
        },
      },
      error: null,
    })

    const signInWithPasswordMock = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      auth: {
        signInWithPassword: signInWithPasswordMock,
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'auth-1',
            },
          },
        }),
        signOut: vi.fn(),
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
              data: {
                estado_cuenta: 'PROVISIONAL',
              },
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
    formData.set('acceso', 'ana@example.com')
    formData.set('password', 'BTL2026')

    const result = await login(formData)

    expect(result).toBeUndefined()
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'btl-sup-1229@provisional.fieldforce.invalid',
      password: 'BTL2026',
    })
  })

  it('reconcilia una cuenta operativa cuando el auth_user_id cambió pero el usuario sigue siendo el mismo', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-3',
        empleado_id: 'emp-3',
        cuenta_cliente_id: 'c1',
        estado_cuenta: 'ACTIVA',
        auth_user_id: 'de30972c-ba0e-4265-9dbe-cc555e883b7d',
        username: 'test_supervisor_03',
        correo_electronico: 'test_supervisor_03@fieldforce.test',
        correo_verificado: true,
      },
      empleadoSesion: {
        id: 'emp-3',
        nombre_completo: 'Supervisor Test 03',
        puesto: 'SUPERVISOR',
        metadata: {},
      },
    })

    adminDouble.service.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: '1ff20547-efa9-43c8-b2a3-759350f44de6',
          email: 'hectorvalle@live.com.mx',
          email_confirmed_at: '2026-04-23T14:00:00.000Z',
          user_metadata: {
            username: 'test_supervisor_03',
            provisional_email: false,
            allow_username_login: false,
          },
        },
      },
      error: null,
    })

    const usuarioState = adminDouble.usuarioState
    const signInWithPasswordMock = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      auth: {
        signInWithPassword: signInWithPasswordMock,
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: '1ff20547-efa9-43c8-b2a3-759350f44de6',
              email: 'hectorvalle@live.com.mx',
            },
          },
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from(table: string) {
        if (table !== 'usuario') {
          throw new Error(`Unexpected table ${table}`)
        }

        const filters: Record<string, unknown> = {}

        return {
          select() {
            return this
          },
          eq(column: string, value: unknown) {
            filters[column] = value
            return this
          },
          maybeSingle() {
            const correoFiltrado = String(filters.correo_electronico ?? '').toLowerCase()
            const usuarioCorreo = String(usuarioState.correo_electronico ?? '').toLowerCase()

            if (filters.auth_user_id && filters.auth_user_id !== usuarioState.auth_user_id) {
              return Promise.resolve({ data: null, error: null })
            }

            if (filters.username && filters.username !== usuarioState.username) {
              return Promise.resolve({ data: null, error: null })
            }

            if (filters.correo_electronico && usuarioCorreo !== correoFiltrado) {
              return Promise.resolve({ data: null, error: null })
            }

            return Promise.resolve({
              data: { ...usuarioState },
              error: null,
            })
          },
          update(payload: Record<string, unknown>) {
            Object.assign(usuarioState, payload)
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
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
    formData.set('acceso', 'hectorvalle@live.com.mx')
    formData.set('password', 'BTL2026')

    const result = await login(formData)

    expect(result).toBeUndefined()
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'hectorvalle@live.com.mx',
      password: 'BTL2026',
    })
    expect(adminDouble.service.auth.admin.getUserById).toHaveBeenCalledWith(
      '1ff20547-efa9-43c8-b2a3-759350f44de6'
    )
    expect(adminDouble.usuarioUpdates).toHaveLength(2)
    expect(adminDouble.usuarioUpdates[0]).toMatchObject({
      auth_user_id: '1ff20547-efa9-43c8-b2a3-759350f44de6',
      correo_electronico: 'hectorvalle@live.com.mx',
      correo_verificado: true,
    })
    expect(adminDouble.usuarioUpdates[1]).toMatchObject({
      ultimo_acceso_en: expect.any(String),
      updated_at: expect.any(String),
    })
    expect(redirectMock).toHaveBeenCalledWith('/dashboard')
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

  it('confirma el primer acceso aunque la cuenta venga pendiente de primer login', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        empleado_id: 'emp-1',
        cuenta_cliente_id: 'c1',
        estado_cuenta: 'PENDIENTE_PRIMER_LOGIN',
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
    expect(adminDouble.usuarioUpdates).toHaveLength(1)
    expect(adminDouble.usuarioState.estado_cuenta).toBe('ACTIVA')
    expect(adminDouble.empleadoState.metadata).toMatchObject({
      onboarding_inicial: {
        primer_acceso: {
          required: false,
          estado: 'CONFIRMADO',
        },
      },
    })
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
    expect(adminDouble.receptorRows).toHaveLength(1)
    expect(adminDouble.receptorRows[0]).toMatchObject({
      empleado_id: 'admin-1',
      metadata: expect.objectContaining({
        receptor_puesto: 'ADMINISTRADOR',
      }),
    })
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

  it('reconoce el flujo pendiente aunque el correo de entrada venga con mayusculas', async () => {
    const adminDouble = createAdminServiceDouble({
      usuarioSesion: {
        id: 'usuario-1',
        estado_cuenta: 'PROVISIONAL',
        auth_user_id: 'auth-1',
        username: 'btl-sup-1229',
        correo_electronico: 'ana@example.com',
        correo_verificado: false,
      },
      flowRows: [
        {
          id: 'flow-pending',
          usuario_id: 'usuario-1',
          auth_user_id: 'auth-1',
          tipo_flujo: 'PRIMER_INGRESO',
          estado: 'EMAIL_CONFIRMED_PASSWORD_PENDING',
          correo_pendiente: 'ana@example.com',
          correo_confirmado: 'ana@example.com',
          email_confirmed_at: '2026-04-20T10:00:00.000Z',
          metadata: {
            source: 'primer_ingreso',
          },
        },
      ],
    })

    const signInWithPasswordMock = vi.fn().mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    const supabase = {
      auth: {
        signInWithPassword: signInWithPasswordMock,
        getUser: vi.fn(),
        signOut: vi.fn(),
      },
    }

    createClientMock.mockResolvedValue(supabase)
    obtenerClienteAdminMock.mockReturnValue({
      service: adminDouble.service,
      error: null,
    })

    const formData = new FormData()
    formData.set('acceso', 'ANA@EXAMPLE.COM')
    formData.set('password', 'BTL2026')

    const result = await login(formData)

    expect(result).toEqual({
      error:
        'Tu cuenta ya esta verificada, pero todavia falta configurar tu seguridad. Usa el enlace reciente o solicita un codigo de acceso para retomar la activacion.',
    })
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'BTL2026',
    })
    expect(redirectMock).not.toHaveBeenCalledWith('/dashboard')
  })
})
