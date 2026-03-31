let activeBodyScrollLocks = 0
let previousBodyOverflow: string | null = null

export function lockBodyScroll() {
  if (typeof document === 'undefined') {
    return () => {}
  }

  const body = document.body

  if (activeBodyScrollLocks === 0) {
    previousBodyOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    body.dataset.scrollLock = 'true'
  }

  activeBodyScrollLocks += 1

  let released = false

  return () => {
    if (released || typeof document === 'undefined') {
      return
    }

    released = true
    activeBodyScrollLocks = Math.max(0, activeBodyScrollLocks - 1)

    if (activeBodyScrollLocks === 0) {
      document.body.style.overflow = previousBodyOverflow ?? ''
      delete document.body.dataset.scrollLock
      previousBodyOverflow = null
    }
  }
}

export function getActiveBodyScrollLocks() {
  return activeBodyScrollLocks
}

export function resetBodyScrollLocksForTest() {
  activeBodyScrollLocks = 0
  previousBodyOverflow = null

  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
    delete document.body.dataset.scrollLock
  }
}
