import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calcularHashPayload, stableSerialize } from './integrity'

function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => reorderKeys(item))
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).reverse()
    return Object.fromEntries(entries.map(([key, item]) => [key, reorderKeys(item)]))
  }

  return value
}

describe('audit integrity properties', () => {
  it('stable serialization round-trips JSON payloads deterministically', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (payload) => {
        const serialized = stableSerialize(payload)
        expect(stableSerialize(JSON.parse(serialized))).toBe(serialized)
        expect(calcularHashPayload(payload)).toBe(calcularHashPayload(payload))
      }),
      { numRuns: 100 }
    )
  })

  it('hashes are invariant to key order', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (payload) => {
        expect(calcularHashPayload(reorderKeys(payload))).toBe(calcularHashPayload(payload))
      }),
      { numRuns: 100 }
    )
  })

  it('detects tampering in persisted payloads', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.jsonValue()),
        (payload) => {
          const tamperedPayload = {
            ...payload,
            __tampered__: payload.__tampered__ === true ? 'mutated' : true,
          }

          expect(calcularHashPayload(tamperedPayload)).not.toBe(calcularHashPayload(payload))
        }
      ),
      { numRuns: 100 }
    )
  })
})