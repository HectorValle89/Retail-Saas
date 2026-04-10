import { resolveMexicoStateFromCity } from '@/lib/geo/mexicoCityState'

export interface FormacionTargetingMetadata {
  targetingMode: 'LEGACY_PARTICIPANTS' | 'PDV_SCOPE' | 'SUPERVISOR_SCOPE'
  eventType: 'FORMACION' | 'ISDINIZACION'
  modality: 'PRESENCIAL' | 'EN_LINEA'
  stateNames: string[]
  supervisorIds: string[]
  coordinatorIds: string[]
  pdvIds: string[]
  operationDate: string | null
  scheduleStart: string | null
  scheduleEnd: string | null
  primarySupervisorId: string | null
  primaryCoordinatorId: string | null
  supervisorName: string | null
  coordinatorName: string | null
  expectedDcCount: number
  expectedSupervisorCount: number
  expectedCoordinatorCount: number
  expectedStoreCount: number
  locationAddress: string | null
  locationLatitude: number | null
  locationLongitude: number | null
  locationRadiusMeters: number | null
  supervisorPdvConfirmation: FormacionSupervisorPdvConfirmationMetadata
  pdvSupervisorConfirmations: FormacionPdvSupervisorConfirmationItem[]
  notificationPlan: FormacionNotificationPlanMetadata
}

export interface FormacionSupervisorPdvConfirmationMetadata {
  required: boolean
  confirmed: boolean
  confirmedAt: string | null
  confirmedByEmployeeId: string | null
  contactName: string | null
  contactRole: string | null
  notes: string | null
}

export interface FormacionPdvSupervisorConfirmationItem {
  pdvId: string
  pdvName: string | null
  confirmed: boolean
  confirmedAt: string | null
  confirmedByEmployeeId: string | null
  contactName: string | null
  contactRole: string | null
  notes: string | null
}

export interface FormacionReminderPlanItem {
  key: 'DAY_MINUS_3' | 'DAY_MINUS_2' | 'DAY_MINUS_1'
  label: string
  offsetDays: number
  scheduledFor: string | null
  sentAt: string | null
  status: 'PENDIENTE' | 'ENVIADO' | 'OMITIDO' | 'NO_APLICA'
  recipientScope: 'DCS_Y_SUPERVISORES'
}

export interface FormacionNotificationPlanMetadata {
  initialNotificationSentAt: string | null
  lastNotificationSentAt: string | null
  recipientEmployeeIds: string[]
  reminders: FormacionReminderPlanItem[]
}

export interface FormacionLegacyParticipant {
  empleadoId: string | null
  nombre: string
  puesto: string | null
  zona: string | null
  rol: string | null
  notificado: boolean
  confirmado: boolean
  estado: string
}

export interface FormacionMatchContext {
  empleadoId: string
  puesto: string | null
  pdvId?: string | null
}

export interface FormacionAttendanceMetadata {
  originPdvId: string | null
  originPdvName: string | null
  attendanceMode: 'PRESENCIAL' | 'EN_LINEA' | null
  checkInUtc: string | null
  checkOutUtc: string | null
  checkInEvidenceUrl: string | null
  checkOutEvidenceUrl: string | null
  checkInEvidenceHash: string | null
  checkOutEvidenceHash: string | null
  checkInGeofenceStatus: 'SIN_VALIDAR' | 'DENTRO' | 'FUERA'
  checkOutGeofenceStatus: 'SIN_VALIDAR' | 'DENTRO' | 'FUERA'
  checkInLatitude: number | null
  checkInLongitude: number | null
  checkOutLatitude: number | null
  checkOutLongitude: number | null
  checkInDistanceMeters: number | null
  checkOutDistanceMeters: number | null
}

export interface FormacionScopePdv {
  id: string
  claveBtl: string
  nombre: string
  ciudad: string | null
  zona: string | null
  estado: string | null
  supervisorId: string | null
  supervisorNombre: string | null
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'es-MX')
  )
}

