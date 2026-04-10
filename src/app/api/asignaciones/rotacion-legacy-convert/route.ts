export const runtime = 'edge';
import { NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import {
  convertPdvRotationLegacyWorkbook,
  getPdvRotationLegacyOutputFilename,
  ISDIN_POR_CUBRIR_MANUAL_PAIRS,
} from '@/features/asignaciones/lib/pdvRotationLegacyWorkbook'
import { buildPdvRotationProposalWorkbook } from '@/features/asignaciones/lib/pdvRotationTemplate'
import { parsePdvRotationCatalogWorkbook } from '@/features/asignaciones/lib/pdvRotationCatalogImport'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_ROLES = ['ADMINISTRADOR'] as const

async function getAccountIdentifier(actor: Awaited<ReturnType<typeof obtenerActorActual>>) {
  if (!actor?.cuentaClienteId) {
    return 'ISDIN'
  }

  const service = createServiceClient() as any
  const { data, error } = await service
    .from('cuenta_cliente')
    .select('identificador, nombre')
    .eq('id', actor.cuentaClienteId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data?.identificador ?? data?.nombre ?? 'ISDIN'
}

export async function POST(request: Request) {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA' || !ALLOWED_ROLES.some((role) => role === actor.puesto)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const uploadedFile = formData.get('legacy_rotacion_file')

    if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
      return NextResponse.json({ error: 'Adjunta un archivo XLSX legacy para convertir.' }, { status: 400 })
    }

    if (!uploadedFile.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ error: 'El archivo legacy debe estar en formato XLSX.' }, { status: 400 })
    }

    const accountIdentifier = await getAccountIdentifier(actor)
    const buffer = Buffer.from(await uploadedFile.arrayBuffer())
    const converted = convertPdvRotationLegacyWorkbook(buffer, {
      accountIdentifier,
      manualPairs: ISDIN_POR_CUBRIR_MANUAL_PAIRS,
    })

    if (converted.issues.some((issue) => issue.severity === 'ERROR')) {
      return NextResponse.json(
        {
          error: 'El archivo legacy no pudo convertirse completamente.',
          summary: converted.summary,
          issues: converted.issues,
        },
        { status: 422 }
      )
    }

    const bytes = buildPdvRotationProposalWorkbook(converted.rows)
    const parsed = parsePdvRotationCatalogWorkbook(bytes)

    if (parsed.issues.some((issue) => issue.severity === 'ERROR') || parsed.rows.length !== converted.rows.length) {
      return NextResponse.json(
        {
          error: 'La validacion final del archivo convertido no paso el contrato oficial.',
          summary: converted.summary,
          issues: [...converted.issues, ...parsed.issues],
        },
        { status: 422 }
      )
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${getPdvRotationLegacyOutputFilename()}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible convertir el archivo legacy de rotacion.' },
      { status: 500 }
    )
  }
}
