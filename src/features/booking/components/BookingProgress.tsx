'use client'

interface BookingProgressProps {
  currentStep: 1 | 2 | 3
  onStepClick?: (step: 1 | 2 | 3) => void
}

const STEPS = [
  { number: 1, title: 'Abogado', description: 'Selecciona profesional' },
  { number: 2, title: 'Horario', description: 'Fecha y hora' },
  { number: 3, title: 'Confirmar', description: 'Revisa y agenda' }
]

export function BookingProgress({ currentStep, onStepClick }: BookingProgressProps) {
  return (
    <div className="relative">
      {/* Línea de conexión */}
      <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200">
        <div
          className="h-full bg-primary-500 transition-all duration-300"
          style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
        />
      </div>

      <div className="relative flex justify-between">
        {STEPS.map((step) => {
          const isCompleted = step.number < currentStep
          const isCurrent = step.number === currentStep
          const isClickable = step.number < currentStep && onStepClick

          return (
            <button
              key={step.number}
              onClick={() => isClickable && onStepClick(step.number as 1 | 2 | 3)}
              disabled={!isClickable}
              className={`flex flex-col items-center ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all ${
                  isCompleted
                    ? 'bg-primary-500 text-white'
                    : isCurrent
                    ? 'bg-primary-500 text-white ring-4 ring-primary-100'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <div className="mt-2 text-center">
                <p className={`text-sm font-medium ${isCurrent ? 'text-primary-600' : 'text-foreground'}`}>
                  {step.title}
                </p>
                <p className="text-xs text-foreground-muted hidden sm:block">
                  {step.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
