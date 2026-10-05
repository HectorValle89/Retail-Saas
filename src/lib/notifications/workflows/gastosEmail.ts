import 'server-only';
import { TypedSupabaseClient, createServiceClient } from '@/lib/supabase/server';
import { sendWorkflowTransitionEmail } from '../workflowTransitionEmail';
import { getCoordinadoresYAdmin, getEmpleadoEmail } from './recipientLookup';

import { readAppUrl } from '@/lib/runtime/env';

const getAppUrl = () => readAppUrl();

export async function notificarGastoReportado(
  supabase: TypedSupabaseClient,
  params: {
    empleadoNombre: string;
    montoTotal: number;
    fecha: string;
    cuentaClienteId: string | null;
  }
) {
  const service = createServiceClient();
  const recipients = await getCoordinadoresYAdmin(service, params.cuentaClienteId);
  if (recipients.length === 0) return;

  await sendWorkflowTransitionEmail({
    recipients,
    subject: `Nuevo reporte de gastos de ${params.empleadoNombre}`,
    body: `${params.empleadoNombre} reportó gastos por $${params.montoTotal} el ${params.fecha}.`,
    ctaLabel: 'Revisar gastos',
    ctaUrl: `${getAppUrl()}/gastos`,
  });
}

export async function notificarGastoResuelto(
  supabase: TypedSupabaseClient,
  params: {
    empleadoId: string;
    adminNombre: string;
    monto: number;
    fecha: string;
    aprobado: boolean;
    nota?: string;
  }
) {
  const service = createServiceClient();
  const recipient = await getEmpleadoEmail(service, params.empleadoId);
  if (!recipient) return;

  const subject = params.aprobado
    ? 'Tu reporte de gasto fue aprobado'
    : 'Tu reporte de gasto fue rechazado';

  const body = params.aprobado
    ? `Tu reporte de gasto por $${params.monto} del ${params.fecha} fue aprobado por ${params.adminNombre}.`
    : `Tu reporte de gasto por $${params.monto} del ${params.fecha} fue rechazado. ${params.nota ? `Motivo: ${params.nota}` : ''}`;

  await sendWorkflowTransitionEmail({
    recipients: [recipient],
    subject,
    body,
    ctaLabel: 'Ver mis gastos',
    ctaUrl: `${getAppUrl()}/gastos`,
  });
}
