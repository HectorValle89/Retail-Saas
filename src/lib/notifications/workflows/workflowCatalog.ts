import { readAppUrl } from '@/lib/runtime/env'

const getAppUrl = () => readAppUrl()

export interface WorkflowNotificationEnvelope {
  workflow: string
  title: string
  body: string
  ctaLabel?: string
  ctaUrl?: string | null
  pushTitle?: string
  pushBody?: string
  pushPath?: string
  pushTag?: string
  data?: Record<string, unknown>
}

function routeWeeklyEnvelope(params: {
  workflow: string
  title: string
  body: string
  ctaLabel: string
  ctaUrl: string
  pushTitle?: string
  pushBody?: string
  pushPath?: string
  pushTag: string
  data?: Record<string, unknown>
}): WorkflowNotificationEnvelope {
  return {
    workflow: params.workflow,
    title: params.title,
    body: params.body,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
    pushTitle: params.pushTitle ?? params.title,
    pushBody: params.pushBody ?? params.body,
    pushPath: params.pushPath ?? new URL(params.ctaUrl).pathname + new URL(params.ctaUrl).search,
    pushTag: params.pushTag,
    data: params.data,
  }
}

export function buildNuevoCandidatoCoordinacionNotification(params: {
  empleadoId: string
  nombreCompleto: string
}): WorkflowNotificationEnvelope {
  return {
    workflow: 'empleados_nuevo_candidato_coordinacion',
    title: 'Nuevo candidato pendiente de aprobacion',
    body: `${params.nombreCompleto} ya quedo en la etapa Nuevos despues de subir su CV. Revisa la ficha para validar el PDV sugerido y continuar con la entrevista.`,
    ctaLabel: 'Abrir candidato',
    ctaUrl: `${getAppUrl()}/empleados`,
    pushTitle: 'Nuevo candidato pendiente de aprobacion',
    pushBody: `${params.nombreCompleto} ya quedo en Nuevos y espera validacion de Coordinacion.`,
    pushPath: '/empleados',
    pushTag: `empleado-nuevo-coordinacion-${params.empleadoId}`,
    data: {
      empleadoId: params.empleadoId,
      etapa: 'NUEVOS',
    },
  }
}

export function buildRutaSemanalEnviadaNotification(params: {
  supervisorNombre: string
  supervisorId: string
  semana: string
  cuentaClienteId: string | null
  totalTiendas: number
  totalDias: number
}): WorkflowNotificationEnvelope {
  return routeWeeklyEnvelope({
    workflow: 'ruta_enviada_coordinacion',
    title: `Nueva ruta semanal de ${params.supervisorNombre} — semana ${params.semana}`,
    body: `El supervisor ${params.supervisorNombre} envió su ruta semanal para la semana del ${params.semana} a coordinación. Total ${params.totalTiendas} tiendas en ${params.totalDias} días.`,
    ctaLabel: 'Revisar ruta',
    ctaUrl: `${getAppUrl()}/ruta-semanal?supervisor=${params.supervisorId}&semana=${params.semana}`,
    pushPath: `/ruta-semanal?supervisor=${params.supervisorId}&semana=${params.semana}`,
    pushTag: `ruta-semanal-enviada-${params.supervisorId}-${params.semana}`,
    data: {
      supervisorId: params.supervisorId,
      semana: params.semana,
      cuentaClienteId: params.cuentaClienteId,
      totalTiendas: params.totalTiendas,
      totalDias: params.totalDias,
    },
  })
}

export function buildRutaSemanalAprobadaNotification(params: {
  supervisorId: string
  coordinadorNombre: string
  semana: string
}): WorkflowNotificationEnvelope {
  return routeWeeklyEnvelope({
    workflow: 'ruta_aprobada',
    title: 'Tu ruta semanal fue aprobada',
    body: `Tu ruta de la semana del ${params.semana} fue aprobada por ${params.coordinadorNombre}. Ya puedes comenzar a ejecutarla.`,
    ctaLabel: 'Ver mi ruta',
    ctaUrl: `${getAppUrl()}/ruta-semanal`,
    pushPath: '/ruta-semanal',
    pushTag: `ruta-semanal-aprobada-${params.supervisorId}-${params.semana}`,
    data: {
      supervisorId: params.supervisorId,
      semana: params.semana,
    },
  })
}

export function buildRutaSemanalRechazadaNotification(params: {
  supervisorId: string
  coordinadorNombre: string
  semana: string
  nota: string
}): WorkflowNotificationEnvelope {
  return routeWeeklyEnvelope({
    workflow: 'ruta_rechazada',
    title: 'Tu ruta semanal requiere cambios',
    body: `Tu ruta de la semana del ${params.semana} fue devuelta por ${params.coordinadorNombre}. Motivo: ${params.nota}`,
    ctaLabel: 'Revisar y reenviar',
    ctaUrl: `${getAppUrl()}/ruta-semanal`,
    pushPath: '/ruta-semanal',
    pushTag: `ruta-semanal-rechazada-${params.supervisorId}-${params.semana}`,
    data: {
      supervisorId: params.supervisorId,
      semana: params.semana,
      nota: params.nota,
    },
  })
}

