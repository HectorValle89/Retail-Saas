'use client'

import { useState, useEffect } from 'react'
import { lawyerService } from '../services/lawyerService'
import type { LawyerWithProfile } from '@/types/database'

export function useLawyer(id: string) {
  const [lawyer, setLawyer] = useState<LawyerWithProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLawyer() {
      try {
        setLoading(true)
        setError(null)
        const data = await lawyerService.getById(id)
        setLawyer(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar abogado')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchLawyer()
    }
  }, [id])

  return { lawyer, loading, error }
}
