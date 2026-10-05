import 'server-only';
import { TypedSupabaseClient, createServiceClient } from '@/lib/supabase/server';
import {
  getCoordinadoresYAdmin,
  getSupervisorEmail,
  getSupervisoresEmail,
} from './recipientLookup';
import {
  buildAgendaEventoCreadoNotification,
  buildAgendaEventoResueltoNotification,
  buildCambioRutaResueltoNotification,
  buildCambioRutaSolicitadoNotification,
  buildRutaSemanalAprobadaNotification,
  buildRutaSemanalEnviadaNotification,
  buildRutaMensualEnviadaNotification,
  buildRutaSemanalRechazadaNotification,
  buildRutasMesGestionadasNotification,
  buildRutaMensualCambiosSolicitadosNotification,
} from './workflowCatalog';
import { sendWorkflowNotification } from './workflowFanout';
import type { WorkflowNotificationRecipient } from './types';
import type { WorkflowNotificationEnvelope } from './workflowCatalog';

async function persistWorkflowInboxNotification(
  supabase: TypedSupabaseClient,
  recipients: WorkflowNotificationRecipient[],
  envelope: WorkflowNotificationEnvelope,
  cuentaClienteId: string | null
) {
  const recipientEmployeeIds = Array.from(
    new Set(
      recipients
        .map((recipient) => recipient.empleadoId?.trim())
        .filter((id): id is string => Boolean(id))
    )
  );

  if (!cuentaClienteId || recipientEmployeeIds.length === 0) {
    return;
  }

  const { data: message, error: messageError } = await supabase
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: cuentaClienteId,
      creado_por_usuario_id: null,
      titulo: envelope.title,
      cuerpo: envelope.body,
      tipo: 'MENSAJE',
      grupo_destino: 'PUESTO',
      zona: null,
      supervisor_empleado_id: null,
      opciones_respuesta: [],
      metadata: {
        workflow: envelope.workflow,
        ctaLabel: envelope.ctaLabel ?? null,
        ctaUrl: envelope.ctaUrl ?? null,
        pushPath: envelope.pushPath ?? null,
        ...(envelope.data ?? {}),
      },
    })
    .select('id')
    .maybeSingle();

  if (messageError || !message?.id) {
    throw new Error(messageError?.message ?? 'No fue posible crear la notificacion interna.');
  }

  const { error: receptorError } = await supabase.from('mensaje_receptor').insert(
    recipientEmployeeIds.map((empleadoId) => ({
      mensaje_id: message.id,
      cuenta_cliente_id: cuentaClienteId,
      empleado_id: empleadoId,
      estado: 'PENDIENTE',
      metadata: {
        workflow: envelope.workflow,
      },
    }))
  );

  if (receptorError) {
    throw new Error(receptorError.message);
  }
}

async function deliverRutaWorkflowNotification(
  _supabase: TypedSupabaseClient,
  recipients: WorkflowNotificationRecipient[],
  envelope: WorkflowNotificationEnvelope,
  cuentaClienteId: string | null
) {
  const service = createServiceClient();
  await persistWorkflowInboxNotification(service, recipients, envelope, cuentaClienteId);
  await sendWorkflowNotification(recipients, envelope);
}

export async function notificarRutaEnviada(
  supabase: TypedSupabaseClient,
  params: {
    supervisorNombre: string;
    supervisorId: string;
    semana: string;
    cuentaClienteId: string | null;
    totalTiendas: number;
    totalDias: number;
  }
) {
  const service = createServiceClient();
  const recipients = await getCoordinadoresYAdmin(service, params.cuentaClienteId);
  if (recipients.length === 0) return;

  await deliverRutaWorkflowNotification(
    supabase,
    recipients,
    buildRutaSemanalEnviadaNotification(params),
    params.cuentaClienteId
  );
}

export async function notificarRutaMensualEnviada(
  supabase: TypedSupabaseClient,
  params: {
    supervisorNombre: string;
    supervisorId: string;
    month: string;
    cuentaClienteId: string | null;
    totalVisitas: number;
    totalDias: number;
  }
) {
  const service = createServiceClient();
  const recipients = await getCoordinadoresYAdmin(service, params.cuentaClienteId);
  if (recipients.length === 0) return;

  await deliverRutaWorkflowNotification(
    supabase,
    recipients,
    buildRutaMensualEnviadaNotification(params),
    params.cuentaClienteId
  );
}

