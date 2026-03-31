import { describe, expect, it } from 'vitest'
import { isSupabaseAuthNetworkError } from './authClientErrors'

describe('isSupabaseAuthNetworkError', () => {
  it('detecta fallos de fetch del navegador', () => {
    expect(isSupabaseAuthNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('detecta mensajes equivalentes de red', () => {
    expect(isSupabaseAuthNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      true
    )
    expect(isSupabaseAuthNetworkError({ message: 'Load failed' })).toBe(true)
  })

  it('ignora errores de auth o dominio que no son de red', () => {
    expect(isSupabaseAuthNetworkError(new Error('Invalid Refresh Token: Already Used'))).toBe(false)
    expect(isSupabaseAuthNetworkError(new Error('JWT expired'))).toBe(false)
    expect(isSupabaseAuthNetworkError(null)).toBe(false)
  })
})
