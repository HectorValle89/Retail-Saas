'use client'

import { useState } from 'react'
import { Button } from '../ui/button'

interface CalendarProps {
  selectedDate?: Date | null
  onDateSelect?: (date: Date) => void
  markedDates?: string[]
  minDate?: Date
  availableDates?: Date[]
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function Calendar({ selectedDate, onDateSelect, markedDates, minDate, availableDates }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date())

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startingDayOfWeek = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()

  const days: (number | null)[] = []
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1))
  }

  const isSelected = (day: number) => {
    if (!selectedDate || !day) return false
    return (
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === month &&
      selectedDate.getFullYear() === year
    )
  }

  const isToday = (day: number) => {
    const today = new Date()
    return (
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year
    )
  }

  const isDisabled = (day: number) => {
    if (!day) return true
    const date = new Date(year, month, day)

    if (minDate) {
      const min = new Date(minDate)
      min.setHours(0, 0, 0, 0)
      if (date < min) return true
    }

    return false
  }

  const isMarked = (day: number) => {
    if (!markedDates || !day) return false
    const dateStr = new Date(year, month, day).toISOString().split('T')[0]
    return markedDates.includes(dateStr)
  }

  const handleDateClick = (day: number) => {
    if (day && onDateSelect && !isDisabled(day)) {
      onDateSelect(new Date(year, month, day))
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-foreground">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={prevMonth}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={nextMonth}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Days of week */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-foreground-muted py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          const disabled = isDisabled(day as number)
          const selected = isSelected(day as number)
          const today = isToday(day as number)
          const marked = isMarked(day as number)

          return (
            <button
              key={index}
              onClick={() => day && handleDateClick(day)}
              disabled={!day || disabled}
              className={`
                h-10 rounded-lg text-sm font-medium relative
                transition-all duration-200
                ${!day ? 'invisible' : ''}
                ${disabled ? 'text-gray-300 cursor-not-allowed' : ''}
                ${selected
                  ? 'bg-primary-500 text-white'
                  : today
                  ? 'bg-secondary-100 text-secondary-700'
                  : disabled
                  ? ''
                  : 'hover:bg-gray-100 text-foreground'
                }
              `}
            >
              {day}
              {marked && !selected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary-500 rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

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
