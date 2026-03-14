'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface Step {
  title: string
  description: string
  icon: React.ReactNode
  action?: {
    label: string
    href: string
  }
}

const clientSteps: Step[] = [
  {
    title: 'Bienvenido a LexAgenda',
    description: 'Tu plataforma de gestión de citas legales. Aquí podrás agendar consultas con abogados especializados de manera fácil y rápida.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
  },
  {
    title: 'Explora Abogados',
    description: 'Navega por nuestro directorio de abogados especializados. Puedes filtrar por especialidad, ver calificaciones y experiencia de cada profesional.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    action: {
      label: 'Ver Abogados',
      href: '/lawyers'
    }
  },
  {
    title: 'Agenda tu Cita',
    description: 'Selecciona un abogado, elige la fecha y hora disponible, y confirma tu cita. Recibirás una confirmación inmediata.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    action: {
      label: 'Nueva Cita',
      href: '/appointments/new'
    }
  },
  {
    title: 'Gestiona tus Citas',
    description: 'Visualiza todas tus citas programadas, confirma, cancela o reprograma según necesites. Todo desde un solo lugar.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    action: {
      label: 'Mis Citas',
      href: '/appointments'
    }
  },
]

const lawyerSteps: Step[] = [
  {
    title: 'Bienvenido a LexAgenda',
    description: 'Tu plataforma de gestión de citas legales. Aquí podrás administrar tu agenda, atender clientes y hacer crecer tu práctica.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
  },
  {
    title: 'Tu Agenda de Citas',
    description: 'Visualiza todas las citas programadas por tus clientes. Confirma, completa o gestiona cada consulta desde tu panel.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    action: {
      label: 'Ver Agenda',
      href: '/appointments'
    }
  },
  {
    title: 'Dashboard Personalizado',
    description: 'Accede a estadísticas de tu práctica: citas completadas, ingresos generados, y próximas consultas programadas.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    action: {
      label: 'Ver Dashboard',
      href: '/dashboard'
    }
  },
]

interface OnboardingWizardProps {
  userRole: 'client' | 'lawyer' | 'admin'
  onComplete: () => void
}

export function OnboardingWizard({ userRole, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  // Admin and lawyer use the same onboarding steps
  const steps = userRole === 'client' ? clientSteps : lawyerSteps
  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1

  const handleNext = () => {
    if (isLastStep) {
      setIsVisible(false)
      setTimeout(onComplete, 300)
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleSkip = () => {
    setIsVisible(false)
    setTimeout(onComplete, 300)
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className={`w-full max-w-lg p-8 transform transition-all duration-300 ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        {/* Progress indicator */}
        <div className="flex gap-2 mb-8">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                index <= currentStep ? 'bg-primary-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary-100 text-primary-600 mb-6">
            {step.icon}
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-3">
            {step.title}
          </h2>

          <p className="text-foreground-secondary mb-8 leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button onClick={handleNext} size="lg" className="w-full">
            {isLastStep ? '¡Comenzar!' : 'Siguiente'}
          </Button>

          {!isLastStep && (
            <button
              onClick={handleSkip}
              className="text-sm text-foreground-secondary hover:text-foreground transition-colors"
            >
              Omitir tutorial
            </button>
          )}
        </div>

        {/* Step counter */}
        <p className="text-center text-sm text-foreground-secondary mt-6">
          Paso {currentStep + 1} de {steps.length}
        </p>
      </Card>
    </div>
  )
}