function normalizeReminderStatus(value: unknown): FormacionReminderPlanItem['status'] {
  return value === 'ENVIADO' || value === 'OMITIDO' || value === 'NO_APLICA' ? value : 'PENDIENTE'
}

function buildEmptySupervisorConfirmation(): FormacionSupervisorPdvConfirmationMetadata {
  return {
    required: true,
    confirmed: false,
    confirmedAt: null,
    confirmedByEmployeeId: null,
    contactName: null,
    contactRole: null,
    notes: null,
  }
}

function buildEmptyNotificationPlan(): FormacionNotificationPlanMetadata {
  return {
    initialNotificationSentAt: null,
    lastNotificationSentAt: null,
    recipientEmployeeIds: [],
    reminders: [],
  }
}

function normalizePdvSupervisorConfirmationItem(
  raw: Record<string, unknown>
): FormacionPdvSupervisorConfirmationItem | null {
  const pdvId =
    typeof raw.pdv_id === 'string'
      ? raw.pdv_id
      : typeof raw.pdvId === 'string'
        ? raw.pdvId
        : null

  if (!pdvId) {
    return null
  }

  return {
    pdvId,
    pdvName:
      typeof raw.pdv_name === 'string'
        ? raw.pdv_name
        : typeof raw.pdvName === 'string'
          ? raw.pdvName
          : null,
    confirmed: Boolean(raw.confirmed),
    confirmedAt:
      typeof raw.confirmed_at === 'string'
        ? raw.confirmed_at
        : typeof raw.confirmedAt === 'string'
          ? raw.confirmedAt
          : null,
    confirmedByEmployeeId:
      typeof raw.confirmed_by_employee_id === 'string'
        ? raw.confirmed_by_employee_id
        : typeof raw.confirmedByEmployeeId === 'string'
          ? raw.confirmedByEmployeeId
          : null,
    contactName:
      typeof raw.contact_name === 'string'
        ? raw.contact_name
        : typeof raw.contactName === 'string'
          ? raw.contactName
          : null,
    contactRole:
      typeof raw.contact_role === 'string'
        ? raw.contact_role
        : typeof raw.contactRole === 'string'
          ? raw.contactRole
          : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
  }
}

export function normalizeFormacionLegacyParticipant(
  raw: Record<string, unknown>
): FormacionLegacyParticipant {
  return {
    empleadoId: typeof raw.empleado_id === 'string' ? raw.empleado_id : null,
    nombre: typeof raw.nombre === 'string' ? raw.nombre : 'Sin nombre',
    puesto: typeof raw.puesto === 'string' ? raw.puesto : null,
    zona: typeof raw.zona === 'string' ? raw.zona : null,
    rol: typeof raw.rol === 'string' ? raw.rol : null,
    notificado: Boolean(raw.notificado),
    confirmado: Boolean(raw.confirmado),
    estado: typeof raw.estado === 'string' ? raw.estado : 'PENDIENTE',
  }
}

export function parseFormacionLegacyParticipants(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as FormacionLegacyParticipant[]
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => normalizeFormacionLegacyParticipant(item))
}

