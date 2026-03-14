'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { AppointmentWithRelations, AppointmentStatus, UserRole } from '@/types/database'

type ViewMode = 'day' | 'week' | 'month'

interface CalendarViewProps {
  initialAppointments: AppointmentWithRelations[]
  lawyers: { id: string; profile: { full_name: string } }[]
  userRole: UserRole
}

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  pending: { bg: 'bg-warning-100', border: 'border-l-warning-500', text: 'text-warning-700' },
  confirmed: { bg: 'bg-accent-100', border: 'border-l-accent-500', text: 'text-accent-700' },
  completed: { bg: 'bg-success-100', border: 'border-l-success-500', text: 'text-success-700' },
  paid: { bg: 'bg-purple-100', border: 'border-l-purple-500', text: 'text-purple-700' },
  cancelled: { bg: 'bg-error-100', border: 'border-l-error-500', text: 'text-error-700' },
  no_show: { bg: 'bg-gray-100', border: 'border-l-gray-500', text: 'text-gray-700' },
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  paid: 'Pagada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8am to 7pm

// Helper to get client name from profile or direct field (for guest clients)
const getClientName = (client: AppointmentWithRelations['client'] | undefined): string => {
  if (!client) return 'Cliente'
  return client.profile?.full_name || client.full_name || 'Cliente'
}

export function CalendarView({ initialAppointments, lawyers, userRole }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedLawyer, setSelectedLawyer] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus | 'all'>('all')
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null)

  const appointments = useMemo(() => {
    return initialAppointments.filter(apt => {
      if (selectedLawyer !== 'all' && apt.lawyer_id !== selectedLawyer) return false
      if (selectedStatus !== 'all' && apt.status !== selectedStatus) return false
      return true
    })
  }, [initialAppointments, selectedLawyer, selectedStatus])

  const navigate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate)
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => setCurrentDate(new Date())

  const getWeekDays = () => {
    const start = new Date(currentDate)
    const day = start.getDay()
    start.setDate(start.getDate() - day)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return d
    })
  }

  const getMonthDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startOffset = firstDay.getDay()

    const days: (Date | null)[] = []
    for (let i = 0; i < startOffset; i++) {
      days.push(null)
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d))
    }
    return days
  }

  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.scheduled_at)
      return aptDate.toDateString() === date.toDateString()
    })
  }

  const getAppointmentsForHour = (date: Date, hour: number) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.scheduled_at)
      return aptDate.toDateString() === date.toDateString() && aptDate.getHours() === hour
    })
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calendario</h1>
          <p className="text-foreground-secondary mt-1">
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(['day', 'week', 'month'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === mode
                    ? 'bg-white shadow-sm text-foreground'
                    : 'text-foreground-secondary hover:text-foreground'
                }`}
              >
                {mode === 'day' ? 'Día' : mode === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('prev')}>
              <ChevronLeftIcon className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Hoy
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('next')}>
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          {userRole === 'admin' && lawyers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Abogado
              </label>
              <select
                value={selectedLawyer}
                onChange={(e) => setSelectedLawyer(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="all">Todos</option>
                {lawyers.map(l => (
                  <option key={l.id} value={l.id}>{l.profile.full_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Estado
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as AppointmentStatus | 'all')}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="all">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Legend */}
          <div className="flex-1 flex items-end justify-end">
            <div className="flex flex-wrap gap-3 text-xs">
              {Object.entries(STATUS_LABELS).slice(0, 4).map(([status, label]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded ${STATUS_COLORS[status as AppointmentStatus].bg} border-l-2 ${STATUS_COLORS[status as AppointmentStatus].border}`} />
                  <span className="text-foreground-secondary">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Calendar Grid */}
      <Card className="overflow-hidden">
        {viewMode === 'month' && (
          <MonthView
            days={getMonthDays()}
            appointments={appointments}
            onSelectAppointment={setSelectedAppointment}
          />
        )}

        {viewMode === 'week' && (
          <WeekView
            days={getWeekDays()}
            hours={HOURS}
            getAppointmentsForHour={getAppointmentsForHour}
            onSelectAppointment={setSelectedAppointment}
          />
        )}

        {viewMode === 'day' && (
          <DayView
            date={currentDate}
            hours={HOURS}
            getAppointmentsForHour={getAppointmentsForHour}
            onSelectAppointment={setSelectedAppointment}
          />
        )}
      </Card>

      {/* Appointment Detail Modal */}
      {selectedAppointment && (
        <AppointmentModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  )
}

