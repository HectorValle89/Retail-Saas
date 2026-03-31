'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isSupabaseAuthNetworkError } from '@/lib/supabase/authClientErrors'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const cargarUsuario = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!cancelled) {
          setUser(user)
        }
      } catch (error) {
        if (isSupabaseAuthNetworkError(error)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('useAuth omitio la carga inicial del usuario por fallo de red.', error)
          }
        } else {
          console.error('useAuth encontro un error inesperado al resolver el usuario.', error)
        }

        if (!cancelled) {
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void cargarUsuario()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) {
        return
      }

      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}
