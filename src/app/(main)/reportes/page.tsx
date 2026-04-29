import { requerirPuestosActivos } from '@/lib/auth/session'
import { VisitasOperativasDemandCard } from '@/features/reportes/components/VisitasOperativasDemandCard'
import { VisitasSupervisoresDemandCard } from '@/features/reportes/components/VisitasSupervisoresDemandCard'
import { ReportesPanel } from '@/features/reportes/components/ReportesPanel'
import { ReportesScheduleManager } from '@/features/reportes/components/ReportesScheduleManager'
import { obtenerPanelReportes, obtenerPanelReportesShell } from '@/features/reportes/services/reporteService'
import { obtenerProgramacionReportes } from '@/features/reportes/services/reporteScheduleService'

export const metadata = {
  title: 'Reportes | Field Force Platform',
}

interface ReportesPageProps {
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

function resolveCurrentMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

export default async function ReportesPage({ searchParams }: ReportesPageProps) {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR'])
  const params = (await searchParams) ?? {}
  const periodo = pickString(params.periodo)
  const page = parsePositiveInt(pickString(params.page), 1)
  const pageSize = parsePositiveInt(pickString(params.pageSize), 25)
  const schedulesPromise =
    actor.puesto === 'ADMINISTRADOR' ? obtenerProgramacionReportes(actor) : Promise.resolve(null)
  const dataPromise = periodo
    ? obtenerPanelReportes(actor, {
        period: periodo,
        page,
        pageSize,
      })
    : Promise.resolve(obtenerPanelReportesShell(resolveCurrentMonth(), page, pageSize))

  const [schedules, data] = await Promise.all([schedulesPromise, dataPromise])

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Control y gobierno
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Reportes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Salida analitica consolidada para asistencia, ventas, campanas, cuotas, nomina y bitacora administrativa, con periodo obligatorio, paginacion operativa y detalle de visitas/evidencias de supervisores bajo demanda.
        </p>
      </header>

      <div className="space-y-6">
        {actor.puesto === 'ADMINISTRADOR' && schedules ? <ReportesScheduleManager actor={actor} data={schedules} /> : null}
        <VisitasOperativasDemandCard periodoInicial={data.filtros.periodo} />
        <VisitasSupervisoresDemandCard periodoInicial={data.filtros.periodo} />
        <ReportesPanel actor={actor} data={data} />
      </div>
    </div>
  )
}
