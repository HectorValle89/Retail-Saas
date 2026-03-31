export type CampaignItemStatus = 'PENDIENTE' | 'EN_PROGRESO' | 'CUMPLIDA' | 'INCUMPLIDA'
export type VisitTaskStatus = 'PENDIENTE' | 'COMPLETADA' | 'JUSTIFICADA'
export type VisitTaskKind = 'FOTO_ANAQUEL' | 'CONTEO_INVENTARIO' | 'ENCUESTA' | 'REGISTRO_PRECIO' | 'OTRA'
export type CampaignGoalType = 'VENTA' | 'EXHIBICION'
export type CampaignEvidenceKind = 'FOTO_PRODUCTO' | 'SELFIE_LABORANDO' | 'EVIDENCIA_ACOMODO' | 'OTRA'

export interface VisitTaskTemplateItem {
  id: string
  label: string
  kind: VisitTaskKind
}

export interface CampaignEvidenceEntry {
  url: string
  hash: string
  thumbnailUrl: string | null
  thumbnailHash: string | null
  uploadedAt: string
  uploadedBy: string
  asistenciaId: string | null
  fileName: string
  mimeType: string
  officialAssetKind: 'optimized' | 'original'
  taskKey: string | null
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
  cameraCaptured: boolean
  timestampStamped: boolean
  distanceFromCheckInMeters: number | null
  suspicious: boolean
  suspiciousReason: string | null
  evidenceLabel?: string | null
  evidenceKind?: CampaignEvidenceKind | null
}

export interface CampaignProductGoal {
  productId: string
  quota: number
  goalType: CampaignGoalType
  notes: string | null
}

export interface CampaignEvidenceRequirement {
  id: string
  label: string
  kind: CampaignEvidenceKind
}

export interface CampaignManualDocument {
  url: string
  hash: string
  fileName: string
  mimeType: string
  uploadedAt: string
  uploadedBy: string
}

export interface VisitTaskSessionTask {
  key: string
  label: string
  kind: VisitTaskKind
  status: VisitTaskStatus
  startedAt: string | null
  finishedAt: string | null
  justification: string | null
  suspicious: boolean
  suspiciousReason: string | null
  evidenceCount: number
}

export interface VisitTaskSession {
  attendanceId: string
  generatedAt: string
  tasks: VisitTaskSessionTask[]
}

interface CampaignMetadataLike {
  variabilidad_tareas?: unknown
  visit_task_sessions?: unknown
  visit_task_execution_minutes?: unknown
  task_template?: unknown
  product_goals?: unknown
  evidence_template?: unknown
  manual_mercadeo?: unknown
}

export const CAMPAIGN_STATE_OPTIONS = [
  { value: 'BORRADOR', label: 'Borrador' },
  { value: 'ACTIVA', label: 'Activa' },
  { value: 'CERRADA', label: 'Cerrada' },
  { value: 'CANCELADA', label: 'Cancelada' },
] as const

function normalizeRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function normalizeDate(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

export function dedupeStringArray(values: readonly string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
    )
  )
}

export function getPendingCampaignTasks(
  requiredTasks: readonly string[],
  completedTasks: readonly string[]
) {
  const normalizedRequiredTasks = dedupeStringArray(requiredTasks)
  const normalizedCompletedTasks = new Set(dedupeStringArray(completedTasks))
  return normalizedRequiredTasks.filter((item) => !normalizedCompletedTasks.has(item))
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash
}

function normalizeVisitTaskKind(value: unknown): VisitTaskKind {
  return value === 'FOTO_ANAQUEL' ||
    value === 'CONTEO_INVENTARIO' ||
    value === 'ENCUESTA' ||
    value === 'REGISTRO_PRECIO' ||
    value === 'OTRA'
    ? value
    : 'OTRA'
}

function normalizeVisitTaskStatus(value: unknown): VisitTaskStatus {
  return value === 'COMPLETADA' || value === 'JUSTIFICADA' ? value : 'PENDIENTE'
}

function normalizeCampaignGoalType(value: unknown): CampaignGoalType {
  return value === 'EXHIBICION' ? 'EXHIBICION' : 'VENTA'
}

function normalizeCampaignEvidenceKind(value: unknown): CampaignEvidenceKind {
  return value === 'SELFIE_LABORANDO' ||
    value === 'EVIDENCIA_ACOMODO' ||
    value === 'FOTO_PRODUCTO' ||
    value === 'OTRA'
    ? value
    : 'OTRA'
}

