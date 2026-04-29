import { describe, expect, it } from 'vitest'
import { shouldRecoverFromChunkLoadError } from './chunkRecovery'

describe('shouldRecoverFromChunkLoadError', () => {
  it('detecta errores de chunk load', () => {
    expect(shouldRecoverFromChunkLoadError('ChunkLoadError: Failed to load chunk')).toBe(true)
    expect(
      shouldRecoverFromChunkLoadError(
        'TypeError: Failed to fetch dynamically imported module'
      )
    ).toBe(true)
    expect(shouldRecoverFromChunkLoadError('Importing a module script failed')).toBe(true)
  })

  it('ignora errores ajenos', () => {
    expect(shouldRecoverFromChunkLoadError('TypeError: cannot read properties of undefined')).toBe(
      false
    )
    expect(shouldRecoverFromChunkLoadError('Network request failed')).toBe(false)
  })
})
