'use client'

import { useState, useEffect } from 'react'
import { lawyerService, type LawyerFilters } from '../services/lawyerService'
import type { LawyerWithProfile } from '@/types/database'

export function useLawyers(filters?: LawyerFilters) {
  const [lawyers, setLawyers] = useState<LawyerWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLawyers() {
      try {
        setLoading(true)
        setError(null)
        const data = await lawyerService.getAll({
          ...filters,
          isActive: true
        })
        setLawyers(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar abogados')
      } finally {
        setLoading(false)
      }
    }

    fetchLawyers()
  }, [filters?.specialty])

  return { lawyers, loading, error, refetch: () => {} }
}

export function useSpecialties() {
  const [specialties, setSpecialties] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSpecialties() {
      try {
        const data = await lawyerService.getSpecialties()
        setSpecialties(data)
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }

    fetchSpecialties()
  }, [])

  return { specialties, loading }
}
