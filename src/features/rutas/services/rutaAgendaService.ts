import {
  formatAgendaDateLabel,
  getAgendaImpactLabel,
  getAgendaTypeLabel,
  isApprovedAgendaEvent,
  normalizeAgendaEventType,
  normalizeAgendaExecutionState,
  normalizeAgendaImpactMode,
  normalizeReposicionClasificacion,
  normalizeReposicionEstado,
  parseRutaAgendaEventMetadata,
  type RutaAgendaApprovalState,
  type RutaAgendaEventType,
  type RutaAgendaExecutionState,
  type RutaAgendaImpactMode,
} from '../lib/routeAgenda'

export interface RutaAgendaBaseVisitInput {
  id: string
  rutaId: string
  pdvId: string
  pdv: string | null
  zona: string | null
  diaSemana: number
  diaLabel: string
  orden: number
  estatus: 'PLANIFICADA' | 'COMPLETADA' | 'CANCELADA'
  checkInAt: string | null
  checkOutAt: string | null
  comentarios: string | null
  completadaEn: string | null
}

export interface RutaAgendaEventRecord {
  id: string
  rutaId: string
  sourceVisitId: string | null
  supervisorEmpleadoId: string
  fechaOperacion: string
  pdvId: string | null
  pdv: string | null
  zona: string | null
  tipoEvento: RutaAgendaEventType
  modoImpacto: RutaAgendaImpactMode
  estatusAprobacion: RutaAgendaApprovalState
  estatusEjecucion: RutaAgendaExecutionState
  titulo: string
  descripcion: string | null
  sede: string | null
  horaInicio: string | null
  horaFin: string | null
  checkInAt: string | null
  checkOutAt: string | null
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export interface RutaAgendaPendingRecord {
  id: string
  routeId: string
  visitId: string
  agendaEventId: string | null
  supervisorEmpleadoId: string
  pdvId: string
  pdv: string | null
  zona: string | null
  fechaOrigen: string
  semanaSugeridaInicio: string | null
  clasificacion: 'JUSTIFICADA' | 'INJUSTIFICADA'
  motivo: string
  estado: 'PENDIENTE' | 'REPROGRAMADA' | 'DESCARTADA' | 'EJECUTADA'
  persisted: boolean
}

export interface RutaAgendaEventItem {
  id: string
  routeId: string
  sourceVisitId: string | null
  supervisorEmpleadoId: string
  fechaOperacion: string
  dayLabel: string
  pdvId: string | null
  pdv: string | null
  zona: string | null
  tipoEvento: RutaAgendaEventType
  tipoLabel: string
  modoImpacto: RutaAgendaImpactMode
  impactoLabel: string
  estatusAprobacion: RutaAgendaApprovalState
  estatusEjecucion: RutaAgendaExecutionState
  titulo: string
  descripcion: string | null
  sede: string | null
  horaInicio: string | null
  horaFin: string | null
  displacedVisitIds: string[]
  checkInAt: string | null
  checkOutAt: string | null
  createdAt: string
}

export interface RutaAgendaResolvedDay {
  fecha: string
  dayLabel: string
  planeadasCount: number
  ejecutadasCount: number
  cumplimientoIncompleto: boolean
  visitasPlaneadas: RutaAgendaBaseVisitInput[]
  visitasActivas: RutaAgendaBaseVisitInput[]
  visitasDesplazadas: RutaAgendaBaseVisitInput[]
  eventos: RutaAgendaEventItem[]
  pendientesReposicion: RutaAgendaPendingRecord[]
  pendientesJustificadasCount: number
  pendientesInjustificadasCount: number
}

function compareIsoDates(left: string, right: string) {
  return left.localeCompare(right, 'en')
}

function dedupePendings(items: RutaAgendaPendingRecord[]) {
  const seen = new Map<string, RutaAgendaPendingRecord>()

  for (const item of items) {
    const key = `${item.visitId}:${item.clasificacion}`
    if (!seen.has(key)) {
      seen.set(key, item)
      continue
    }

    const current = seen.get(key)!
    if (!current.persisted && item.persisted) {
      seen.set(key, item)
    }
  }

  return Array.from(seen.values()).sort((left, right) => left.pdvId.localeCompare(right.pdvId))
}

export function normalizeAgendaEventRecord(record: RutaAgendaEventRecord): RutaAgendaEventItem {
  const metadata = parseRutaAgendaEventMetadata(record.metadata)

  return {
    id: record.id,
    routeId: record.rutaId,
    sourceVisitId: record.sourceVisitId,
    supervisorEmpleadoId: record.supervisorEmpleadoId,
    fechaOperacion: record.fechaOperacion,
    dayLabel: formatAgendaDateLabel(record.fechaOperacion),
    pdvId: record.pdvId,
    pdv: record.pdv,
    zona: record.zona,
    tipoEvento: normalizeAgendaEventType(record.tipoEvento),
    tipoLabel: getAgendaTypeLabel(record.tipoEvento),
    modoImpacto: normalizeAgendaImpactMode(record.modoImpacto),
    impactoLabel: getAgendaImpactLabel(record.modoImpacto),
    estatusAprobacion: record.estatusAprobacion,
    estatusEjecucion: normalizeAgendaExecutionState(record.estatusEjecucion),
    titulo: record.titulo,
    descripcion: record.descripcion,
    sede: record.sede,
    horaInicio: record.horaInicio,
    horaFin: record.horaFin,
    displacedVisitIds: metadata.displacedVisitIds,
    checkInAt: metadata.checkIn.at ?? record.checkInAt,
    checkOutAt: metadata.checkOut.at ?? record.checkOutAt,
    createdAt: record.createdAt,
  }
}

export function resolveAgendaOperativaSupervisorDia({
  fecha,
  visitasPlaneadas,
  agendaEventos,
  pendientesPersistidos,
  today = new Date().toISOString().slice(0, 10),
}: {
  fecha: string
  visitasPlaneadas: RutaAgendaBaseVisitInput[]
  agendaEventos: RutaAgendaEventRecord[]
  pendientesPersistidos: RutaAgendaPendingRecord[]
  today?: string
}): RutaAgendaResolvedDay {
  const normalizedEvents = agendaEventos
    .map(normalizeAgendaEventRecord)
    .sort((left, right) => {
      const impactRank = (value: RutaAgendaImpactMode) =>
        value === 'REEMPLAZA_TOTAL' ? 3 : value === 'SOBREPONE_PARCIAL' ? 2 : 1
      return (
        impactRank(right.modoImpacto) - impactRank(left.modoImpacto) ||
        left.createdAt.localeCompare(right.createdAt)
      )
    })

  const approvedEvents = normalizedEvents.filter((item) => isApprovedAgendaEvent(item.estatusAprobacion))
  const replaceTotalEvent = approvedEvents.find((item) => item.modoImpacto === 'REEMPLAZA_TOTAL') ?? null
  const displacedVisitIds = new Set<string>()

  if (replaceTotalEvent) {
    for (const visit of visitasPlaneadas) {
      displacedVisitIds.add(visit.id)
    }
  } else {
    for (const event of approvedEvents.filter((item) => item.modoImpacto === 'SOBREPONE_PARCIAL')) {
      for (const visitId of event.displacedVisitIds) {
        displacedVisitIds.add(visitId)
      }
    }
  }

  const visitasDesplazadas = visitasPlaneadas.filter((item) => displacedVisitIds.has(item.id))
  const visitasActivas = visitasPlaneadas.filter((item) => !displacedVisitIds.has(item.id))
  const persistedPendings = pendientesPersistidos.map((item) => ({
    ...item,
    clasificacion: normalizeReposicionClasificacion(item.clasificacion),
    estado: normalizeReposicionEstado(item.estado),
  }))

  const existingKeys = new Set(
    persistedPendings.map((item) => `${item.visitId}:${item.clasificacion}`)
  )
  const derivedPendings: RutaAgendaPendingRecord[] = []

  for (const visit of visitasDesplazadas) {
    if (visit.estatus === 'COMPLETADA') {
      continue
    }

    const key = `${visit.id}:JUSTIFICADA`
    if (existingKeys.has(key)) {
      continue
    }

    derivedPendings.push({
      id: `virtual-justificada-${visit.id}`,
      routeId: visit.rutaId,
      visitId: visit.id,
      agendaEventId: replaceTotalEvent?.id ?? null,
      supervisorEmpleadoId: '',
      pdvId: visit.pdvId,
      pdv: visit.pdv,
      zona: visit.zona,
      fechaOrigen: fecha,
      semanaSugeridaInicio: null,
      clasificacion: 'JUSTIFICADA',
      motivo: 'La visita fue desplazada por una sobreposicion operativa aprobada.',
      estado: 'PENDIENTE',
      persisted: false,
    })
  }

  const isPastDay = compareIsoDates(fecha, today) < 0
  if (isPastDay) {
    for (const visit of visitasActivas) {
      if (visit.estatus === 'COMPLETADA' || visit.estatus === 'CANCELADA') {
        continue
      }

      const key = `${visit.id}:INJUSTIFICADA`
      if (existingKeys.has(key)) {
        continue
      }

      derivedPendings.push({
        id: `virtual-injustificada-${visit.id}`,
        routeId: visit.rutaId,
        visitId: visit.id,
        agendaEventId: null,
        supervisorEmpleadoId: '',
        pdvId: visit.pdvId,
        pdv: visit.pdv,
        zona: visit.zona,
        fechaOrigen: fecha,
        semanaSugeridaInicio: null,
        clasificacion: 'INJUSTIFICADA',
        motivo: 'La visita no se ejecuto y no existe una causa operativa aprobada.',
        estado: 'PENDIENTE',
        persisted: false,
      })
    }
  }

  const pendientesReposicion = dedupePendings([...persistedPendings, ...derivedPendings])
  const ejecutadasCount = visitasPlaneadas.filter((item) => item.estatus === 'COMPLETADA').length
  const pendientesJustificadasCount = pendientesReposicion.filter(
    (item) => item.clasificacion === 'JUSTIFICADA' && item.estado !== 'DESCARTADA'
  ).length
  const pendientesInjustificadasCount = pendientesReposicion.filter(
    (item) => item.clasificacion === 'INJUSTIFICADA' && item.estado !== 'DESCARTADA'
  ).length

  return {
    fecha,
    dayLabel: formatAgendaDateLabel(fecha),
    planeadasCount: visitasPlaneadas.length,
    ejecutadasCount,
    cumplimientoIncompleto: ejecutadasCount < visitasPlaneadas.length,
    visitasPlaneadas,
    visitasActivas,
    visitasDesplazadas,
    eventos: normalizedEvents,
    pendientesReposicion,
    pendientesJustificadasCount,
    pendientesInjustificadasCount,
  }
}