export function buildCambioRutaSolicitadoNotification(params: {
  rutaId: string
  supervisorNombre: string
  dia: string
  nota: string
  cuentaClienteId: string | null
}): WorkflowNotificationEnvelope {
  return routeWeeklyEnvelope({
    workflow: 'ruta_cambio_solicitado',
    title: `Solicitud de cambio de ruta — ${params.supervisorNombre}`,
    body: `${params.supervisorNombre} solicitó un cambio en su ruta del día ${params.dia}. Motivo: ${params.nota}`,
    ctaLabel: 'Revisar cambio',
    ctaUrl: `${getAppUrl()}/ruta-semanal?ruta=${params.rutaId}&cambio=pendiente`,
    pushPath: `/ruta-semanal?ruta=${params.rutaId}&cambio=pendiente`,
    pushTag: `ruta-cambio-solicitado-${params.rutaId}`,
    data: {
      rutaId: params.rutaId,
      dia: params.dia,
      nota: params.nota,
      cuentaClienteId: params.cuentaClienteId,
    },
  })
}

export function buildCambioRutaResueltoNotification(params: {
  supervisorId: string
  coordinadorNombre: string
  dia: string
  aprobado: boolean
  nota?: string
}): WorkflowNotificationEnvelope {
  const subject = params.aprobado ? 'Tu solicitud de cambio fue aprobada' : 'Tu solicitud de cambio fue rechazada'
  const body = params.aprobado
    ? `El cambio solicitado para el día ${params.dia} fue aprobado por ${params.coordinadorNombre}.`
    : `Tu solicitud de cambio para el día ${params.dia} fue rechazada. ${params.nota ? `Motivo: ${params.nota}` : ''}`

  return routeWeeklyEnvelope({
    workflow: params.aprobado ? 'ruta_cambio_aprobado' : 'ruta_cambio_rechazado',
    title: subject,
    body,
    ctaLabel: params.aprobado ? 'Ver ruta actualizada' : 'Ver detalles',
    ctaUrl: `${getAppUrl()}/ruta-semanal`,
    pushPath: '/ruta-semanal',
    pushTag: `ruta-cambio-resuelto-${params.supervisorId}-${params.dia}`,
    data: {
      supervisorId: params.supervisorId,
      dia: params.dia,
      aprobado: params.aprobado,
      nota: params.nota ?? null,
    },
  })
}

export function buildAgendaEventoCreadoNotification(params: {
  eventoId: string
  supervisorNombre: string
  tipo: string
  fecha: string
  cuentaClienteId: string | null
}): WorkflowNotificationEnvelope {
  return routeWeeklyEnvelope({
    workflow: 'agenda_evento_creado',
    title: `Nuevo evento operativo pendiente — ${params.supervisorNombre}`,
    body: `${params.supervisorNombre} registró un evento de tipo ${params.tipo} para el ${params.fecha}. Requiere aprobación.`,
    ctaLabel: 'Revisar evento',
    ctaUrl: `${getAppUrl()}/ruta-semanal?evento=${params.eventoId}`,
    pushPath: `/ruta-semanal?evento=${params.eventoId}`,
    pushTag: `ruta-agenda-creado-${params.eventoId}`,
    data: {
      eventoId: params.eventoId,
      tipo: params.tipo,
      fecha: params.fecha,
      cuentaClienteId: params.cuentaClienteId,
    },
  })
}

export function buildAgendaEventoResueltoNotification(params: {
  supervisorId: string
  coordinadorNombre: string
  titulo: string
  fecha: string
  aprobado: boolean
  nota?: string
}): WorkflowNotificationEnvelope {
  const subject = params.aprobado ? 'Tu evento fue aprobado' : 'Tu evento requiere ajustes'
  const body = params.aprobado
    ? `El evento '${params.titulo}' del ${params.fecha} fue aprobado por ${params.coordinadorNombre}.`
    : `El evento '${params.titulo}' del ${params.fecha} fue devuelto. ${params.nota ? `Motivo: ${params.nota}` : ''}`

  return routeWeeklyEnvelope({
    workflow: params.aprobado ? 'agenda_evento_aprobado' : 'agenda_evento_rechazado',
    title: subject,
    body,
    ctaLabel: 'Ver agenda',
    ctaUrl: `${getAppUrl()}/ruta-semanal`,
    pushPath: '/ruta-semanal',
    pushTag: `ruta-agenda-resuelto-${params.supervisorId}-${params.titulo}`,
    data: {
      supervisorId: params.supervisorId,
      titulo: params.titulo,
      fecha: params.fecha,
      aprobado: params.aprobado,
      nota: params.nota ?? null,
    },
  })
}
