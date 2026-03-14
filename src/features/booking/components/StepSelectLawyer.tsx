'use client'

import { useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLawyers } from '@/features/lawyers/hooks/useLawyers'
import { useAppointmentTypes } from '@/features/appointments/hooks/useAppointments'
import { useBookingStore } from '../store/bookingStore'
import type { LawyerWithProfile } from '@/types/database'

interface StepSelectLawyerProps {
  preselectedLawyerId?: string
}

export function StepSelectLawyer({ preselectedLawyerId }: StepSelectLawyerProps) {
  const { lawyers, loading: lawyersLoading } = useLawyers({ isActive: true })
  const { types, loading: typesLoading } = useAppointmentTypes()

  const {
    lawyerId,
    appointmentTypeId,
    setLawyer,
    setAppointmentType,
    nextStep,
    canProceedToStep2
  } = useBookingStore()

  // Pre-seleccionar abogado si viene de la URL
  useEffect(() => {
    if (preselectedLawyerId && !lawyerId) {
      setLawyer(preselectedLawyerId)
    }
  }, [preselectedLawyerId, lawyerId, setLawyer])

  if (lawyersLoading || typesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Selección de abogado */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Selecciona un abogado
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lawyers.map((lawyer) => (
            <LawyerSelectCard
              key={lawyer.id}
              lawyer={lawyer}
              isSelected={lawyerId === lawyer.id}
              onSelect={() => setLawyer(lawyer.id)}
            />
          ))}
        </div>
      </div>

      {/* Selección de tipo de cita */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Tipo de consulta
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {types.map((type) => (
            <Card
              key={type.id}
              className={`p-4 cursor-pointer transition-all ${
                appointmentTypeId === type.id
                  ? 'ring-2 ring-primary-500 bg-primary-50'
                  : 'hover:border-primary-300'
              }`}
              onClick={() => setAppointmentType(type.id)}
            >
              <h4 className="font-medium text-foreground">{type.name}</h4>
              <p className="text-sm text-foreground-secondary mt-1 line-clamp-2">
                {type.description}
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-foreground-muted">
                  {type.duration_minutes} min
                </span>
                <span className="font-semibold text-secondary-600">
                  ${type.price}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Botón continuar */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={nextStep}
          disabled={!canProceedToStep2()}
          size="lg"
        >
          Continuar
          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  )
}

function LawyerSelectCard({
  lawyer,
  isSelected,
  onSelect
}: {
  lawyer: LawyerWithProfile
  isSelected: boolean
  onSelect: () => void
}) {
  const initials = lawyer.profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??'

  return (
    <Card
      className={`p-4 cursor-pointer transition-all ${
        isSelected
          ? 'ring-2 ring-primary-500 bg-primary-50'
          : 'hover:border-primary-300'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-4">
        {lawyer.profile?.avatar_url ? (
          <img
            src={lawyer.profile.avatar_url}
            alt={lawyer.profile.full_name || 'Abogado'}
            className="w-14 h-14 rounded-full object-cover"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold">
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-foreground truncate">
              {lawyer.profile?.full_name}
            </h4>
            {isSelected && (
              <svg className="w-5 h-5 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <p className="text-sm text-accent-500">{lawyer.specialty}</p>
          <div className="flex items-center gap-3 mt-1 text-sm text-foreground-muted">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-secondary-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {lawyer.rating.toFixed(1)}
            </span>
            <span>${lawyer.hourly_rate}/hr</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