export function normalizeFormacionTargetingMetadata(value: unknown): FormacionTargetingMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      targetingMode: 'LEGACY_PARTICIPANTS',
      eventType: 'FORMACION',
      modality: 'PRESENCIAL',
      stateNames: [],
      supervisorIds: [],
      coordinatorIds: [],
      pdvIds: [],
      operationDate: null,
      scheduleStart: null,
      scheduleEnd: null,
      primarySupervisorId: null,
      primaryCoordinatorId: null,
      supervisorName: null,
      coordinatorName: null,
      expectedDcCount: 0,
      expectedSupervisorCount: 0,
      expectedCoordinatorCount: 0,
      expectedStoreCount: 0,
      locationAddress: null,
      locationLatitude: null,
      locationLongitude: null,
      locationRadiusMeters: null,
      supervisorPdvConfirmation: buildEmptySupervisorConfirmation(),
      pdvSupervisorConfirmations: [],
      notificationPlan: buildEmptyNotificationPlan(),
    }
  }

  const raw = value as Record<string, unknown>
  const targetingMode =
    raw.targeting_mode === 'SUPERVISOR_SCOPE'
      ? 'SUPERVISOR_SCOPE'
      : raw.targeting_mode === 'PDV_SCOPE'
        ? 'PDV_SCOPE'
        : 'LEGACY_PARTICIPANTS'
  const stateNames = Array.isArray(raw.state_names)
    ? uniqueStrings(raw.state_names.map((item) => String(item ?? '')))
    : []
  const supervisorIds = Array.isArray(raw.supervisor_ids)
    ? uniqueStrings(raw.supervisor_ids.map((item) => String(item ?? '')))
    : []
  const coordinatorIds = Array.isArray(raw.coordinator_ids)
    ? uniqueStrings(raw.coordinator_ids.map((item) => String(item ?? '')))
    : []
  const pdvIds = Array.isArray(raw.pdv_ids)
    ? uniqueStrings(raw.pdv_ids.map((item) => String(item ?? '')))
    : []
  const rawSupervisorConfirmation =
    raw.supervisor_pdv_confirmation &&
    typeof raw.supervisor_pdv_confirmation === 'object' &&
    !Array.isArray(raw.supervisor_pdv_confirmation)
      ? (raw.supervisor_pdv_confirmation as Record<string, unknown>)
      : null
  const rawNotificationPlan =
    raw.notification_plan && typeof raw.notification_plan === 'object' && !Array.isArray(raw.notification_plan)
      ? (raw.notification_plan as Record<string, unknown>)
      : null
  const pdvSupervisorConfirmations = Array.isArray(raw.pdv_supervisor_confirmations)
    ? raw.pdv_supervisor_confirmations
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => normalizePdvSupervisorConfirmationItem(item))
        .filter((item): item is FormacionPdvSupervisorConfirmationItem => Boolean(item))
    : []
  const reminders = Array.isArray(rawNotificationPlan?.reminders)
    ? rawNotificationPlan.reminders
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map<FormacionReminderPlanItem>((item) => ({
          key: item.key === 'DAY_MINUS_3' || item.key === 'DAY_MINUS_2' || item.key === 'DAY_MINUS_1' ? item.key : 'DAY_MINUS_1',
          label: typeof item.label === 'string' ? item.label : 'Recordatorio',
          offsetDays: Number.isFinite(Number(item.offset_days)) ? Number(item.offset_days) : 1,
          scheduledFor:
            typeof item.scheduled_for === 'string'
              ? item.scheduled_for
              : typeof item.scheduledFor === 'string'
                ? item.scheduledFor
                : null,
          sentAt:
            typeof item.sent_at === 'string' ? item.sent_at : typeof item.sentAt === 'string' ? item.sentAt : null,
          status: normalizeReminderStatus(item.status),
          recipientScope: 'DCS_Y_SUPERVISORES',
        }))
    : []

  return {
    targetingMode,
    eventType: raw.event_type === 'ISDINIZACION' ? 'ISDINIZACION' : 'FORMACION',
    modality: raw.modality === 'EN_LINEA' ? 'EN_LINEA' : 'PRESENCIAL',
    stateNames,
    supervisorIds,
    coordinatorIds,
    pdvIds,
    operationDate: typeof raw.operation_date === 'string' ? raw.operation_date : null,
    scheduleStart: typeof raw.schedule_start === 'string' ? raw.schedule_start : null,
    scheduleEnd: typeof raw.schedule_end === 'string' ? raw.schedule_end : null,
    primarySupervisorId: typeof raw.primary_supervisor_id === 'string' ? raw.primary_supervisor_id : null,
    primaryCoordinatorId: typeof raw.primary_coordinator_id === 'string' ? raw.primary_coordinator_id : null,
    supervisorName: typeof raw.supervisor_name === 'string' ? raw.supervisor_name : null,
    coordinatorName: typeof raw.coordinator_name === 'string' ? raw.coordinator_name : null,
    expectedDcCount: Number(raw.expected_dc_count) || 0,
    expectedSupervisorCount: Number(raw.expected_supervisor_count) || 0,
    expectedCoordinatorCount: Number(raw.expected_coordinator_count) || 0,
    expectedStoreCount: Number(raw.expected_store_count) || 0,
    locationAddress: typeof raw.location_address === 'string' ? raw.location_address : null,
    locationLatitude: Number.isFinite(Number(raw.location_latitude)) ? Number(raw.location_latitude) : null,
    locationLongitude: Number.isFinite(Number(raw.location_longitude)) ? Number(raw.location_longitude) : null,
    locationRadiusMeters: Number.isFinite(Number(raw.location_radius_meters)) ? Number(raw.location_radius_meters) : null,
    supervisorPdvConfirmation: rawSupervisorConfirmation
      ? {
          required: rawSupervisorConfirmation.required !== false,
          confirmed: Boolean(rawSupervisorConfirmation.confirmed),
          confirmedAt:
            typeof rawSupervisorConfirmation.confirmed_at === 'string'
              ? rawSupervisorConfirmation.confirmed_at
              : typeof rawSupervisorConfirmation.confirmedAt === 'string'
                ? rawSupervisorConfirmation.confirmedAt
                : null,
          confirmedByEmployeeId:
            typeof rawSupervisorConfirmation.confirmed_by_employee_id === 'string'
              ? rawSupervisorConfirmation.confirmed_by_employee_id
              : typeof rawSupervisorConfirmation.confirmedByEmployeeId === 'string'
                ? rawSupervisorConfirmation.confirmedByEmployeeId
                : null,
          contactName:
            typeof rawSupervisorConfirmation.contact_name === 'string'
              ? rawSupervisorConfirmation.contact_name
              : typeof rawSupervisorConfirmation.contactName === 'string'
                ? rawSupervisorConfirmation.contactName
                : null,
          contactRole:
            typeof rawSupervisorConfirmation.contact_role === 'string'
              ? rawSupervisorConfirmation.contact_role
              : typeof rawSupervisorConfirmation.contactRole === 'string'
                ? rawSupervisorConfirmation.contactRole
                : null,
          notes: typeof rawSupervisorConfirmation.notes === 'string' ? rawSupervisorConfirmation.notes : null,
        }
      : buildEmptySupervisorConfirmation(),
    pdvSupervisorConfirmations,
    notificationPlan: rawNotificationPlan
      ? {
          initialNotificationSentAt:
            typeof rawNotificationPlan.initial_notification_sent_at === 'string'
              ? rawNotificationPlan.initial_notification_sent_at
              : typeof rawNotificationPlan.initialNotificationSentAt === 'string'
                ? rawNotificationPlan.initialNotificationSentAt
                : null,
          lastNotificationSentAt:
            typeof rawNotificationPlan.last_notification_sent_at === 'string'
              ? rawNotificationPlan.last_notification_sent_at
              : typeof rawNotificationPlan.lastNotificationSentAt === 'string'
                ? rawNotificationPlan.lastNotificationSentAt
                : null,
          recipientEmployeeIds: Array.isArray(rawNotificationPlan.recipient_employee_ids)
            ? uniqueStrings(rawNotificationPlan.recipient_employee_ids.map((item) => String(item ?? '')))
            : Array.isArray(rawNotificationPlan.recipientEmployeeIds)
              ? uniqueStrings(rawNotificationPlan.recipientEmployeeIds.map((item) => String(item ?? '')))
              : [],
          reminders,
        }
      : buildEmptyNotificationPlan(),
  }
}

