const CACHE_NAME = 'retail-pwa-v1'
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL, '/manifest.webmanifest']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(event.request.url)
  const isSameOrigin = requestUrl.origin === self.location.origin
  const isStaticAsset =
    isSameOrigin &&
    (requestUrl.pathname.startsWith('/_next/static/') ||
      requestUrl.pathname.startsWith('/_next/image') ||
      requestUrl.pathname.endsWith('.js') ||
      requestUrl.pathname.endsWith('.css') ||
      requestUrl.pathname.endsWith('.png') ||
      requestUrl.pathname.endsWith('.svg') ||
      requestUrl.pathname.endsWith('.woff2'))

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          return response
        })
        .catch(async () => {
          const cachedPage = await caches.match(event.request)
          if (cachedPage) {
            return cachedPage
          }

          return caches.match(OFFLINE_URL)
        })
    )
    return
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        return fetch(event.request).then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          return response
        })
      })
    )
  }
})
