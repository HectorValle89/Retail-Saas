'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AppointmentType, Availability } from '@/types/database'

interface LawyerInfo {
  id: string
  name: string
  email: string
  avatar?: string | null
  specialty: string
  bio?: string | null
  experience_years: number
  hourly_rate: number
  rating: number
  availability: Availability[]
}

interface PublicBookingPageProps {
  lawyer: LawyerInfo
  appointmentTypes: AppointmentType[]
}

type BookingStep = 'service' | 'datetime' | 'info' | 'confirm' | 'success'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']

export function PublicBookingPage({ lawyer, appointmentTypes }: PublicBookingPageProps) {
  const [step, setStep] = useState<BookingStep>('service')
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    description: '',
    acceptedTerms: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate available dates for next 30 days
  const availableDates = useMemo(() => {
    const dates: Date[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 1; i <= 30; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() + i)
      const dayOfWeek = date.getDay()

      const hasAvailability = lawyer.availability.some(
        a => a.day_of_week === dayOfWeek && a.is_available
      )

      if (hasAvailability) {
        dates.push(date)
      }
    }

    return dates
  }, [lawyer.availability])

  // Generate time slots for selected date
  const timeSlots = useMemo(() => {
    if (!selectedDate) return []

    const dayOfWeek = selectedDate.getDay()
    const dayAvailability = lawyer.availability.find(
      a => a.day_of_week === dayOfWeek && a.is_available
    )

    if (!dayAvailability) return []

    const slots: string[] = []
    const [startHour] = dayAvailability.start_time.split(':').map(Number)
    const [endHour] = dayAvailability.end_time.split(':').map(Number)
    const duration = selectedType?.duration_minutes || 30

    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += duration) {
        if (hour + min / 60 < endHour) {
          slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`)
        }
      }
    }

    return slots
  }, [selectedDate, lawyer.availability, selectedType])

  const handleSubmit = async () => {
    if (!selectedType || !selectedDate || !selectedTime) return

    setIsSubmitting(true)
    setError(null)

    try {
      // Combine date and time - preserve local time without UTC conversion
      const [hours, minutes] = selectedTime.split(':').map(Number)
      const year = selectedDate.getFullYear()
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const day = String(selectedDate.getDate()).padStart(2, '0')
      const hour = String(hours).padStart(2, '0')
      const min = String(minutes).padStart(2, '0')
      // Format as ISO-like string without timezone (will be stored as-is)
      const scheduledAt = `${year}-${month}-${day}T${hour}:${min}:00`

      const response = await fetch('/api/booking/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lawyerId: lawyer.id,
          appointmentTypeId: selectedType.id,
          scheduledAt,
          client: {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            description: formData.description
          }
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear la cita')
      }

      setStep('success')
    } catch (err) {
      console.error('Booking error:', err)
      setError(err instanceof Error ? err.message : 'Error al crear la cita')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(price)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background to-secondary-50">
      {/* Header */}
      <div className="bg-primary-500 text-white py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-4">
            <ScaleIcon className="w-8 h-8 text-secondary-400" />
            <span className="text-xl font-semibold">LexAgenda</span>
          </div>
          <h1 className="text-3xl font-bold">Agenda tu Consulta Legal</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Lawyer Profile */}
          <Card className="p-6 md:col-span-1 h-fit">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-primary-100 mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-primary-600">
                {lawyer.name.charAt(0)}
              </div>
              <h2 className="text-xl font-bold text-foreground">{lawyer.name}</h2>
              <p className="text-accent-600 font-medium">{lawyer.specialty}</p>

              <div className="flex items-center justify-center gap-1 mt-2">
                {[...Array(5)].map((_, i) => (
                  <StarIcon
                    key={i}
                    className={`w-4 h-4 ${i < Math.floor(lawyer.rating) ? 'text-secondary-500 fill-secondary-500' : 'text-gray-300'}`}
                  />
                ))}
                <span className="text-sm text-foreground-secondary ml-1">({lawyer.rating})</span>
              </div>

              <div className="text-sm text-foreground-secondary mt-4 space-y-2">
                <p className="flex items-center justify-center gap-2">
                  <BriefcaseIcon className="w-4 h-4" />
                  {lawyer.experience_years} anos de experiencia
                </p>
                <p className="flex items-center justify-center gap-2">
                  <CurrencyIcon className="w-4 h-4" />
                  {formatPrice(lawyer.hourly_rate)}/hora
                </p>
              </div>

              {lawyer.bio && (
                <p className="text-sm text-foreground-secondary mt-4 text-left">
                  {lawyer.bio}
                </p>
              )}
            </div>
          </Card>

          {/* Booking Form */}
          <div className="md:col-span-2">
            {/* Progress */}
            <div className="flex items-center justify-between mb-8">
              {['service', 'datetime', 'info', 'confirm'].map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === s || ['service', 'datetime', 'info', 'confirm'].indexOf(step) > i
                      ? 'bg-accent-500 text-white'
                      : 'bg-gray-200 text-foreground-secondary'
                  }`}>
                    {i + 1}
                  </div>
                  {i < 3 && (
                    <div className={`w-16 h-1 ${
                      ['service', 'datetime', 'info', 'confirm'].indexOf(step) > i
                        ? 'bg-accent-500'
                        : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: Select Service */}
            {step === 'service' && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  1. Selecciona el tipo de consulta
                </h3>
                <div className="space-y-3">
                  {appointmentTypes.map(type => (
                    <button
                      key={type.id}
                      onClick={() => {
                        setSelectedType(type)
                        setStep('datetime')
                      }}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all hover:border-accent-300 ${
                        selectedType?.id === type.id
                          ? 'border-accent-500 bg-accent-50'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-foreground">{type.name}</h4>
                          <p className="text-sm text-foreground-secondary mt-1">
                            {type.description}
                          </p>
                          <p className="text-sm text-foreground-secondary mt-1">
                            <ClockIcon className="w-4 h-4 inline mr-1" />
                            {type.duration_minutes} minutos
                          </p>
                        </div>
                        <span className="text-lg font-bold text-accent-600">
                          {formatPrice(type.price)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Step 2: Select Date & Time */}
            {step === 'datetime' && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  2. Selecciona fecha y hora
                </h3>

                {/* Date Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-foreground-secondary mb-2">
                    Fecha disponible
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                    {availableDates.map(date => (
                      <button
                        key={date.toISOString()}
                        onClick={() => {
                          setSelectedDate(date)
                          setSelectedTime(null)
                        }}
                        className={`p-3 rounded-lg text-center transition-all ${
                          selectedDate?.toDateString() === date.toDateString()
                            ? 'bg-accent-500 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-foreground'
                        }`}
                      >
                        <div className="text-xs">{DAYS[date.getDay()].slice(0, 3)}</div>
                        <div className="text-lg font-bold">{date.getDate()}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Selection */}
                {selectedDate && (
                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-2">
                      Hora disponible - {formatDate(selectedDate)}
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {timeSlots.map(time => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`p-2 rounded-lg text-sm font-medium transition-all ${
                            selectedTime === time
                              ? 'bg-accent-500 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-foreground'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep('service')}>
                    Atras
                  </Button>
                  <Button
                    onClick={() => setStep('info')}
                    disabled={!selectedDate || !selectedTime}
                    className="flex-1"
                  >
                    Continuar
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 3: Personal Info */}
            {step === 'info' && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  3. Tus datos de contacto
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      Nombre completo *
                    </label>
                    <Input
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Juan Perez"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      Correo electronico *
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="juan@ejemplo.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      Telefono *
                    </label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+52 55 1234 5678"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      Describe brevemente tu caso
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Cuentanos sobre tu situacion legal..."
                      rows={4}
                      className="w-full px-4 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.acceptedTerms}
                      onChange={e => setFormData(prev => ({ ...prev, acceptedTerms: e.target.checked }))}
                      className="mt-1 w-4 h-4 rounded border-border text-accent-500 focus:ring-accent-500"
                    />
                    <span className="text-sm text-foreground-secondary">
                      Acepto la <a href="/privacy" className="text-accent-600 underline">Politica de Privacidad</a> y
                      los <a href="/terms" className="text-accent-600 underline">Terminos de Servicio</a>
                    </span>
                  </label>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep('datetime')}>
                    Atras
                  </Button>
                  <Button
                    onClick={() => setStep('confirm')}
                    disabled={!formData.name || !formData.email || !formData.phone || !formData.acceptedTerms}
                    className="flex-1"
                  >
                    Revisar Cita
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 4: Confirm */}
            {step === 'confirm' && selectedType && selectedDate && selectedTime && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  4. Confirma tu cita
                </h3>

                <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-foreground-secondary">Servicio</span>
                    <span className="font-medium text-foreground">{selectedType.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-secondary">Abogado</span>
                    <span className="font-medium text-foreground">{lawyer.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-secondary">Fecha</span>
                    <span className="font-medium text-foreground">{formatDate(selectedDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-secondary">Hora</span>
                    <span className="font-medium text-foreground">{selectedTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-secondary">Duracion</span>
                    <span className="font-medium text-foreground">{selectedType.duration_minutes} min</span>
                  </div>
                  <div className="border-t border-border pt-3 flex justify-between">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="text-xl font-bold text-accent-600">{formatPrice(selectedType.price)}</span>
                  </div>
                </div>

                <div className="bg-primary-50 rounded-xl p-4 mb-6">
                  <h4 className="font-medium text-primary-700 mb-2">Tus datos</h4>
                  <p className="text-sm text-primary-600">{formData.name}</p>
                  <p className="text-sm text-primary-600">{formData.email}</p>
                  <p className="text-sm text-primary-600">{formData.phone}</p>
                </div>

                {error && (
                  <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-xl mb-4">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep('info')}>
                    Atras
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? (
                      <>
                        <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      'Confirmar Cita'
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* Success */}
            {step === 'success' && (
              <Card className="p-8 text-center">
                <div className="w-20 h-20 bg-success-100 rounded-full mx-auto mb-6 flex items-center justify-center">
                  <CheckCircleIcon className="w-12 h-12 text-success-500" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-2">
                  Cita Confirmada
                </h3>
                <p className="text-foreground-secondary mb-6">
                  Hemos enviado los detalles de tu cita a {formData.email}
                </p>

                <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
                  <div className="flex justify-between mb-2">
                    <span className="text-foreground-secondary">Abogado</span>
                    <span className="font-medium">{lawyer.name}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-foreground-secondary">Fecha</span>
                    <span className="font-medium">{selectedDate && formatDate(selectedDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-secondary">Hora</span>
                    <span className="font-medium">{selectedTime}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" className="flex-1">
                    <CalendarPlusIcon className="w-5 h-5 mr-2" />
                    Agregar al Calendario
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setStep('service')
                      setSelectedType(null)
                      setSelectedDate(null)
                      setSelectedTime(null)
                      setFormData({ name: '', email: '', phone: '', description: '', acceptedTerms: false })
                    }}
                  >
                    Agendar Otra Cita
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-primary-900 text-white py-8 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ScaleIcon className="w-6 h-6 text-secondary-400" />
            <span className="font-semibold">LexAgenda</span>
          </div>
          <p className="text-sm text-white/60">
            Plataforma de agendamiento legal profesional
          </p>
          <div className="flex justify-center gap-6 mt-4 text-sm text-white/60">
            <a href="/privacy" className="hover:text-white">Privacidad</a>
            <a href="/terms" className="hover:text-white">Terminos</a>
            <a href="/contact" className="hover:text-white">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Icons
function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  )
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CalendarPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}
