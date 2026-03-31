'use server'

import { revalidatePath } from 'next/cache'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { EXPEDIENTE_RAW_UPLOAD_MAX_BYTES } from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { computeSHA256 } from '@/lib/files/sha256'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Puesto } from '@/types/database'
import { ESTADO_LOVE_ISDIN_INICIAL, type LoveIsdinActionState } from './state'
import { assignAvailableLoveQrToEmployee, processLoveQrImportBatch } from './lib/loveQrImport'
import {
  registerLoveAffiliationWithService,
  resolveLoveEffectiveAccount,
  registrarLoveAuditEvent,
} from './lib/loveRegistration'

const LOVE_WRITE_ROLES = [
  'ADMINISTRADOR',
  'LOVE_IS',
  'SUPERVISOR',
  'COORDINADOR',
  'DERMOCONSEJERO',
] as const satisfies Puesto[]

const LOVE_BUCKET = 'operacion-evidencias'
const LOVE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const LOVE_IMPORTS_BUCKET = 'love-isdin-imports'
const LOVE_IMPORT_ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
] as const
const LOVE_IMPORT_MAX_BYTES = 25 * 1024 * 1024
const LOVE_ADMIN_ROLES = ['ADMINISTRADOR', 'LOVE_IS', 'COORDINADOR'] as const satisfies Puesto[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type LoveEvidenceUpload = {
  url: string
  hash: string
  thumbnailUrl: string | null
  thumbnailHash: string | null
  optimization: {
    kind: string
    originalBytes: number
    finalBytes: number
    targetMet: boolean
    notes: string[]
    officialAssetKind: 'optimized' | 'original'
  }
}

function buildState(partial: Partial<LoveIsdinActionState>): LoveIsdinActionState {
  return {
    ...ESTADO_LOVE_ISDIN_INICIAL,
    ...partial,
  }
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }

  return normalized
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function asUploadedFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
    return null
  }

  return value
}

async function ensureBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(LOVE_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: LOVE_ALLOWED_MIME_TYPES,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

async function ensureImportBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(LOVE_IMPORTS_BUCKET, {
    public: false,
    fileSizeLimit: `${LOVE_IMPORT_MAX_BYTES}`,
    allowedMimeTypes: [...LOVE_IMPORT_ALLOWED_MIME_TYPES],
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

function validateLoveImportFile(
  file: File,
  {
    label,
    extensions,
  }: {
    label: string
    extensions: string[]
  }
) {
  if (file.size > LOVE_IMPORT_MAX_BYTES) {
    throw new Error(`${label} excede el limite operativo de 25 MB.`)
  }

  const lowerName = file.name.toLowerCase()
  const matchesExtension = extensions.some((extension) => lowerName.endsWith(extension))

  if (!matchesExtension) {
    throw new Error(`${label} debe tener formato ${extensions.join(', ')}.`)
  }
}

async function uploadLoveImportFile(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    actorUsuarioId,
    prefix,
    file,
    bytes,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    prefix: string
    file: File
    bytes?: Buffer
  }
) {
  await ensureImportBucket(service)
  const uploadBytes = bytes ?? Buffer.from(await file.arrayBuffer())
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'bin' : 'bin'
  const route = `${cuentaClienteId}/${actorUsuarioId}/${prefix}-${Date.now()}.${extension}`
  const { error } = await service.storage.from(LOVE_IMPORTS_BUCKET).upload(route, uploadBytes, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })

  if (error) {
    throw new Error(error.message)
  }

  return route
}

async function uploadLoveEvidence(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    empleadoId,
    file,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    empleadoId: string
    file: File
  }
): Promise<LoveEvidenceUpload> {
  if (file.size > EXPEDIENTE_RAW_UPLOAD_MAX_BYTES) {
    throw new Error('La evidencia excede el limite operativo de 12 MB antes de optimizar.')
  }

  if (!LOVE_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('La evidencia debe ser una imagen JPEG, PNG o WEBP.')
  }

  await ensureBucket(service)
  const stored = await storeOptimizedEvidence({
    service,
    bucket: LOVE_BUCKET,
    actorUsuarioId,
    storagePrefix: `love-isdin/${cuentaClienteId}/${empleadoId}`,
    file,
  })

  return {
    url: stored.archivo.url,
    hash: stored.archivo.hash,
    thumbnailUrl: stored.miniatura?.url ?? null,
    thumbnailHash: stored.miniatura?.hash ?? null,
    optimization: {
      kind: stored.optimization.optimizationKind,
      originalBytes: stored.optimization.originalBytes,
      finalBytes: stored.optimization.optimizedBytes,
      targetMet: stored.optimization.targetMet,
      notes: stored.optimization.notes,
      officialAssetKind: stored.optimization.officialAssetKind,
    },
  }
}

