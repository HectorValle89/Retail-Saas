import type { Puesto } from '@/types/database'

export type EmpleadosMainTab = 'base'
// export type EmpleadosMainTab = 'base' | 'reclutamiento' | 'coordinacion' | 'pdvs'

export function resolveEmpleadosInitialTab(
  puesto: Puesto,
  rawTab: string | string[] | undefined
): EmpleadosMainTab {
  return 'base'
}
