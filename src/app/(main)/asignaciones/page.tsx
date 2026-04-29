import { createClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { AsignacionesHub } from '@/features/asignaciones/components/AsignacionesHub'
import { getMaterializedDateRangeCalendar } from '@/features/asignaciones/services/asignacionMaterializationService'

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

function normalizeDate(value: string | undefined, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim()) ? String(value).trim() : fallback
}

function formatCurrentMonthStart() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).slice(0, 8) + '01'
}

function formatCurrentMonthEnd() {
  const currentMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
  const end = new Date(`${currentMonth}-01T12:00:00Z`)
  end.setUTCMonth(end.getUTCMonth() + 1, 0)
  return end.toISOString().slice(0, 10)
}

export default async function AsignacionesPage({ searchParams }: AsignacionesPageProps) {
  await requerirActorActivo()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}
  const fechaInicio = normalizeDate(pickString(params.fecha_inicio), formatCurrentMonthStart())
  const fechaFin = normalizeDate(pickString(params.fecha_fin), formatCurrentMonthEnd())

  const calendar = await getMaterializedDateRangeCalendar(
    {
      fechaInicio,
      fechaFin,
    },
    supabase
  )

  return (
    <div className="mx-auto max-w-[1680px] px-4 pb-10 pt-24 sm:px-6 lg:px-10 lg:pt-10">
      <AsignacionesHub calendar={calendar} fechaInicio={fechaInicio} fechaFin={fechaFin} />
    </div>
  )
}
