'use client'

import { startTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface MensajesRealtimeBridgeProps {
  cuentaClienteId: string | null
  empleadoId: string
  allowManagerScope: boolean
}

function pageCanRefresh() {
  if (typeof document === 'undefined') {
    return true
  }

  return document.visibilityState === 'visible' && document.hasFocus()
}

export function MensajesRealtimeBridge({
  cuentaClienteId,
  empleadoId,
  allowManagerScope,
}: MensajesRealtimeBridgeProps) {
  const router = useRouter()
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRefreshRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`mensajes-live:${cuentaClienteId ?? 'sin-cuenta'}:${empleadoId}`)

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

      refreshTimeoutRef.current = setTimeout(runRefresh, 1200)
    }

    const flushPendingRefresh = () => {
      if (!pendingRefreshRef.current || !pageCanRefresh()) {
        return
      }

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      refreshTimeoutRef.current = setTimeout(runRefresh, 250)
    }

    const accountFilter = cuentaClienteId ? `cuenta_cliente_id=eq.${cuentaClienteId}` : undefined
    const receptorFilter = allowManagerScope ? accountFilter : `empleado_id=eq.${empleadoId}`

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mensaje_interno',
          filter: accountFilter,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mensaje_receptor',
          filter: receptorFilter,
        },
        scheduleRefresh
      )
      .subscribe()

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
  }, [allowManagerScope, cuentaClienteId, empleadoId, router])

  return null
}