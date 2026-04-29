'use client'

import { useUiChangeSubscription } from '@/lib/ui-change/client'
import type { UiChangeRoleTarget } from '@/lib/ui-change/types'

interface DashboardRealtimeBridgeProps {
  cuentaClienteId: string | null
  allowGlobalScope: boolean
  empleadoId: string
  puesto: string
}

export function DashboardRealtimeBridge({
  cuentaClienteId,
  allowGlobalScope,
  empleadoId,
  puesto,
}: DashboardRealtimeBridgeProps) {
  useUiChangeSubscription({
    module: 'dashboard',
    surfaces: ['panel', 'insights', 'metricas', 'alertas', 'cartera', 'shell', 'all'],
    scopeKeys:
      allowGlobalScope && !cuentaClienteId
        ? ['global']
        : [cuentaClienteId ? `cuenta:${cuentaClienteId}` : 'global', `empleado:${empleadoId}`],
    roleTargets: [puesto as UiChangeRoleTarget],
    enabled: true,
  })

  return null
}
