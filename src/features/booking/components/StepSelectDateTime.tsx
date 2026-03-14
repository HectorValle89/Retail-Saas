'use client'

import { Calendar, TimeSlotPicker } from '@/components/appointments'
import { Button } from '@/components/ui/button'
import { useAvailableSlots } from '@/features/availability/hooks/useAvailability'
import { useBookingStore } from '../store/bookingStore'

export function StepSelectDateTime() {
  const {
    lawyerId,
    selectedDate,
    selectedTime,
    setDate,
    setTime,
    nextStep,
    prevStep,
    canProceedToStep3
  } = useBookingStore()

  const { slots, loading } = useAvailableSlots(lawyerId!, selectedDate)

  // Generar fechas marcadas (próximos 30 días disponibles)
  const today = new Date()
  const markedDates = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() + i)
    return date.toISOString().split('T')[0]
  })

  const handleDateSelect = (date: Date) => {
    setDate(date)
  }

  const handleTimeSelect = (time: string) => {
    setTime(time)
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Calendario */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Selecciona una fecha
          </h3>
          <Calendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            markedDates={markedDates}
            minDate={today}
          />
        </div>

        {/* Horarios */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Horarios disponibles
          </h3>
          {selectedDate ? (
            loading ? (
              <div className="grid grid-cols-3 gap-2">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : slots.length > 0 ? (
              <TimeSlotPicker
                slots={slots}
                selectedSlot={selectedTime}
                onSlotSelect={handleTimeSelect}
              />
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-foreground-secondary">
                  No hay horarios disponibles para esta fecha
                </p>
                <p className="text-sm text-foreground-muted mt-1">
                  Prueba seleccionando otro día
                </p>
              </div>
            )
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-foreground-secondary">
                Selecciona una fecha en el calendario
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Resumen de selección */}
      {selectedDate && selectedTime && (
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-foreground">Fecha y hora seleccionada</p>
              <p className="text-sm text-primary-600">
                {selectedDate.toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })} a las {selectedTime}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Botones navegación */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={prevStep}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Anterior
        </Button>
        <Button
          onClick={nextStep}
          disabled={!canProceedToStep3()}
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
