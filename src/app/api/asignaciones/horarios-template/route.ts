export const runtime = 'edge';
import { NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import {
  buildAssignmentWeeklyScheduleTemplateWorkbook,
  getAssignmentWeeklyScheduleTemplateFilename,
} from '@/features/asignaciones/lib/assignmentWeeklyScheduleTemplate'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_ROLES = ['ADMINISTRADOR'] as const

export async function GET() {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA' || !ALLOWED_ROLES.some((role) => role === actor.puesto)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const bytes = buildAssignmentWeeklyScheduleTemplateWorkbook()

    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${getAssignmentWeeklyScheduleTemplateFilename()}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible generar la plantilla semanal de horarios.' },
      { status: 500 }
    )
  }
}

