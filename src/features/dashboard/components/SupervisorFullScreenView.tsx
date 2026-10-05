'use client';

import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, X } from '@phosphor-icons/react';
import { lockBodyScroll } from '@/lib/ui/bodyScrollLock';

interface SupervisorFullScreenViewProps {
  open: boolean;
  onClose: () => void;
  title: string;
  badge?: string;
  description?: string;
  children: ReactNode;
  contentClassName?: string;
  zIndexClassName?: string;
  backLabel?: string;
}

export function SupervisorFullScreenView({
  open,
  onClose,
  title,
  badge,
  description,
  children,
  contentClassName = 'max-w-7xl',
  zIndexClassName = 'z-50',
  backLabel,
}: SupervisorFullScreenViewProps) {
  useEffect(() => {
    if (open) {
      return lockBodyScroll();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`fixed inset-0 ${zIndexClassName} flex flex-col bg-slate-50 overflow-hidden`}
    >
      {/* Barra superior fija con botón prominente para regresar al dashboard principal */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 sm:px-6 shadow-xs backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
            aria-label={backLabel ?? 'Regresar al dashboard principal'}
          >
            <ArrowLeft className="h-5 w-5 text-slate-600" weight="bold" />
            <span className="hidden sm:inline">{backLabel ?? 'Regresar al dashboard principal'}</span>
            <span className="sm:hidden">{backLabel ?? 'Regresar'}</span>
          </button>

          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base sm:text-lg font-bold text-slate-900">{title}</h2>
              {badge && (
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="truncate text-xs text-slate-500 hidden md:block">{description}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98]"
          aria-label="Cerrar y volver al dashboard"
        >
          <X className="h-5 w-5" weight="bold" />
        </button>
      </header>

      {/* Contenido scrolleable a pantalla completa */}
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className={`mx-auto ${contentClassName}`}>{children}</div>
      </main>
    </div>
  );
}
