import type { AsistenciaListadoItem } from '@/features/asistencias/services/asistenciaService'

export function isReusableAttendanceDraftContext(item: Pick<AsistenciaListadoItem, 'asignacionId' | 'checkInUtc' | 'checkOutUtc' | 'estatus'>) {
  return Boolean(
    item.asignacionId &&
      item.checkInUtc &&
      !item.checkOutUtc &&
      item.estatus !== 'RECHAZADA' &&
      item.estatus !== 'CERRADA'
  )
}

export function selectReusableAttendanceDraftContext(items: AsistenciaListadoItem[]) {
  return items.find(isReusableAttendanceDraftContext) ?? null
}
