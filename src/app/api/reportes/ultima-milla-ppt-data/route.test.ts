import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { resolveEvidenceUrl, resolveFirstEvidenceUrl } from './evidenceResolution';

type EvidenceRow = NonNullable<Parameters<typeof resolveEvidenceUrl>[1]>;
type EvidenceHashLookup = NonNullable<Parameters<typeof resolveEvidenceUrl>[2]>;

function createStorageService() {
  const createSignedUrl = vi.fn(async (route: string) => ({
    data: { signedUrl: `https://signed.local/${route}` },
    error: null,
  }));
  const from = vi.fn(() => ({ createSignedUrl }));

  return {
    service: { storage: { from } } as unknown as SupabaseClient,
    from,
    createSignedUrl,
  };
}

function createEvidence(overrides: Partial<EvidenceRow>): EvidenceRow {
  return {
    entrega_id: 'entrega-1',
    tipo: 'ACUSE_FIRMADO',
    archivo_hash_id: null,
    bucket: null,
    ruta_archivo: null,
    thumbnail_url: null,
    capturada_en: '2026-05-06T12:00:00.000Z',
    orden: 1,
    metadata: {},
    ...overrides,
  };
}

describe('ultima milla PPT evidence resolution', () => {
  it('resuelve la evidencia desde archivo_hash_id cuando la fila no trae bucket/ruta', async () => {
    const { service, from, createSignedUrl } = createStorageService();
    const lookup: EvidenceHashLookup = {
      byId: new Map([
        [
          'archivo-1',
          {
            id: 'archivo-1',
            sha256: 'sha-1',
            bucket: 'operacion-evidencias',
            ruta_archivo: 'materiales/ultima-milla/foto.jpg',
            miniatura_bucket: null,
            miniatura_ruta_archivo: null,
          },
        ],
      ]),
      bySha256: new Map(),
    };

    const url = await resolveEvidenceUrl(
      service,
      createEvidence({ archivo_hash_id: 'archivo-1' }),
      lookup
    );

    expect(url).toBe('/api/reportes/imagen-proxy?bucket=operacion-evidencias&route=materiales%2Fultima-milla%2Ffoto.jpg');
    expect(from).toHaveBeenCalledWith('operacion-evidencias');
    expect(createSignedUrl).toHaveBeenCalledWith('materiales/ultima-milla/foto.jpg', 60 * 60);
  });

  it('salta la primera evidencia del tipo si no puede resolverse y usa la siguiente valida', async () => {
    const { service } = createStorageService();
    const lookup: EvidenceHashLookup = {
      byId: new Map(),
      bySha256: new Map(),
    };

    const url = await resolveFirstEvidenceUrl(
      service,
      [
        createEvidence({ orden: 1 }),
        createEvidence({
          orden: 2,
          bucket: 'operacion-evidencias',
          ruta_archivo: 'materiales/ultima-milla/acuse-valido.jpg',
        }),
      ],
      'ACUSE_FIRMADO',
      lookup
    );

    expect(url).toBe('/api/reportes/imagen-proxy?bucket=operacion-evidencias&route=materiales%2Fultima-milla%2Facuse-valido.jpg');
  });

  it('ignora thumbnail_url y usa la imagen completa para no distorsionar el PPT', async () => {
    const { service } = createStorageService();
    const lookup: EvidenceHashLookup = {
      byId: new Map(),
      bySha256: new Map(),
    };

    await expect(
      resolveEvidenceUrl(
        service,
        createEvidence({
          thumbnail_url: 'operacion-evidencias/materiales/ultima-milla/thumbnail.jpg',
          bucket: 'operacion-evidencias',
          ruta_archivo: 'materiales/ultima-milla/foto-completa.jpg',
        }),
        lookup
      )
    ).resolves.toBe('/api/reportes/imagen-proxy?bucket=operacion-evidencias&route=materiales%2Fultima-milla%2Ffoto-completa.jpg');
  });

  it('recupera evidencias que la limpieza movio a _orphans despues de la captura', async () => {
    const createSignedUrl = vi.fn(async (route: string) => ({
      data:
        route === '_orphans/2026-05-07/materiales/ultima-milla/foto.jpg'
          ? { signedUrl: `https://signed.local/${route}` }
          : null,
      error:
        route === '_orphans/2026-05-07/materiales/ultima-milla/foto.jpg'
          ? null
          : { message: 'Object not found' },
    }));
    const service = {
      storage: {
        from: vi.fn(() => ({ createSignedUrl })),
      },
    } as unknown as SupabaseClient;
    const lookup: EvidenceHashLookup = {
      byId: new Map(),
      bySha256: new Map(),
    };

    await expect(
      resolveEvidenceUrl(
        service,
        createEvidence({
          bucket: 'operacion-evidencias',
          ruta_archivo: 'materiales/ultima-milla/foto.jpg',
          capturada_en: '2026-05-05T20:00:00.000Z',
        }),
        lookup
      )
    ).resolves.toBe('/api/reportes/imagen-proxy?bucket=operacion-evidencias&route=_orphans%2F2026-05-07%2Fmateriales%2Fultima-milla%2Ffoto.jpg');
    expect(createSignedUrl).toHaveBeenCalledWith('materiales/ultima-milla/foto.jpg', 60 * 60);
    expect(createSignedUrl).toHaveBeenCalledWith(
      '_orphans/2026-05-07/materiales/ultima-milla/foto.jpg',
      60 * 60
    );
  });
});
