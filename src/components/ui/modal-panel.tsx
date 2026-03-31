'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { lockBodyScroll } from '@/lib/ui/bodyScrollLock';

interface ModalPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  maxWidthClassName?: string;
}

export function ModalPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidthClassName = 'max-w-5xl',
}: ModalPanelProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const unlockBodyScroll = lockBodyScroll();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4 py-6 sm:px-6">
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/48 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-[1201] flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] ${maxWidthClassName}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>

          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <X className="h-5 w-5" weight="regular" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">{children}</div>
      </div>
    </div>
  );
}
