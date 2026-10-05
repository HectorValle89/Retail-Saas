'use client';

import { useEffect } from 'react';

export function PwaBootstrap() {
  useEffect(() => {
    // El aviso de instalación está deshabilitado; no necesitamos guardar el evento ni estado visual.
    const suppressInstallPrompt = (event: Event) => event.preventDefault();
    window.addEventListener('beforeinstallprompt', suppressInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', suppressInstallPrompt);
  }, []);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    const registerServiceWorker = () => {
      void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.error('[PWA] No se pudo registrar el service worker.', error);
      });
    };

    // Difiere el registro para priorizar la primera navegación y cancela si el shell se desmonta.
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(registerServiceWorker);
      return () => window.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(registerServiceWorker, 2000);
    return () => window.clearTimeout(handle);
  }, []);

  return null;
}
