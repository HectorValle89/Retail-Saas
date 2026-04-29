import { NextRequest, NextResponse } from 'next/server';
import { requerirActorActivo } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { generateR2DownloadUrl, isR2ProxyUrl } from '@/lib/storage/r2Service';

const ATTENDANCE_EVIDENCE_URL_EXPIRY_SECONDS = 60 * 60;

type AttendanceEvidenceRow = {
  id: string;
  cuenta_cliente_id: string;
  empleado_id: string;
  supervisor_empleado_id: string | null;
  selfie_check_in_url: string | null;
  selfie_check_out_url: string | null;
  metadata: Record<string, unknown> | null;
};

type RequestEvidenceRow = {
  id: string;
  cuenta_cliente_id: string;
  empleado_id: string;
  supervisor_empleado_id: string | null;
  justificante_url: string | null;
};

function readAttendanceThumbnailReference(
  attendance: Pick<
    AttendanceEvidenceRow,
    'metadata' | 'selfie_check_in_url' | 'selfie_check_out_url'
  >,
  kind: 'check-in' | 'check-out'
) {
  const fallbackReference =
    kind === 'check-out' ? attendance.selfie_check_out_url : attendance.selfie_check_in_url;

  if (!attendance.metadata || typeof attendance.metadata !== 'object') {
    return fallbackReference;
  }

  const candidate =
    kind === 'check-out'
      ? attendance.metadata['selfie_check_out_thumbnail_url']
      : attendance.metadata['selfie_check_in_thumbnail_url'];
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }

  return fallbackReference;
}

function isActorAllowedToReadAttendance(
  actor: Awaited<ReturnType<typeof requerirActorActivo>>,
  attendance: AttendanceEvidenceRow
) {
  if (actor.puesto === 'DERMOCONSEJERO') {
    return attendance.empleado_id === actor.empleadoId;
  }

  if (actor.puesto === 'SUPERVISOR') {
    return attendance.supervisor_empleado_id === actor.empleadoId;
  }

  if (actor.cuentaClienteId) {
    return attendance.cuenta_cliente_id === actor.cuentaClienteId;
  }

  return true;
}

async function signStorageReference(rawReference: string) {
  const normalized = rawReference.trim();
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
  if (segments.length < 2) {
    return null;
  }

  const [bucket, ...pathSegments] = segments;
  const objectPath = pathSegments.join('/');

  if (bucket === 'CF_R2') {
    return generateR2DownloadUrl(objectPath).catch(() => null);
  }

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(bucket)
    .createSignedUrl(objectPath, ATTENDANCE_EVIDENCE_URL_EXPIRY_SECONDS);

  if (error) {
    return generateR2DownloadUrl(normalized).catch(() => null);
  }

  return data?.signedUrl ?? (await generateR2DownloadUrl(normalized).catch(() => null));
}

function toRedirectUrl(request: NextRequest, url: string) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return new URL(url, request.nextUrl.origin).toString();
}

export async function GET(request: NextRequest) {
  const actor = await requerirActorActivo();
  const attendanceId = request.nextUrl.searchParams.get('attendanceId')?.trim() ?? '';
  const requestId = request.nextUrl.searchParams.get('requestId')?.trim() ?? '';
  const kind = request.nextUrl.searchParams.get('kind')?.trim() ?? 'check-in-thumbnail';

  if (!attendanceId && !requestId) {
    return NextResponse.json(
      { message: 'attendanceId o requestId es requerido.' },
      { status: 400 }
    );
  }

  if (
    kind !== 'check-in' &&
    kind !== 'check-in-thumbnail' &&
    kind !== 'check-out' &&
    kind !== 'check-out-thumbnail' &&
    kind !== 'justificante'
  ) {
    return NextResponse.json({ message: 'kind invalido.' }, { status: 400 });
  }

  const service = createServiceClient();
  let rawReference: string | null = null;

  if (kind === 'justificante') {
    const { data, error } = await service
      .from('solicitud')
      .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, justificante_url')
      .eq('id', requestId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ message: 'Solicitud no encontrada.' }, { status: 404 });
    }

    const solicitud = data as RequestEvidenceRow;
    if (
      (actor.puesto === 'DERMOCONSEJERO' && solicitud.empleado_id !== actor.empleadoId) ||
      (actor.puesto === 'SUPERVISOR' && solicitud.supervisor_empleado_id !== actor.empleadoId) ||
      (actor.cuentaClienteId && solicitud.cuenta_cliente_id !== actor.cuentaClienteId)
    ) {
      return NextResponse.json(
        { message: 'No tienes permiso para ver esta evidencia.' },
        { status: 403 }
      );
    }

    rawReference = solicitud.justificante_url;
  } else {
    const { data, error } = await service
      .from('asistencia')
      .select(
        'id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, selfie_check_in_url, selfie_check_out_url, metadata'
      )
      .eq('id', attendanceId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ message: 'Asistencia no encontrada.' }, { status: 404 });
    }

    const attendance = data as AttendanceEvidenceRow;

    if (!isActorAllowedToReadAttendance(actor, attendance)) {
      return NextResponse.json(
        { message: 'No tienes permiso para ver esta evidencia.' },
        { status: 403 }
      );
    }

    rawReference =
      kind === 'check-in'
        ? attendance.selfie_check_in_url
        : kind === 'check-out'
          ? attendance.selfie_check_out_url
          : kind === 'check-out-thumbnail'
            ? readAttendanceThumbnailReference(attendance, 'check-out')
            : readAttendanceThumbnailReference(attendance, 'check-in');
  }

  if (!rawReference) {
    return NextResponse.json(
      { message: 'La asistencia no tiene selfie disponible.' },
      { status: 404 }
    );
  }

  const signedUrl = await signStorageReference(rawReference);
  if (!signedUrl) {
    return NextResponse.json({ message: 'No fue posible preparar la selfie.' }, { status: 404 });
  }

  return NextResponse.redirect(toRedirectUrl(request, signedUrl), {
    status: 307,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