// Month View Component
function MonthView({
  days,
  appointments,
  onSelectAppointment
}: {
  days: (Date | null)[]
  appointments: AppointmentWithRelations[]
  onSelectAppointment: (apt: AppointmentWithRelations) => void
}) {
  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.scheduled_at)
      return aptDate.toDateString() === date.toDateString()
    })
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS.map(day => (
          <div key={day} className="p-3 text-center text-sm font-semibold text-foreground-secondary bg-gray-50">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date, i) => {
          const isCurrentDay = date && date.toDateString() === new Date().toDateString()
          const dayAppointments = date ? getAppointmentsForDate(date) : []

          return (
            <div
              key={i}
              className={`min-h-[120px] p-2 border-b border-r border-border ${
                !date ? 'bg-gray-50' : ''
              }`}
            >
              {date && (
                <>
                  <div className={`text-sm font-medium mb-1 ${
                    isCurrentDay
                      ? 'w-7 h-7 rounded-full bg-accent-500 text-white flex items-center justify-center'
                      : 'text-foreground'
                  }`}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayAppointments.slice(0, 3).map(apt => {
                      const colors = STATUS_COLORS[apt.status]
                      return (
                        <button
                          key={apt.id}
                          onClick={() => onSelectAppointment(apt)}
                          className={`w-full text-left px-2 py-1 rounded text-xs truncate ${colors.bg} ${colors.text} border-l-2 ${colors.border} hover:opacity-80 transition-opacity`}
                        >
                          {new Date(apt.scheduled_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {getClientName(apt.client)}
                        </button>
                      )
                    })}
                    {dayAppointments.length > 3 && (
                      <p className="text-xs text-foreground-secondary pl-2">
                        +{dayAppointments.length - 3} más
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Week View Component
function WeekView({
  days,
  hours,
  getAppointmentsForHour,
  onSelectAppointment
}: {
  days: Date[]
  hours: number[]
  getAppointmentsForHour: (date: Date, hour: number) => AppointmentWithRelations[]
  onSelectAppointment: (apt: AppointmentWithRelations) => void
}) {
  return (
    <div className="overflow-auto max-h-[600px]">
      <div className="min-w-[800px]">
        {/* Header */}
        <div className="grid grid-cols-8 border-b border-border sticky top-0 bg-white z-10">
          <div className="p-3 border-r border-border" />
          {days.map((date, i) => {
            const isCurrentDay = date.toDateString() === new Date().toDateString()
            return (
              <div key={i} className={`p-3 text-center border-r border-border ${isCurrentDay ? 'bg-accent-50' : ''}`}>
                <div className="text-xs text-foreground-secondary">{DAYS[date.getDay()]}</div>
                <div className={`text-lg font-semibold ${isCurrentDay ? 'text-accent-600' : 'text-foreground'}`}>
                  {date.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Time Grid */}
        {hours.map(hour => (
          <div key={hour} className="grid grid-cols-8 border-b border-border min-h-[60px]">
            <div className="p-2 text-xs text-foreground-secondary border-r border-border text-right pr-3">
              {hour}:00
            </div>
            {days.map((date, i) => {
              const hourAppointments = getAppointmentsForHour(date, hour)
              return (
                <div key={i} className="p-1 border-r border-border relative">
                  {hourAppointments.map(apt => {
                    const colors = STATUS_COLORS[apt.status]
                    return (
                      <button
                        key={apt.id}
                        onClick={() => onSelectAppointment(apt)}
                        className={`w-full text-left px-2 py-1 rounded text-xs ${colors.bg} ${colors.text} border-l-2 ${colors.border} hover:opacity-80 transition-opacity mb-1`}
                      >
                        <div className="font-medium truncate">
                          {getClientName(apt.client)}
                        </div>
                        <div className="text-[10px] opacity-75">
                          {apt.appointment_type?.name || 'Consulta'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Day View Component
function DayView({
  date,
  hours,
  getAppointmentsForHour,
  onSelectAppointment
}: {
  date: Date
  hours: number[]
  getAppointmentsForHour: (date: Date, hour: number) => AppointmentWithRelations[]
  onSelectAppointment: (apt: AppointmentWithRelations) => void
}) {
  return (
    <div className="overflow-auto max-h-[600px]">
      <div className="p-4 border-b border-border bg-gray-50">
        <h3 className="font-semibold text-foreground">
          {DAYS[date.getDay()]}, {date.getDate()} de {MONTHS[date.getMonth()]}
        </h3>
      </div>
      {hours.map(hour => {
        const hourAppointments = getAppointmentsForHour(date, hour)
        return (
          <div key={hour} className="flex border-b border-border min-h-[80px]">
            <div className="w-20 p-3 text-sm text-foreground-secondary border-r border-border text-right shrink-0">
              {hour}:00
            </div>
            <div className="flex-1 p-2 space-y-2">
              {hourAppointments.map(apt => {
                const colors = STATUS_COLORS[apt.status]
                return (
                  <button
                    key={apt.id}
                    onClick={() => onSelectAppointment(apt)}
                    className={`w-full text-left px-4 py-3 rounded-xl ${colors.bg} ${colors.text} border-l-4 ${colors.border} hover:opacity-80 transition-opacity`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{getClientName(apt.client)}</span>
                      <span className="text-sm">{apt.duration_minutes} min</span>
                    </div>
                    <div className="text-sm opacity-75 mt-1">
                      {apt.appointment_type?.name || 'Consulta'} - {apt.lawyer?.profile?.full_name || 'Abogado'}
                    </div>
                  </button>
                )
              })}
              {hourAppointments.length === 0 && (
                <div className="h-full flex items-center justify-center text-sm text-foreground-muted">
                  Disponible
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Appointment Modal
function AppointmentModal({
  appointment,
  onClose
}: {
  appointment: AppointmentWithRelations
  onClose: () => void
}) {
  const colors = STATUS_COLORS[appointment.status]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
              {STATUS_LABELS[appointment.status]}
            </span>
            <h3 className="text-xl font-bold text-foreground mt-2">
              {appointment.appointment_type?.name || 'Consulta Legal'}
            </h3>
          </div>
          <button onClick={onClose} className="text-foreground-secondary hover:text-foreground">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-foreground-secondary">Cliente</p>
              <p className="font-medium text-foreground">{getClientName(appointment.client)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center">
              <BriefcaseIcon className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <p className="text-sm text-foreground-secondary">Abogado</p>
              <p className="font-medium text-foreground">{appointment.lawyer?.profile?.full_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary-100 flex items-center justify-center">
              <ClockIcon className="w-5 h-5 text-secondary-600" />
            </div>
            <div>
              <p className="text-sm text-foreground-secondary">Fecha y Hora</p>
              <p className="font-medium text-foreground">
                {new Date(appointment.scheduled_at).toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
              <p className="text-sm text-foreground-secondary">
                {new Date(appointment.scheduled_at).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit'
                })} - {appointment.duration_minutes} minutos
              </p>
            </div>
          </div>

          {appointment.notes && (
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-sm text-foreground-secondary mb-1">Notas:</p>
              <p className="text-sm text-foreground">{appointment.notes}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cerrar
          </Button>
          <Button className="flex-1">
            Ver Detalles
          </Button>
        </div>
      </Card>
    </div>
  )
}

// Icons
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
