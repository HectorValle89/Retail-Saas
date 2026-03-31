export type PrimerAccesoEstado = 'PENDIENTE' | 'CONFIRMADO' | 'CORRECCION_SOLICITADA'

export interface PrimerAccesoMetadata {
  required: boolean
  estado: PrimerAccesoEstado
  source: string | null
  importedAt: string | null
  reviewedAt: string | null
  correctionRequestedAt: string | null
  correctionNote: string | null
  correctionMessageId: string | null
}

const DEFAULT_PRIMER_ACCESO_METADATA: PrimerAccesoMetadata = {
  required: false,
  estado: 'CONFIRMADO',
  source: null,
  importedAt: null,
  reviewedAt: null,
  correctionRequestedAt: null,
  correctionNote: null,
  correctionMessageId: null,
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function normalizeEstado(value: unknown): PrimerAccesoEstado {
  if (value === 'PENDIENTE' || value === 'CONFIRMADO' || value === 'CORRECCION_SOLICITADA') {
    return value
  }

  return DEFAULT_PRIMER_ACCESO_METADATA.estado
}

export function readPrimerAccesoMetadata(metadata: unknown): PrimerAccesoMetadata {
  const root = asRecord(metadata)
  const onboarding = asRecord(root?.onboarding_inicial)
  const primerAcceso = asRecord(onboarding?.primer_acceso)

  if (!primerAcceso) {
    return DEFAULT_PRIMER_ACCESO_METADATA
  }

  return {
    required: Boolean(primerAcceso.required),
    estado: normalizeEstado(primerAcceso.estado),
    source: typeof primerAcceso.source === 'string' ? primerAcceso.source : null,
    importedAt: typeof primerAcceso.importedAt === 'string' ? primerAcceso.importedAt : null,
    reviewedAt: typeof primerAcceso.reviewedAt === 'string' ? primerAcceso.reviewedAt : null,
    correctionRequestedAt:
      typeof primerAcceso.correctionRequestedAt === 'string'
        ? primerAcceso.correctionRequestedAt
        : null,
    correctionNote:
      typeof primerAcceso.correctionNote === 'string' ? primerAcceso.correctionNote : null,
    correctionMessageId:
      typeof primerAcceso.correctionMessageId === 'string'
        ? primerAcceso.correctionMessageId
        : null,
  }
}

export function isPrimerAccesoPendiente(metadata: unknown) {
  const current = readPrimerAccesoMetadata(metadata)
  return current.required && current.estado === 'PENDIENTE'
}

export function writePrimerAccesoMetadata(
  metadata: unknown,
  patch: Partial<PrimerAccesoMetadata>
): Record<string, unknown> {
  const root = asRecord(metadata) ?? {}
  const onboarding = asRecord(root.onboarding_inicial) ?? {}
  const current = readPrimerAccesoMetadata(metadata)

  return {
    ...root,
    onboarding_inicial: {
      ...onboarding,
      primer_acceso: {
        ...current,
        ...patch,
      },
    },
  }
}
