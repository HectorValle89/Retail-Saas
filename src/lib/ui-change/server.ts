import { revalidateTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildModuleCacheTagsFromUiChangeTarget } from '@/lib/cache/moduleTags'
import { createServiceClient } from '@/lib/supabase/server'
import type { UiChangeTarget, UiChangeVersionRow } from '@/lib/ui-change/types'

type TypedSupabaseClient = SupabaseClient<any>
type UiChangePersistenceMode = 'unknown' | 'rpc' | 'table' | 'synthetic'

let uiChangePersistenceMode: UiChangePersistenceMode = 'unknown'

function isMissingTouchUiChangeVersionFunction(message?: string | null) {
  const normalized = message?.toLowerCase() ?? ''
  return (
    normalized.includes('could not find the function public.touch_ui_change_version') ||
    normalized.includes('function public.touch_ui_change_version') ||
    normalized.includes('touch_ui_change_version')
  )
}

function isMissingUiChangeVersionStorage(message?: string | null) {
  const normalized = message?.toLowerCase() ?? ''
  return (
    normalized.includes("could not find the table 'public.ui_change_version'") ||
    normalized.includes("relation 'public.ui_change_version' does not exist") ||
    normalized.includes('relation "public.ui_change_version" does not exist') ||
    normalized.includes("could not find the relation 'public.ui_change_version'") ||
    normalized.includes("could not find the table 'ui_change_version'") ||
    normalized.includes("relation 'ui_change_version' does not exist") ||
    normalized.includes('relation "ui_change_version" does not exist')
  )
}

function buildSyntheticUiChangeVersionRow(target: UiChangeTarget): UiChangeVersionRow {
  const now = new Date().toISOString()

  return {
    id: `ui-change-degraded:${target.module}:${target.surface}:${target.scopeKey}:${Date.now()}`,
    cuenta_cliente_id: target.cuentaClienteId ?? null,
    module: target.module,
    surface: target.surface,
    scope_key: target.scopeKey,
    role_target: target.roleTarget ?? 'ALL',
    empleado_id: target.empleadoId ?? null,
    supervisor_empleado_id: target.supervisorEmpleadoId ?? null,
    version: 1,
    last_event_type: target.eventType,
    metadata: target.metadata ?? {},
    updated_at: now,
    created_at: now,
  }
}

async function touchUiChangeVersionFallback(
  service: TypedSupabaseClient,
  target: UiChangeTarget
) {
  if (uiChangePersistenceMode === 'synthetic') {
    return buildSyntheticUiChangeVersionRow(target)
  }

  const normalizedRoleTarget = target.roleTarget ?? 'ALL'
  const { data: existingRow, error: selectError } = await service
    .from('ui_change_version')
    .select('*')
    .eq('module', target.module)
    .eq('surface', target.surface)
    .eq('scope_key', target.scopeKey)
    .eq('role_target', normalizedRoleTarget)
    .maybeSingle()

  if (selectError) {
    if (isMissingUiChangeVersionStorage(selectError.message)) {
      uiChangePersistenceMode = 'synthetic'
      return buildSyntheticUiChangeVersionRow(target)
    }
    throw new Error(selectError.message)
  }

  const nextVersion =
    existingRow && typeof existingRow.version === 'number' ? existingRow.version + 1 : 1
  const payload = {
    cuenta_cliente_id: target.cuentaClienteId ?? null,
    module: target.module,
    surface: target.surface,
    scope_key: target.scopeKey,
    role_target: normalizedRoleTarget,
    empleado_id: target.empleadoId ?? null,
    supervisor_empleado_id: target.supervisorEmpleadoId ?? null,
    version: nextVersion,
    last_event_type: target.eventType,
    metadata: target.metadata ?? {},
    updated_at: new Date().toISOString(),
  }

  const { data: row, error: upsertError } = await service
    .from('ui_change_version')
    .upsert(payload, {
      onConflict: 'module,surface,scope_key,role_target',
    })
    .select('*')
    .maybeSingle()

  if (upsertError) {
    if (isMissingUiChangeVersionStorage(upsertError.message)) {
      uiChangePersistenceMode = 'synthetic'
      return buildSyntheticUiChangeVersionRow(target)
    }
    throw new Error(upsertError.message)
  }

  if (!row) {
    throw new Error('No fue posible actualizar ui_change_version.')
  }

  uiChangePersistenceMode = 'table'
  return row as UiChangeVersionRow
}