export async function registrarAfiliacionLoveIsdin(
  _prevState: LoveIsdinActionState,
  formData: FormData
): Promise<LoveIsdinActionState> {
  try {
    const actor = await requerirPuestosActivos(LOVE_WRITE_ROLES)
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const empleadoId = normalizeOptionalText(formData.get('empleado_id')) ?? actor.empleadoId
    const pdvId = normalizeRequiredText(formData.get('pdv_id'), 'PDV')
    const asistenciaId = normalizeOptionalText(formData.get('asistencia_id'))
    const afiliadoNombre = normalizeRequiredText(formData.get('afiliado_nombre'), 'Afiliado')
    const afiliadoContacto = normalizeOptionalText(formData.get('afiliado_contacto'))
    const ticketFolio = normalizeOptionalText(formData.get('ticket_folio'))
    const fechaUtc = normalizeOptionalText(formData.get('fecha_utc')) ?? new Date().toISOString()
    const evidencia = asUploadedFile(formData.get('evidencia'))

    const evidenciaUpload = evidencia
      ? await uploadLoveEvidence(service, {
          actorUsuarioId: actor.usuarioId,
          cuentaClienteId,
          empleadoId,
          file: evidencia,
        })
      : null

    const result = await registerLoveAffiliationWithService(service, {
      cuentaClienteId,
      empleadoId,
      pdvId,
      asistenciaId,
      afiliadoNombre,
      afiliadoContacto,
      ticketFolio,
      fechaUtc,
      origen: 'ONLINE',
      evidenciaUrl: evidenciaUpload?.url ?? null,
      evidenciaHash: evidenciaUpload?.hash ?? null,
      evidenciaThumbnailUrl: evidenciaUpload?.thumbnailUrl ?? null,
      evidenciaThumbnailHash: evidenciaUpload?.thumbnailHash ?? null,
      evidenciaOptimization: evidenciaUpload?.optimization ?? null,
      metadata: {
        capturado_desde: 'panel_love_isdin',
        actor_puesto: actor.puesto,
        evidencia: Boolean(evidenciaUpload),
        periodo_operativo: fechaUtc.slice(0, 7),
      },
    })

    await registrarLoveAuditEvent(service, {
      cuentaClienteId: result.context.cuentaClienteId,
      actorUsuarioId: actor.usuarioId,
      registroId: result.id,
      payload: {
        evento: 'love_isdin_registrado',
        afiliado_nombre: afiliadoNombre,
        empleado_id: result.context.empleadoId,
        pdv_id: result.context.pdvId,
        qr_personal: result.context.qr.codigo,
        qr_codigo_id: result.context.qr.codigoId,
        qr_asignacion_id: result.context.qr.asignacionId,
        asistencia_id: result.context.attendanceId,
        evidencia: Boolean(evidenciaUpload),
      },
    })

    revalidatePath('/love-isdin')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')

    return buildState({
      ok: true,
      message: result.inserted
        ? 'Afiliacion LOVE ISDIN registrada.'
        : 'Ya existia una captura LOVE ISDIN para este cliente en la fecha operativa. Se mantuvo el registro previo.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la afiliacion.',
    })
  }
}

