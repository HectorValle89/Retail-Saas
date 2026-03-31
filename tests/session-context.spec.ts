import { expect, test } from '@playwright/test'
import {
  AUTH_CONTEXT_INVALIDATION_WINDOW_MS,
  getAuthSessionContextStatus,
} from '../src/lib/auth/sessionContext'

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createAccessToken(iatSeconds: number) {
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = encodeBase64Url(JSON.stringify({ sub: 'user-1', iat: iatSeconds }))
  return `${header}.${payload}.signature`
}

function createDeterministicRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

test('detecta sesion vigente y sesion stale por cambio de contexto auth', () => {
  const issuedAtMs = Date.UTC(2026, 2, 14, 21, 20, 0)
  const accessToken = createAccessToken(Math.floor(issuedAtMs / 1000))

  const current = getAuthSessionContextStatus({
    accessToken,
    appMetadata: {
      auth_context_updated_at: new Date(issuedAtMs - 1000).toISOString(),
    },
  })

  expect(current.isStale).toBe(false)
  expect(current.exceededGraceWindow).toBe(false)

  const stale = getAuthSessionContextStatus({
    accessToken,
    appMetadata: {
      auth_context_updated_at: new Date(issuedAtMs + 30_000).toISOString(),
    },
    now: issuedAtMs + AUTH_CONTEXT_INVALIDATION_WINDOW_MS + 30_000,
  })

  expect(stale.isStale).toBe(true)
  expect(stale.exceededGraceWindow).toBe(true)
})

test('mantiene consistencia en 250 escenarios pseudoaleatorios', () => {
  const random = createDeterministicRandom(20260314)

  for (let index = 0; index < 250; index += 1) {
    const issuedAtMs = Date.UTC(2026, 2, 14, 12, 0, 0) + Math.floor(random() * 3_600_000)
    const deltaMs = Math.floor((random() - 0.5) * 12 * 60 * 1000)
    const contextUpdatedAtMs = issuedAtMs + deltaMs
    const now = contextUpdatedAtMs + Math.floor(random() * 10 * 60 * 1000)

    const status = getAuthSessionContextStatus({
      accessToken: createAccessToken(Math.floor(issuedAtMs / 1000)),
      appMetadata: {
        auth_context_updated_at: new Date(contextUpdatedAtMs).toISOString(),
      },
      now,
    })

    const expectedStale = contextUpdatedAtMs > issuedAtMs
    const expectedExceeded =
      expectedStale && now - contextUpdatedAtMs >= AUTH_CONTEXT_INVALIDATION_WINDOW_MS

    expect(status.isStale, `iteracion ${index}`).toBe(expectedStale)
    expect(status.exceededGraceWindow, `iteracion ${index}`).toBe(expectedExceeded)
  }
})
test('mantiene una ventana de gracia antes de invalidar la sesion stale', () => {
  const issuedAtMs = Date.UTC(2026, 2, 14, 21, 20, 0)
  const contextUpdatedAtMs = issuedAtMs + 30_000

  const status = getAuthSessionContextStatus({
    accessToken: createAccessToken(Math.floor(issuedAtMs / 1000)),
    appMetadata: {
      auth_context_updated_at: new Date(contextUpdatedAtMs).toISOString(),
    },
    now: contextUpdatedAtMs + AUTH_CONTEXT_INVALIDATION_WINDOW_MS - 1_000,
  })

  expect(status.isStale).toBe(true)
  expect(status.exceededGraceWindow).toBe(false)
})
