export function isSupervisorPuesto(puesto: string | null | undefined) {
  return String(puesto ?? '').trim().toUpperCase() === 'SUPERVISOR'
}
