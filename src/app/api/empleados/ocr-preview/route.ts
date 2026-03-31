import { NextResponse } from 'next/server'
import {
  buildOperationalDocumentUploadLimitMessage,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { performConfiguredDocumentOcr } from '@/lib/ocr/gemini'
import { createServiceClient } from '@/lib/supabase/server'
import { obtenerActorActual } from '@/lib/auth/session'
import {
  OCR_MODEL_CONFIG_KEY,
  OCR_PROVIDER_CONFIG_KEY,
} from '@/features/configuracion/configuracionCatalog'
import { buildEmpleadoOcrSnapshot } from '@/features/empleados/lib/ocrMapping'

function countRecognizedSnapshotFields(snapshot: ReturnType<typeof buildEmpleadoOcrSnapshot>) {
  return [
    snapshot.nombreCompleto,
    snapshot.curp,
    snapshot.rfc,
    snapshot.nss,
    snapshot.puestoDetectado,
    snapshot.direccion,
    snapshot.codigoPostal,
    snapshot.telefono,
    snapshot.correoElectronico,
    snapshot.fechaIngreso,
    snapshot.fechaNacimiento,
    snapshot.edad,
    snapshot.aniosLaborando,
    snapshot.sexo,
    snapshot.estadoCivil,
    snapshot.originario,
    snapshot.fuenteDireccion,
  ].filter((value) => value !== null && value !== '').length
}

export async function POST(request: Request) {
  try {
    const actor = await obtenerActorActual()

    if (!actor) {
      return NextResponse.json({ message: 'Sesion no disponible.' }, { status: 401 })
    }

    if (!['ADMINISTRADOR', 'RECLUTAMIENTO'].includes(actor.puesto)) {
      return NextResponse.json({ message: 'No autorizado para preanalizar expedientes.' }, { status: 403 })
    }

    const formData = await request.formData()
    const expedienteFile = formData.get('expediente_pdf')

    if (!(expedienteFile instanceof File) || expedienteFile.size <= 0) {
      return NextResponse.json(
        { message: 'Adjunta el expediente completo en PDF antes de analizar.' },
        { status: 400 }
      )
    }

    if (expedienteFile.type !== 'application/pdf') {
      return NextResponse.json(
        { message: 'El expediente inicial debe cargarse como PDF.' },
        { status: 400 }
      )
    }

    if (exceedsOperationalDocumentUploadLimit(expedienteFile)) {
      return NextResponse.json(
        {
          message: buildOperationalDocumentUploadLimitMessage('expediente', expedienteFile),
        },
        { status: 400 }
      )
    }

    const originalBuffer = Buffer.from(await expedienteFile.arrayBuffer())

    const service = createServiceClient()
    const { data, error } = await service
      .from('configuracion')
      .select('clave, valor')
      .in('clave', [OCR_PROVIDER_CONFIG_KEY, OCR_MODEL_CONFIG_KEY])

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 })
    }

    const rows = Array.isArray(data) ? data : []
    const providerRow = rows.find((item) => item.clave === OCR_PROVIDER_CONFIG_KEY)
    const modelRow = rows.find((item) => item.clave === OCR_MODEL_CONFIG_KEY)

    const ocr = await performConfiguredDocumentOcr({
      buffer: originalBuffer,
      mimeType: expedienteFile.type || 'application/octet-stream',
      fileName: expedienteFile.name,
      expectedDocumentType: 'EXPEDIENTE_COMPLETO',
      providerOverride: String(providerRow?.valor ?? '').trim() || null,
      modelOverride: String(modelRow?.valor ?? '').trim() || null,
    })
    const snapshot = buildEmpleadoOcrSnapshot(ocr.result)
    const recognizedFields = countRecognizedSnapshotFields(snapshot)
    const resultMessage =
      ocr.result.errorMessage ??
      ocr.result.confidenceSummary ??
      (recognizedFields > 0
        ? `OCR detecto ${recognizedFields} campo(s) utiles del expediente.`
        : 'OCR no detecto campos utiles en el expediente. Revisa calidad, orientacion o legibilidad del PDF.')

    if (recognizedFields === 0 && ocr.result.status !== 'ok') {
      return NextResponse.json(
        {
          ok: false,
          message: resultMessage,
          ocrProvider: ocr.provider,
          snapshot,
          result: ocr.result,
          recognizedFields,
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: resultMessage,
      ocrProvider: ocr.provider,
      snapshot,
      result: ocr.result,
      recognizedFields,
    })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible analizar el expediente en este momento.',
      },
      { status: 500 }
    )
  }
}
