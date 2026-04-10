export interface ReporteProgramadoActionState {
  ok: boolean
  message: string | null
}
export const ESTADO_REPORTE_PROGRAMADO_INICIAL: ReporteProgramadoActionState = {
  ok: false,
  message: null,
}