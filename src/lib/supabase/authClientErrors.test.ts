import { describe, expect, it } from 'vitest'
import { getSupabaseAuthFriendlyErrorMessage, isSupabaseAuthNetworkError } from './authClientErrors'

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

  it('convierte respuestas HTML o de Cloudflare en un mensaje amigable', () => {
    expect(
      getSupabaseAuthFriendlyErrorMessage(
        new Error(`Unexpected token 'e', "error code: 1016" is not valid JSON`)
      )
    ).toBe('No fue posible conectar con el servicio de autenticacion. Reintenta en unos minutos.')
  })
})
