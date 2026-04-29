import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsignacionesBackButton } from '@/features/asignaciones/components/AsignacionesBackButton'
import { AsignacionesPanel } from '@/features/asignaciones/components/AsignacionesPanel'
import { obtenerPdvsWorkspaceData } from '@/features/asignaciones/services/asignacionService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'PDVs | Field Force Platform',
}

interface PdvsWorkspacePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function PdvsWorkspacePage({ searchParams }: PdvsWorkspacePageProps) {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}

  const data = await obtenerPdvsWorkspaceData(supabase, actor, {
    pdvPanel: pickString(params.pdv_panel),
    pdvState: pickString(params.pdv_estado),
    cadena: pickString(params.cadena),
    ciudad: pickString(params.ciudad),
    zona: pickString(params.zona),
    rotacionClasificacion: pickString(params.rotacion_clasificacion),
    grupoRotacion: pickString(params.grupo_rotacion),
  })

  return (
    <div className="mx-auto max-w-[1680px] px-4 pb-10 pt-24 sm:px-6 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <div className="mb-4">
          <AsignacionesBackButton />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Planeacion operativa</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">PDVs</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Administra la rotación maestra y la cobertura de puntos de venta en una superficie separada, con importación y revisión independiente del catálogo de asignaciones.
        </p>
      </header>

      <AsignacionesPanel data={data} puedeGestionar={actor.puesto === 'ADMINISTRADOR'} surface="pdvs" />
    </div>
  )
}
