export type OperablePdvStatus = 'ACTIVO' | 'TEMPORAL'
export type PdvMasterStatus = OperablePdvStatus | 'INACTIVO'

export function isOperablePdvStatus(status: string | null | undefined): status is OperablePdvStatus {
  return status === 'ACTIVO' || status === 'TEMPORAL'
}

export function isInactivePdvStatus(status: string | null | undefined) {
  return status === 'INACTIVO'
}
