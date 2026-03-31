const CACHE_NAME_APP_SHELL = "retail-app-shell-v2"
const CACHE_NAME_STATIC = "retail-static-v2"
const CACHE_NAME_DATA = "retail-data-v2"
const CACHE_NAME_CATALOGS = "retail-catalogs-v2"
const CACHE_NAME_THUMBNAILS = "retail-thumbnails-v2"
const OFFLINE_URL = "/offline"
const STATIC_ASSETS = ["/manifest.webmanifest"]
const PRECACHE_ROUTES = [
  "/",
  "/offline",
  "/dashboard",
  "/asistencias",
  "/ventas",
  "/reportes",
  "/rutas",
  "/clientes",
  "/nomina",
  "/campanas",
]
const CATALOG_TTL_MS = 60 * 60 * 1000
const THUMBNAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000
const META_SUFFIX = "::meta"
const OFFLINE_SYNC_TAG = "retail-offline-sync"
const OFFLINE_SYNC_REQUEST = "OFFLINE_SYNC_REQUEST"
const OFFLINE_SYNC_COMPLETE = "OFFLINE_SYNC_COMPLETE"
const OFFLINE_SYNC_TIMEOUT_MS = 15 * 1000
const SENSITIVE_PATTERNS = [
  "/nomina",
  "/nomina_periodo",
  "/pre_nomina",
  "/gastos",
  "/expediente",
  "/incapacidad",
]
const THUMBNAIL_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".avif"]
const HEAVY_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".ppt",
  ".pptx",
  ".zip",
]
const LEGACY_CACHE_NAMES = [
  "retail-pages-v1",
  "retail-static-v1",
  "retail-data-v1",
  "retail-catalogs-v1",
]
const CACHE_NAMES = [
  CACHE_NAME_APP_SHELL,
  CACHE_NAME_STATIC,
  CACHE_NAME_DATA,
  CACHE_NAME_CATALOGS,
  CACHE_NAME_THUMBNAILS,
  ...LEGACY_CACHE_NAMES,
]
const pendingSyncRequests = new Map()

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME_APP_SHELL).then((cache) => cache.add(OFFLINE_URL)),
      caches.open(CACHE_NAME_STATIC).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(CACHE_NAME_APP_SHELL).then((cache) => cache.addAll(PRECACHE_ROUTES)),
    ])
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !CACHE_NAMES.includes(key))
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("push", (event) => {
  if (!event.data) {
    return
  }

  const payload = event.data.json()
  const title = payload.title || "Mensaje operativo"
  const options = {
    body: payload.body || "Tienes una nueva notificacion.",
    icon: "/icon",
    badge: "/icon",
    tag: payload.tag || "retail-push",
    data: payload.data || { path: "/mensajes" },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetPath = event.notification.data?.path || "/mensajes"
  const targetUrl = new URL(targetPath, self.location.origin).toString()

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matched = clients.find((client) => client.url === targetUrl)
      if (matched) {
        return matched.focus()
      }

      return self.clients.openWindow(targetUrl)
    })
  )
})

self.addEventListener("sync", (event) => {
  if (event.tag !== OFFLINE_SYNC_TAG) {
    return
  }

  event.waitUntil(processBackgroundSync(event.tag))
})

self.addEventListener("message", (event) => {
  const data = event.data || {}

  if (data.type !== OFFLINE_SYNC_COMPLETE || !data.requestId) {
    return
  }

  const pendingRequest = pendingSyncRequests.get(data.requestId)
  if (!pendingRequest) {
    return
  }

  clearTimeout(pendingRequest.timeoutId)
  pendingSyncRequests.delete(data.requestId)

  if (data.ok === false) {
    pendingRequest.reject(new Error(data.error || "Foreground sync failed"))
    return
  }

  pendingRequest.resolve()
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return
  }

  const requestUrl = new URL(event.request.url)
  const isSameOrigin = requestUrl.origin === self.location.origin
  const isHeavyDocumentRequest = isHeavyDocumentStorageRequest(requestUrl)
  const isThumbnailRequest = isImageRequest(requestUrl)
  const isCatalogRequest = isCatalogResource(requestUrl)
  const isOperationalData =
    requestUrl.pathname.startsWith("/api/") ||
    requestUrl.pathname.includes("/rest/v1/") ||
    (!isSameOrigin && requestUrl.hostname.includes("supabase"))
  const isSensitiveData = matchesSensitivePattern(requestUrl)

  if (isSensitiveData) {
    event.respondWith(fetch(event.request))
    return
  }

  if (isHeavyDocumentRequest) {
    event.respondWith(fetch(event.request))
    return
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event, CACHE_NAME_APP_SHELL))
    return
  }

  if (isThumbnailRequest) {
    event.respondWith(cacheFirstWithTtl(event, CACHE_NAME_THUMBNAILS, THUMBNAIL_TTL_MS))
    return
  }

  if (isStaticAsset(requestUrl, isSameOrigin)) {
    event.respondWith(cacheFirstWithTtl(event, CACHE_NAME_STATIC))
    return
  }

  if (isCatalogRequest) {
    event.respondWith(staleWhileRevalidateWithTtl(event, CACHE_NAME_CATALOGS, CATALOG_TTL_MS))
    return
  }

  if (isOperationalData) {
    event.respondWith(networkFirst(event, CACHE_NAME_DATA))
    return
  }
})

