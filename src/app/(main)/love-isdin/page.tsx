export const runtime = 'edge';
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { LoveIsdinPanel } from '@/features/love-isdin/components/LoveIsdinPanel'
import { obtenerPanelLoveIsdin } from '@/features/love-isdin/services/loveIsdinService'

export const metadata = {
  title: 'LOVE ISDIN | Field Force Platform',
}

interface LoveIsdinPageProps {
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

export default async function LoveIsdinPage({ searchParams }: LoveIsdinPageProps) {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const service = createServiceClient()
  const params = (await searchParams) ?? {}
  const data = await obtenerPanelLoveIsdin(supabase, {
    actor,
    serviceClient: service,
    page: parsePositiveInt(pickString(params.page), 1),
    pageSize: parsePositiveInt(pickString(params.pageSize), 50),
  })

  return (
    <div className="page-shell max-w-7xl">
      <header className="page-hero mb-6">
        <p className="page-hero-eyebrow">
          Ejecucion diaria
        </p>
        <h1 className="page-hero-title">LOVE ISDIN</h1>
        <p className="page-hero-copy max-w-3xl">
          Captura y trazabilidad de afiliaciones ligadas a PDV, promotora y contexto operativo.
        </p>
      </header>

      <LoveIsdinPanel data={data} />
    </div>
  )
}

