import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsistenciasPanel } from '@/features/asistencias/components/AsistenciasPanel'
import { AsistenciasAdminPanel } from '@/features/asistencias/components/AsistenciasAdminPanel'
import { obtenerPanelAsistencias } from '@/features/asistencias/services/asistenciaService'
import { obtenerCalendarioAdministrativoAsistencias } from '@/features/asistencias/services/attendanceAdminService'

export const metadata = {
  title: 'Asistencias | Beteele One',
}

interface AsistenciasPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

export default async function AsistenciasPage({ searchParams }: AsistenciasPageProps) {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}

  if (actor.puesto === 'ADMINISTRADOR' || actor.puesto === 'COORDINADOR' || actor.puesto === 'NOMINA') {
    const data = await obtenerCalendarioAdministrativoAsistencias(supabase as never, actor, {
      month: pickString(params.month),
      supervisorId: pickString(params.supervisorId),
      cadena: pickString(params.cadena),
      ciudad: pickString(params.ciudad),
      zona: pickString(params.zona),
      estadoDia: pickString(params.estadoDia) as never,
    })

    return (
      <div className="mx-auto max-w-[min(100vw-2rem,1800px)] px-4 pb-10 pt-28 lg:px-8 lg:pt-10">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
            Asistencia administrativa
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Asistencias</h1>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">
            Calendario mensual consolidado por colaboradora, con faltas, retardos, vacaciones, incapacidades y detalle consultivo por día.
          </p>
        </header>

        <AsistenciasAdminPanel data={data} />
      </div>
    )
  }

  if (actor.puesto === 'SUPERVISOR' || actor.puesto === 'DERMOCONSEJERO') {
    const data = await obtenerPanelAsistencias(supabase, {
      page: parsePositiveInt(pickString(params.page), 1),
      pageSize: parsePositiveInt(pickString(params.pageSize), 50),
    })

    return (
      <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
            Ejecucion diaria
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Asistencias</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            Jornada operativa con GPS, misión del día, validación biométrica y trazabilidad de check-in/check-out.
          </p>
        </header>

        <AsistenciasPanel data={data} />
      </div>
    )
  }

  return null
}
