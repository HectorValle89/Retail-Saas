'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X } from '@phosphor-icons/react'
import { lockBodyScroll } from '@/lib/ui/bodyScrollLock'

type BottomSheetSnap = 'partial' | 'expanded'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  initialSnap?: BottomSheetSnap
  footer?: ReactNode
  showBackButton?: boolean
  children: ReactNode
}

const SHEET_HEIGHTS: Record<BottomSheetSnap, string> = {
  partial: '50vh',
  expanded: '95vh',
}

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  initialSnap = 'partial',
  footer,
  showBackButton = true,
  children,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(open)
  const [snap, setSnap] = useState<BottomSheetSnap>(initialSnap)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setSnap(initialSnap)
      setDragOffset(0)
      return lockBodyScroll()
    }
    const timeout = window.setTimeout(() => {
      setMounted(false)
      setDragOffset(0)
    }, 220)

    return () => window.clearTimeout(timeout)
  }, [initialSnap, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])
  const panelHeight = useMemo(() => SHEET_HEIGHTS[snap], [snap])

  const beginDrag = (clientY: number) => {
    dragStartRef.current = clientY
  }

  const updateDrag = (clientY: number) => {
    if (dragStartRef.current === null) {
      return
    }

    const delta = clientY - dragStartRef.current
    setDragOffset(delta > 0 ? delta : delta * 0.35)
  }

  const endDrag = () => {
    if (dragStartRef.current === null) {
      return
    }

    const delta = dragOffset
    dragStartRef.current = null

    if (delta > 96) {
      setDragOffset(0)
      onClose()
      return
    }

    if (delta < -80) {
      setSnap('expanded')
      setDragOffset(0)
      return
    }

    if (delta > 40) {
      setSnap('partial')
    }

    setDragOffset(0)
  }

  if (!mounted) {
    return null
  }

  return (
    <div
      className={`fixed inset-0 z-[90] ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      <section
        aria-modal="true"
        role="dialog"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_48px_rgba(15,23,42,0.18)] transition-transform duration-200 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{
          height: panelHeight,
          transform: open ? `translateY(${Math.max(0, dragOffset)}px)` : undefined,
        }}
      >
        <div
          className="flex cursor-grab touch-none flex-col border-b border-slate-200/80 px-4 pb-4 pt-3 active:cursor-grabbing"
          onMouseDown={(event) => beginDrag(event.clientY)}
          onMouseMove={(event) => updateDrag(event.clientY)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={(event) => beginDrag(event.touches[0]?.clientY ?? 0)}
          onTouchMove={(event) => updateDrag(event.touches[0]?.clientY ?? 0)}
          onTouchEnd={endDrag}
        >
          <span className="mx-auto h-1.5 w-14 rounded-full bg-slate-300" />
          <div className="mt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
                {description && (
                  <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" weight="regular" aria-hidden="true" />
              </button>
            </div>
            {showBackButton && (
              <button
                type="button"
                onClick={onClose}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[14px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Atras
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <div className="sticky bottom-0 border-t border-slate-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 backdrop-blur sm:px-5">
            {footer}
          </div>
        )}
      </section>
    </div>
  )
}
