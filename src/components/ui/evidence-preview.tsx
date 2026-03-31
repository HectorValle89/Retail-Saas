'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useState } from 'react'
import { lockBodyScroll } from '@/lib/ui/bodyScrollLock'

function getFileExtension(url: string | null) {
  if (!url) {
    return null
  }

  try {
    const parsedUrl = new URL(url)
    const segments = parsedUrl.pathname.split('/')
    const lastSegment = segments[segments.length - 1] ?? ''
    return lastSegment.split('.').pop()?.toLowerCase() ?? null
  } catch {
    const sanitizedUrl = url.split('?')[0] ?? url
    return sanitizedUrl.split('.').pop()?.toLowerCase() ?? null
  }
}

function isImageExtension(extension: string | null) {
  return extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'webp'
}

function isHeavyDocument(extension: string | null) {
  return (
    extension === 'pdf' ||
    extension === 'doc' ||
    extension === 'docx' ||
    extension === 'xls' ||
    extension === 'xlsx' ||
    extension === 'ppt' ||
    extension === 'pptx' ||
    extension === 'zip'
  )
}

interface EvidencePreviewProps {
  url: string | null
  label: string
  hash?: string | null
  emptyLabel?: string
}

export function EvidencePreview({
  url,
  label,
  hash,
  emptyLabel = 'Sin evidencia',
}: EvidencePreviewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dialogId = useId()
  const extension = getFileExtension(url)
  const isImage = isImageExtension(extension)
  const isHeavy = isHeavyDocument(extension)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    return lockBodyScroll()
  }, [isOpen])

  if (!url) {
    return <span className="text-xs text-slate-400">{emptyLabel}</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50"
      >
        {isImage ? (
          <img
            src={url}
            alt={label}
            loading="lazy"
            decoding="async"
            className="h-12 w-12 rounded-xl border border-slate-200 object-cover"
          />
        ) : (
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {isHeavy ? extension : 'FILE'}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-xs font-medium text-slate-700">{label}</span>
          <span className="mt-1 block text-[11px] text-slate-400">
            {isImage ? 'Preview lazy' : 'Abrir original'}
          </span>
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id={dialogId} className="text-lg font-semibold text-slate-950">
                  {label}
                </h3>
                {hash && <p className="mt-1 text-xs text-slate-500">Hash: {hash}</p>}
              </div>
              <div className="flex gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Abrir original
                </a>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="mt-6">
              {isImage ? (
                <img
                  src={url}
                  alt={label}
                  decoding="async"
                  className="max-h-[72vh] w-full rounded-2xl border border-slate-200 object-contain"
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">Documento disponible</p>
                  <p className="mt-2">
                    Este tipo de archivo no genera miniatura ligera en tabla. Abre el original desde el boton superior.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