export function inferVisitTaskKind(label: string): VisitTaskKind {
  const normalized = label.trim().toLowerCase()

  if (/(^|\b)(foto|fotografia|anaquel|imagen)(\b|$)/.test(normalized)) {
    return 'FOTO_ANAQUEL'
  }

  if (/(^|\b)(conteo|inventario|existencia)(\b|$)/.test(normalized)) {
    return 'CONTEO_INVENTARIO'
  }

  if (/(^|\b)(encuesta|pregunta|cuestionario)(\b|$)/.test(normalized)) {
    return 'ENCUESTA'
  }

  if (/(^|\b)(precio|pricing|pvp|costo)(\b|$)/.test(normalized)) {
    return 'REGISTRO_PRECIO'
  }

  return 'OTRA'
}

export function createVisitTaskTemplateItem(label: string, kind?: VisitTaskKind): VisitTaskTemplateItem {
  const normalizedLabel = label.trim()
  const resolvedKind = kind ?? inferVisitTaskKind(normalizedLabel)

  return {
    id: `template-${hashString(`${resolvedKind}:${normalizedLabel}`).toString(16)}`,
    label: normalizedLabel,
    kind: resolvedKind,
  }
}

export function visitTaskRequiresPhoto(kind: VisitTaskKind) {
  return kind === 'FOTO_ANAQUEL'
}

export function createCampaignEvidenceRequirement(
  label: string,
  kind: CampaignEvidenceKind = 'OTRA'
): CampaignEvidenceRequirement {
  const normalizedLabel = label.trim()

  return {
    id: `evidence-${hashString(`${kind}:${normalizedLabel}`).toString(16)}`,
    label: normalizedLabel,
    kind,
  }
}

export function serializeCampaignEvidenceTemplate(items: readonly CampaignEvidenceRequirement[]) {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
  }))
}

export function readCampaignEvidenceTemplate(
  metadata: unknown,
  fallbackLabels: readonly string[]
): CampaignEvidenceRequirement[] {
  const record = normalizeRecord(metadata as CampaignMetadataLike)
  const rawTemplate = Array.isArray(record?.evidence_template) ? record.evidence_template : []
  const parsedTemplate = rawTemplate
    .map((item) => {
      const row = normalizeRecord(item)
      if (!row) {
        return null
      }

      const label = String(row.label ?? '').trim()
      if (!label) {
        return null
      }

      return createCampaignEvidenceRequirement(label, normalizeCampaignEvidenceKind(row.kind))
    })
    .filter((item): item is CampaignEvidenceRequirement => item !== null)

  if (parsedTemplate.length > 0) {
    return parsedTemplate
  }

  return dedupeStringArray(fallbackLabels).map((label) => createCampaignEvidenceRequirement(label))
}

export function serializeCampaignProductGoals(items: readonly CampaignProductGoal[]) {
  return items.map((item) => ({
    product_id: item.productId,
    cuota: item.quota,
    tipo_meta: item.goalType,
    notas: item.notes,
  }))
}

export function readCampaignProductGoals(metadata: unknown): CampaignProductGoal[] {
  const record = normalizeRecord(metadata as CampaignMetadataLike)
  const rows = Array.isArray(record?.product_goals) ? record.product_goals : []

  return rows
    .map((item) => {
      const row = normalizeRecord(item)
      if (!row) {
        return null
      }

      const productId = String(row.product_id ?? '').trim()
      const quota = Number(row.cuota ?? row.quota ?? NaN)

      if (!productId || !Number.isFinite(quota) || quota < 0) {
        return null
      }

      return {
        productId,
        quota: Number(quota.toFixed(2)),
        goalType: normalizeCampaignGoalType(row.tipo_meta ?? row.goalType),
        notes:
          typeof row.notas === 'string' && row.notas.trim()
            ? row.notas.trim()
            : typeof row.notes === 'string' && row.notes.trim()
              ? row.notes.trim()
              : null,
      } satisfies CampaignProductGoal
    })
    .filter((item): item is CampaignProductGoal => item !== null)
}