export async function registrarCargaMasivaQrIncremental(
  _prevState: LoveIsdinActionState,
  formData: FormData
): Promise<LoveIsdinActionState> {
  let lotId: string | null = null
  let lotAccountId: string | null = null

  try {
    const actor = await requerirPuestosActivos(LOVE_ADMIN_ROLES)
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaSolicitada = normalizeOptionalText(formData.get('cuenta_cliente_id'))
    const manifiesto = asUploadedFile(formData.get('manifiesto_qr'))
    const zip = asUploadedFile(formData.get('imagenes_zip'))

    if (!manifiesto) {
      throw new Error('El manifiesto de QR es obligatorio.')
    }

    if (!zip) {
      throw new Error('El archivo ZIP con las imagenes QR es obligatorio.')
    }

    validateLoveImportFile(manifiesto, {
      label: 'El manifiesto',
      extensions: ['.xlsx', '.xls', '.csv'],
    })
    validateLoveImportFile(zip, {
      label: 'El ZIP de imagenes',
      extensions: ['.zip'],
    })

    const cuenta = await resolveLoveEffectiveAccount(service, cuentaSolicitada ?? actor.cuentaClienteId ?? null)
    lotAccountId = cuenta.id
    const importedAt = new Date().toISOString().slice(0, 10)
    const [manifiestoBytes, zipBytes] = await Promise.all([
      Buffer.from(await manifiesto.arrayBuffer()),
      Buffer.from(await zip.arrayBuffer()),
    ])
    const manifiestoHash = await computeSHA256(manifiestoBytes)
    const [manifiestoPath, zipPath] = await Promise.all([
      uploadLoveImportFile(service, {
        cuentaClienteId: cuenta.id,
        actorUsuarioId: actor.usuarioId,
        prefix: 'manifiesto-qr',
        file: manifiesto,
        bytes: manifiestoBytes,
      }),
      uploadLoveImportFile(service, {
        cuentaClienteId: cuenta.id,
        actorUsuarioId: actor.usuarioId,
        prefix: 'imagenes-qr',
        file: zip,
        bytes: zipBytes,
      }),
    ])

    const { data: loteInsertado, error: loteError } = await service
      .from('love_isdin_qr_import_lote')
      .insert({
        cuenta_cliente_id: cuenta.id,
        archivo_nombre: manifiesto.name,
        archivo_hash: manifiestoHash,
        estado: 'BORRADOR_PREVIEW',
        metadata: {
          tipo_carga: 'INCREMENTAL',
          manifiesto_path: manifiestoPath,
          manifiesto_nombre: manifiesto.name,
          manifiesto_bytes: manifiesto.size,
          zip_path: zipPath,
          zip_nombre: zip.name,
          zip_bytes: zip.size,
          cargado_por_usuario_id: actor.usuarioId,
          actor_puesto: actor.puesto,
          imported_at: importedAt,
          qr_tiff_auto_convert: true,
        },
        resumen: {
          manifiesto_nombre: manifiesto.name,
          zip_nombre: zip.name,
          manifiesto_hash: manifiestoHash,
        },
        advertencias: [],
      })
      .select('id')
      .maybeSingle()

    if (loteError || !loteInsertado) {
      throw new Error(loteError?.message ?? 'No fue posible registrar el lote QR.')
    }
    lotId = loteInsertado.id as string

    const processed = await processLoveQrImportBatch(service, {
      cuentaClienteId: cuenta.id,
      actorUsuarioId: actor.usuarioId,
      manifestBuffer: manifiestoBytes,
      manifestFileName: manifiesto.name,
      zipBuffer: zipBytes,
      imageBucket: LOVE_BUCKET,
      importLoteId: lotId,
      importedAt,
    })

    const finalMetadata = {
      tipo_carga: 'INCREMENTAL',
      manifiesto_path: manifiestoPath,
      manifiesto_nombre: manifiesto.name,
      manifiesto_bytes: manifiesto.size,
      zip_path: zipPath,
      zip_nombre: zip.name,
      zip_bytes: zip.size,
      cargado_por_usuario_id: actor.usuarioId,
      actor_puesto: actor.puesto,
      imported_at: importedAt,
      qr_tiff_auto_convert: true,
      sheet_name: processed.sheetName,
      warning_count: processed.warningCount,
      error_count: processed.errorCount,
      rows_prepared: processed.rowsPrepared,
      processed: processed.applied,
    }
    const finalResumen = processed.applied
      ? {
          manifiesto_nombre: manifiesto.name,
          zip_nombre: zip.name,
          manifiesto_hash: manifiestoHash,
          rows_prepared: processed.rowsPrepared,
          processed_count: processed.result?.processedCount ?? 0,
          active_count: processed.result?.activeCount ?? 0,
          available_count: processed.result?.availableCount ?? 0,
          blocked_count: processed.result?.blockedCount ?? 0,
          baja_count: processed.result?.bajaCount ?? 0,
          inserted_codes: processed.result?.insertedCodes ?? 0,
          updated_codes: processed.result?.updatedCodes ?? 0,
          activated_assignments: processed.result?.activatedAssignments ?? 0,
          closed_assignments: processed.result?.closedAssignments ?? 0,
          converted_from_tiff_count: processed.result?.convertedFromTiffCount ?? 0,
        }
      : {
          manifiesto_nombre: manifiesto.name,
          zip_nombre: zip.name,
          manifiesto_hash: manifiestoHash,
          rows_prepared: processed.rowsPrepared,
          error_count: processed.errorCount,
        }

    const { error: updateLotError } = await service
      .from('love_isdin_qr_import_lote')
      .update({
        estado: processed.applied ? 'CONFIRMADO' : 'CANCELADO',
        metadata: finalMetadata,
        resumen: finalResumen,
        advertencias: processed.warnings,
        confirmado_por_usuario_id: processed.applied ? actor.usuarioId : null,
        confirmado_en: processed.applied ? new Date().toISOString() : null,
      })
      .eq('id', lotId)

    if (updateLotError) {
      throw new Error(updateLotError.message)
    }

    await service.from('audit_log').insert({
      cuenta_cliente_id: cuenta.id,
      actor_usuario_id: actor.usuarioId,
      tabla: 'love_isdin_qr_import_lote',
      registro_id: lotId,
      accion: processed.applied ? 'IMPORT' : 'RECHAZADA',
      payload: {
        evento: processed.applied
          ? 'love_isdin_qr_import_lote_confirmado'
          : 'love_isdin_qr_import_lote_cancelado',
        tipo_carga: 'INCREMENTAL',
        manifiesto_nombre: manifiesto.name,
        zip_nombre: zip.name,
        rows_prepared: processed.rowsPrepared,
        warning_count: processed.warningCount,
        error_count: processed.errorCount,
        processed_count: processed.result?.processedCount ?? 0,
        activated_assignments: processed.result?.activatedAssignments ?? 0,
        converted_from_tiff_count: processed.result?.convertedFromTiffCount ?? 0,
      },
    })

    revalidatePath('/love-isdin')
    revalidatePath('/dashboard')
    revalidatePath('/love-isdin/qr-template')

    if (!processed.applied) {
      const firstErrors = processed.warnings
        .filter((warning) => warning.severity === 'error')
        .slice(0, 3)
        .map((warning) => warning.message)
        .join(' ')

      return buildState({
        message:
          firstErrors ||
          'La carga masiva se cancelo porque el manifiesto o el ZIP traen errores operativos.',
      })
    }

    return buildState({
      ok: true,
      message: `Carga QR aplicada. ${processed.result?.activeCount ?? 0} QR activos quedaron listos para dashboard y se convirtieron ${processed.result?.convertedFromTiffCount ?? 0} imagenes TIFF/TIF.`,
    })
  } catch (error) {
    if (lotId && lotAccountId) {
      const message = error instanceof Error ? error.message : 'No fue posible procesar la carga masiva incremental.'
      await createServiceClient()
        .from('love_isdin_qr_import_lote')
        .update({
          estado: 'CANCELADO',
          advertencias: [
            {
              code: 'unexpected_import_failure',
              severity: 'error',
              message,
              rowNumber: null,
            },
          ],
          metadata: {
            failure_stage: 'registrarCargaMasivaQrIncremental',
          },
          resumen: {
            error: message,
          },
        })
        .eq('id', lotId)
    }

    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la carga masiva incremental.',
    })
  }
}

