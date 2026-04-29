import { requerirActorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { obtenerRecibosNominaEmpleado } from '@/features/nomina/services/nominaReceiptService'
import { MiNominaPanel } from '@/features/nomina/components/MiNominaPanel'

export const metadata = {
  title: 'Mi nomina | Field Force Platform',
}

export default async function MiNominaPage() {
  const actor = await requerirActorActivo()
  const supabase = await createClient()
  const recibos = await obtenerRecibosNominaEmpleado(actor, {
    empleadoId: actor.empleadoId,
    serviceClient: supabase,
  })

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-28 lg:px-10 lg:pt-10">
      <MiNominaPanel actor={actor} data={recibos} />
    </div>
  )
}
