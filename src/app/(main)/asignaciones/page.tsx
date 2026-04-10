export const runtime = 'edge';
import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsignacionesPanel } from '@/features/asignaciones/components/AsignacionesPanel'
import { obtenerPanelAsignaciones } from '@/features/asignaciones/services/asignacionService'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Asignaciones | Field Force Platform',
}

interface AsignacionesPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AsignacionesPage({ searchParams }: AsignacionesPageProps) {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}
  const data = await obtenerPanelAsignaciones(supabase, actor, {
    view: pickString(params.vista),
    modal: pickString(params.modal),
    page: pickString(params.page) ? Number(pickString(params.page)) : null,
    assignmentState: pickString(params.estado),
    filters: {
      month: pickString(params.month),
      supervisorEmpleadoId: pickString(params.supervisor_empleado_id),
      estadoOperativo: pickString(params.estado_operativo),
      pdvPanel: pickString(params.pdv_panel),
      pdvState: pickString(params.pdv_estado),
      cadena: pickString(params.cadena),
      ciudad: pickString(params.ciudad),
      zona: pickString(params.zona),
      rotacionClasificacion: pickString(params.rotacion_clasificacion),
      grupoRotacion: pickString(params.grupo_rotacion),
    },
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Planeacion operativa
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Asignaciones</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Planeacion mensual, validaciones de publicacion, coberturas y control de conflictos operativos.
        </p>
      </header>

      <AsignacionesPanel data={data} puedeGestionar={actor.puesto === 'ADMINISTRADOR'} />
    </div>
  )
}
