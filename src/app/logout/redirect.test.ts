import { describe, expect, it } from 'vitest'

import { resolveLogoutRedirectUrl } from './redirect'

function createRequestLike(url: string, headers: Record<string, string> = {}) {
  const bag = new Map(Object.entries(headers))

  return {
    url,
    headers: {
      get(name: string) {
        return bag.get(name) ?? null
      },
    },
  }
}

describe('resolveLogoutRedirectUrl', () => {
  it('reemplaza 0.0.0.0 por localhost para que el navegador pueda abrir login', () => {
    const redirectUrl = resolveLogoutRedirectUrl(
      createRequestLike('http://0.0.0.0:3000/logout', {
        host: '0.0.0.0:3000',
      })
    )

    expect(redirectUrl.toString()).toBe('http://localhost:3000/login')
  })

  it('conserva la IP LAN cuando el usuario navega desde la red local', () => {
    const redirectUrl = resolveLogoutRedirectUrl(
      createRequestLike('http://192.168.1.83:3000/logout', {
        host: '192.168.1.83:3000',
      })
    )

    expect(redirectUrl.toString()).toBe('http://192.168.1.83:3000/login')
  })

  it('prioriza el forwarded host publico cuando existe proxy delante', () => {
    const redirectUrl = resolveLogoutRedirectUrl(
      createRequestLike('http://0.0.0.0:3000/logout', {
        host: '0.0.0.0:3000',
        'x-forwarded-host': 'retail.example.com',
        'x-forwarded-proto': 'https',
      })
    )

    expect(redirectUrl.toString()).toBe('https://retail.example.com/login')
  })
})
