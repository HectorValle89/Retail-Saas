import { requerirOperadorNomina } from '@/lib/auth/session'
import { NominaWorkspacePanel } from '@/features/nomina/components/NominaWorkspacePanel'
import {
  obtenerWorkspaceNomina,
  type NominaWorkspaceData,
} from '@/features/nomina/services/nominaWorkspaceService'

export const metadata = {
  title: 'Nomina | Beteele One',
}

interface NominaPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function buildNominaFallbackData(month: string, message: string): NominaWorkspaceData {
  return {
    summary: {
      totalMovimientos: 0,
      altasPendientes: 0,
      bajasPendientes: 0,
      bajasDevueltas: 0,
      devueltasAReclutamiento: 0,
      movimientosCerrados: 0,
      incapacidadesPendientes: 0,
    },
    payrollInbox: [],
    incapacidadesPendientes: [],
    attendanceMonth: month,
    infraestructuraLista: false,
    mensajeInfraestructura: message,
  }
}

export default async function NominaPage({ searchParams }: NominaPageProps) {
  const actor = await requerirOperadorNomina()
  const params = (await searchParams) ?? {}
  const initialInbox = pickString(params.inbox) ?? 'ALL'
  const month = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date())

  let data: NominaWorkspaceData
  try {
    data = await obtenerWorkspaceNomina(actor)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No fue posible cargar Nomina en este momento.'
    data = buildNominaFallbackData(month, message)
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Nomina
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Nomina</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Flujo operativo de altas pendientes, bajas pendientes, devoluciones a Reclutamiento, revision final de incapacidades y acceso directo al calendario mensual de asistencias.
        </p>
      </header>

      <NominaWorkspacePanel actor={actor} data={data} initialInbox={initialInbox} />
    </div>
  )
}
