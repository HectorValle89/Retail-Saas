'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AppointmentWithRelations } from '@/types/database'

type ViewType = 'week' | 'month'

interface AppointmentsCalendarProps {
  appointments: AppointmentWithRelations[]
  userRole: 'client' | 'lawyer' | 'admin'
}

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const statusColors: Record<string, string> = {
  pending: 'bg-status-pending border-status-pending',
  confirmed: 'bg-status-confirmed border-status-confirmed',
  completed: 'bg-status-completed border-status-completed',
  paid: 'bg-status-paid border-status-paid',
  cancelled: 'bg-status-cancelled border-status-cancelled',
  no_show: 'bg-gray-400 border-gray-400',
}

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  paid: 'Pagada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
}

// Helper to get client name from profile or direct field (for guest clients)
const getClientName = (client: AppointmentWithRelations['client'] | undefined): string => {
  if (!client) return 'Cliente'
  return client.profile?.full_name || client.full_name || 'Cliente'
}

export function AppointmentsCalendar({ appointments, userRole }: AppointmentsCalendarProps) {
  const [view, setView] = useState<ViewType>('week')
  const [currentDate, setCurrentDate] = useState(new Date())

  // Get appointments map by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, AppointmentWithRelations[]>()
    appointments.forEach(apt => {
      const dateKey = new Date(apt.scheduled_at).toDateString()
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(apt)
    })
    // Sort appointments by time within each day
    map.forEach((apts) => {
      apts.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    })
    return map
  }, [appointments])

  // Get week dates
  const getWeekDates = (date: Date) => {
    const startOfWeek = new Date(date)
    const day = startOfWeek.getDay()
    startOfWeek.setDate(startOfWeek.getDate() - day)

    const dates = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      dates.push(d)
    }
    return dates
  }

  // Get month dates (including padding days)
  const getMonthDates = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPadding = firstDay.getDay()

    const dates = []

    // Padding from previous month
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      dates.push({ date: d, isCurrentMonth: false })
    }

    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      dates.push({ date: new Date(year, month, i), isCurrentMonth: true })
    }

    // Padding for next month (to complete 6 rows)
    const remaining = 42 - dates.length
    for (let i = 1; i <= remaining; i++) {
      dates.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
    }

    return dates
  }

  const weekDates = getWeekDates(currentDate)
  const monthDates = getMonthDates(currentDate)

  const navigate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate)
    if (view === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getHeaderText = () => {
    if (view === 'week') {
      const start = weekDates[0]
      const end = weekDates[6]
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} - ${end.getDate()} de ${MONTHS[start.getMonth()]} ${start.getFullYear()}`
      }
      return `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} - ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }

  const renderAppointment = (apt: AppointmentWithRelations, compact = false) => {
    const personName = userRole === 'lawyer'
      ? getClientName(apt.client)
      : apt.lawyer?.profile?.full_name || 'Abogado'

    if (compact) {
      return (
        <Link
          key={apt.id}
          href={`/appointments/${apt.id}`}
          className={`block text-xs p-1.5 rounded-lg text-white truncate hover:opacity-90 transition-opacity ${statusColors[apt.status]}`}
        >
          {formatTime(apt.scheduled_at)} {personName.split(' ')[0]}
        </Link>
      )
    }

    return (
      <Link
        key={apt.id}
        href={`/appointments/${apt.id}`}
        className={`block p-3 rounded-xl border-l-4 bg-white shadow-sm hover:shadow-md transition-all ${statusColors[apt.status]}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground truncate">{personName}</p>
            <p className="text-sm text-foreground-secondary">
              {formatTime(apt.scheduled_at)} - {apt.duration_minutes} min
            </p>
            {apt.appointment_type && (
              <p className="text-xs text-foreground-muted mt-1 truncate">
                {apt.appointment_type.name}
              </p>
            )}
          </div>
          <Badge variant={apt.status === 'confirmed' ? 'confirmed' : apt.status === 'pending' ? 'pending' : 'cancelled'} className="text-[10px] shrink-0">
            {statusLabels[apt.status]}
          </Badge>
        </div>
      </Link>
    )
  }

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary-50 to-accent-50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('prev')}
              className="p-2 hover:bg-white/80 rounded-lg transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5 text-foreground-secondary" />
            </button>
            <h2 className="text-lg font-semibold text-foreground min-w-[200px] text-center">
              {getHeaderText()}
            </h2>
            <button
              onClick={() => navigate('next')}
              className="p-2 hover:bg-white/80 rounded-lg transition-colors"
            >
              <ChevronRightIcon className="w-5 h-5 text-foreground-secondary" />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-white/80 rounded-lg transition-colors"
            >
              Hoy
            </button>
          </div>

          {/* View Toggle */}
          <div className="flex bg-white rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setView('week')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                view === 'week'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-foreground-secondary hover:text-foreground'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                view === 'month'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-foreground-secondary hover:text-foreground'
              }`}
            >
              Mes
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      {view === 'week' ? (
        // Week View
        <div className="divide-y divide-border">
          {weekDates.map((date, idx) => {
            const dayAppointments = appointmentsByDate.get(date.toDateString()) || []
            const today = isToday(date)

            return (
              <div
                key={idx}
                className={`flex ${today ? 'bg-accent-50/50' : ''}`}
              >
                {/* Day Header */}
                <div className={`w-24 shrink-0 p-4 text-center border-r border-border ${today ? 'bg-accent-100/50' : 'bg-gray-50'}`}>
                  <p className="text-xs text-foreground-secondary uppercase">{DAYS_SHORT[date.getDay()]}</p>
                  <p className={`text-2xl font-bold ${today ? 'text-accent-600' : 'text-foreground'}`}>
                    {date.getDate()}
                  </p>
                  {today && (
                    <span className="inline-block mt-1 text-[10px] font-medium text-accent-600 bg-accent-100 px-2 py-0.5 rounded-full">
                      Hoy
                    </span>
                  )}
                </div>

                {/* Appointments */}
                <div className="flex-1 p-3 min-h-[100px]">
                  {dayAppointments.length > 0 ? (
                    <div className="space-y-2">
                      {dayAppointments.map(apt => renderAppointment(apt))}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-foreground-muted">
                      Sin citas
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // Month View
        <div>
          {/* Days Header */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAYS_SHORT.map(day => (
              <div key={day} className="p-3 text-center text-xs font-medium text-foreground-secondary uppercase bg-gray-50">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {monthDates.map(({ date, isCurrentMonth }, idx) => {
              const dayAppointments = appointmentsByDate.get(date.toDateString()) || []
              const today = isToday(date)

              return (
                <div
                  key={idx}
                  className={`min-h-[120px] p-2 border-b border-r border-border ${
                    !isCurrentMonth ? 'bg-gray-50/50' : ''
                  } ${today ? 'bg-accent-50' : ''}`}
                >
                  <div className={`text-sm font-medium mb-1 ${
                    today
                      ? 'w-7 h-7 rounded-full bg-accent-500 text-white flex items-center justify-center'
                      : isCurrentMonth ? 'text-foreground' : 'text-foreground-muted'
                  }`}>
                    {date.getDate()}
                  </div>

                  <div className="space-y-1">
                    {dayAppointments.slice(0, 3).map(apt => renderAppointment(apt, true))}
                    {dayAppointments.length > 3 && (
                      <p className="text-xs text-foreground-secondary text-center">
                        +{dayAppointments.length - 3} más
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {appointments.length === 0 && (
        <div className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <CalendarIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No tienes citas programadas</h3>
          <p className="text-foreground-secondary mb-6">
            Las citas aparecerán aquí cuando las programes
          </p>
          {userRole === 'client' && (
            <Link
              href="/appointments/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Agendar Primera Cita
            </Link>
          )}
        </div>
      )}

      {/* Legend */}
      {appointments.length > 0 && (
        <div className="p-4 border-t border-border bg-gray-50">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="text-foreground-secondary font-medium">Estados:</span>
            {Object.entries(statusLabels).slice(0, 5).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full ${statusColors[key]}`} />
                <span className="text-foreground-secondary">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
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

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}