export function readCampaignManualDocument(metadata: unknown): CampaignManualDocument | null {
  const record = normalizeRecord(metadata as CampaignMetadataLike)
  const rawManual = normalizeRecord(record?.manual_mercadeo)

  if (!rawManual) {
    return null
  }

  const url = String(rawManual.url ?? '').trim()
  const hash = String(rawManual.hash ?? '').trim()
  const fileName = String(rawManual.file_name ?? rawManual.fileName ?? '').trim()
  const mimeType = String(rawManual.mime_type ?? rawManual.mimeType ?? '').trim()
  const uploadedAt = String(rawManual.uploaded_at ?? rawManual.uploadedAt ?? '').trim()
  const uploadedBy = String(rawManual.uploaded_by ?? rawManual.uploadedBy ?? '').trim()

  if (!url || !hash || !fileName || !mimeType || !uploadedAt || !uploadedBy) {
    return null
  }

  return {
    url,
    hash,
    fileName,
    mimeType,
    uploadedAt,
    uploadedBy,
  }
}

export function readVisitTaskTemplate(metadata: unknown, fallbackLabels: readonly string[]) {
  const record = normalizeRecord(metadata as CampaignMetadataLike)
  const rawTemplate = Array.isArray(record?.task_template) ? record.task_template : []
  const parsedTemplate = rawTemplate
    .map((item) => {
      const row = normalizeRecord(item)
      if (!row) {
        return null
      }

      const label = String(row.label ?? '').trim()
      if (!label) {
        return null
      }

      return createVisitTaskTemplateItem(label, normalizeVisitTaskKind(row.kind))
    })
    .filter((item): item is VisitTaskTemplateItem => item !== null)

  if (parsedTemplate.length > 0) {
    return parsedTemplate
  }

  return dedupeStringArray(fallbackLabels).map((label) => createVisitTaskTemplateItem(label))
}

export function serializeVisitTaskTemplate(items: readonly VisitTaskTemplateItem[]) {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
  }))
}

function readVisitTaskSessionTask(value: unknown): VisitTaskSessionTask | null {
  const record = normalizeRecord(value)

  if (!record) {
    return null
  }

  const key = String(record.key ?? '').trim()
  const label = String(record.label ?? '').trim()

  if (!key || !label) {
    return null
  }

  const status = normalizeVisitTaskStatus(record.status)
  const startedAt = typeof record.startedAt === 'string' && record.startedAt.trim() ? record.startedAt : null
  const finishedAt = typeof record.finishedAt === 'string' && record.finishedAt.trim() ? record.finishedAt : null
  const justification =
    typeof record.justification === 'string' && record.justification.trim() ? record.justification.trim() : null
  const kind = typeof record.kind === 'string' ? inferVisitTaskKind(record.kind) : inferVisitTaskKind(label)
  const suspicious = record.suspicious === true
  const suspiciousReason =
    typeof record.suspiciousReason === 'string' && record.suspiciousReason.trim()
      ? record.suspiciousReason.trim()
      : null
  const evidenceCount =
    Number.isInteger(record.evidenceCount) && Number(record.evidenceCount) >= 0
      ? Number(record.evidenceCount)
      : 0

  return {
    key,
    label,
    kind,
    status,
    startedAt,
    finishedAt,
    justification,
    suspicious,
    suspiciousReason,
    evidenceCount,
  }
}

export function readCampaignTaskVariability(metadata: unknown, fallbackCount: number) {
  const record = normalizeRecord(metadata as CampaignMetadataLike)
  const configured = Number(record?.variabilidad_tareas ?? NaN)

  if (Number.isInteger(configured) && configured > 0) {
    return configured
  }

  return Math.max(0, Math.trunc(fallbackCount))
}

export function readVisitTaskSessions(metadata: unknown) {
  const record = normalizeRecord(metadata as CampaignMetadataLike)
  const rawSessions = normalizeRecord(record?.visit_task_sessions)

  if (!rawSessions) {
    return {} as Record<string, VisitTaskSession>
  }

  const sessions: Record<string, VisitTaskSession> = {}

  for (const [attendanceId, value] of Object.entries(rawSessions)) {
    const sessionRecord = normalizeRecord(value)
    const generatedAt =
      typeof sessionRecord?.generatedAt === 'string' && sessionRecord.generatedAt.trim()
        ? sessionRecord.generatedAt
        : null
    const rawTasks = Array.isArray(sessionRecord?.tasks) ? sessionRecord.tasks : []
    const tasks = rawTasks
      .map((task) => readVisitTaskSessionTask(task))
      .filter((task): task is VisitTaskSessionTask => task !== null)

    if (!attendanceId.trim() || !generatedAt || tasks.length === 0) {
      continue
    }

    sessions[attendanceId] = {
      attendanceId,
      generatedAt,
      tasks,
    }
  }

  return sessions
}

