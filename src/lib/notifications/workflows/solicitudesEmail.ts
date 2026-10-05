import 'server-only';
import { TypedSupabaseClient, createServiceClient } from '@/lib/supabase/server';
import { sendWorkflowTransitionEmail } from '../workflowTransitionEmail';
import { getCoordinadoresYAdmin, getEmpleadoEmail } from './recipientLookup';

import { readAppUrl } from '@/lib/runtime/env';

const getAppUrl = () => readAppUrl();

export async function notificarSolicitudCreada(
  supabase: TypedSupabaseClient,
  params: {
    empleadoNombre: string;
    puesto: string;
    tipo: string;
    resumen: string;
    cuentaClienteId: string | null;
  }
) {
  const service = createServiceClient();
  const recipients = await getCoordinadoresYAdmin(service, params.cuentaClienteId);
  if (recipients.length === 0) return;

  await sendWorkflowTransitionEmail({
    recipients,
    subject: `Nueva solicitud de ${params.empleadoNombre} — ${params.tipo}`,
    body: `${params.empleadoNombre} (${params.puesto}) creó una solicitud de tipo ${params.tipo}. Detalle: ${params.resumen}`,
    ctaLabel: 'Revisar solicitud',
    ctaUrl: `${getAppUrl()}/solicitudes`,
  });
}

export async function notificarSolicitudResuelta(
  supabase: TypedSupabaseClient,
  params: {
    empleadoId: string;
    adminNombre: string;
    tipo: string;
    fecha: string;
    aprobado: boolean;
    nota?: string;
  }
) {
  const service = createServiceClient();
  const recipient = await getEmpleadoEmail(service, params.empleadoId);
  if (!recipient) return;

  const subject = params.aprobado ? 'Tu solicitud fue aprobada' : 'Tu solicitud fue rechazada';

  const body = params.aprobado
    ? `Tu solicitud de ${params.tipo} del ${params.fecha} fue aprobada por ${params.adminNombre}.`
    : `Tu solicitud de ${params.tipo} del ${params.fecha} fue rechazada. ${params.nota ? `Motivo: ${params.nota}` : ''}`;

  await sendWorkflowTransitionEmail({
    recipients: [recipient],
    subject,
    body,
    ctaLabel: 'Ver solicitudes',
    ctaUrl: `${getAppUrl()}/solicitudes`,
  });
}
