import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { BitacoraPanel } from '@/features/bitacora/components/BitacoraPanel'
import { obtenerBitacoraPanel } from '@/features/bitacora/services/bitacoraService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Bitacora | Field Force Platform',
}

interface BitacoraPageProps {
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

export default async function BitacoraPage({ searchParams }: BitacoraPageProps) {
  const actor = await requerirAdministradorActivo()
  const supabase = await createClient({ bypassTenantScope: true })
  const params = (await searchParams) ?? {}

  const data = await obtenerBitacoraPanel(supabase, {
    actor,
    usuario: pickString(params.usuario),
    modulo: pickString(params.modulo),
    accion: pickString(params.accion),
    fechaDesde: pickString(params.fechaDesde),
    fechaHasta: pickString(params.fechaHasta),
    cursor: pickString(params.cursor),
    history: pickString(params.history),
    pageSize: parsePositiveInt(pickString(params.pageSize), 50),
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Caja Negra
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Bitacora</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Superficie dedicada para auditoria administrativa sobre `audit_log`, con filtros, verificacion de integridad, exportacion y lectura siempre fresca desde base de datos.
        </p>
      </header>

      <BitacoraPanel data={data} />
    </div>
  )
}
