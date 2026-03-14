'use client'

interface TimeSlotPickerProps {
  slots?: string[]
  selectedSlot?: string | null
  onSlotSelect?: (time: string) => void
  // Legacy props for backward compatibility
  selectedTime?: string
  onTimeSelect?: (time: string) => void
  availableSlots?: string[]
}

const DEFAULT_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '14:00', '14:30', '15:00', '15:30', '16:00',
  '16:30', '17:00', '17:30', '18:00'
]

export function TimeSlotPicker({
  slots,
  selectedSlot,
  onSlotSelect,
  // Legacy props
  selectedTime,
  onTimeSelect,
  availableSlots
}: TimeSlotPickerProps) {
  // Support both new and legacy prop names
  const timeSlots = slots || availableSlots || DEFAULT_SLOTS
  const selected = selectedSlot || selectedTime
  const onSelect = onSlotSelect || onTimeSelect

  if (timeSlots.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-foreground-secondary">No hay horarios disponibles</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {timeSlots.map((time) => (
        <button
          key={time}
          onClick={() => onSelect?.(time)}
          className={`
            px-3 py-2.5 rounded-lg text-sm font-medium
            transition-all duration-200
            ${selected === time
              ? 'bg-primary-500 text-white'
              : 'bg-gray-50 text-foreground hover:bg-gray-100 hover:border-primary-200 border border-transparent'
            }
          `}
        >
          {time}
        </button>
      ))}
    </div>
  )
}
