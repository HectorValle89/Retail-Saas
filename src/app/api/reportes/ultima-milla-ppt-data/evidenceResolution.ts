import type { SupabaseClient } from '@supabase/supabase-js';

import type { ArchivoHash, MaterialEntregaUltimaMillaEvidencia } from '@/types/database';

const EVIDENCE_URL_EXPIRY_SECONDS = 60 * 60;

export type LastMileEvidenceRow = Pick<
  MaterialEntregaUltimaMillaEvidencia,
  | 'entrega_id'
  | 'tipo'
  | 'archivo_hash_id'
  | 'bucket'
  | 'ruta_archivo'
  | 'thumbnail_url'
  | 'capturada_en'
  | 'orden'
  | 'metadata'
>;

type ArchivoHashEvidenceRow = Pick<ArchivoHash, 'id' | 'sha256' | 'bucket' | 'ruta_archivo'>;

export interface EvidenceHashLookup {
  byId: Map<string, ArchivoHashEvidenceRow>;
  bySha256: Map<string, ArchivoHashEvidenceRow>;
}

function isDirectEvidenceUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith('/api/storage/');
}

function pickMetadataString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function buildOrphanRouteCandidates(route: string, capturedAt: string | null) {
  const normalizedRoute = route.trim().replace(/^\/+/, '');
  if (!normalizedRoute || normalizedRoute.startsWith('_orphans/')) {
    return [];
  }

  const parsedDate = capturedAt ? new Date(capturedAt) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return [];
  }

  return Array.from({ length: 8 }, (_, daysAfterCapture) => {
    const day = addDays(parsedDate, daysAfterCapture).toISOString().slice(0, 10);
    return `_orphans/${day}/${normalizedRoute}`;
  });
}

async function signEvidenceStorageRoute(
  service: SupabaseClient,
  bucket: string | null,
  route: string | null,
  capturedAt: string | null = null
) {
  const normalizedBucket = bucket?.trim() ?? '';
  const normalizedRoute = route?.trim() ?? '';

  if (!normalizedBucket || !normalizedRoute) {
    return null;
  }

  const candidateRoutes = [
    normalizedRoute,
    ...buildOrphanRouteCandidates(normalizedRoute, capturedAt),
  ];

  for (const candidateRoute of candidateRoutes) {
    const { data, error } = await service.storage
      .from(normalizedBucket)
      .createSignedUrl(candidateRoute, EVIDENCE_URL_EXPIRY_SECONDS);

    if (!error && data?.signedUrl) {
      return `/api/reportes/imagen-proxy?bucket=${encodeURIComponent(normalizedBucket)}&route=${encodeURIComponent(candidateRoute)}`;
    }
  }

  return null;
}

export async function resolveEvidenceUrl(
  service: SupabaseClient,
  evidence: LastMileEvidenceRow | null,
  hashLookup?: EvidenceHashLookup
) {
  if (!evidence) {
    return null;
  }

  const metadata = evidence.metadata ?? {};
  const archivoUrl = pickMetadataString(metadata, ['archivo_url', 'url', 'storage_url']);
  const archivoHash = pickMetadataString(metadata, ['archivo_hash', 'sha256']);

  if (archivoUrl && isDirectEvidenceUrl(archivoUrl)) {
    return archivoUrl;
  }

  const signedFromColumns = await signEvidenceStorageRoute(
    service,
    evidence.bucket,
    evidence.ruta_archivo,
    evidence.capturada_en
  );

  if (signedFromColumns) {
    return signedFromColumns;
  }

  const hashFromId = evidence.archivo_hash_id
    ? hashLookup?.byId.get(evidence.archivo_hash_id)
    : null;
  const signedFromHashId = hashFromId
    ? await signEvidenceStorageRoute(
        service,
        hashFromId.bucket,
        hashFromId.ruta_archivo,
        evidence.capturada_en
      )
    : null;

  if (signedFromHashId) {
    return signedFromHashId;
  }

  const hashFromMetadata = archivoHash ? hashLookup?.bySha256.get(archivoHash) : null;
  const signedFromMetadataHash = hashFromMetadata
    ? await signEvidenceStorageRoute(
        service,
        hashFromMetadata.bucket,
        hashFromMetadata.ruta_archivo,
        evidence.capturada_en
      )
    : null;

  if (signedFromMetadataHash) {
    return signedFromMetadataHash;
  }

  if (!archivoUrl) {
    return null;
  }

  const [bucket, ...routeParts] = archivoUrl.split('/').filter(Boolean);
  if (!bucket || routeParts.length === 0) {
    return null;
  }

  return signEvidenceStorageRoute(service, bucket, routeParts.join('/'), evidence.capturada_en);
}

export async function buildEvidenceHashLookup(
  service: SupabaseClient,
  evidences: LastMileEvidenceRow[]
): Promise<EvidenceHashLookup> {
  const hashIds = Array.from(
    new Set(
      evidences
        .flatMap((item) => [
          item.archivo_hash_id?.trim() ?? '',
          pickMetadataString(item.metadata ?? {}, ['archivo_hash_id']),
        ])
        .filter((item): item is string => Boolean(item))
    )
  );
  const metadataHashes = Array.from(
    new Set(
      evidences
        .map((item) => {
          const value = item.metadata?.archivo_hash;
          return typeof value === 'string' ? value.trim() : '';
        })
        .filter((item): item is string => Boolean(item))
    )
  );

  if (hashIds.length === 0 && metadataHashes.length === 0) {
    return {
      byId: new Map(),
      bySha256: new Map(),
    };
  }

  let query = service.from('archivo_hash').select('id, sha256, bucket, ruta_archivo');

  if (hashIds.length > 0 && metadataHashes.length > 0) {
    query = query.or(`id.in.(${hashIds.join(',')}),sha256.in.(${metadataHashes.join(',')})`);
  } else if (hashIds.length > 0) {
    query = query.in('id', hashIds);
  } else {
    query = query.in('sha256', metadataHashes);
  }

  const { data, error } = await query;
  const rows = error ? [] : ((data ?? []) as ArchivoHashEvidenceRow[]);

  return {
    byId: new Map(rows.map((item) => [item.id, item])),
    bySha256: new Map(rows.map((item) => [item.sha256, item])),
  };
}

export async function resolveFirstEvidenceUrl(
  service: SupabaseClient,
  evidences: LastMileEvidenceRow[],
  type: LastMileEvidenceRow['tipo'],
  hashLookup: EvidenceHashLookup
) {
  const candidates = evidences
    .filter((item) => item.tipo === type)
    .sort((left, right) => left.orden - right.orden);

  for (const candidate of candidates) {
    const resolved = await resolveEvidenceUrl(service, candidate, hashLookup);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}
