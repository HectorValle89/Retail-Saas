import { describe, expect, it } from 'vitest';
import { shouldRecoverFromChunkLoadError } from './chunkRecovery';

describe('shouldRecoverFromChunkLoadError', () => {
  it('detecta errores de chunk load', () => {
    expect(shouldRecoverFromChunkLoadError('ChunkLoadError: Failed to load chunk')).toBe(true);
    expect(
      shouldRecoverFromChunkLoadError('TypeError: Failed to fetch dynamically imported module')
    ).toBe(true);
    expect(shouldRecoverFromChunkLoadError('Importing a module script failed')).toBe(true);
  });

  it('detecta errores de Server Action no encontrada', () => {
    expect(
      shouldRecoverFromChunkLoadError(
        'Server Action "60336631ac2b6b9216f90f8bcda25890b2cf7e96d3" was not found on the server.'
      )
    ).toBe(true);
    expect(
      shouldRecoverFromChunkLoadError('Failed to find server action')
    ).toBe(true);
    expect(
      shouldRecoverFromChunkLoadError('Server Action abc123 not found')
    ).toBe(true);
  });

  it('ignora errores ajenos', () => {
    expect(shouldRecoverFromChunkLoadError('TypeError: cannot read properties of undefined')).toBe(
      false
    );
    expect(shouldRecoverFromChunkLoadError('Network request failed')).toBe(false);
  });
});
