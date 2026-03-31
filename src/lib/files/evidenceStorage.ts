import type { SupabaseClient } from '@supabase/supabase-js'
import type { ArchivoHash } from '@/types/database'
import {
  buildOperationalDocumentUploadLimitMessage,
  exceedsOperationalDocumentUploadLimit,
  optimizeExpedienteDocument,
  type DocumentOptimizationResult,
} from './documentOptimization'
import { computeSHA256 } from './sha256'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type ArchivoHashStorageRow = Pick<
  ArchivoHash,
  | 'id'
  | 'sha256'
  | 'bucket'
  | 'ruta_archivo'
  | 'miniatura_sha256'
  | 'miniatura_bucket'
  | 'miniatura_ruta_archivo'
>

export interface StoredEvidenceAsset {
  url: string
  hash: string
}

export interface StoredEvidenceResult {
  archivo: StoredEvidenceAsset
  miniatura: StoredEvidenceAsset | null
  optimization: DocumentOptimizationResult
  deduplicated: boolean
}

interface StoreOptimizedEvidenceInput {
  service: TypedSupabaseClient
  bucket: string
  actorUsuarioId: string
  storagePrefix: string
  file: File
}

function buildStorageUrl(bucket: string, route: string) {
  return `${bucket}/${route}`
}

export async function storeOptimizedEvidence({
  service,
  bucket,
  actorUsuarioId,
  storagePrefix,
  file,
}: StoreOptimizedEvidenceInput): Promise<StoredEvidenceResult> {
  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('PDF', file))
  }

  const optimization = await optimizeExpedienteDocument({
    buffer: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
  })

  const sha256 = await computeSHA256(optimization.buffer)

  const { data: existingRaw } = await service
    .from('archivo_hash')
    .select(
      'id, sha256, bucket, ruta_archivo, miniatura_sha256, miniatura_bucket, miniatura_ruta_archivo'
    )
    .eq('sha256', sha256)
    .maybeSingle()

  let archivoHash = existingRaw as ArchivoHashStorageRow | null

  if (!archivoHash) {
    const fileRoute = `${storagePrefix}/${sha256}.${optimization.extension}`

    const { error: uploadError } = await service.storage.from(bucket).upload(fileRoute, optimization.buffer, {
      contentType: optimization.mimeType,
      upsert: false,
    })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    let thumbnailPayload: {
      sha256: string
      bucket: string
      route: string
      mimeType: string
      bytes: number
    } | null = null

    if (optimization.thumbnail) {
      const thumbnailSha = await computeSHA256(optimization.thumbnail.buffer)
      const thumbnailRoute = `${storagePrefix}/${sha256}-thumb.${optimization.thumbnail.extension}`

      const { error: thumbnailUploadError } = await service.storage
        .from(bucket)
        .upload(thumbnailRoute, optimization.thumbnail.buffer, {
          contentType: optimization.thumbnail.mimeType,
          upsert: false,
        })

      if (thumbnailUploadError) {
        throw new Error(thumbnailUploadError.message)
      }

      thumbnailPayload = {
        sha256: thumbnailSha,
        bucket,
        route: thumbnailRoute,
        mimeType: optimization.thumbnail.mimeType,
        bytes: optimization.thumbnail.bytes,
      }
    }

    const { data: insertedHashRaw, error: insertHashError } = await service
      .from('archivo_hash')
      .insert({
        sha256,
        bucket,
        ruta_archivo: fileRoute,
        mime_type: optimization.mimeType,
        tamano_bytes: optimization.optimizedBytes,
        miniatura_sha256: thumbnailPayload?.sha256 ?? null,
        miniatura_bucket: thumbnailPayload?.bucket ?? null,
        miniatura_ruta_archivo: thumbnailPayload?.route ?? null,
        miniatura_mime_type: thumbnailPayload?.mimeType ?? null,
        miniatura_tamano_bytes: thumbnailPayload?.bytes ?? null,
        creado_por_usuario_id: actorUsuarioId,
      })
      .select(
        'id, sha256, bucket, ruta_archivo, miniatura_sha256, miniatura_bucket, miniatura_ruta_archivo'
      )
      .maybeSingle()

    if (insertHashError || !insertedHashRaw) {
      throw new Error(insertHashError?.message ?? 'No fue posible registrar el hash del archivo.')
    }

    archivoHash = insertedHashRaw as ArchivoHashStorageRow
  } else if (optimization.thumbnail && !archivoHash.miniatura_ruta_archivo) {
    const thumbnailSha = await computeSHA256(optimization.thumbnail.buffer)
    const thumbnailRoute = `${storagePrefix}/${sha256}-thumb.${optimization.thumbnail.extension}`

    const { error: thumbnailUploadError } = await service
      .storage
      .from(bucket)
      .upload(thumbnailRoute, optimization.thumbnail.buffer, {
        contentType: optimization.thumbnail.mimeType,
        upsert: false,
      })

    if (thumbnailUploadError && !/already exists/i.test(thumbnailUploadError.message)) {
      throw new Error(thumbnailUploadError.message)
    }

    const { error: updateHashError } = await service
      .from('archivo_hash')
      .update({
        miniatura_sha256: thumbnailSha,
        miniatura_bucket: bucket,
        miniatura_ruta_archivo: thumbnailRoute,
        miniatura_mime_type: optimization.thumbnail.mimeType,
        miniatura_tamano_bytes: optimization.thumbnail.bytes,
      })
      .eq('id', archivoHash.id)

    if (updateHashError) {
      throw new Error(updateHashError.message)
    }

    archivoHash = {
      ...archivoHash,
      miniatura_sha256: thumbnailSha,
      miniatura_bucket: bucket,
      miniatura_ruta_archivo: thumbnailRoute,
    }
  }

  return {
    archivo: {
      url: buildStorageUrl(archivoHash.bucket, archivoHash.ruta_archivo),
      hash: archivoHash.sha256,
    },
    miniatura:
      archivoHash.miniatura_bucket && archivoHash.miniatura_ruta_archivo && archivoHash.miniatura_sha256
        ? {
            url: buildStorageUrl(archivoHash.miniatura_bucket, archivoHash.miniatura_ruta_archivo),
            hash: archivoHash.miniatura_sha256,
          }
        : null,
    optimization,
    deduplicated: Boolean(existingRaw),
  }
}
