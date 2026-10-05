import type { SupabaseClient } from '@supabase/supabase-js';
import { buildR2ProxyUrl } from '@/lib/storage/r2Service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;

export interface DirectR2Reference {
  objectKey: string | null;
  sha256: string | null;
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
}

export interface DirectR2ManifestReference {
  objectKey: string;
  sha256: string;
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  metadata?: Record<string, unknown> | null;
}

export function readDirectR2Reference(formData: FormData, prefix?: string): DirectR2Reference {
  const keyPrefix = prefix ? `${prefix}_` : '';

  return {
    objectKey: (formData.get(`${keyPrefix}r2_object_key`) as string | null) ?? null,
    sha256: (formData.get(`${keyPrefix}r2_sha256`) as string | null) ?? null,
    fileName: (formData.get(`${keyPrefix}r2_file_name`) as string | null) ?? null,
    contentType: (formData.get(`${keyPrefix}r2_type`) as string | null) ?? null,
    size: Number(formData.get(`${keyPrefix}r2_size`) ?? 0),
  };
}

export function hasDirectR2Reference(reference: DirectR2Reference) {
  return Boolean(reference.objectKey && reference.sha256);
}

export function readDirectR2Manifest(formData: FormData, fieldName: string) {
  const raw = String(formData.get(fieldName) ?? '').trim();
  if (!raw) {
    return [] as DirectR2ManifestReference[];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`El manifiesto ${fieldName} no es valido.`);
  }

  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    )
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
    .filter((item) => Boolean(item.objectKey) && Boolean(item.sha256));
}

export async function registerDirectR2Evidence(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    actorAuthUserId,
    modulo,
    referenciaEntidadId,
    reference,
  }: {
    actorUsuarioId: string;
    actorAuthUserId?: string | null;
    modulo: string;
    referenciaEntidadId: string;
    reference: DirectR2Reference;
  }
) {
  if (!reference.objectKey || !reference.sha256) {
    throw new Error('La referencia R2 esta incompleta.');
  }

  const fileSizeBytes = Number(reference.size ?? 0);

  // Resolve auth_user_id (for auth.users FK in archivo_referencia)
  // and usuario_id (for public.usuario FK in archivo_hash)
  let resolvedAuthUserId: string | null = actorAuthUserId ?? null;
  let resolvedUsuarioId: string | null = actorUsuarioId ?? null;

  if (!resolvedAuthUserId && actorUsuarioId) {
    const { data: userRow } = await service
      .from('usuario')
      .select('id, auth_user_id')
      .or(`id.eq.${actorUsuarioId},auth_user_id.eq.${actorUsuarioId}`)
      .maybeSingle();

    if (userRow) {
      resolvedAuthUserId = userRow.auth_user_id ?? null;
      resolvedUsuarioId = userRow.id ?? actorUsuarioId;
    }
  }

  // 1. Insert into archivo_referencia (resilient to FK / duplicate issues)
  try {
    const { error: referenceError } = await service.from('archivo_referencia').insert({
      modulo,
      referencia_entidad_id: referenciaEntidadId,
      r2_object_key: reference.objectKey,
      content_type: reference.contentType ?? null,
      file_size_bytes: fileSizeBytes > 0 ? fileSizeBytes : null,
      creado_por: resolvedAuthUserId,
    });

    if (referenceError) {
      // If foreign key constraint on creado_por fails, retry with creado_por = null
      if (referenceError.code === '23503' || /foreign key/i.test(referenceError.message)) {
        await service.from('archivo_referencia').insert({
          modulo,
          referencia_entidad_id: referenciaEntidadId,
          r2_object_key: reference.objectKey,
          content_type: reference.contentType ?? null,
          file_size_bytes: fileSizeBytes > 0 ? fileSizeBytes : null,
          creado_por: null,
        });
      } else if (referenceError.code !== '23505') {
        // Log non-duplicate errors without breaking evidence flow
        console.warn('[registerDirectR2Evidence] non-fatal reference insert error:', referenceError.message);
      }
    }
  } catch (err) {
    console.warn('[registerDirectR2Evidence] caught reference insert exception:', err);
  }

  // 2. Consolidate into archivo_hash
  const { data: existingHash, error: existingHashError } = await service
    .from('archivo_hash')
    .select('id')
    .eq('sha256', reference.sha256)
    .maybeSingle();

  if (existingHashError) {
    console.warn('[registerDirectR2Evidence] hash query warning:', existingHashError.message);
  }

  let archivoHashId = existingHash?.id ?? null;

  if (!archivoHashId) {
    const { data: insertedHash, error: hashError } = await service
      .from('archivo_hash')
      .insert({
        sha256: reference.sha256,
        bucket: 'CF_R2',
        ruta_archivo: reference.objectKey,
        mime_type: reference.contentType ?? null,
        tamano_bytes: fileSizeBytes > 0 ? fileSizeBytes : null,
        creado_por_usuario_id: resolvedUsuarioId,
      })
      .select('id')
      .maybeSingle();

    if (hashError && (hashError.code === '23503' || /foreign key/i.test(hashError.message))) {
      // Retry without usuario_id if FK fails
      const { data: retryInserted } = await service
        .from('archivo_hash')
        .insert({
          sha256: reference.sha256,
          bucket: 'CF_R2',
          ruta_archivo: reference.objectKey,
          mime_type: reference.contentType ?? null,
          tamano_bytes: fileSizeBytes > 0 ? fileSizeBytes : null,
          creado_por_usuario_id: null,
        })
        .select('id')
        .maybeSingle();
      archivoHashId = retryInserted?.id ?? null;
    } else if (insertedHash?.id) {
      archivoHashId = insertedHash.id;
    }

    if (!archivoHashId) {
      // Fallback lookup in case of race condition
      const { data: recheckHash } = await service
        .from('archivo_hash')
        .select('id')
        .eq('sha256', reference.sha256)
        .maybeSingle();
      archivoHashId = recheckHash?.id ?? null;
    }
  }

  return {
    archivoHashId,
    url: buildR2ProxyUrl(reference.objectKey),
    hash: reference.sha256,
    fileName: reference.fileName ?? 'r2_upload',
    contentType: reference.contentType ?? null,
    size: fileSizeBytes,
  };
}

export async function registerDirectR2EvidenceList(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    modulo,
    referenciaEntidadId,
    references,
  }: {
    actorUsuarioId: string;
    modulo: string;
    referenciaEntidadId: string;
    references: DirectR2ManifestReference[];
  }
) {
  return Promise.all(
    references.map(async (reference) => {
      const registered = await registerDirectR2Evidence(service, {
        actorUsuarioId,
        modulo,
        referenciaEntidadId,
        reference,
      });

      return {
        ...registered,
        metadata: reference.metadata ?? null,
      };
    })
  );
}
