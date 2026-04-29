import { requerirPuestosActivos } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import { obtenerDashboardReclutamiento } from '@/features/reclutamiento/services/recruitmentService'
import { RecruitmentShell } from '@/features/reclutamiento/components/RecruitmentShell'
import type { Puesto } from '@/types/database'

export const metadata = {
  title: 'Reclutamiento | Beteele One',
}

export default async function ReclutamientoPage() {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO', 'COORDINADOR'])
  const serviceSupabase = createServiceClient()
  const data = await obtenerDashboardReclutamiento(actor, serviceSupabase)

  return (
    <div className="page-shell max-w-7xl">
      <header className="page-hero mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="page-hero-eyebrow">
              {actor.puesto === 'ADMINISTRADOR' ? 'ISDIN' : 'Operaciones'}
            </p>
            <h1 className="page-hero-title">Gestión de Reclutamiento</h1>
            <p className="page-hero-copy max-w-3xl">
              Pipeline centralizado de candidatos, validación de expedientes y onboarding operativo.
            </p>
          </div>
        </div>
      </header>

      <RecruitmentShell 
        data={data} 
        actorPuesto={actor.puesto as Puesto} 
      />
    </div>
  )
}
