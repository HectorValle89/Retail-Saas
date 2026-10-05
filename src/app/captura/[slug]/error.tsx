'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  recoverFromChunkLoadError,
  shouldRecoverFromChunkLoadError,
} from '@/lib/runtime/chunkRecovery';

export default function CapturaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Captura Error Boundary]', error.message, error.stack);

    if (shouldRecoverFromChunkLoadError(error.message)) {
      void recoverFromChunkLoadError();
    }
  }, [error]);

  const isChunkError =
    error.message?.includes('ChunkLoadError') ||
    error.message?.includes('Loading chunk') ||
    error.message?.includes('Failed to fetch dynamically imported module') ||
    error.message?.includes('Importing a module script failed');

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="text-center">
          <span className="text-5xl">😟</span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            {isChunkError ? 'Actualización disponible' : 'Error al cargar el formulario'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {isChunkError
              ? 'Hay una nueva versión del formulario. Recarga la página para obtener la versión más reciente.'
              : 'Hubo un problema al cargar el formulario de captura. Por favor intenta recargar la página.'}
          </p>

          {!isChunkError && (
            <p className="mt-2 text-xs text-slate-400 font-mono break-all">
              {error.message?.substring(0, 200)}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              🔄 Recargar página
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
              }}
            >
              Reintentar
            </Button>
          </div>

          <p className="mt-5 text-xs text-slate-400">
            Si el problema persiste después de recargar, cierra completamente el navegador y vuelve a entrar.
          </p>
        </div>
      </Card>
    </div>
  );
}
