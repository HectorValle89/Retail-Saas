import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsignacionesBackButton } from '@/features/asignaciones/components/AsignacionesBackButton'
import { AsignacionesPanel } from '@/features/asignaciones/components/AsignacionesPanel'
import { obtenerAsignacionesWorkspaceData } from '@/features/asignaciones/services/asignacionService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Asignaciones | Field Force Platform',
}

interface AsignacionesWorkspacePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AsignacionesWorkspacePage({ searchParams }: AsignacionesWorkspacePageProps) {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}

  const data = await obtenerAsignacionesWorkspaceData(supabase, actor, {
    modal: pickString(params.modal),
    page: pickString(params.page) ? Number(pickString(params.page)) : null,
    assignmentState: pickString(params.estado),
    manualPrefill: {
      pdvId: pickString(params.prefill_pdv_id),
      fechaInicio: pickString(params.prefill_fecha_inicio),
      motivoMovimiento: pickString(params.prefill_motivo),
      observaciones: pickString(params.prefill_observaciones),
      tipo: pickString(params.prefill_tipo),
      naturaleza: pickString(params.prefill_naturaleza),
    },
  })

  return (
    <div className="mx-auto max-w-[1680px] px-4 pb-10 pt-24 sm:px-6 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <div className="mb-4">
          <AsignacionesBackButton />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Planeacion operativa</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Asignaciones</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Carga el catálogo maestro, crea asignaciones puntuales y administra descansos permanentes sin mezclar otras superficies de la operación.
        </p>
      </header>

      <AsignacionesPanel data={data} puedeGestionar={actor.puesto === 'ADMINISTRADOR'} surface="asignaciones" />
    </div>
  )
}