export function buildFormacionTargetingMetadata(input: {
  eventType?: 'FORMACION' | 'ISDINIZACION'
  modality?: 'PRESENCIAL' | 'EN_LINEA'
  stateNames: string[]
  supervisorIds: string[]
  coordinatorIds: string[]
  pdvIds: string[]
  operationDate?: string | null
  scheduleStart?: string | null
  scheduleEnd?: string | null
  primarySupervisorId?: string | null
  primaryCoordinatorId?: string | null
  supervisorName?: string | null
  coordinatorName?: string | null
  expectedDcCount?: number
  expectedSupervisorCount?: number
  expectedCoordinatorCount?: number
  expectedStoreCount?: number
  locationAddress?: string | null
  locationLatitude?: number | null
  locationLongitude?: number | null
  locationRadiusMeters?: number | null
  supervisorPdvConfirmation?: Partial<FormacionSupervisorPdvConfirmationMetadata> | null
  pdvSupervisorConfirmations?: Array<Partial<FormacionPdvSupervisorConfirmationItem> & { pdvId: string }> | null
  notificationPlan?: Partial<FormacionNotificationPlanMetadata> | null
}) {
  const notificationPlan = input.notificationPlan ?? null
  return {
    targeting_mode: input.primarySupervisorId ? 'SUPERVISOR_SCOPE' : 'PDV_SCOPE',
    event_type: input.eventType ?? 'FORMACION',
    modality: input.modality ?? 'PRESENCIAL',
    state_names: uniqueStrings(input.stateNames),
    supervisor_ids: uniqueStrings(input.supervisorIds),
    coordinator_ids: uniqueStrings(input.coordinatorIds),
    pdv_ids: uniqueStrings(input.pdvIds),
    operation_date: input.operationDate ?? null,
    schedule_start: input.scheduleStart ?? null,
    schedule_end: input.scheduleEnd ?? null,
    primary_supervisor_id: input.primarySupervisorId ?? null,
    primary_coordinator_id: input.primaryCoordinatorId ?? null,
    supervisor_name: input.supervisorName ?? null,
    coordinator_name: input.coordinatorName ?? null,
    expected_dc_count: input.expectedDcCount ?? 0,
    expected_supervisor_count: input.expectedSupervisorCount ?? 0,
    expected_coordinator_count: input.expectedCoordinatorCount ?? 0,
    expected_store_count: input.expectedStoreCount ?? 0,
    location_address: input.locationAddress ?? null,
    location_latitude: input.locationLatitude ?? null,
    location_longitude: input.locationLongitude ?? null,
    location_radius_meters: input.locationRadiusMeters ?? null,
    supervisor_pdv_confirmation: {
      ...buildEmptySupervisorConfirmation(),
      ...(input.supervisorPdvConfirmation ?? {}),
    },
    pdv_supervisor_confirmations: (input.pdvSupervisorConfirmations ?? []).map((item) => ({
      pdv_id: item.pdvId,
      pdv_name: item.pdvName ?? null,
      confirmed: item.confirmed ?? false,
      confirmed_at: item.confirmedAt ?? null,
      confirmed_by_employee_id: item.confirmedByEmployeeId ?? null,
      contact_name: item.contactName ?? null,
      contact_role: item.contactRole ?? null,
      notes: item.notes ?? null,
    })),
    notification_plan: {
      ...buildEmptyNotificationPlan(),
      ...(notificationPlan ?? {}),
      recipient_employee_ids: uniqueStrings(notificationPlan?.recipientEmployeeIds ?? []),
      reminders: (notificationPlan?.reminders ?? []).map((item) => ({
        key: item.key,
        label: item.label,
        offset_days: item.offsetDays,
        scheduled_for: item.scheduledFor,
        sent_at: item.sentAt,
        status: item.status,
        recipient_scope: item.recipientScope,
      })),
    },
  }
}