export function pickVisitTaskSubset(
  templateTasks: readonly string[],
  variabilityCount: number,
  seed: string
) {
  const normalizedTasks = dedupeStringArray(templateTasks)

  if (normalizedTasks.length === 0) {
    return [] as string[]
  }

  const desiredCount = Math.min(
    normalizedTasks.length,
    Math.max(1, Math.trunc(variabilityCount || normalizedTasks.length))
  )

  return [...normalizedTasks]
    .sort((left, right) => {
      const leftWeight = hashString(`${seed}:${left}`)
      const rightWeight = hashString(`${seed}:${right}`)
      return leftWeight - rightWeight
    })
    .slice(0, desiredCount)
}

export function ensureVisitTaskSession(
  metadata: unknown,
  {
    attendanceId,
    templateTasks,
    variabilityCount,
    generatedAt,
  }: {
    attendanceId: string
    templateTasks: readonly VisitTaskTemplateItem[]
    variabilityCount: number
    generatedAt: string
  }
) {
  const existingSessions = readVisitTaskSessions(metadata)
  const existingSession = existingSessions[attendanceId]

  if (existingSession) {
    return {
      sessions: existingSessions,
      session: existingSession,
    }
  }

  const generatedTasks = pickVisitTaskSubset(
    templateTasks.map((item) => item.label),
    variabilityCount,
    attendanceId
  ).map((label) => {
    const template = templateTasks.find((item) => item.label === label) ?? createVisitTaskTemplateItem(label)
    return {
      key: `task-${hashString(`${attendanceId}:${label}`).toString(16)}`,
      label,
      kind: template.kind,
      status: 'PENDIENTE' as const,
      startedAt: null,
      finishedAt: null,
      justification: null,
      suspicious: false,
      suspiciousReason: null,
      evidenceCount: 0,
    }
  })

  const session: VisitTaskSession = {
    attendanceId,
    generatedAt,
    tasks: generatedTasks,
  }

  return {
    sessions: {
      ...existingSessions,
      [attendanceId]: session,
    },
    session,
  }
}

export function updateVisitTaskSession(
  session: VisitTaskSession,
  updates: ReadonlyArray<{
    key: string
    status: VisitTaskStatus
    justification?: string | null
    suspicious?: boolean
    suspiciousReason?: string | null
    evidenceCountIncrement?: number
  }>,
  nowIso: string
) {
  const updatesByKey = new Map(
    updates.map((update) => [
      update.key,
      {
        status: update.status,
        justification:
          update.status === 'JUSTIFICADA' && update.justification?.trim() ? update.justification.trim() : null,
        suspicious: update.suspicious === true,
        suspiciousReason:
          typeof update.suspiciousReason === 'string' && update.suspiciousReason.trim()
            ? update.suspiciousReason.trim()
            : null,
        evidenceCountIncrement:
          Number.isInteger(update.evidenceCountIncrement) && Number(update.evidenceCountIncrement) > 0
            ? Number(update.evidenceCountIncrement)
            : 0,
      },
    ])
  )

  return {
    ...session,
    tasks: session.tasks.map((task) => {
      const next = updatesByKey.get(task.key)

      if (!next) {
        return task
      }

      const becameResolved = task.status === 'PENDIENTE' && next.status !== 'PENDIENTE'
      const becamePendingAgain = task.status !== 'PENDIENTE' && next.status === 'PENDIENTE'

      return {
        ...task,
        status: next.status,
        startedAt: task.startedAt ?? (becameResolved ? nowIso : null),
        finishedAt: next.status === 'PENDIENTE' ? (becamePendingAgain ? null : task.finishedAt) : task.finishedAt ?? nowIso,
        justification: next.status === 'JUSTIFICADA' ? next.justification ?? task.justification : null,
        suspicious: next.suspicious || task.suspicious,
        suspiciousReason: next.suspicious
          ? next.suspiciousReason ?? task.suspiciousReason
          : task.suspiciousReason,
        evidenceCount: task.evidenceCount + next.evidenceCountIncrement,
      }
    }),
  }
}

