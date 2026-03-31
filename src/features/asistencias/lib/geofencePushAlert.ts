export interface GeofencePushAlertInput {
  attendanceId: string
  cuentaClienteId: string
  empleadoId: string
  supervisorEmpleadoId: string | null
  pdvId: string
  pdvNombre: string | null
  estadoGps: string | null
  distanciaCheckInMetros: number | null
  justificacionFueraGeocerca: string | null
  checkInUtc: string | null
}

export interface GeofencePushAlertPayload {
  employeeIds: string[]
  title: string
  body: string
  path: string
  tag: string
  cuentaClienteId: string
  audit: {
    tabla: string
    registroId: string
    accion: string
  }
  data: Record<string, unknown>
}

export function buildGeofencePushAlert(input: GeofencePushAlertInput): GeofencePushAlertPayload | null {
  if (!input.supervisorEmpleadoId) {
    return null
  }

  if (!input.checkInUtc || input.estadoGps !== 'FUERA_GEOCERCA') {
    return null
  }

  const pdvLabel = input.pdvNombre?.trim() || input.pdvId
  const distanceLabel =
    typeof input.distanciaCheckInMetros === 'number'
      ? `${Math.round(input.distanciaCheckInMetros)} m`
      : 'distancia no disponible'

  return {
    employeeIds: [input.supervisorEmpleadoId],
    title: 'Alerta de geocerca',
    body: `Check-in fuera de geocerca en ${pdvLabel} (${distanceLabel}).`,
    path: '/dashboard',
    tag: `geocerca-${input.attendanceId}`,
    cuentaClienteId: input.cuentaClienteId,
    audit: {
      tabla: 'asistencia',
      registroId: input.attendanceId,
      accion: 'fanout_alerta_geocerca_push',
    },
    data: {
      attendanceId: input.attendanceId,
      empleadoId: input.empleadoId,
      pdvId: input.pdvId,
      pdvNombre: input.pdvNombre,
      estadoGps: input.estadoGps,
      distanciaCheckInMetros: input.distanciaCheckInMetros,
      justificacionFueraGeocerca: input.justificacionFueraGeocerca,
      checkInUtc: input.checkInUtc,
    },
  }
}