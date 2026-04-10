export const runtime = 'edge';
import { requerirPuestosActivos } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { RankingsPanel } from '@/features/rankings/components/RankingsPanel'
import { obtenerPanelRanking } from '@/features/rankings/services/rankingService'
import type { Puesto } from '@/types/database'

export const metadata = {
  title: 'Ranking | Field Force Platform',
}

const RANKING_ROLES = [
  'DERMOCONSEJERO',
  'SUPERVISOR',
  'COORDINADOR',
  'LOVE_IS',
  'VENTAS',
  'ADMINISTRADOR',
  'CLIENTE',
] as const satisfies Puesto[]

interface RankingPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function RankingPage({ searchParams }: RankingPageProps) {
  const actor = await requerirPuestosActivos([...RANKING_ROLES])
  const supabase = await createClient()
  const params = (await searchParams) ?? {}
  const data = await obtenerPanelRanking(actor, supabase, {
    periodo: pickString(params.periodo),
    corte: pickString(params.corte),
    zona: pickString(params.zona),
    supervisorId: pickString(params.supervisorId),
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Control y motivacion
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Ranking</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Vista comparativa por ventas, afiliaciones LOVE ISDIN, zona y supervisor, con snapshot agregado de 15 minutos y lectura compacta para movil.
        </p>
      </header>

      <RankingsPanel data={data} />
    </div>
  )
}
