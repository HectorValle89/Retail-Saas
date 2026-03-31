import { describe, expect, it } from 'vitest'
import { buildGeofencePushAlert } from './geofencePushAlert'

describe('buildGeofencePushAlert', () => {
  it('crea payload push para check-in fuera de geocerca con supervisor asignado', () => {
    const payload = buildGeofencePushAlert({
      attendanceId: 'asis-1',
      cuentaClienteId: 'cuenta-1',
      empleadoId: 'emp-1',
      supervisorEmpleadoId: 'sup-1',
      pdvId: 'pdv-1',
      pdvNombre: 'San Pablo Centro',
      estadoGps: 'FUERA_GEOCERCA',
      distanciaCheckInMetros: 412.8,
      justificacionFueraGeocerca: 'Ajuste de entrada',
      checkInUtc: '2026-03-18T15:00:00.000Z',
    })

    expect(payload).toMatchObject({
      employeeIds: ['sup-1'],
      title: 'Alerta de geocerca',
      path: '/dashboard',
      tag: 'geocerca-asis-1',
      cuentaClienteId: 'cuenta-1',
      audit: {
        tabla: 'asistencia',
        registroId: 'asis-1',
        accion: 'fanout_alerta_geocerca_push',
      },
    })
    expect(payload?.body).toContain('San Pablo Centro')
    expect(payload?.body).toContain('413 m')
  })

  it('omite push si no hay supervisor o la asistencia no esta fuera de geocerca', () => {
    expect(
      buildGeofencePushAlert({
        attendanceId: 'asis-2',
        cuentaClienteId: 'cuenta-1',
        empleadoId: 'emp-2',
        supervisorEmpleadoId: null,
        pdvId: 'pdv-2',
        pdvNombre: 'PDV Norte',
        estadoGps: 'FUERA_GEOCERCA',
        distanciaCheckInMetros: 180,
        justificacionFueraGeocerca: null,
        checkInUtc: '2026-03-18T15:10:00.000Z',
      })
    ).toBeNull()

    expect(
      buildGeofencePushAlert({
        attendanceId: 'asis-3',
        cuentaClienteId: 'cuenta-1',
        empleadoId: 'emp-3',
        supervisorEmpleadoId: 'sup-3',
        pdvId: 'pdv-3',
        pdvNombre: 'PDV Sur',
        estadoGps: 'DENTRO_GEOCERCA',
        distanciaCheckInMetros: 20,
        justificacionFueraGeocerca: null,
        checkInUtc: '2026-03-18T15:20:00.000Z',
      })
    ).toBeNull()
  })
})