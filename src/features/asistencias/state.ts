export type SupervisorAttendanceActionState = {
  ok: boolean
  message: string | null
}

export const ESTADO_SUPERVISOR_ASISTENCIA_INICIAL: SupervisorAttendanceActionState = {
  ok: false,
  message: null,
}
