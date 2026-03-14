'use client'

import { useState, useEffect } from 'react'
import { OnboardingWizard } from './OnboardingWizard'

interface OnboardingProviderProps {
  userRole: 'client' | 'lawyer' | 'admin'
  userId: string
}

const ONBOARDING_KEY = 'lexagenda_onboarding_completed'

export function OnboardingProvider({ userRole, userId }: OnboardingProviderProps) {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [isChecked, setIsChecked] = useState(false)

  useEffect(() => {
    // Check if user has completed onboarding
    const storageKey = `${ONBOARDING_KEY}_${userId}`
    const completed = localStorage.getItem(storageKey)

    if (!completed) {
      setShowOnboarding(true)
    }
    setIsChecked(true)
  }, [userId])

  const handleComplete = () => {
    const storageKey = `${ONBOARDING_KEY}_${userId}`
    localStorage.setItem(storageKey, 'true')
    setShowOnboarding(false)
  }

  // Don't render anything until we've checked localStorage
  if (!isChecked) return null

  if (!showOnboarding) return null

  return (
    <OnboardingWizard
      userRole={userRole}
      onComplete={handleComplete}
    />
  )
}