async function touchUiChangeVersion(
  service: TypedSupabaseClient,
  target: UiChangeTarget
) {
  if (uiChangePersistenceMode === 'synthetic') {
    return buildSyntheticUiChangeVersionRow(target)
  }

  if (uiChangePersistenceMode === 'table') {
    return touchUiChangeVersionFallback(service, target)
  }

  const { data, error } = await service.rpc('touch_ui_change_version', {
    p_cuenta_cliente_id: target.cuentaClienteId ?? null,
    p_module: target.module,
    p_surface: target.surface,
    p_scope_key: target.scopeKey,
    p_role_target: target.roleTarget ?? 'ALL',
    p_empleado_id: target.empleadoId ?? null,
    p_supervisor_empleado_id: target.supervisorEmpleadoId ?? null,
    p_last_event_type: target.eventType,
    p_metadata: target.metadata ?? {},
  })

  if (error) {
    if (isMissingTouchUiChangeVersionFunction(error.message)) {
      uiChangePersistenceMode = 'table'
      return touchUiChangeVersionFallback(service, target)
    }
    throw new Error(error.message)
  }

  uiChangePersistenceMode = 'rpc'
  return data as UiChangeVersionRow
}

function normalizeRouteWeekStart(value?: string | null) {
  const normalized = value?.trim() ?? ''

  if (!normalized) {
    return null
  }

  return normalized.slice(0, 10)
}

export async function publishUiChange(
  target: UiChangeTarget,
  options?: {
    service?: TypedSupabaseClient
    revalidateTags?: boolean
  }
) {
  const [row] = await publishUiChanges([target], options)
  return row
}

export async function publishUiChanges(
  targets: UiChangeTarget[],
  options?: {
    service?: TypedSupabaseClient
    revalidateTags?: boolean
  }
) {
  if (targets.length === 0) {
    return []
  }

  const service = options?.service ?? (createServiceClient() as TypedSupabaseClient)
  const [firstTarget, ...remainingTargets] = targets
  const rows: UiChangeVersionRow[] = [
    await touchUiChangeVersion(service, {
      ...firstTarget,
      metadata:
        firstTarget.module === 'ruta-semanal' &&
        typeof firstTarget.scopeKey === 'string' &&
        firstTarget.scopeKey.startsWith('periodo:')
          ? {
              ...(firstTarget.metadata ?? {}),
              periodo: normalizeRouteWeekStart(firstTarget.metadata?.periodo as string | null | undefined),
            }
          : firstTarget.metadata ?? null,
    }),
  ]

  if (remainingTargets.length > 0) {
    const remainingRows = await Promise.all(
      remainingTargets.map((target) =>
        touchUiChangeVersion(service, {
          ...target,
          metadata:
            target.module === 'ruta-semanal' &&
            typeof target.scopeKey === 'string' &&
            target.scopeKey.startsWith('periodo:')
              ? {
                  ...(target.metadata ?? {}),
                  periodo: normalizeRouteWeekStart(target.metadata?.periodo as string | null | undefined),
                }
              : target.metadata ?? null,
        })
      )
    )
    rows.push(...remainingRows)
  }

  if (options?.revalidateTags !== false) {
    const tags = new Set<string>()

    for (const target of targets) {
      for (const tag of buildModuleCacheTagsFromUiChangeTarget(target)) {
        tags.add(tag)
      }
    }

    for (const tag of tags) {
      revalidateTag(tag, 'max')
    }
  }

  return rows
}
