'use client'

import { startTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface DashboardRealtimeBridgeProps {
  cuentaClienteId: string | null
  allowGlobalScope: boolean
  puesto: string
}

function pageCanRefresh() {
  if (typeof document === 'undefined') {
    return true
  }

  return document.visibilityState === 'visible' && document.hasFocus()
}

export function DashboardRealtimeBridge({
  cuentaClienteId,
  allowGlobalScope,
  puesto,
}: DashboardRealtimeBridgeProps) {
  const router = useRouter()
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRefreshRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(
      `dashboard-live:${allowGlobalScope ? 'global' : cuentaClienteId ?? 'sin-cuenta'}`
    )

    const runRefresh = () => {
      pendingRefreshRef.current = false
      startTransition(() => {
        router.refresh()
      })
    }

    const scheduleRefresh = () => {
      if (!pageCanRefresh()) {
        pendingRefreshRef.current = true
        return
      }

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      refreshTimeoutRef.current = setTimeout(runRefresh, 1800)
    }

    const flushPendingRefresh = () => {
      if (!pendingRefreshRef.current || !pageCanRefresh()) {
        return
      }

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      refreshTimeoutRef.current = setTimeout(runRefresh, 300)
    }

    const accountFilter = !allowGlobalScope && cuentaClienteId
      ? `cuenta_cliente_id=eq.${cuentaClienteId}`
      : undefined

    const subscribeTable = (table: string) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: accountFilter,
        },
        scheduleRefresh
      )
    }

    subscribeTable('asistencia')

    if (puesto === 'DERMOCONSEJERO') {
      subscribeTable('mensaje_receptor')
      subscribeTable('solicitud')
      subscribeTable('formacion_asistencia')
    } else if (puesto === 'SUPERVISOR') {
      subscribeTable('solicitud')
      subscribeTable('mensaje_receptor')
      subscribeTable('ruta_semanal')
      subscribeTable('ruta_semanal_visita')
      subscribeTable('ruta_agenda_evento')
      subscribeTable('ruta_visita_pendiente_reposicion')
      subscribeTable('formacion_asistencia')
    } else {
      subscribeTable('dashboard_kpis')
    }

    channel.subscribe()

    window.addEventListener('focus', flushPendingRefresh)
    document.addEventListener('visibilitychange', flushPendingRefresh)

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      window.removeEventListener('focus', flushPendingRefresh)
      document.removeEventListener('visibilitychange', flushPendingRefresh)
      supabase.removeChannel(channel)
    }
  }, [allowGlobalScope, cuentaClienteId, puesto, router])

  return null
}
