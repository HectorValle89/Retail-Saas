import { NextResponse } from 'next/server'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { obtenerPanelUsuarios } from '@/features/usuarios/services/usuarioService'
import { readRuntimeEnv } from '@/lib/runtime/env'

export async function GET() {
  try {
    const actor = await requerirAdministradorActivo()
    // Use the request-authenticated client so `auth.uid()` exists for admin session RPCs.
    const supabase = await createClient()
    const data = await obtenerPanelUsuarios(actor, {
      backendAdminConfigurado: Boolean(readRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY')),
    }, supabase)

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de usuarios.',
      },
      { status: 500 }
    )
  }
}
