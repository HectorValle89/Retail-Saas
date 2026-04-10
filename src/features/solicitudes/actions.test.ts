import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  revalidatePathMock,
  requerirPuestosActivosMock,
  createServiceClientMock,
  sendOperationalPushNotificationMock,
  storeOptimizedEvidenceMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requerirPuestosActivosMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  sendOperationalPushNotificationMock: vi.fn(),
  storeOptimizedEvidenceMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/auth/session', () => ({
  requerirPuestosActivos: requerirPuestosActivosMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}))

vi.mock('@/lib/push/pushFanout', () => ({
  sendOperationalPushNotification: sendOperationalPushNotificationMock,
}))

vi.mock('@/lib/files/evidenceStorage', () => ({
  storeOptimizedEvidence: storeOptimizedEvidenceMock,
}))

vi.mock('@/lib/files/documentOptimization', () => ({
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES: 12 * 1024 * 1024,
  optimizeExpedienteDocument: vi.fn(),
}))

import { actualizarEstatusSolicitud, registrarSolicitudOperativa } from './actions'

type UpdatePayload = Record<string, unknown> & {
  metadata?: Record<string, unknown> & {
    notificaciones?: unknown[]
  }
}

describe('solicitudes actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('formaliza una incapacidad validada por reclutamiento en REGISTRADA_RH y genera notificacion', async () => {
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'user-1',
      puesto: 'NOMINA',
    })

    const auditEvents: Array<Record<string, unknown>> = []
    const updates: UpdatePayload[] = []

    const service = {
      from(table: string) {
        if (table === 'cuenta_cliente') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'cuenta-1', activa: true },
                error: null,
              })
            },
          }
        }

        if (table === 'solicitud') {
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
                  id: 'sol-1',
                  cuenta_cliente_id: 'cuenta-1',
                  empleado_id: 'emp-1',
                  supervisor_empleado_id: 'sup-1',
                  tipo: 'INCAPACIDAD',
                  fecha_inicio: '2026-03-16',
                  fecha_fin: '2026-03-18',
                  estatus: 'VALIDADA_SUP',
                  metadata: {
                    approval_path: ['SUPERVISOR', 'RECLUTAMIENTO', 'NOMINA'],
                    validada_supervisor_en: '2026-03-16T12:00:00.000Z',
                    reclutamiento_validada_en: '2026-03-16T16:00:00.000Z',
                    justifica_asistencia: true,
                  },
                },
                error: null,
              })
            },
            update(payload: UpdatePayload) {
              updates.push(payload)
              const updateChain = {
                eq() {
                  return updateChain
                },
                then(resolve: (value: { error: null }) => void) {
                  return Promise.resolve({ error: null }).then(resolve)
                },
              }
              return updateChain
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert(payload: Record<string, unknown>) {
              auditEvents.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    }

    createServiceClientMock.mockReturnValue(service)

    const formData = new FormData()
    formData.set('solicitud_id', 'sol-1')
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('estatus', 'REGISTRADA_RH')

    await actualizarEstatusSolicitud(formData)

    expect(updates).toHaveLength(1)
    const update = updates[0]!
    const metadata = update.metadata!
    expect(update).toMatchObject({
      estatus: 'REGISTRADA_RH',
    })
    expect(metadata).toMatchObject({
      registrada_rh_por_puesto: 'NOMINA',
      justifica_asistencia: true,
      estado_resolucion: 'APROBADA',
      siguiente_actor: null,
    })
    expect(metadata.notificaciones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mensaje: 'Tu solicitud fue aprobada y formalizada por nomina.',
          destinatario_puesto: 'DERMOCONSEJERO',
        }),
      ])
    )
    expect(auditEvents).toHaveLength(1)
    expect(auditEvents[0]).toMatchObject({
      tabla: 'solicitud',
      registro_id: 'sol-1',
    })
    expect(sendOperationalPushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeIds: ['emp-1'],
        path: '/solicitudes',
        tag: 'solicitud-sol-1-registrada_rh',
      })
    )
    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, '/solicitudes')
    expect(revalidatePathMock).toHaveBeenNthCalledWith(2, '/asistencias')
  })

  it('permite que reclutamiento valide el documento de incapacidad y la pase a nomina', async () => {
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'user-reclut-1',
      puesto: 'RECLUTAMIENTO',
    })

    const updates: UpdatePayload[] = []

    const service = {
      from(table: string) {
        if (table === 'cuenta_cliente') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'cuenta-1', activa: true },
                error: null,
              })
            },
          }
        }

        if (table === 'solicitud') {
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
                  id: 'sol-2',
                  cuenta_cliente_id: 'cuenta-1',
                  empleado_id: 'emp-1',
                  supervisor_empleado_id: 'sup-1',
                  tipo: 'INCAPACIDAD',
                  fecha_inicio: '2026-03-16',
                  fecha_fin: '2026-03-18',
                  estatus: 'VALIDADA_SUP',
                  metadata: {
                    actor_puesto: 'DERMOCONSEJERO',
                    approval_path: ['SUPERVISOR', 'RECLUTAMIENTO', 'NOMINA'],
                    validada_supervisor_en: '2026-03-16T12:00:00.000Z',
                    justifica_asistencia: true,
                  },
                },
                error: null,
              })
            },
            update(payload: UpdatePayload) {
              updates.push(payload)
              const updateChain = {
                eq() {
                  return updateChain
                },
                then(resolve: (value: { error: null }) => void) {
                  return Promise.resolve({ error: null }).then(resolve)
                },
              }
              return updateChain
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
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'emp-1', nombre_completo: 'Dermo Uno' },
                error: null,
              })
            },
            then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
              return Promise.resolve({
                data: [{ id: 'nom-1', puesto: 'NOMINA' }],
                error: null,
              }).then(resolve)
            },
          }
        }

        if (table === 'mensaje_interno') {
          return {
            insert() {
              return {
                select() {
                  return this
                },
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'msg-2' },
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'mensaje_receptor' || table === 'audit_log') {
          return {
            insert() {
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    }

    createServiceClientMock.mockReturnValue(service)

    const formData = new FormData()
    formData.set('solicitud_id', 'sol-2')
    formData.set('cuenta_cliente_id', 'cuenta-1')
    formData.set('estatus', 'VALIDADA_SUP')

    await actualizarEstatusSolicitud(formData)

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      estatus: 'VALIDADA_SUP',
      metadata: expect.objectContaining({
        reclutamiento_validada_por_puesto: 'RECLUTAMIENTO',
        siguiente_actor: 'NOMINA',
      }),
    })
    expect(sendOperationalPushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeIds: ['nom-1'],
        path: '/solicitudes?tipo=INCAPACIDAD',
      })
    )
  })

  it('envia incapacidad a supervision y reclutamiento antes de nomina', async () => {
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'user-1',
      puesto: 'DERMOCONSEJERO',
      empleadoId: 'emp-1',
    })

    storeOptimizedEvidenceMock.mockResolvedValue({
      archivo: {
        url: 'https://files.test/incapacidad.jpg',
        hash: 'hash-1',
      },
      miniatura: null,
      optimization: {
        optimizationKind: 'passthrough',
        originalBytes: 1024,
        optimizedBytes: 1024,
        targetMet: true,
        notes: [],
        officialAssetKind: 'document',
      },
    })

    const solicitudRows: Array<Record<string, unknown>> = []
    const mensajeRows: Array<Record<string, unknown>> = []
    const mensajeReceptorRows: Array<Record<string, unknown>[]> = []

    const service = {
      storage: {
        createBucket() {
          return Promise.resolve({ error: null })
        },
      },
      from(table: string) {
        if (table === 'cuenta_cliente') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'cuenta-1', activa: true },
                error: null,
              })
            },
          }
        }

        if (table === 'empleado') {
          return {
            select() {
              return this
            },
            in() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'emp-1', nombre_completo: 'Dermo Uno' },
                error: null,
              })
            },
            then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
              return Promise.resolve({
                data: [
                  { id: 'reclut-1', puesto: 'RECLUTAMIENTO' },
                ],
                error: null,
              }).then(resolve)
            },
          }
        }

        if (table === 'solicitud') {
          return {
            insert(payload: Record<string, unknown>) {
              solicitudRows.push(payload)
              return {
                select() {
                  return this
                },
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'sol-1' },
                    error: null,
                  })
                },
              }
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
                  return Promise.resolve({
                    data: { id: 'msg-1' },
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'mensaje_receptor') {
          return {
            insert(payload: Record<string, unknown>[]) {
              mensajeReceptorRows.push(payload)
              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert() {
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
    formData.set('empleado_id', 'emp-1')
    formData.set('supervisor_empleado_id', 'sup-1')
    formData.set('tipo', 'INCAPACIDAD')
    formData.set('fecha_inicio', '2026-03-21')
    formData.set('fecha_fin', '2026-03-24')
    formData.set('motivo', 'Enfermedad general')
    formData.set('comentarios', 'Solicito registro de incapacidad')
    formData.set('incapacidad_clase', 'INICIAL')
    formData.set(
      'justificante',
      new File(['mock'], 'incapacidad.jpg', { type: 'image/jpeg' })
    )

    const result = await registrarSolicitudOperativa({ ok: false, message: null }, formData)

    expect(result).toMatchObject({ ok: true })
    expect(solicitudRows[0]).toMatchObject({
      tipo: 'INCAPACIDAD',
      estatus: 'ENVIADA',
      motivo: 'Enfermedad general',
      comentarios: 'Solicito registro de incapacidad',
      justificante_url: 'https://files.test/incapacidad.jpg',
      metadata: expect.objectContaining({
        incapacidad_clase: 'INICIAL',
        siguiente_actor: 'SUPERVISOR',
        approval_path: ['SUPERVISOR', 'RECLUTAMIENTO', 'NOMINA'],
      }),
    })
    expect(mensajeRows[0]).toMatchObject({
      titulo: 'Incapacidad inicial registrada',
    })
    expect(mensajeReceptorRows[0]).toHaveLength(2)
    expect(sendOperationalPushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeIds: expect.arrayContaining(['reclut-1', 'sup-1']),
        path: '/solicitudes?tipo=INCAPACIDAD',
      })
    )
  })

  it('solo permite crear solicitudes desde dermoconsejo y supervision', async () => {
    requerirPuestosActivosMock.mockImplementation(async (allowedRoles: unknown) => {
      expect(allowedRoles).toEqual(['DERMOCONSEJERO', 'SUPERVISOR'])
      return {
        usuarioId: 'user-dermo-1',
        puesto: 'DERMOCONSEJERO',
        empleadoId: 'emp-1',
      }
    })

    storeOptimizedEvidenceMock.mockResolvedValue({
      archivo: {
        url: 'https://files.test/permiso.pdf',
        hash: 'hash-permiso',
      },
      miniatura: null,
      optimization: {
        optimizationKind: 'passthrough',
        originalBytes: 1024,
        optimizedBytes: 1024,
        targetMet: true,
        notes: [],
        officialAssetKind: 'document',
      },
    })

    const service = {
      storage: {
        createBucket() {
          return Promise.resolve({ error: null })
        },
      },
      from(table: string) {
        if (table === 'cuenta_cliente') {
          return {
            select() { return this },
            eq() { return this },
            maybeSingle() {
              return Promise.resolve({ data: { id: 'cuenta-1', activa: true }, error: null })
            },
          }
        }

        if (table === 'solicitud') {
          return {
            insert() {
              return {
                select() { return this },
                maybeSingle() {
                  return Promise.resolve({ data: { id: 'sol-per-1' }, error: null })
                },
              }
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert() {
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
    formData.set('empleado_id', 'emp-1')
    formData.set('supervisor_empleado_id', 'sup-1')
    formData.set('tipo', 'PERMISO')
    formData.set('fecha_inicio', '2026-03-25')
    formData.set('fecha_fin', '2026-03-25')
    formData.set('motivo', 'Permiso personal')
    formData.set('comentarios', 'Salida por tramite')
    formData.set('justificante', new File(['mock'], 'permiso.pdf', { type: 'application/pdf' }))

    const result = await registrarSolicitudOperativa({ ok: false, message: null }, formData)

    expect(result).toMatchObject({ ok: true })
    expect(requerirPuestosActivosMock).toHaveBeenCalledWith(['DERMOCONSEJERO', 'SUPERVISOR'])
  })
  it('bloquea justificacion de falta si no existe aviso previo y la permite con receta IMSS cuando si existe', async () => {
    requerirPuestosActivosMock.mockResolvedValue({
      usuarioId: 'user-dermo-1',
      puesto: 'DERMOCONSEJERO',
      empleadoId: 'emp-1',
    })

    storeOptimizedEvidenceMock.mockResolvedValue({
      archivo: {
        url: 'https://files.test/receta-imss.jpg',
        hash: 'hash-receta',
      },
      miniatura: null,
      optimization: {
        optimizationKind: 'passthrough',
        originalBytes: 2048,
        optimizedBytes: 2048,
        targetMet: true,
        notes: [],
        officialAssetKind: 'document',
      },
    })

    let latestSolicitudInsert: Record<string, unknown> | null = null
    let shouldReturnAviso = false

    const service = {
      storage: {
        createBucket() {
          return Promise.resolve({ error: null })
        },
      },
      from(table: string) {
        if (table === 'cuenta_cliente') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'cuenta-1', activa: true },
                error: null,
              })
            },
          }
        }

        if (table === 'solicitud') {
          return {
            queryTipo: null as string | null,
            select() {
              return this
            },
            eq(column?: string, value?: unknown) {
              if (column === 'tipo' && typeof value === 'string') {
                this.queryTipo = value
              }
              return this
            },
            order() {
              return this
            },
            limit() {
              return this
            },
            maybeSingle() {
              return Promise.resolve(
                this.queryTipo === 'AVISO_INASISTENCIA' && shouldReturnAviso
                  ? {
                      data: {
                        id: 'aviso-1',
                        estatus: 'REGISTRADA',
                        metadata: {},
                      },
                      error: null,
                    }
                  : { data: null, error: null }
              )
            },
            insert(payload: Record<string, unknown>) {
              latestSolicitudInsert = payload
              return {
                select() {
                  return this
                },
                maybeSingle() {
                  return Promise.resolve({
                    data: { id: 'sol-just-1' },
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert() {
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    }

    createServiceClientMock.mockReturnValue(service)

    const baseFormData = () => {
      const formData = new FormData()
      formData.set('cuenta_cliente_id', 'cuenta-1')
      formData.set('empleado_id', 'emp-1')
      formData.set('supervisor_empleado_id', 'sup-1')
      formData.set('tipo', 'JUSTIFICACION_FALTA')
      formData.set('fecha_inicio', '2026-03-25')
      formData.set('fecha_fin', '2026-03-25')
      formData.set('motivo', 'Enfermedad general')
      formData.set('comentarios', 'Adjunto receta IMSS')
      formData.set('justificante', new File(['mock'], 'receta-imss.jpg', { type: 'image/jpeg' }))
      return formData
    }

    const rejected = await registrarSolicitudOperativa({ ok: false, message: null }, baseFormData())
    expect(rejected).toMatchObject({
      ok: false,
      message: 'La falta solo puede justificarse si existe un aviso previo de inasistencia registrado para ese dia.',
    })

    shouldReturnAviso = true
    const accepted = await registrarSolicitudOperativa({ ok: false, message: null }, baseFormData())

    expect(accepted).toMatchObject({
      ok: true,
      message: 'Justificacion de falta enviada.',
    })
    expect(latestSolicitudInsert).toMatchObject({
      tipo: 'JUSTIFICACION_FALTA',
      estatus: 'ENVIADA',
      justificante_url: 'https://files.test/receta-imss.jpg',
      metadata: expect.objectContaining({
        aviso_inasistencia_id: 'aviso-1',
        requiere_aviso_previo: true,
        justificante_clase: 'RECETA_IMSS',
        siguiente_actor: 'SUPERVISOR',
      }),
    })
  })
})
