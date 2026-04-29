'use client'

import type { Puesto } from '@/types/database'
import { useUiChangeSubscription } from '@/lib/ui-change/client'

interface MensajesRealtimeBridgeProps {
  cuentaClienteId: string | null
  empleadoId: string
  allowManagerScope: boolean
  actorPuesto: Puesto
}

export function MensajesRealtimeBridge({
  cuentaClienteId,
  empleadoId,
  allowManagerScope,
  actorPuesto,
}: MensajesRealtimeBridgeProps) {
  useUiChangeSubscription({
    module: 'mensajes',
    surfaces: ['panel', 'inbox', 'tabla', 'shell', 'all'],
    scopeKeys: allowManagerScope
      ? [cuentaClienteId ? `cuenta:${cuentaClienteId}` : 'global']
      : [
          cuentaClienteId ? `cuenta:${cuentaClienteId}` : 'global',
          `empleado:${empleadoId}`,
        ],
    roleTargets: [actorPuesto],
    enabled: Boolean(cuentaClienteId || empleadoId),
  })

  return null
}
