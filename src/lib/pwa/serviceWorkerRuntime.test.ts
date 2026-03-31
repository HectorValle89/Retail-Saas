import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

type SyncMessage = {
  type?: string
  requestId?: string
  ok?: boolean
  error?: string
}

function bootServiceWorker() {
  const listeners: Record<string, (event: any) => void> = {}
  const postedMessages: Array<Record<string, unknown>> = []

  const client = {
    postMessage: (payload: Record<string, unknown>) => {
      postedMessages.push(payload)
      return Promise.resolve()
    },
  }

  const selfScope = {
    addEventListener: (type: string, handler: (event: any) => void) => {
      listeners[type] = handler
    },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn(async () => [client]),
      openWindow: vi.fn(),
    },
    registration: {
      showNotification: vi.fn(),
    },
    location: {
      origin: 'https://retail.test',
    },
    crypto: {
      randomUUID: () => 'req-123',
    },
  }

  const sandbox = {
    self: selfScope,
    caches: {
      open: vi.fn(async () => ({ add: vi.fn(), addAll: vi.fn(), match: vi.fn(), put: vi.fn() })),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
      match: vi.fn(async () => null),
    },
    fetch: vi.fn(async () => new Response('ok')),
    Request,
    Response,
    URL,
    Map,
    Promise,
    Error,
    Date,
    Math,
    Number,
    String,
    setTimeout,
    clearTimeout,
    console,
  }

  vm.createContext(sandbox)
  vm.runInContext(serviceWorkerSource, sandbox)

  return {
    listeners,
    postedMessages,
    selfScope,
    sandbox,
  }
}

describe('service worker background sync runtime', () => {
  it('rechaza la sincronizacion si no llega confirmacion antes del timeout', async () => {
    vi.useFakeTimers()

    const runtime = bootServiceWorker()
    const waitPromise = (runtime.sandbox as any).waitForSyncCompletion('req-timeout') as Promise<void>
    const rejection = waitPromise.catch((error: Error) => error)

    await vi.advanceTimersByTimeAsync(15_000)

    await expect(rejection).resolves.toMatchObject({
      message: 'Foreground sync confirmation timed out',
    })

    vi.useRealTimers()
  })

  it('resuelve la sincronizacion cuando llega OFFLINE_SYNC_COMPLETE', async () => {
    vi.useFakeTimers()

    const runtime = bootServiceWorker()
    const waitPromise = (runtime.sandbox as any).waitForSyncCompletion('req-ok') as Promise<void>

    runtime.listeners.message?.({
      data: {
        type: 'OFFLINE_SYNC_COMPLETE',
        requestId: 'req-ok',
        ok: true,
      } satisfies SyncMessage,
    })

    await expect(waitPromise).resolves.toBeUndefined()

    vi.useRealTimers()
  })

  it('engancha waitUntil y expone un timeout controlado al procesar el evento sync', async () => {
    vi.useFakeTimers()

    const runtime = bootServiceWorker()
    const waitUntil = vi.fn()

    runtime.listeners.sync?.({
      tag: 'retail-offline-sync',
      waitUntil,
    })

    expect(waitUntil).toHaveBeenCalledTimes(1)

    const syncPromise = waitUntil.mock.calls[0]?.[0] as Promise<void>
    const rejection = syncPromise.catch((error: Error) => error)

    await Promise.resolve()
    await Promise.resolve()

    expect(runtime.selfScope.clients.matchAll).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(15_000)

    await expect(rejection).resolves.toMatchObject({
      message: 'Foreground sync confirmation timed out',
    })

    vi.useRealTimers()
  })
})