'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createAppointment } from '@/actions/appointments'
import { useBookingStore } from '../store/bookingStore'
import { lawyerService } from '@/features/lawyers/services/lawyerService'
import { appointmentService } from '@/features/appointments/services/appointmentService'
import type { LawyerWithProfile, AppointmentType } from '@/types/database'

export function StepConfirm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lawyer, setLawyer] = useState<LawyerWithProfile | null>(null)
  const [appointmentType, setAppointmentType] = useState<AppointmentType | null>(null)

  const {
    lawyerId,
    appointmentTypeId,
    selectedDate,
    selectedTime,
    clientNotes,
    setNotes,
    prevStep,
    reset
  } = useBookingStore()

  // Cargar datos del abogado y tipo de cita
  useEffect(() => {
    async function loadData() {
      if (lawyerId) {
        const l = await lawyerService.getById(lawyerId)
        setLawyer(l)
      }
      if (appointmentTypeId) {
        const types = await appointmentService.getAppointmentTypes()
        const t = types.find(t => t.id === appointmentTypeId)
        if (t) setAppointmentType(t)
      }
    }
    loadData()
  }, [lawyerId, appointmentTypeId])

  const handleConfirm = async () => {
    if (!lawyerId || !appointmentTypeId || !selectedDate || !selectedTime) {
      return
    }

    setLoading(true)
    setError(null)

    // Construir fecha completa
    const [hours, minutes] = selectedTime.split(':').map(Number)
    const scheduledAt = new Date(selectedDate)
    scheduledAt.setHours(hours, minutes, 0, 0)

    const result = await createAppointment({
      lawyer_id: lawyerId,
      appointment_type_id: appointmentTypeId,
      scheduled_at: scheduledAt.toISOString(),
      client_notes: clientNotes || undefined
    })

    setLoading(false)

    if (result?.error) {
      setError(result.error)
    } else {
      reset()
      router.push('/appointments')
    }
  }

  if (!lawyer || !appointmentType || !selectedDate || !selectedTime) {
    return (
      <div className="text-center py-12">
        <p className="text-foreground-secondary">Cargando resumen...</p>
      </div>
    )
  }

  const initials = lawyer.profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??'

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">
        Confirma tu cita
      </h3>

      {/* Resumen de la cita */}
      <Card className="p-6">
        <div className="space-y-6">
          {/* Abogado */}
          <div className="flex items-center gap-4">
            {lawyer.profile?.avatar_url ? (
              <img
                src={lawyer.profile.avatar_url}
                alt={lawyer.profile.full_name || 'Abogado'}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold text-lg">
                {initials}
              </div>
            )}
            <div>
              <h4 className="font-semibold text-foreground">
                {lawyer.profile?.full_name}
              </h4>
              <p className="text-sm text-accent-500">{lawyer.specialty}</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Detalles */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-foreground-muted mb-1">Tipo de consulta</p>
              <p className="font-medium text-foreground">{appointmentType.name}</p>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Duración</p>
              <p className="font-medium text-foreground">{appointmentType.duration_minutes} minutos</p>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Fecha</p>
              <p className="font-medium text-foreground">
                {selectedDate.toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Hora</p>
              <p className="font-medium text-foreground">{selectedTime}</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Precio */}
          <div className="flex items-center justify-between">
            <span className="text-foreground-secondary">Costo de la consulta</span>
            <span className="text-2xl font-bold text-secondary-600">
              ${appointmentType.price}
            </span>
          </div>
        </div>
      </Card>

      {/* Notas adicionales */}
      <Card className="p-6">
        <label className="block">
          <span className="text-sm font-medium text-foreground mb-2 block">
            Notas adicionales (opcional)
          </span>
          <textarea
            value={clientNotes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            rows={3}
            placeholder="Describe brevemente el motivo de tu consulta..."
          />
        </label>
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-error-50 border border-error-200 rounded-lg p-4">
          <p className="text-error-600 text-sm">{error}</p>
        </div>
      )}

      {/* Botones */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={prevStep} disabled={loading}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Anterior
        </Button>
        <Button onClick={handleConfirm} disabled={loading} size="lg">
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Procesando...
            </>
          ) : (
            <>
              Confirmar Cita
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
