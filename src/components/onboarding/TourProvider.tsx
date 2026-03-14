'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { AppTourWizard } from './AppTourWizard'

interface TourContextType {
  startTour: () => void
  hasSeenTour: boolean
}

const TourContext = createContext<TourContextType | null>(null)

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within TourProvider')
  }
  return context
}

const TOUR_STORAGE_KEY = 'lexagenda_tour_completed'

export function TourProvider({ children }: { children: ReactNode }) {
  const [showTour, setShowTour] = useState(false)
  const [hasSeenTour, setHasSeenTour] = useState(true) // Default true to prevent flash
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Check localStorage after mount
    const seen = localStorage.getItem(TOUR_STORAGE_KEY)
    setHasSeenTour(seen === 'true')
    setIsReady(true)

    // Si no ha visto el tour, mostrarlo automáticamente después de un delay
    if (seen !== 'true') {
      const timer = setTimeout(() => {
        setShowTour(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const startTour = () => {
    setShowTour(true)
  }

  const handleComplete = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true')
    setHasSeenTour(true)
    setShowTour(false)
  }

  const handleSkip = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true')
    setHasSeenTour(true)
    setShowTour(false)
  }

  return (
    <TourContext.Provider value={{ startTour, hasSeenTour }}>
      {children}
      {isReady && showTour && (
        <AppTourWizard onComplete={handleComplete} onSkip={handleSkip} />
      )}
    </TourContext.Provider>
  )
}
