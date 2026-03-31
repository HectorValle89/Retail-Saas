import { createHash } from 'node:crypto'

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  )

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
    .join(',')}}`
}

export function calcularHashPayload(payload: unknown) {
  return createHash('sha256')
    .update(Buffer.from(stableSerialize(payload), 'utf8'))
    .digest('hex')
}
