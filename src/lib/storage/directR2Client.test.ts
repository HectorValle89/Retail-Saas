import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadFileDirectToR2 } from './directR2Client';

const crearBoletoSubidaR2Mock = vi.fn();

vi.mock('@/lib/storage/r2Actions', () => ({
  crearBoletoSubidaR2: (...args: unknown[]) => crearBoletoSubidaR2Mock(...args),
}));

describe('direct R2 client uploads', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.useRealTimers();
    crearBoletoSubidaR2Mock.mockReset();
    vi.restoreAllMocks();
  });

  it('aborta la transferencia a los 45s y completa la subida mediante el servidor', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    crearBoletoSubidaR2Mock.mockResolvedValue({
      uploadUrl: 'https://r2.example/upload',
      r2ObjectKey: 'rutas/selfie.jpg',
      bucket: 'bucket',
    });

    const uploaded = {
      objectKey: 'rutas/selfie.jpg',
      sha256: 'test-hash',
      fileName: 'selfie.jpg',
      contentType: 'image/jpeg',
      size: 6,
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/storage/r2') {
        return Promise.resolve(Response.json(uploaded));
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['selfie'], 'selfie.jpg', { type: 'image/jpeg' });
    const upload = uploadFileDirectToR2(file, 'rutas');

    await vi.advanceTimersByTimeAsync(45_000);

    await expect(upload).resolves.toEqual(uploaded);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/storage/r2', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });
});
