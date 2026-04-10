import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

export interface DirectR2Reference {
  objectKey: string | null
  sha256: string | null
  fileName?: string | null
  contentType?: string | null
  size?: number | null
}

export interface DirectR2ManifestReference {
  objectKey: string
  sha256: string
  fileName?: string | null
  contentType?: string | null
  size?: number | null
  metadata?: Record<string, unknown> | null
}

export function readDirectR2Reference(formData: FormData, prefix?: string): DirectR2Reference {
  const keyPrefix = prefix ? `${prefix}_` : ''

  return {
    objectKey: (formData.get(`${keyPrefix}r2_object_key`) as string | null) ?? null,
    sha256: (formData.get(`${keyPrefix}r2_sha256`) as string | null) ?? null,
    fileName: (formData.get(`${keyPrefix}r2_file_name`) as string | null) ?? null,
    contentType: (formData.get(`${keyPrefix}r2_type`) as string | null) ?? null,
    size: Number(formData.get(`${keyPrefix}r2_size`) ?? 0),
  }
}

export function hasDirectR2Reference(reference: DirectR2Reference) {
  return Boolean(reference.objectKey && reference.sha256)
}

export function readDirectR2Manifest(formData: FormData, fieldName: string) {
  const raw = String(formData.get(fieldName) ?? '').trim()
  if (!raw) {
    return [] as DirectR2ManifestReference[]
  }

  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error(`El manifiesto ${fieldName} no es valido.`)
  }

  return parsed
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      objectKey: String(item.objectKey ?? '').trim(),
      sha256: String(item.sha256 ?? '').trim(),
      fileName: typeof item.fileName === 'string' ? item.fileName : null,
      contentType: typeof item.contentType === 'string' ? item.contentType : null,
      size: typeof item.size === 'number' ? item.size : Number(item.size ?? 0),
      metadata:
        item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : null,
    }))
    .filter((item) => Boolean(item.objectKey) && Boolean(item.sha256))
}

export async function registerDirectR2Evidence(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    modulo,
    referenciaEntidadId,
    reference,
  }: {
    actorUsuarioId: string
    modulo: string
    referenciaEntidadId: string
    reference: DirectR2Reference
  }
) {
  if (!reference.objectKey || !reference.sha256) {
    throw new Error('La referencia R2 esta incompleta.')
  }

  const fileSizeBytes = Number(reference.size ?? 0)

  const { error: referenceError } = await service.from('archivo_referencia').insert({
    modulo,
    referencia_entidad_id: referenciaEntidadId,
    r2_object_key: reference.objectKey,
    content_type: reference.contentType ?? null,
    file_size_bytes: fileSizeBytes > 0 ? fileSizeBytes : null,
    creado_por: actorUsuarioId,
  })

  if (referenceError) {
    throw new Error(referenceError.message)
  }

  const { data: existingHash, error: existingHashError } = await service
    .from('archivo_hash')
    .select('id')
    .eq('sha256', reference.sha256)
    .maybeSingle()

  if (existingHashError) {
    throw new Error(existingHashError.message)
  }

  let archivoHashId = existingHash?.id ?? null

  if (!archivoHashId) {
    const { data: insertedHash, error: hashError } = await service
      .from('archivo_hash')
      .insert({
        sha256: reference.sha256,
        bucket: 'CF_R2',
        ruta_archivo: reference.objectKey,
        mime_type: reference.contentType ?? null,
        tamano_bytes: fileSizeBytes > 0 ? fileSizeBytes : null,
        creado_por_usuario_id: actorUsuarioId,
      })
      .select('id')
      .maybeSingle()

    if (hashError || !insertedHash?.id) {
      throw new Error(hashError?.message ?? 'No fue posible consolidar el hash del archivo R2.')
    }

    archivoHashId = insertedHash.id
  }

  return {
    archivoHashId,
    url: reference.objectKey,
    hash: reference.sha256,
    fileName: reference.fileName ?? 'r2_upload',
    contentType: reference.contentType ?? null,
    size: fileSizeBytes,
  }
}

export async function registerDirectR2EvidenceList(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    modulo,
    referenciaEntidadId,
    references,
  }: {
    actorUsuarioId: string
    modulo: string
    referenciaEntidadId: string
    references: DirectR2ManifestReference[]
  }
) {
  return Promise.all(
    references.map(async (reference) => {
      const registered = await registerDirectR2Evidence(service, {
        actorUsuarioId,
        modulo,
        referenciaEntidadId,
        reference,
      })

      return {
        ...registered,
        metadata: reference.metadata ?? null,
      }
    })
  )
}
