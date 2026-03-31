'use client'

import { startTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface MensajesRealtimeBridgeProps {
  cuentaClienteId: string | null
  empleadoId: string
  allowManagerScope: boolean
}

export function MensajesRealtimeBridge({
  cuentaClienteId,
  empleadoId,
  allowManagerScope,
}: MensajesRealtimeBridgeProps) {
  const router = useRouter()
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`mensajes-live:${cuentaClienteId ?? 'sin-cuenta'}:${empleadoId}`)

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      refreshTimeoutRef.current = setTimeout(() => {
        startTransition(() => {
          router.refresh()
        })
      }, 900)
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

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      supabase.removeChannel(channel)
    }
  }, [allowManagerScope, cuentaClienteId, empleadoId, router])

  return null
}