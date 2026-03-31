import { requerirPuestosActivos } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import { EmpleadosPanel } from '@/features/empleados/components/EmpleadosPanel'
import { obtenerPanelEmpleados } from '@/features/empleados/services/empleadoService'

export const metadata = {
  title: 'Empleados | Beteele One',
}

interface EmpleadosPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function EmpleadosPage({ searchParams }: EmpleadosPageProps) {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO', 'COORDINADOR'])
  const supabase = createServiceClient()
  const data = await obtenerPanelEmpleados(supabase)
  const params = (await searchParams) ?? {}
  const initialFilters = {
    search: pickString(params.search) ?? '',
    estadoLaboral: pickString(params.estadoLaboral) ?? 'ALL',
    zona: pickString(params.zona) ?? 'ALL',
    supervisorId: pickString(params.supervisorId) ?? 'ALL',
    imss: pickString(params.imss) ?? 'ALL',
    inbox: pickString(params.inbox) ?? 'ALL',
  }

  const roleLabel =
    actor.puesto === 'ADMINISTRADOR' ? 'ISDIN' : 'Reclutamiento'

  return (
    <div className="page-shell max-w-7xl">
      <header className="page-hero mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="page-hero-eyebrow">
              {roleLabel}
            </p>
            <h1 className="page-hero-title">Empleados</h1>
            <p className="page-hero-copy max-w-3xl">
              Candidatos, reclutamiento, coordinacion y base operativa del equipo.
            </p>
          </div>
          <a
            href="/api/empleados/export"
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
          >
            Descargar lista de empleados
          </a>
        </div>
      </header>

      <EmpleadosPanel data={data} actorPuesto={actor.puesto} initialFilters={initialFilters} />
    </div>
  )
}
