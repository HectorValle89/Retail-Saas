export function isFallbackableAttendanceRpcError(message: string | null | undefined) {
  if (!message) {
    return false
  }

  return (
    /Could not find the function public\.rpc_registrar_asistencia_dc|rpc_registrar_asistencia_dc.*schema cache/i.test(
      message
    ) ||
    /No existe una asignacion publicada y vigente para este check-in/i.test(message) ||
    /No existe una asignacion activa con PDV y horario de referencia/i.test(message) ||
    /operator does not exist: .*text/i.test(message) ||
    /column\s+"?fecha_operacion"?\s+is of type date but expression is of type text/i.test(message) ||
    /is of type [a-z0-9_ ]+ but expression is of type text/i.test(message)
  )
}
