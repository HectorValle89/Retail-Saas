import type { ActorActual } from '@/lib/auth/session'
import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone'
import type { Pdv } from '@/types/database'
import { parseRutaSemanalWorkflowMetadata } from '../lib/routeWorkflow'

type MaybeMany<T> = T | T[] | null

export interface RutaPdvSnapshot extends Pick<
  Pdv,
  'id' | 'clave_btl' | 'nombre' | 'zona' | 'direccion' | 'estatus' | 'formato'
> {
  cadenaNombre?: string | null
  cadenaCodigo?: string | null
}

function getCurrentDayValue() {
  return getIsoDateInMexicoCity()
}

export function buildVisiblePdvIds(actor: ActorActual, relations: Array<{
  pdv_id: string
  cuenta_cliente_id: string
  activo: boolean
  fecha_fin: string | null
}>) {
  if (!actor.cuentaClienteId) {
    return null
  }

  const today = getCurrentDayValue()
  return new Set(
    relations
      .filter(
        (item) =>
          item.activo &&
          item.cuenta_cliente_id === actor.cuentaClienteId &&
          (!item.fecha_fin || item.fecha_fin >= today)
      )
      .map((item) => item.pdv_id)
  )
}

export function resolveRutaPdvSnapshot(
  linkedPdv: MaybeMany<RutaPdvSnapshot> | null | undefined,
  fallbackPdv: RutaPdvSnapshot | null | undefined
) {
  if (!linkedPdv) {
    return fallbackPdv ?? null
  }

  return Array.isArray(linkedPdv) ? linkedPdv[0] ?? fallbackPdv ?? null : linkedPdv ?? fallbackPdv ?? null
}

export function collectRutaReferencePdvIds(routes: Array<{ metadata: unknown }>) {
  const pdvIds = new Set<string>()

  for (const route of routes) {
    const workflow = parseRutaSemanalWorkflowMetadata(route.metadata)

    if (workflow.changeRequest.targetPdvId) {
      pdvIds.add(workflow.changeRequest.targetPdvId)
    }

    for (const proposal of workflow.changeRequest.proposedVisits) {
      pdvIds.add(proposal.pdvId)
    }
  }

  return pdvIds
}
