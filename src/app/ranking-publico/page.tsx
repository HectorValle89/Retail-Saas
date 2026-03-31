import type { ActorActual } from '@/lib/auth/session'
import { obtenerClienteAdmin } from '@/lib/auth/admin'
import { PublicRankingsPanel } from '@/features/rankings/components/PublicRankingsPanel'
import { buildPublicRankingPanel, obtenerPanelRanking } from '@/features/rankings/services/rankingService'

export const metadata = {
  title: 'Ranking Publico | Field Force Platform',
}

interface RankingPublicPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

const PUBLIC_ACTOR: ActorActual = {
  authUserId: 'public-ranking',
  usuarioId: 'public-ranking',
  empleadoId: 'public-ranking',
  cuentaClienteId: null,
  username: 'public-ranking',
  correoElectronico: 'public-ranking@localhost',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Public Ranking',
  puesto: 'ADMINISTRADOR',
}

export default async function RankingPublicPage({ searchParams }: RankingPublicPageProps) {
  const { service, error } = obtenerClienteAdmin()
  if (!service) {
    throw new Error(error ?? 'No fue posible cargar el ranking publico.')
  }

  const params = (await searchParams) ?? {}
  const privateData = await obtenerPanelRanking(PUBLIC_ACTOR, service, {
    periodo: pickString(params.periodo),
    corte: pickString(params.corte),
  })
  const data = buildPublicRankingPanel(privateData)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#d9ecff_0%,_#f7fbff_45%,_#eef3f8_100%)]">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <PublicRankingsPanel data={data} />
      </div>
    </div>
  )
}
