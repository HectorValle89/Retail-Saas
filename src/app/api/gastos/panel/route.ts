import { NextResponse } from 'next/server'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { obtenerPanelGastos } from '@/features/gastos/services/gastoService'

const GASTO_PANEL_ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA'] as const

export async function GET() {
  try {
    const actor = await requerirPuestosActivos([...GASTO_PANEL_ROLES])
    const supabase = await createClient()
    const data = await obtenerPanelGastos(actor, { serviceClient: supabase })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'No fue posible refrescar el panel de gastos.',
      },
      { status: 500 }
    )
  }
}
