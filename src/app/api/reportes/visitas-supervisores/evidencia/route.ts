import { NextRequest, NextResponse } from 'next/server';

import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { generateR2DownloadUrl, isR2ProxyUrl } from '@/lib/storage/r2Service';

const VISITA_EVIDENCIA_URL_EXPIRY_SECONDS = 60 * 60;

type VisitaEvidenciaRow = {
  id: string;
  cuenta_cliente_id: string;
  supervisor_empleado_id: string | null;
  selfie_hash: string | null;
  selfie_url: string | null;
  evidencia_hash: string | null;
  evidencia_url: string | null;
};

type ArchivoHashEvidenciaRow = {
  bucket: string;
  ruta_archivo: string | null;
};

function pickString(value: string | null) {
  return value?.trim() || undefined;
}

async function signStorageReference(
  service: ReturnType<typeof createServiceClient>,
  bucket: string,
  route: string
) {
  const normalizedBucket = bucket.trim();
  const normalizedRoute = route.trim();

  if (!normalizedBucket || !normalizedRoute) {
    return null;
  }

  if (normalizedBucket === 'CF_R2') {
    return generateR2DownloadUrl(normalizedRoute).catch(() => null);
  }

  const { data, error } = await service.storage
    .from(normalizedBucket)
    .createSignedUrl(normalizedRoute, VISITA_EVIDENCIA_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

async function resolveEvidenciaUrl(
  service: ReturnType<typeof createServiceClient>,
  rawReference: string | null,
  hash: string | null
) {
  const normalized = rawReference?.trim() ?? '';

  if (hash) {
    const { data, error } = await service
      .from('archivo_hash')
      .select('bucket, ruta_archivo')
      .eq('sha256', hash)
      .maybeSingle();

    if (!error && data) {
      const archivo = data as ArchivoHashEvidenciaRow;
      const signedFromHash = await signStorageReference(
        service,
        archivo.bucket,
        archivo.ruta_archivo ?? ''
      );
      if (signedFromHash) {
        return signedFromHash;
      }
    }
  }

  if (!normalized) {
    return null;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (isR2ProxyUrl(normalized)) {
    return normalized;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const [bucket, ...pathSegments] = segments;
    const signedFromStorage = await signStorageReference(service, bucket, pathSegments.join('/'));
    if (signedFromStorage) {
      return signedFromStorage;
    }
  }

  return generateR2DownloadUrl(normalized).catch(() => null);
}

function toRedirectUrl(request: NextRequest, url: string) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return new URL(url, request.nextUrl.origin).toString();
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);
    const visitId = pickString(request.nextUrl.searchParams.get('visitId'));
    const kind = pickString(request.nextUrl.searchParams.get('kind')) ?? 'selfie';

    if (!visitId) {
      return NextResponse.json({ message: 'visitId es requerido.' }, { status: 400 });
    }

    if (kind !== 'selfie' && kind !== 'evidencia') {
      return NextResponse.json({ message: 'kind invalido.' }, { status: 400 });
    }

    const service = createServiceClient();
    const { data, error } = await service
      .from('ruta_semanal_visita')
      .select(
        'id, cuenta_cliente_id, supervisor_empleado_id, selfie_hash, selfie_url, evidencia_hash, evidencia_url'
      )
      .eq('id', visitId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ message: 'La visita no fue encontrada.' }, { status: 404 });
    }

    const row = data as VisitaEvidenciaRow;

    if (actor.cuentaClienteId && row.cuenta_cliente_id !== actor.cuentaClienteId) {
      return NextResponse.json(
        { message: 'No tienes permiso para ver esta evidencia.' },
        { status: 403 }
      );
    }

    const rawReference = kind === 'selfie' ? row.selfie_url : row.evidencia_url;
    const hash = kind === 'selfie' ? row.selfie_hash : row.evidencia_hash;

    const signedUrl = await resolveEvidenciaUrl(service, rawReference, hash);
    if (!signedUrl) {
      return NextResponse.json(
        { message: 'La visita no tiene evidencia disponible.' },
        { status: 404 }
      );
    }

    return NextResponse.redirect(toRedirectUrl(request, signedUrl), {
      status: 307,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible abrir la evidencia de la visita.',
      },
      { status: 500 }
    );
  }
}
