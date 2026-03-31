import { afterEach, describe, expect, it } from 'vitest'
import {
  getActiveBodyScrollLocks,
  lockBodyScroll,
  resetBodyScrollLocksForTest,
} from '@/lib/ui/bodyScrollLock'

type MockBody = {
  style: {
    overflow: string
  }
  dataset: Record<string, string | undefined>
}

function installMockDocument(initialOverflow = '') {
  const body: MockBody = {
    style: {
      overflow: initialOverflow,
    },
    dataset: {},
  }

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { body },
  })

  return body
}

afterEach(() => {
  resetBodyScrollLocksForTest()
  Reflect.deleteProperty(globalThis, 'document')
})

describe('bodyScrollLock', () => {
  it('bloquea el scroll del body y lo restaura al liberar el ultimo lock', () => {
    const body = installMockDocument('auto')

    const unlock = lockBodyScroll()

    expect(body.style.overflow).toBe('hidden')
    expect(body.dataset.scrollLock).toBe('true')

    unlock()

    expect(body.style.overflow).toBe('auto')
    expect(body.dataset.scrollLock).toBeUndefined()
  })

  it('mantiene el scroll bloqueado mientras existan overlays apilados', () => {
    const body = installMockDocument('')

    const unlockFirst = lockBodyScroll()
    const unlockSecond = lockBodyScroll()

    expect(getActiveBodyScrollLocks()).toBe(2)
    expect(body.style.overflow).toBe('hidden')

    unlockFirst()

    expect(getActiveBodyScrollLocks()).toBe(1)
    expect(body.style.overflow).toBe('hidden')

    unlockSecond()

    expect(getActiveBodyScrollLocks()).toBe(0)
    expect(body.style.overflow).toBe('')
  })
})
