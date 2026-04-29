import type { ActorActual } from '@/lib/auth/session'
import type { Puesto } from '@/types/database'

export type UiChangeModule =
  | 'dashboard'
  | 'asistencias'
  | 'love-isdin'
  | 'ventas'
  | 'solicitudes'
  | 'mensajes'
  | 'reportes'
  | 'usuarios'
  | 'configuracion'
  | 'empleados'
  | 'nomina'
  | 'materiales'
  | string

export type UiChangeSurface =
  | 'all'
  | 'panel'
  | 'insights'
  | 'metricas'
  | 'alertas'
  | 'cartera'
  | 'shell'
  | 'inbox'
  | 'tabla'
  | string

export type UiChangeScope =
  | 'global'
  | `cuenta:${string}`
  | `empleado:${string}`
  | `supervisor:${string}`
  | `pdv:${string}`
  | `periodo:${string}`
  | string

export type UiChangeRoleTarget = Puesto | 'ALL'

export interface UiChangeTarget {
  cuentaClienteId?: string | null
  module: UiChangeModule
  surface: UiChangeSurface
  scopeKey: UiChangeScope
  roleTarget?: UiChangeRoleTarget
  empleadoId?: string | null
  supervisorEmpleadoId?: string | null
  eventType: string
  metadata?: Record<string, unknown> | null
}

export interface UiChangeVersionRow {
  id: string
  cuenta_cliente_id: string | null
  module: UiChangeModule
  surface: UiChangeSurface
  scope_key: UiChangeScope
  role_target: UiChangeRoleTarget
  empleado_id: string | null
  supervisor_empleado_id: string | null
  version: number
  last_event_type: string
  metadata: Record<string, unknown> | null
  updated_at: string
  created_at: string
}

export type UiChangeBusinessEventInput = {
  eventType: string
  modules: UiChangeModule[]
  surfaces: UiChangeSurface[]
  scopes: Array<UiChangeScope | null | undefined>
  cuentaClienteId?: string | null
  empleadoId?: string | null
  supervisorEmpleadoId?: string | null
  roleTargets?: UiChangeRoleTarget[]
  metadata?: Record<string, unknown> | null
}

export function buildUiChangeScope(kind: 'global'): UiChangeScope
export function buildUiChangeScope(
  kind: 'cuenta' | 'empleado' | 'supervisor' | 'pdv' | 'periodo',
  id: string | null | undefined
): UiChangeScope | null
export function buildUiChangeScope(
  kind: 'global' | 'cuenta' | 'empleado' | 'supervisor' | 'pdv' | 'periodo',
  id?: string | null
) {
  if (kind === 'global') {
    return 'global'
  }

  const normalized = id?.trim() ?? ''
  if (!normalized) {
    return null
  }

  return `${kind}:${normalized}` as UiChangeScope
}

export function getUiChangeScopeKeysForActor(actor: ActorActual) {
  const scopes = new Set<UiChangeScope>()

  if (actor.cuentaClienteId) {
    scopes.add(`cuenta:${actor.cuentaClienteId}`)
  }

  scopes.add(`empleado:${actor.empleadoId}`)

  if (actor.puesto === 'SUPERVISOR') {
    scopes.add(`supervisor:${actor.empleadoId}`)
  }

  if (actor.puesto === 'ADMINISTRADOR' && !actor.cuentaClienteId) {
    scopes.add('global')
  }

  return Array.from(scopes)
}

export function buildUiChangeTargetsFromBusinessEvent({
  eventType,
  modules,
  surfaces,
  scopes,
  cuentaClienteId,
  empleadoId,
  supervisorEmpleadoId,
  roleTargets,
  metadata,
}: UiChangeBusinessEventInput) {
  const normalizedScopes = Array.from(
    new Set(scopes.filter((scope): scope is UiChangeScope => Boolean(scope)))
  )
  const normalizedRoles =
    roleTargets && roleTargets.length > 0 ? Array.from(new Set(roleTargets)) : (['ALL'] as UiChangeRoleTarget[])

  return modules.flatMap((module) =>
    surfaces.flatMap((surface) =>
      normalizedScopes.flatMap((scopeKey) =>
        normalizedRoles.map<UiChangeTarget>((roleTarget) => ({
          cuentaClienteId: cuentaClienteId ?? null,
          module,
          surface,
          scopeKey,
          roleTarget,
          empleadoId: empleadoId ?? null,
          supervisorEmpleadoId: supervisorEmpleadoId ?? null,
          eventType,
          metadata: metadata ?? null,
        }))
      )
    )
  )
}
