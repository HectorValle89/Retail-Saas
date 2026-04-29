import { requerirAdministradorActivo } from '@/lib/auth/session'
import { ConfiguracionPanel } from '@/features/configuracion/components/ConfiguracionPanel'
import { obtenerPanelConfiguracion } from '@/features/configuracion/services/configuracionService'

export const metadata = {
  title: 'Configuracion | Field Force Platform',
}

export default async function ConfiguracionPage() {
  const actor = await requerirAdministradorActivo()
  const data = await obtenerPanelConfiguracion(actor)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Configuracion central
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Configuracion</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Catalogos base, parametros globales, OCR y misiones del dia para la
          operacion retail.
        </p>
      </header>

      <ConfiguracionPanel actor={actor} data={data} />
    </div>
  )
}

