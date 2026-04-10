import { createClient } from '@/lib/supabase/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { SolicitudesPanel } from '@/features/solicitudes/components/SolicitudesPanel'
import { obtenerPanelSolicitudes } from '@/features/solicitudes/services/solicitudService'

export const metadata = {
  title: 'Solicitudes | Field Force Platform',
}

interface SolicitudesPageProps {
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

export default async function SolicitudesPage({ searchParams }: SolicitudesPageProps) {
  const actor = await requerirPuestosActivos([
    'ADMINISTRADOR',
    'DERMOCONSEJERO',
    'SUPERVISOR',
    'COORDINADOR',
    'RECLUTAMIENTO',
    'NOMINA',
  ])
  const supabase = await createClient()
  const params = (await searchParams) ?? {}
  const data = await obtenerPanelSolicitudes(supabase, {
    actorPuesto: actor.puesto,
    actorEmpleadoId: actor.empleadoId ?? null,
    page: parsePositiveInt(pickString(params.page), 1),
    pageSize: parsePositiveInt(pickString(params.pageSize), 50),
    filters: {
      tipo: pickString(params.tipo),
      estatus: pickString(params.estatus),
      empleadoId: pickString(params.empleado_id),
      fechaInicio: pickString(params.fecha_inicio),
      fechaFin: pickString(params.fecha_fin),
      month: pickString(params.month),
    },
  })

  return (
    <div className="page-shell max-w-7xl">
      <header className="page-hero mb-6">
        <p className="page-hero-eyebrow">
          Control operativo
        </p>
        <h1 className="page-hero-title">Solicitudes</h1>
        <p className="page-hero-copy max-w-3xl">
          Registro y seguimiento de incapacidades, vacaciones y permisos con flujo de aprobacion trazable.
        </p>
      </header>

      <SolicitudesPanel data={data} />
    </div>
  )
}
