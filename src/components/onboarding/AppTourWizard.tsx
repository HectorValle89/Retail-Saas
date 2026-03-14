'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/button'

interface TourStep {
  target: string // CSS selector
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

const tourSteps: TourStep[] = [
  {
    target: '[data-tour="sidebar"]',
    title: 'Menu de Navegación',
    description: 'Desde aquí puedes acceder a todas las secciones de la aplicación. El menú se adapta según tu rol (Admin, Abogado o Cliente).',
    position: 'right'
  },
  {
    target: '[data-tour="dashboard"]',
    title: 'Dashboard',
    description: 'Tu panel principal con estadísticas, citas próximas y acciones rápidas. Toda la información importante en un solo lugar.',
    position: 'right'
  },
  {
    target: '[data-tour="calendar"]',
    title: 'Calendario',
    description: 'Visualiza todas las citas en formato día, semana o mes. Filtra por estado y gestiona tu agenda fácilmente.',
    position: 'right'
  },
  {
    target: '[data-tour="appointments"]',
    title: 'Mis Citas',
    description: 'Lista completa de tus citas. Puedes ver detalles, confirmar, cancelar o reagendar según sea necesario.',
    position: 'right'
  },
  {
    target: '[data-tour="lawyers"]',
    title: 'Abogados',
    description: 'Directorio de abogados disponibles. Consulta sus especialidades, experiencia y agenda una cita.',
    position: 'right'
  },
  {
    target: '[data-tour="admin-section"]',
    title: 'Administración',
    description: 'Sección exclusiva para administradores. Gestiona usuarios, precios y consulta analytics del bufete.',
    position: 'right'
  },
  {
    target: '[data-tour="chat-widget"]',
    title: 'Asistente Virtual',
    description: 'Nuestro chatbot te ayuda a agendar citas rápidamente. Responde preguntas frecuentes y te guía en el proceso.',
    position: 'left'
  },
  {
    target: '[data-tour="user-profile"]',
    title: 'Tu Perfil',
    description: 'Aquí puedes ver tu información y cerrar sesión cuando lo necesites.',
    position: 'bottom'
  }
]

interface AppTourWizardProps {
  onComplete: () => void
  onSkip: () => void
}

export function AppTourWizard({ onComplete, onSkip }: AppTourWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const step = tourSteps[currentStep]
    const element = document.querySelector(step.target)

    if (element) {
      const rect = element.getBoundingClientRect()
      setTargetRect(rect)

      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      // Si no encuentra el elemento, pasar al siguiente
      if (currentStep < tourSteps.length - 1) {
        setCurrentStep(prev => prev + 1)
      }
    }
  }, [currentStep])

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      onComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const step = tourSteps[currentStep]

  const getTooltipPosition = () => {
    if (!targetRect) return { top: '50%', left: '50%' }

    const padding = 16
    const tooltipWidth = 320
    const tooltipHeight = 200

    switch (step.position) {
      case 'right':
        return {
          top: `${targetRect.top + targetRect.height / 2}px`,
          left: `${targetRect.right + padding}px`,
          transform: 'translateY(-50%)'
        }
      case 'left':
        return {
          top: `${targetRect.top + targetRect.height / 2}px`,
          left: `${targetRect.left - tooltipWidth - padding}px`,
          transform: 'translateY(-50%)'
        }
      case 'bottom':
        return {
          top: `${targetRect.bottom + padding}px`,
          left: `${targetRect.left + targetRect.width / 2}px`,
          transform: 'translateX(-50%)'
        }
      case 'top':
        return {
          top: `${targetRect.top - tooltipHeight - padding}px`,
          left: `${targetRect.left + targetRect.width / 2}px`,
          transform: 'translateX(-50%)'
        }
      default:
        return { top: '50%', left: '50%' }
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay with hole */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Highlight box */}
      {targetRect && (
        <div
          className="absolute border-2 border-secondary-400 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] bg-transparent pointer-events-none transition-all duration-300"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute w-80 bg-white rounded-xl shadow-2xl p-6 transition-all duration-300"
        style={getTooltipPosition()}
      >
        {/* Progress indicator */}
        <div className="flex gap-1 mb-4">
          {tourSteps.map((_, index) => (
            <div
              key={index}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index <= currentStep ? 'bg-secondary-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step counter */}
        <div className="text-xs text-foreground-secondary mb-2">
          Paso {currentStep + 1} de {tourSteps.length}
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-foreground mb-2">
          {step.title}
        </h3>
        <p className="text-sm text-foreground-secondary mb-6">
          {step.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-sm text-foreground-secondary hover:text-foreground transition-colors"
          >
            Saltar tour
          </button>

          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrev}>
                Anterior
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {currentStep === tourSteps.length - 1 ? 'Finalizar' : 'Siguiente'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
