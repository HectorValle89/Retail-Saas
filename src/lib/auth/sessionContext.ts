export const AUTH_CONTEXT_INVALIDATION_WINDOW_MS = 5 * 60 * 1000
export const AUTH_CONTEXT_POLL_INTERVAL_MS = 60 * 1000

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as JsonRecord
}

function decodeBase64UrlSegment(segment: string) {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')

  if (typeof atob === 'function') {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  return Buffer.from(padded, 'base64').toString('utf8')
}

function readTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function readAccessTokenPayload(accessToken: string | null | undefined) {
  if (!accessToken) {
    return null
  }

  const parts = accessToken.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    return JSON.parse(decodeBase64UrlSegment(parts[1])) as JsonRecord
  } catch {
    return null
  }
}

export function readAccessTokenIssuedAt(accessToken: string | null | undefined) {
  const payload = readAccessTokenPayload(accessToken)
  const issuedAt = payload?.iat

  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)) {
    return null
  }

  return issuedAt * 1000
}

export function readAuthContextUpdatedAt(appMetadata: unknown) {
  const metadata = asRecord(appMetadata)

  if (!metadata) {
    return null
  }

  const topLevel = readTimestamp(metadata.auth_context_updated_at)
  if (topLevel) {
    return topLevel
  }

  return readTimestamp(asRecord(metadata.claims)?.auth_context_updated_at)
}

export interface AuthSessionContextStatus {
  issuedAtMs: number | null
  contextUpdatedAtMs: number | null
  isStale: boolean
  exceededGraceWindow: boolean
}

export function getAuthSessionContextStatus({
  accessToken,
  appMetadata,
  now = Date.now(),
}: {
  accessToken: string | null | undefined
  appMetadata: unknown
  now?: number
}): AuthSessionContextStatus {
  const issuedAtMs = readAccessTokenIssuedAt(accessToken)
  const contextUpdatedAtMs = readAuthContextUpdatedAt(appMetadata)

  if (!issuedAtMs || !contextUpdatedAtMs) {
    return {
      issuedAtMs,
      contextUpdatedAtMs,
      isStale: false,
      exceededGraceWindow: false,
    }
  }

  const isStale = issuedAtMs < contextUpdatedAtMs

  return {
    issuedAtMs,
    contextUpdatedAtMs,
    isStale,
    exceededGraceWindow:
      isStale && now - contextUpdatedAtMs >= AUTH_CONTEXT_INVALIDATION_WINDOW_MS,
  }
}