export function resolveFormacionPdvState(input: {
  ciudadNombre?: string | null
  ciudadEstado?: string | null
}) {
  const ciudadEstado = String(input.ciudadEstado ?? '').trim()
  if (ciudadEstado) {
    return ciudadEstado
  }

  const ciudadNombre = String(input.ciudadNombre ?? '').trim()
  if (!ciudadNombre) {
    return null
  }

  return resolveMexicoStateFromCity(ciudadNombre)
}

export function formacionTargetsEmployee(
  input: {
    participantes: unknown
    metadata: unknown
  },
  context: FormacionMatchContext
) {
  const legacyParticipants = parseFormacionLegacyParticipants(input.participantes)
  if (legacyParticipants.some((participant) => participant.empleadoId === context.empleadoId)) {
    return true
  }

  const targeting = normalizeFormacionTargetingMetadata(input.metadata)
  if (targeting.supervisorIds.includes(context.empleadoId)) {
    return true
  }

  if (targeting.coordinatorIds.includes(context.empleadoId)) {
    return true
  }

  if (targeting.targetingMode !== 'PDV_SCOPE' && targeting.targetingMode !== 'SUPERVISOR_SCOPE') {
    return false
  }

  if (
    context.pdvId &&
    targeting.pdvIds.includes(context.pdvId) &&
    (context.puesto === null || context.puesto === 'DERMOCONSEJERO')
  ) {
    return true
  }

  return false
}

