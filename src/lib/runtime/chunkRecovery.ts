const CHUNK_LOAD_RECOVERY_KEY = 'retail.runtime.chunk-reload-v1'

export function shouldRecoverFromChunkLoadError(message: string) {
  const normalized = message.trim().toLowerCase()

  return (
    normalized.includes('chunkloaderror') ||
    normalized.includes('loading chunk') ||
    normalized.includes('failed to fetch dynamically imported module') ||
    normalized.includes('importing a module script failed') ||
    (normalized.includes('module script') && normalized.includes('failed'))
  )
}

async function clearRetailServiceWorkerState() {
  if (typeof window === 'undefined') {
    return
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys()
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith('retail-'))
        .map((key) => caches.delete(key))
    )
  }
}

export async function recoverFromChunkLoadError() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    if (window.sessionStorage.getItem(CHUNK_LOAD_RECOVERY_KEY) === '1') {
      return false
    }

    window.sessionStorage.setItem(CHUNK_LOAD_RECOVERY_KEY, '1')
  } catch {
    // No bloqueamos la recuperacion si sessionStorage no esta disponible.
  }

  try {
    await clearRetailServiceWorkerState()
  } catch {
    // La recarga sigue siendo util aunque limpiar cache falle.
  }

  window.location.reload()
  return true
}
