'use client'

import { useState, useEffect, useCallback } from 'react'
import { appointmentService } from '../services/appointmentService'
import type { AppointmentWithRelations, AppointmentStatus } from '@/types/database'

interface UseAppointmentsOptions {
  clientId?: string
  lawyerId?: string
  status?: AppointmentStatus
}

export function useAppointments(options: UseAppointmentsOptions = {}) {
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let data: AppointmentWithRelations[]

      if (options.clientId) {
        data = await appointmentService.getByClient(options.clientId)
      } else if (options.lawyerId) {
        data = await appointmentService.getByLawyer(options.lawyerId)
      } else {
        data = []
      }

      if (options.status) {
        data = data.filter(a => a.status === options.status)
      }

      setAppointments(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar citas')
    } finally {
      setLoading(false)
    }
  }, [options.clientId, options.lawyerId, options.status])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  return { appointments, loading, error, refetch: fetchAppointments }
}

export function useAppointment(id: string) {
  const [appointment, setAppointment] = useState<AppointmentWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const data = await appointmentService.getById(id)
        setAppointment(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar cita')
      } finally {
        setLoading(false)
      }
    }

    fetch()
  }, [id])

  return { appointment, loading, error }
}

export function useAppointmentTypes() {
  const [types, setTypes] = useState<Awaited<ReturnType<typeof appointmentService.getAppointmentTypes>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const data = await appointmentService.getAppointmentTypes()
        setTypes(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar tipos')
      } finally {
        setLoading(false)
      }
    }

    fetch()
  }, [])

  return { types, loading, error }
}
