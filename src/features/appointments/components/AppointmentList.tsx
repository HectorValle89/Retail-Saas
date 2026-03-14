'use client'

import { AppointmentCard } from '@/components/appointments'
import type { AppointmentWithRelations } from '@/types/database'

interface AppointmentListProps {
  appointments: AppointmentWithRelations[]
  loading?: boolean
  emptyMessage?: string
  userRole?: 'client' | 'lawyer'
}

export function AppointmentList({
  appointments,
  loading = false,
  emptyMessage = 'No hay citas programadas',
  userRole = 'client'
}: AppointmentListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-32 bg-gray-100 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">
          {emptyMessage}
        </h3>
        <p className="text-foreground-secondary">
          Las citas aparecerán aquí cuando las programes
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {appointments.map(appointment => (
        <AppointmentCard
          key={appointment.id}
          appointment={{
            id: appointment.id,
            lawyerName: appointment.lawyer?.profile?.full_name || 'Abogado',
            lawyerSpecialty: appointment.lawyer?.specialty || '',
            clientName: appointment.client?.profile?.full_name || 'Cliente',
            date: new Date(appointment.scheduled_at).toLocaleDateString('es-ES', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }),
            time: new Date(appointment.scheduled_at).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit'
            }),
            status: appointment.status,
            type: appointment.appointment_type?.name || 'Consulta',
            avatarUrl: userRole === 'client'
              ? appointment.lawyer?.profile?.avatar_url
              : appointment.client?.profile?.avatar_url
          }}
        />
      ))}
    </div>
  )
}