export async function notificarRutaAprobada(
  supabase: TypedSupabaseClient,
  params: {
    supervisorId: string;
    coordinadorNombre: string;
    semana: string;
  }
) {
  const service = createServiceClient();
  const recipient = await getSupervisorEmail(service, params.supervisorId);
  if (!recipient) return;

  await deliverRutaWorkflowNotification(
    supabase,
    [recipient],
    buildRutaSemanalAprobadaNotification(params),
    recipient.cuentaClienteId ?? null
  );
}

export async function notificarRutaRechazada(
  supabase: TypedSupabaseClient,
  params: {
    supervisorId: string;
    coordinadorNombre: string;
    semana: string;
    nota: string;
  }
) {
  const service = createServiceClient();
  const recipient = await getSupervisorEmail(service, params.supervisorId);
  if (!recipient) return;

  await deliverRutaWorkflowNotification(
    supabase,
    [recipient],
    buildRutaSemanalRechazadaNotification(params),
    recipient.cuentaClienteId ?? null
  );
}

export async function notificarRutasMesGestionadas(
  supabase: TypedSupabaseClient,
  params: {
    supervisorIds: string[];
    actorNombre: string;
    month: string;
    action: 'APROBAR' | 'LIBERAR';
    cuentaClienteId: string;
  }
) {
  const service = createServiceClient();
  const recipients = await getSupervisoresEmail(
    service,
    params.supervisorIds,
    params.cuentaClienteId
  );
  if (recipients.length === 0) return;

  await deliverRutaWorkflowNotification(
    supabase,
    recipients,
    buildRutasMesGestionadasNotification(params),
    params.cuentaClienteId
  );
}

export async function notificarRutaMensualCambiosSolicitados(
  supabase: TypedSupabaseClient,
  params: {
    supervisorId: string;
    actorNombre: string;
    month: string;
    nota: string;
    cuentaClienteId: string;
  }
) {
  const service = createServiceClient();
  const recipient = await getSupervisorEmail(service, params.supervisorId);
  if (!recipient) return;

  await deliverRutaWorkflowNotification(
    supabase,
    [recipient],
    buildRutaMensualCambiosSolicitadosNotification(params),
    params.cuentaClienteId
  );
}

export async function notificarCambioRutaSolicitado(
  supabase: TypedSupabaseClient,
  params: {
    rutaId: string;
    supervisorNombre: string;
    dia: string;
    nota: string;
    cuentaClienteId: string | null;
  }
) {
  const service = createServiceClient();
  const recipients = await getCoordinadoresYAdmin(service, params.cuentaClienteId);
  if (recipients.length === 0) return;

  await deliverRutaWorkflowNotification(
    supabase,
    recipients,
    buildCambioRutaSolicitadoNotification(params),
    params.cuentaClienteId
  );
}

export async function notificarCambioRutaResuelto(
  supabase: TypedSupabaseClient,
  params: {
    supervisorId: string;
    coordinadorNombre: string;
    dia: string;
    aprobado: boolean;
    nota?: string;
  }
) {
  const service = createServiceClient();
  const recipient = await getSupervisorEmail(service, params.supervisorId);
  if (!recipient) return;

  await deliverRutaWorkflowNotification(
    supabase,
    [recipient],
    buildCambioRutaResueltoNotification(params),
    recipient.cuentaClienteId ?? null
  );
}

// Agenda Operativa

export async function notificarAgendaEventoCreado(
  supabase: TypedSupabaseClient,
  params: {
    eventoId: string;
    supervisorNombre: string;
    tipo: string;
    fecha: string;
    cuentaClienteId: string | null;
  }
) {
  const service = createServiceClient();
  const recipients = await getCoordinadoresYAdmin(service, params.cuentaClienteId);
  if (recipients.length === 0) return;

  await deliverRutaWorkflowNotification(
    supabase,
    recipients,
    buildAgendaEventoCreadoNotification(params),
    params.cuentaClienteId
  );
}

export async function notificarAgendaEventoResuelto(
  supabase: TypedSupabaseClient,
  params: {
    supervisorId: string;
    coordinadorNombre: string;
    titulo: string;
    fecha: string;
    aprobado: boolean;
    nota?: string;
  }
) {
  const service = createServiceClient();
  const recipient = await getSupervisorEmail(service, params.supervisorId);
  if (!recipient) return;

  await deliverRutaWorkflowNotification(
    supabase,
    [recipient],
    buildAgendaEventoResueltoNotification(params),
    recipient.cuentaClienteId ?? null
  );
}
