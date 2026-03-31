export interface AttendanceWindow {
  employeeId: string
  date: string
  checkInUtc: string
  checkOutUtc: string | null
}

export interface AttendanceSaleConfirmation {
  confirmada: boolean | null
}

function toTimestamp(value: string | null) {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

export function isCheckInBeforeCheckOut(checkInUtc: string, checkOutUtc: string | null) {
  const checkIn = toTimestamp(checkInUtc)
  const checkOut = toTimestamp(checkOutUtc)

  if (checkIn === null) {
    return false
  }

  if (checkOut === null) {
    return true
  }

  return checkIn <= checkOut
}

export function hasAttendanceOverlap(left: AttendanceWindow, right: AttendanceWindow) {
  if (left.employeeId !== right.employeeId || left.date !== right.date) {
    return false
  }

  const leftStart = toTimestamp(left.checkInUtc)
  const leftEnd = toTimestamp(left.checkOutUtc) ?? Number.POSITIVE_INFINITY
  const rightStart = toTimestamp(right.checkInUtc)
  const rightEnd = toTimestamp(right.checkOutUtc) ?? Number.POSITIVE_INFINITY

  if (leftStart === null || rightStart === null) {
    return false
  }

  return leftStart <= rightEnd && rightStart <= leftEnd
}

export function hasCheckoutCoordinates(latitud: number | null, longitud: number | null) {
  return Number.isFinite(latitud) && Number.isFinite(longitud)
}

export function countUnconfirmedAttendanceSales(sales: AttendanceSaleConfirmation[]) {
  return sales.reduce((total, sale) => total + (sale.confirmada ? 0 : 1), 0)
}