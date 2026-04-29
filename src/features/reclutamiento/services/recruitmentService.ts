import { type SupabaseClient } from '@supabase/supabase-js'
import { type ActorActual } from '@/lib/auth/session'
import { obtenerPanelEmpleados } from '@/features/empleados/services/empleadoService'

export async function obtenerDashboardReclutamiento(
  actor: ActorActual,
  supabase: SupabaseClient
) {
  // Reuse the existing data fetcher as it already calculates everything we need
  // (Pipeline, Metrics, Coverage)
  const data = await obtenerPanelEmpleados(actor, {
    emitCoverageSideEffects: true,
  }, supabase)

  return data
}
