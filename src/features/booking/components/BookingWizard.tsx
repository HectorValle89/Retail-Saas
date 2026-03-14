'use client'

import { useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { BookingProgress } from './BookingProgress'
import { StepSelectLawyer } from './StepSelectLawyer'
import { StepSelectDateTime } from './StepSelectDateTime'
import { StepConfirm } from './StepConfirm'
import { useBookingStore } from '../store/bookingStore'

interface BookingWizardProps {
  preselectedLawyerId?: string
}

export function BookingWizard({ preselectedLawyerId }: BookingWizardProps) {
  const { currentStep, goToStep, reset } = useBookingStore()

  // Limpiar estado al desmontar
  useEffect(() => {
    return () => {
      // No reset aquí para preservar estado si el usuario navega
    }
  }, [])

  // Manejar navegación a pasos anteriores
  const handleStepClick = (step: 1 | 2 | 3) => {
    if (step < currentStep) {
      goToStep(step)
    }
  }

  return (
    <div className="space-y-8">
      {/* Indicador de progreso */}
      <Card className="p-6">
        <BookingProgress
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />
      </Card>

      {/* Contenido del paso actual */}
      <Card className="p-6">
        {currentStep === 1 && (
          <StepSelectLawyer preselectedLawyerId={preselectedLawyerId} />
        )}
        {currentStep === 2 && <StepSelectDateTime />}
        {currentStep === 3 && <StepConfirm />}
      </Card>
    </div>
  )
}
