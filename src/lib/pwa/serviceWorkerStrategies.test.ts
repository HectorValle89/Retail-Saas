import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

describe('service worker cache strategies', () => {
  it('uses cache-first for static assets and thumbnails', () => {
    expect(serviceWorkerSource).toContain('const CACHE_NAME_STATIC = "retail-static-v2"')
    expect(serviceWorkerSource).toContain('const CACHE_NAME_THUMBNAILS = "retail-thumbnails-v2"')
    expect(serviceWorkerSource).toContain(
      'event.respondWith(cacheFirstWithTtl(event, CACHE_NAME_STATIC))'
    )
    expect(serviceWorkerSource).toContain(
      'event.respondWith(cacheFirstWithTtl(event, CACHE_NAME_THUMBNAILS, THUMBNAIL_TTL_MS))'
    )
  })

  it('uses stale-while-revalidate for catalogs with one-hour ttl', () => {
    expect(serviceWorkerSource).toContain('const CACHE_NAME_CATALOGS = "retail-catalogs-v2"')
    expect(serviceWorkerSource).toContain('const CATALOG_TTL_MS = 60 * 60 * 1000')
    expect(serviceWorkerSource).toContain(
      'event.respondWith(staleWhileRevalidateWithTtl(event, CACHE_NAME_CATALOGS, CATALOG_TTL_MS))'
    )
  })

  it('uses network-first for navigations and operational data with offline fallback', () => {
    expect(serviceWorkerSource).toContain('const CACHE_NAME_APP_SHELL = "retail-app-shell-v2"')
    expect(serviceWorkerSource).toContain('const CACHE_NAME_DATA = "retail-data-v2"')
    expect(serviceWorkerSource).toContain('event.respondWith(networkFirst(event, CACHE_NAME_APP_SHELL))')
    expect(serviceWorkerSource).toContain('event.respondWith(networkFirst(event, CACHE_NAME_DATA))')
    expect(serviceWorkerSource).toContain('return caches.match(OFFLINE_URL)')
  })

  it('keeps sensitive modules and heavy documents out of persistent cache', () => {
    expect(serviceWorkerSource).toContain('"/nomina"')
    expect(serviceWorkerSource).toContain('"/pre_nomina"')
    expect(serviceWorkerSource).toContain('"/expediente"')
    expect(serviceWorkerSource).toContain('".pdf"')
    expect(serviceWorkerSource).toContain('".xlsx"')
    expect(serviceWorkerSource).toContain('event.respondWith(fetch(event.request))')
  })

  it('versions caches and coordinates foreground sync confirmations from the service worker when background sync fires', () => {
    expect(serviceWorkerSource).toContain('const CACHE_NAME_APP_SHELL = "retail-app-shell-v2"')
    expect(serviceWorkerSource).toContain('const CACHE_NAME_STATIC = "retail-static-v2"')
    expect(serviceWorkerSource).toContain('const OFFLINE_SYNC_TAG = "retail-offline-sync"')
    expect(serviceWorkerSource).toContain('const OFFLINE_SYNC_COMPLETE = "OFFLINE_SYNC_COMPLETE"')
    expect(serviceWorkerSource).toContain('self.addEventListener("sync", (event) => {')
    expect(serviceWorkerSource).toContain('processBackgroundSync(event.tag)')
    expect(serviceWorkerSource).toContain('self.addEventListener("message", (event) => {')
    expect(serviceWorkerSource).toContain('type: OFFLINE_SYNC_REQUEST')
    expect(serviceWorkerSource).toContain('data.type !== OFFLINE_SYNC_COMPLETE')
    expect(serviceWorkerSource).toContain('waitForSyncCompletion(requestId)')
  })
})
