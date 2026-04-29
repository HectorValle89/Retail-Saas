'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  recoverFromChunkLoadError,
  shouldRecoverFromChunkLoadError,
} from '@/lib/runtime/chunkRecovery'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (shouldRecoverFromChunkLoadError(error.message)) {
      void recoverFromChunkLoadError()
    }
  }, [error.message])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
          Error de aplicacion
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Hubo un problema al cargar la pantalla
        </h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Esto suele pasar cuando el navegador conserva archivos viejos del sistema o cuando un
          chunk de JavaScript no coincide con la version publicada. La solucion normal es recargar
          la app para limpiar la sesion de carga.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => {
              reset()
              window.location.reload()
            }}
          >
            Recargar aplicacion
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset()
            }}
          >
            Reintentar
          </Button>
        </div>

        <p className="mt-5 text-xs leading-6 text-slate-500">
          Si vuelve a ocurrir varias veces, cierra la pestaña y vuelve a entrar. Si sigue igual,
          el navegador puede tener caché vieja del sitio.
        </p>
      </div>
    </div>
  )
}
