import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
type WorkerEvent = {
  request?: Request;
  respondWith?: (response: Promise<Response>) => void;
  waitUntil?: (work: Promise<unknown>) => void;
};

function bootWorker() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const cached = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => cached.get(request.url)?.clone()),
    put: vi.fn(async () => {}),
  };
  const cacheStorage = {
    open: vi.fn<(name: string) => Promise<typeof cache>>().mockResolvedValue(cache),
    keys: vi.fn(async () => [] as string[]),
    delete: vi.fn<(name: string) => Promise<boolean>>().mockResolvedValue(true),
    match: vi.fn(async () => new Response('offline')),
  };
  const fetchMock = vi.fn(async () => new Response('network'));
  const scope = {
    self: {
      addEventListener: (name: string, callback: (event: WorkerEvent) => void) =>
        listeners.set(name, callback),
      location: { origin: 'https://retail.test' },
      clients: { claim: vi.fn() },
    },
    caches: cacheStorage,
    fetch: fetchMock,
    Request,
    Response,
    URL,
    Date,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, scope);
  async function fetchRequest(path: string, navigate = false) {
    const request = new Request(new URL(path, scope.self.location.origin));
    if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
    const respondWith = vi.fn<(response: Promise<Response>) => void>();
    const waitUntil = vi.fn<(work: Promise<unknown>) => void>();
    listeners.get('fetch')?.({ request, respondWith, waitUntil });
    const response = await respondWith.mock.calls[0]?.[0];
    await Promise.all(waitUntil.mock.calls.map(([work]) => work));
    return response;
  }
  return { listeners, cached, cache, cacheStorage, fetchMock, fetchRequest };
}

describe('service worker cache strategies', () => {
  it.each(['/_next/static/app.js', '/thumbnail.jpg'])(
    'serves a fresh cached asset without a network request: %s',
    async (path) => {
      const runtime = bootWorker();
      const url = 'https://retail.test' + path;
      runtime.cached.set(url, new Response('cached'));
      runtime.cached.set(url + '::meta', new Response(String(Date.now())));
      expect(await (await runtime.fetchRequest(path))?.text()).toBe('cached');
      expect(runtime.fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([30 * 60 * 1000, 61 * 60 * 1000])(
    'refreshes catalogs only after their one-hour TTL (age %i)',
    async (age) => {
      const runtime = bootWorker();
      const url = 'https://retail.test/api/catalogo/productos';
      runtime.cached.set(url, new Response('catalog'));
      runtime.cached.set(url + '::meta', new Response(String(Date.now() - age)));
      expect(await (await runtime.fetchRequest('/api/catalogo/productos'))?.text()).toBe('catalog');
      expect(runtime.fetchMock).toHaveBeenCalledTimes(age > 60 * 60 * 1000 ? 1 : 0);
    }
  );

  it('uses the offline fallback for failed navigation without caching SSR HTML', async () => {
    const runtime = bootWorker();
    runtime.fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await (await runtime.fetchRequest('/dashboard', true))?.text()).toBe('offline');
    expect(runtime.cacheStorage.match).toHaveBeenCalledWith('/offline');
    expect(runtime.cache.put).not.toHaveBeenCalled();
  });

  it('uses the cached operational response after a network failure', async () => {
    const runtime = bootWorker();
    runtime.cached.set('https://retail.test/api/asistencias/panel', new Response('pending'));
    runtime.fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await (await runtime.fetchRequest('/api/asistencias/panel'))?.text()).toBe('pending');
    expect(runtime.fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    '/nomina',
    '/pre_nomina',
    '/expediente',
    '/storage/v1/object/doc.pdf',
    '/storage/v1/object/report.xlsx',
  ])('does not persist sensitive data or heavy documents: %s', async (path) => {
    const runtime = bootWorker();
    expect(await (await runtime.fetchRequest(path))?.text()).toBe('network');
    expect(runtime.cacheStorage.open).not.toHaveBeenCalled();
    expect(runtime.cache.put).not.toHaveBeenCalled();
  });

  it('removes outdated caches and keeps the current version during activation', async () => {
    const runtime = bootWorker();
    await runtime.fetchRequest('/_next/static/app.js');
    const currentName = runtime.cacheStorage.open.mock.calls[0]?.[0];
    expect(currentName).toMatch(/^retail-static-v[0-9]+$/);
    runtime.cacheStorage.keys.mockResolvedValueOnce([
      String(currentName),
      'retail-static-v1',
      'retail-pages-v1',
    ]);
    const waitUntil = vi.fn<(work: Promise<unknown>) => void>();
    runtime.listeners.get('activate')?.({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(runtime.cacheStorage.delete.mock.calls.map(([name]) => name)).toEqual([
      'retail-static-v1',
      'retail-pages-v1',
    ]);
  });
});
