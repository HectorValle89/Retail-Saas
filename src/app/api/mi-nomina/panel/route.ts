import { NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { obtenerRecibosNominaEmpleado } from '@/features/nomina/services/nominaReceiptService'

export async function GET() {
  try {
    const actor = await requerirActorActivo()
    const supabase = await createClient()
    const data = await obtenerRecibosNominaEmpleado(actor, {
      empleadoId: actor.empleadoId,
      serviceClient: supabase,
    })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'No fue posible refrescar mi nomina.' },
      { status: 500 }
    )
  }
}
