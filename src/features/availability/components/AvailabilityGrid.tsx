'use client'

import { useLawyerAvailability } from '../hooks/useAvailability'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface AvailabilityGridProps {
  lawyerId: string
}

export function AvailabilityGrid({ lawyerId }: AvailabilityGridProps) {
  const { availability, loading, error } = useLawyerAvailability(lawyerId)

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-error-500 text-sm">{error}</p>
  }

  const availabilityByDay = availability.reduce((acc, a) => {
    acc[a.day_of_week] = a
    return acc
  }, {} as Record<number, typeof availability[0]>)

  return (
    <div className="space-y-2">
      {DAYS.map((day, index) => {
        const dayAvailability = availabilityByDay[index]
        const isAvailable = dayAvailability?.is_available

        return (
          <div
            key={day}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              isAvailable
                ? 'border-success-200 bg-success-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <span className={`font-medium ${isAvailable ? 'text-foreground' : 'text-foreground-muted'}`}>
              {day}
            </span>
            {isAvailable ? (
              <span className="text-sm text-success-600">
                {dayAvailability.start_time.slice(0, 5)} - {dayAvailability.end_time.slice(0, 5)}
              </span>
            ) : (
              <span className="text-sm text-foreground-muted">No disponible</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