export async function asignarQrDisponibleLoveIsdin(
  _prevState: LoveIsdinActionState,
  formData: FormData
): Promise<LoveIsdinActionState> {
  try {
    const actor = await requerirPuestosActivos(LOVE_ADMIN_ROLES)
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaSolicitada = normalizeOptionalText(formData.get('cuenta_cliente_id'))
    const qrCodigoId = normalizeRequiredText(formData.get('qr_codigo_id'), 'QR disponible')
    const empleadoId = normalizeRequiredText(formData.get('empleado_id'), 'Dermoconsejera')
    const motivo = normalizeOptionalText(formData.get('motivo')) ?? 'ASIGNACION_NUEVA_CONTRATACION'
    const observaciones = normalizeOptionalText(formData.get('observaciones'))
    const fechaInicio = normalizeOptionalText(formData.get('fecha_inicio')) ?? new Date().toISOString().slice(0, 10)
    const cuenta = await resolveLoveEffectiveAccount(service, cuentaSolicitada ?? actor.cuentaClienteId ?? null)

    const assigned = await assignAvailableLoveQrToEmployee(service, {
      cuentaClienteId: cuenta.id,
      actorUsuarioId: actor.usuarioId,
      qrCodigoId,
      empleadoId,
      assignedAt: fechaInicio,
      motivo,
      observaciones,
    })

    await service.from('audit_log').insert({
      tabla: 'love_isdin_qr_asignacion',
      registro_id: assigned.assignmentId,
      accion: 'EVENTO',
      payload: {
        evento: 'love_isdin_qr_asignado_manualmente',
        qr_codigo_id: assigned.qrCodigoId,
        qr_codigo: assigned.codigo,
        empleado_id: assigned.empleadoId,
        empleado_nombre: assigned.empleadoNombre,
        fecha_inicio: assigned.fechaInicio,
        motivo,
        observaciones,
      },
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: cuenta.id,
    })

    revalidatePath('/love-isdin')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: `QR ${assigned.codigo} asignado a ${assigned.empleadoNombre}.`,
    })
  } catch (error) {
    return buildState({
      ok: false,
      message: error instanceof Error ? error.message : 'No fue posible asignar el QR disponible.',
    })
  }
}