function normalizeGeoStatus(value: unknown): FormacionAttendanceMetadata['checkInGeofenceStatus'] {
  return value === 'DENTRO' || value === 'FUERA' ? value : 'SIN_VALIDAR'
}

function normalizeNullableNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeFormacionAttendanceMetadata(value: unknown): FormacionAttendanceMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      originPdvId: null,
      originPdvName: null,
      attendanceMode: null,
      checkInUtc: null,
      checkOutUtc: null,
      checkInEvidenceUrl: null,
      checkOutEvidenceUrl: null,
      checkInEvidenceHash: null,
      checkOutEvidenceHash: null,
      checkInGeofenceStatus: 'SIN_VALIDAR',
      checkOutGeofenceStatus: 'SIN_VALIDAR',
      checkInLatitude: null,
      checkInLongitude: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkInDistanceMeters: null,
      checkOutDistanceMeters: null,
    }
  }

  const raw = value as Record<string, unknown>
  return {
    originPdvId: typeof raw.origin_pdv_id === 'string' ? raw.origin_pdv_id : null,
    originPdvName: typeof raw.origin_pdv_name === 'string' ? raw.origin_pdv_name : null,
    attendanceMode: raw.attendance_mode === 'EN_LINEA' ? 'EN_LINEA' : raw.attendance_mode === 'PRESENCIAL' ? 'PRESENCIAL' : null,
    checkInUtc: typeof raw.check_in_utc === 'string' ? raw.check_in_utc : null,
    checkOutUtc: typeof raw.check_out_utc === 'string' ? raw.check_out_utc : null,
    checkInEvidenceUrl: typeof raw.check_in_evidence_url === 'string' ? raw.check_in_evidence_url : null,
    checkOutEvidenceUrl: typeof raw.check_out_evidence_url === 'string' ? raw.check_out_evidence_url : null,
    checkInEvidenceHash: typeof raw.check_in_evidence_hash === 'string' ? raw.check_in_evidence_hash : null,
    checkOutEvidenceHash: typeof raw.check_out_evidence_hash === 'string' ? raw.check_out_evidence_hash : null,
    checkInGeofenceStatus: normalizeGeoStatus(raw.check_in_geofence_status),
    checkOutGeofenceStatus: normalizeGeoStatus(raw.check_out_geofence_status),
    checkInLatitude: normalizeNullableNumber(raw.check_in_latitude),
    checkInLongitude: normalizeNullableNumber(raw.check_in_longitude),
    checkOutLatitude: normalizeNullableNumber(raw.check_out_latitude),
    checkOutLongitude: normalizeNullableNumber(raw.check_out_longitude),
    checkInDistanceMeters: normalizeNullableNumber(raw.check_in_distance_meters),
    checkOutDistanceMeters: normalizeNullableNumber(raw.check_out_distance_meters),
  }
}