async function cacheFirstWithTtl(event, cacheName, ttl) {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(event.request)

  if (cachedResponse) {
    if (!ttl || !(await isStale(cache, event.request, ttl))) {
      return cachedResponse
    }
    event.waitUntil(fetchAndCache(event.request, cacheName))
    return cachedResponse
  }

  return fetchAndCache(event.request, cacheName)
}

async function networkFirst(event, cacheName) {
  const cache = await caches.open(cacheName)

  try {
    return await fetchAndCache(event.request, cacheName)
  } catch {
    const cachedResponse = await cache.match(event.request)
    if (cachedResponse) {
      return cachedResponse
    }
    if (event.request.mode === "navigate") {
      return caches.match(OFFLINE_URL)
    }
    throw new Error("Network failure")
  }
}

async function staleWhileRevalidateWithTtl(event, cacheName, ttl) {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(event.request)

  if (cachedResponse) {
    const shouldRevalidate = !ttl || (await isStale(cache, event.request, ttl))

    if (shouldRevalidate) {
      event.waitUntil(
        fetchAndCache(event.request, cacheName).catch(() => null)
      )
    }

    return cachedResponse
  }

  return fetchAndCache(event.request, cacheName)
}

async function fetchAndCache(request, cacheName) {
  const response = await fetch(request)
  await storeInCache(cacheName, request, response)
  return response
}

async function storeInCache(cacheName, request, response) {
  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
  await cache.put(getMetaRequest(request), new Response(String(Date.now())))
}

function getMetaRequest(request) {
  return new Request(request.url + META_SUFFIX)
}

async function isStale(cache, request, ttl) {
  if (!ttl) {
    return false
  }
  const metaResponse = await cache.match(getMetaRequest(request))
  if (!metaResponse) {
    return true
  }
  const timestamp = Number(await metaResponse.text())
  return Number.isNaN(timestamp) || Date.now() - timestamp > ttl
}

function isCatalogResource(requestUrl) {
  return (
    requestUrl.pathname.includes("/producto") ||
    requestUrl.pathname.includes("/cadena") ||
    requestUrl.pathname.includes("/ciudad") ||
    requestUrl.pathname.includes("/horario") ||
    requestUrl.pathname.includes("/mision")
  )
}

function isImageRequest(requestUrl) {
  const pathname = requestUrl.pathname.toLowerCase()
  if (requestUrl.pathname.includes("/storage/v1/object")) {
    if (hasHeavyDocumentExtension(pathname)) {
      return false
    }

    return (
      hasThumbnailExtension(pathname) ||
      requestUrl.searchParams.has("width") ||
      requestUrl.searchParams.has("height") ||
      requestUrl.searchParams.has("resize")
    )
  }

  return hasThumbnailExtension(pathname)
}

function isHeavyDocumentStorageRequest(requestUrl) {
  const pathname = requestUrl.pathname.toLowerCase()
  return requestUrl.pathname.includes("/storage/v1/object") && hasHeavyDocumentExtension(pathname)
}

function hasThumbnailExtension(pathname) {
  return THUMBNAIL_EXTENSIONS.some((extension) => pathname.endsWith(extension))
}

function hasHeavyDocumentExtension(pathname) {
  return HEAVY_DOCUMENT_EXTENSIONS.some((extension) => pathname.endsWith(extension))
}

function isStaticAsset(requestUrl, isSameOrigin) {
  return (
    isSameOrigin &&
    (requestUrl.pathname.startsWith("/_next/static/") ||
      requestUrl.pathname.startsWith("/_next/image") ||
      requestUrl.pathname.endsWith(".js") ||
      requestUrl.pathname.endsWith(".css") ||
      requestUrl.pathname.endsWith(".svg") ||
      requestUrl.pathname.endsWith(".woff2"))
  )
}

function matchesSensitivePattern(requestUrl) {
  return SENSITIVE_PATTERNS.some((segment) => requestUrl.pathname.includes(segment))
}

async function notifyClientsToSync(tag) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  const requestId = self.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

  await Promise.all(
    clients.map((client) =>
      client.postMessage({
        type: OFFLINE_SYNC_REQUEST,
        tag,
        requestId,
      })
    )
  )

  return requestId
}

async function processBackgroundSync(tag) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })

  if (clients.length === 0) {
    return
  }

  const requestId = await notifyClientsToSync(tag)
  await waitForSyncCompletion(requestId)
}

function waitForSyncCompletion(requestId) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingSyncRequests.delete(requestId)
      reject(new Error("Foreground sync confirmation timed out"))
    }, OFFLINE_SYNC_TIMEOUT_MS)

    pendingSyncRequests.set(requestId, {
      resolve,
      reject,
      timeoutId,
    })
  })
}