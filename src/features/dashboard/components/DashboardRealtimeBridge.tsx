'use client'

import { startTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface DashboardRealtimeBridgeProps {
  cuentaClienteId: string | null
  allowGlobalScope: boolean
}

export function DashboardRealtimeBridge({
  cuentaClienteId,
  allowGlobalScope,
}: DashboardRealtimeBridgeProps) {
  const router = useRouter()
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(
      `dashboard-live:${allowGlobalScope ? 'global' : cuentaClienteId ?? 'sin-cuenta'}`
    )

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      refreshTimeoutRef.current = setTimeout(() => {
        startTransition(() => {
          router.refresh()
        })
      }, 1200)
    }

    const accountFilter = !allowGlobalScope && cuentaClienteId
      ? `cuenta_cliente_id=eq.${cuentaClienteId}`
      : undefined

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'asistencia',
          filter: accountFilter,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dashboard_kpis',
          filter: accountFilter,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'geocerca_pdv',
        },
        scheduleRefresh
      )
      .subscribe()

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      supabase.removeChannel(channel)
    }
  }, [allowGlobalScope, cuentaClienteId, router])

  return null
}