export function readVisitTaskExecutionMinutesMap(metadata: unknown) {
  const record = normalizeRecord(metadata as CampaignMetadataLike)
  const rawMap = normalizeRecord(record?.visit_task_execution_minutes)

  if (!rawMap) {
    return {} as Record<string, number>
  }

  return Object.fromEntries(
    Object.entries(rawMap).flatMap(([attendanceId, value]) =>
      Number.isInteger(value) && Number(value) >= 0 ? [[attendanceId, Number(value)] as const] : []
    )
  )
}

export function serializeVisitTaskExecutionMinutesMap(entries: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(entries).flatMap(([attendanceId, minutes]) =>
      Number.isInteger(minutes) && minutes >= 0 ? [[attendanceId, minutes] as const] : []
    )
  )
}

export function getResolvedVisitTaskLabels(session: VisitTaskSession | null | undefined) {
  if (!session) {
    return [] as string[]
  }

  return dedupeStringArray(
    session.tasks.filter((task) => task.status !== 'PENDIENTE').map((task) => task.label)
  )
}

export function getPendingVisitTaskLabels(session: VisitTaskSession | null | undefined) {
  if (!session) {
    return [] as string[]
  }

  return dedupeStringArray(
    session.tasks.filter((task) => task.status === 'PENDIENTE').map((task) => task.label)
  )
}

