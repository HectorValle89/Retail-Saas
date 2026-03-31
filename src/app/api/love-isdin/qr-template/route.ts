import { NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import {
  buildLoveQrImportTemplateWorkbook,
  getLoveQrImportTemplateFilename,
} from '@/features/love-isdin/lib/loveQrImportTemplate'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_ROLES = ['ADMINISTRADOR', 'LOVE_IS', 'COORDINADOR'] as const

export async function GET() {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA' || !ALLOWED_ROLES.some((role) => role === actor.puesto)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const bytes = buildLoveQrImportTemplateWorkbook()

    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${getLoveQrImportTemplateFilename()}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible generar la plantilla QR.' },
      { status: 500 }
    )
  }
}
