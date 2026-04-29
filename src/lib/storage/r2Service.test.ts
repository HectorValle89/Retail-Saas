import { describe, expect, it } from 'vitest';

import { buildR2ProxyUrl, isR2ProxyUrl } from './r2Service';

describe('R2 storage URL helpers', () => {
  it('builds authenticated app proxy URLs for object keys', () => {
    expect(buildR2ProxyUrl('ruta-semanal/cuenta-1/selfie-thumb.jpg')).toBe(
      '/api/storage/r2?key=ruta-semanal%2Fcuenta-1%2Fselfie-thumb.jpg'
    );
  });

  it('detects proxy URLs without treating remote URLs as R2 object keys', () => {
    expect(isR2ProxyUrl('/api/storage/r2?key=ruta-semanal%2Fthumb.jpg')).toBe(true);
    expect(isR2ProxyUrl('https://assets.example.com/thumb.jpg')).toBe(false);
  });

  it('rejects unsafe object keys before exposing a proxy URL', () => {
    expect(() => buildR2ProxyUrl('../private/file.jpg')).toThrow('La llave de R2 no es valida.');
    expect(() => buildR2ProxyUrl('/private/file.jpg')).toThrow('La llave de R2 no es valida.');
  });
});
