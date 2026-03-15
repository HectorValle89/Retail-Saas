export interface AsignacionValidable {
  cuenta_cliente_id: string | null
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
}

export interface SupervisorAsignacionRow {
  pdv_id: string
  activo: boolean
  fecha_fin: string | null
}

export interface AsignacionValidationContext {
  pdvsConGeocerca: Set<string>
  supervisoresPorPdv: Record<string, SupervisorAsignacionRow[]>
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function obtenerReferenciaValidacion(fechaInicio: string, today = getTodayIsoDate()) {
  return fechaInicio > today ? fechaInicio : today
}

export function tieneSupervisorVigente(
  supervisores: SupervisorAsignacionRow[] | undefined,
  referencia: string
) {
  return Boolean(
    supervisores?.some(
      (supervisor) => supervisor.activo && (!supervisor.fecha_fin || supervisor.fecha_fin >= referencia)
    )
  )
}

export function evaluarValidacionesAsignacion(
  asignacion: AsignacionValidable,
  context: AsignacionValidationContext
) {
  const validaciones: string[] = []
  const referencia = obtenerReferenciaValidacion(asignacion.fecha_inicio)

  if (!asignacion.cuenta_cliente_id) {
    validaciones.push('Sin cuenta cliente')
  }

  if (!context.pdvsConGeocerca.has(asignacion.pdv_id)) {
    validaciones.push('PDV sin geocerca')
  }

  if (!tieneSupervisorVigente(context.supervisoresPorPdv[asignacion.pdv_id], referencia)) {
    validaciones.push('PDV sin supervisor activo')
  }

  if (asignacion.fecha_fin && asignacion.fecha_fin < asignacion.fecha_inicio) {
    validaciones.push('Vigencia invalida')
  }

  return validaciones
}
