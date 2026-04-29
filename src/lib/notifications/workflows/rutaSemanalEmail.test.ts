import { expect, test, vi } from 'vitest'

const { sendWorkflowNotificationMock, getCoordinadoresYAdminMock } = vi.hoisted(() => ({
  sendWorkflowNotificationMock: vi.fn().mockResolvedValue(undefined),
  getCoordinadoresYAdminMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('./workflowFanout', () => ({
  sendWorkflowNotification: sendWorkflowNotificationMock,
}))
vi.mock('./recipientLookup', () => ({
  getCoordinadoresYAdmin: getCoordinadoresYAdminMock,
  getSupervisorEmail: vi.fn(),
}))

import { notificarRutaEnviada } from './rutaSemanalEmail'

function createInboxSupabaseDouble() {
  const insertedMessages: Array<Record<string, unknown>> = []
  const insertedRecipients: Array<Record<string, unknown>> = []

  return {
    insertedMessages,
    insertedRecipients,
    client: {
      from(table: string) {
        if (table === 'mensaje_interno') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedMessages.push(payload)
              return {
                select() {
                  return {
                    maybeSingle: () => Promise.resolve({ data: { id: 'msg-ruta-1' }, error: null }),
                  }
                },
              }
            },
          }
        }

        if (table === 'mensaje_receptor') {
          return {
            insert(payload: Array<Record<string, unknown>>) {
              insertedRecipients.push(...payload)
              return Promise.resolve({ data: null, error: null })
            },
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    },
  }
}

test('notificarRutaEnviada crea notificacion interna antes del fanout externo', async () => {
  getCoordinadoresYAdminMock.mockResolvedValue([
    {
      email: 'coord@artolagroup.com',
      name: 'Coordinacion',
      empleadoId: 'emp-coord',
      cuentaClienteId: 'cuenta-1',
      puesto: 'COORDINADOR',
    },
  ])
  const supabase = createInboxSupabaseDouble()

  await notificarRutaEnviada(supabase.client as never, {
    supervisorNombre: 'Luis Supervisor',
    supervisorId: 'emp-sup',
    semana: '2026-04-27',
    cuentaClienteId: 'cuenta-1',
    totalTiendas: 12,
    totalDias: 5,
  })

  expect(supabase.insertedMessages).toHaveLength(1)
  expect(supabase.insertedMessages[0]).toMatchObject({
    cuenta_cliente_id: 'cuenta-1',
    tipo: 'MENSAJE',
    grupo_destino: 'PUESTO',
  })
  expect(supabase.insertedRecipients).toEqual([
    expect.objectContaining({
      mensaje_id: 'msg-ruta-1',
      cuenta_cliente_id: 'cuenta-1',
      empleado_id: 'emp-coord',
      estado: 'PENDIENTE',
    }),
  ])
  expect(sendWorkflowNotificationMock).toHaveBeenCalledTimes(1)
})
