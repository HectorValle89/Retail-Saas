import { requerirPuestosActivos } from '@/lib/auth/session'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { MensajesPanel } from '@/features/mensajes/components/MensajesPanel'
import { MensajesRealtimeBridge } from '@/features/mensajes/components/MensajesRealtimeBridge'
import { obtenerPanelMensajes } from '@/features/mensajes/services/mensajeService'
import Link from 'next/link'

export const metadata = {
  title: 'Mensajes | Field Force Platform',
}

const MENSAJES_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'DERMOCONSEJERO',
  'LOVE_IS',
  'VENTAS',
  'NOMINA',
  'LOGISTICA',
  'RECLUTAMIENTO',
] as const

interface MensajesPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

export default async function MensajesPage({ searchParams }: MensajesPageProps) {
  const actor = await requerirPuestosActivos([...MENSAJES_ROLES])
  const accountScope = await readRequestAccountScope()
  const params = (await searchParams) ?? {}
  const page = parsePositiveInt(pickString(params.page), 1)
  const pageSize = parsePositiveInt(pickString(params.pageSize), 20)
  const direction = pickString(params.direction)
  const data = await obtenerPanelMensajes(actor, {
    scopeAccountId: accountScope.accountId,
    page,
    pageSize,
    direction,
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <div className="mb-4 flex items-center justify-start">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
          >
            Atras
          </Link>
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">
          Comunicacion operativa
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Mensajes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Avisos internos, encuestas y seguimiento de lectura por grupo operativo, con historial paginado y actualizacion en tiempo real.
        </p>
      </header>

      <MensajesRealtimeBridge
        cuentaClienteId={accountScope.accountId}
        empleadoId={actor.empleadoId}
        allowManagerScope={['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR'].includes(actor.puesto)}
      />
      <MensajesPanel data={data} />
    </div>
  )
}
