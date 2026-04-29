import { describe, expect, it } from 'vitest'
import { isSupervisorPuesto } from './onboardingRules'

describe('onboardingRules', () => {
  it('detecta supervisores sin importar mayusculas o espacios', () => {
    expect(isSupervisorPuesto('SUPERVISOR')).toBe(true)
    expect(isSupervisorPuesto(' supervisor ')).toBe(true)
    expect(isSupervisorPuesto('DERMOCONSEJERO')).toBe(false)
  })
})