export function getVisitTaskExecutionMinutes(session: VisitTaskSession | null | undefined) {
  if (!session) {
    return null
  }

  const startedAt = session.tasks
    .map((task) => task.startedAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0]
  const finishedAt = session.tasks
    .map((task) => task.finishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  if (!startedAt || !finishedAt) {
    return null
  }

  const delta = Date.parse(finishedAt) - Date.parse(startedAt)
  if (!Number.isFinite(delta) || delta < 0) {
    return null
  }

  return Math.trunc(delta / 60000)
}

export function hasSuspiciousVisitTasks(session: VisitTaskSession | null | undefined) {
  if (!session) {
    return false
  }

  return session.tasks.some((task) => task.suspicious)
}

export function serializeVisitTaskSessions(sessions: Record<string, VisitTaskSession>) {
  return Object.fromEntries(
    Object.entries(sessions).map(([attendanceId, session]) => [
      attendanceId,
      {
        attendanceId: session.attendanceId,
        generatedAt: session.generatedAt,
        tasks: session.tasks.map((task) => ({
          key: task.key,
          label: task.label,
          kind: task.kind,
          status: task.status,
          startedAt: task.startedAt,
          finishedAt: task.finishedAt,
          justification: task.justification,
          suspicious: task.suspicious,
          suspiciousReason: task.suspiciousReason,
          evidenceCount: task.evidenceCount,
        })),
      },
    ])
  )
}

export function normalizeLineList(value: string | null | undefined) {
  return dedupeStringArray(
    String(value ?? '')
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

export function rangesOverlapIso(
  leftStart: string,
  leftEnd: string | null,
  rightStart: string,
  rightEnd: string | null
) {
  const normalizedLeftStart = normalizeDate(leftStart)
  const normalizedRightStart = normalizeDate(rightStart)

  if (!normalizedLeftStart || !normalizedRightStart) {
    return false
  }

  const normalizedLeftEnd = normalizeDate(leftEnd) ?? normalizedLeftStart
  const normalizedRightEnd = normalizeDate(rightEnd) ?? normalizedRightStart

  return normalizedLeftStart <= normalizedRightEnd && normalizedRightStart <= normalizedLeftEnd
}

export function buildCampaignProgress(
  requiredTasks: readonly string[],
  completedTasks: readonly string[],
  requiredEvidenceCount: number,
  evidenceUploaded: number,
  campaignEnd: string,
  nowIso: string = new Date().toISOString().slice(0, 10)
) {
  const normalizedRequiredTasks = dedupeStringArray(requiredTasks)
  const normalizedCompletedTasks = dedupeStringArray(completedTasks).filter((item) =>
    normalizedRequiredTasks.includes(item)
  )
  const pendingTasks = getPendingCampaignTasks(normalizedRequiredTasks, normalizedCompletedTasks)
  const safeRequiredEvidenceCount = Math.max(0, Math.trunc(requiredEvidenceCount))
  const safeEvidenceUploaded = Math.max(0, Math.trunc(evidenceUploaded))
  const totalUnits = normalizedRequiredTasks.length + safeRequiredEvidenceCount
  const completedUnits =
    normalizedCompletedTasks.length + Math.min(safeRequiredEvidenceCount, safeEvidenceUploaded)
  const progressPercentage =
    totalUnits === 0 ? 0 : Math.min(100, Number(((completedUnits / totalUnits) * 100).toFixed(2)))

  let status: CampaignItemStatus = 'PENDIENTE'

  if (totalUnits > 0 && completedUnits >= totalUnits) {
    status = 'CUMPLIDA'
  } else if (completedUnits > 0) {
    status = 'EN_PROGRESO'
  } else if (campaignEnd < nowIso) {
    status = 'INCUMPLIDA'
  }

  return {
    requiredTasks: normalizedRequiredTasks,
    completedTasks: normalizedCompletedTasks,
    requiredEvidenceCount: safeRequiredEvidenceCount,
    evidenceUploaded: safeEvidenceUploaded,
    totalUnits,
    completedUnits,
    pendingTasks: pendingTasks.length,
    progressPercentage,
    status,
  }
}

export function isCampaignWindowActive(
  startDate: string,
  endDate: string,
  nowIso: string = new Date().toISOString().slice(0, 10)
) {
  return startDate <= nowIso && endDate >= nowIso
}

export function readCampaignEvidenceEntries(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [] as CampaignEvidenceEntry[]
  }

  const entries = (metadata as Record<string, unknown>).evidencias

  if (!Array.isArray(entries)) {
    return [] as CampaignEvidenceEntry[]
  }

  return entries.filter((item): item is CampaignEvidenceEntry => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false
    }

    const candidate = item as Record<string, unknown>
    return (
      typeof candidate.url === 'string' &&
      typeof candidate.hash === 'string' &&
      typeof candidate.uploadedAt === 'string' &&
      typeof candidate.uploadedBy === 'string' &&
      typeof candidate.fileName === 'string' &&
      typeof candidate.mimeType === 'string' &&
      (candidate.thumbnailUrl === null || typeof candidate.thumbnailUrl === 'string') &&
      (candidate.thumbnailHash === null || typeof candidate.thumbnailHash === 'string') &&
      (candidate.asistenciaId === null || typeof candidate.asistenciaId === 'string') &&
      (candidate.officialAssetKind === 'optimized' || candidate.officialAssetKind === 'original') &&
      (candidate.taskKey === null || typeof candidate.taskKey === 'string') &&
      (candidate.capturedAt === null || typeof candidate.capturedAt === 'string') &&
      (candidate.latitude === null || typeof candidate.latitude === 'number') &&
      (candidate.longitude === null || typeof candidate.longitude === 'number') &&
        typeof candidate.cameraCaptured === 'boolean' &&
        typeof candidate.timestampStamped === 'boolean' &&
        (candidate.distanceFromCheckInMeters === null || typeof candidate.distanceFromCheckInMeters === 'number') &&
        typeof candidate.suspicious === 'boolean' &&
        (candidate.suspiciousReason === null || typeof candidate.suspiciousReason === 'string') &&
        (candidate.evidenceLabel === undefined ||
          candidate.evidenceLabel === null ||
          typeof candidate.evidenceLabel === 'string') &&
        (candidate.evidenceKind === undefined ||
          candidate.evidenceKind === null ||
          candidate.evidenceKind === 'FOTO_PRODUCTO' ||
          candidate.evidenceKind === 'SELFIE_LABORANDO' ||
          candidate.evidenceKind === 'EVIDENCIA_ACOMODO' ||
          candidate.evidenceKind === 'OTRA')
      )
    })
  }

export function mergeCampaignEvidenceEntries(
  existingEntries: readonly CampaignEvidenceEntry[],
  newEntries: readonly CampaignEvidenceEntry[]
) {
  const merged = new Map<string, CampaignEvidenceEntry>()

  for (const entry of existingEntries) {
    merged.set(entry.hash, entry)
  }

  for (const entry of newEntries) {
    merged.set(entry.hash, entry)
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.uploadedAt < right.uploadedAt ? 1 : left.uploadedAt > right.uploadedAt ? -1 : 0
  )
}
