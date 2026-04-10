import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { VentasPanel } from '@/features/ventas/components/VentasPanel'
import { obtenerPanelVentas } from '@/features/ventas/services/ventaService'

export const metadata = {
  title: 'Ventas | Field Force Platform',
}

interface VentasPageProps {
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

export default async function VentasPage({ searchParams }: VentasPageProps) {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}
  const data = await obtenerPanelVentas(supabase, {
    actorPuesto: actor.puesto,
    actorEmpleadoId: actor.empleadoId ?? null,
    page: parsePositiveInt(pickString(params.page), 1),
    pageSize: parsePositiveInt(pickString(params.pageSize), 50),
  })

  return (
    <div className="page-shell max-w-7xl">
      <header className="page-hero mb-6">
        <p className="page-hero-eyebrow">
          Ejecucion diaria
        </p>
        <h1 className="page-hero-title">Ventas</h1>
        <p className="page-hero-copy max-w-3xl">
          Registro comercial diario ligado a jornada activa, confirmación de cierre y base para cuotas y bonos.
        </p>
      </header>

      <VentasPanel data={data} />
    </div>
  )
}
