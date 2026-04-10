import type { ActorActual } from '@/lib/auth/session'
import {
  getSupervisorMonthlyPdvCalendar,
  type SupervisorMonthlyPdvCalendar,
  type SupervisorMonthlyPdvFilters,
  type SupervisorMonthlyPdvRow,
  type SupervisorMonthlyPdvStoreType,
} from '@/features/asignaciones/services/asignacionMaterializationService'

export type { SupervisorMonthlyPdvCalendar, SupervisorMonthlyPdvFilters, SupervisorMonthlyPdvRow, SupervisorMonthlyPdvStoreType }

export interface SupervisorMonthlyRoleFilters {
  month: string
  cadenaCodigo?: string | null
  storeType?: SupervisorMonthlyPdvStoreType | null
}

export async function obtenerRolMensualSupervisor(
  actor: ActorActual,
  filters: SupervisorMonthlyRoleFilters
): Promise<SupervisorMonthlyPdvCalendar> {
  if (actor.puesto !== 'SUPERVISOR') {
    throw new Error('Solo SUPERVISOR puede consultar Rol mensual.')
  }

  return getSupervisorMonthlyPdvCalendar({
    month: filters.month,
    supervisorEmpleadoId: actor.empleadoId,
    cuentaClienteId: actor.cuentaClienteId,
    cadenaCodigo: filters.cadenaCodigo ?? null,
    storeType: filters.storeType ?? null,
  })
}