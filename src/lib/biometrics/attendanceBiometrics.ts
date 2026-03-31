import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BIOMETRY_PROVIDER_CONFIG_KEY } from '@/features/configuracion/configuracionCatalog'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

export type AttendanceBiometricProvider = 'local-sharp' | 'disabled'

export interface AttendanceBiometricConfig {
  provider: AttendanceBiometricProvider
  threshold: number
}

export interface AttendanceBiometricReferenceAsset {
  source: 'empleado_metadata' | 'documento_ine'
  bucket: string
  path: string
  hash: string | null
}

export interface AttendanceBiometricValidationResult {
  status: 'VALIDA' | 'RECHAZADA' | 'PENDIENTE'
  provider: AttendanceBiometricProvider
  score: number | null
  threshold: number
  reason:
    | 'MATCH'
    | 'MISMATCH'
    | 'NO_REFERENCE'
    | 'REFERENCE_DOWNLOAD_FAILED'
    | 'PROVIDER_DISABLED'
  reference: AttendanceBiometricReferenceAsset | null
}

interface EmployeeBiometricRow {
  supervisor_empleado_id: string | null
  metadata: Record<string, unknown> | null
}

interface EmployeeDocumentRow {
  id: string
  archivo_hash_id: string
  tipo_documento: 'INE'
  estado_documento: 'CARGADO' | 'VALIDADO' | 'OBSERVADO'
  metadata: Record<string, unknown> | null
  created_at: string
}

interface ArchivoHashRow {
  sha256: string
  bucket: string
  ruta_archivo: string
  miniatura_sha256: string | null
  miniatura_bucket: string | null
  miniatura_ruta_archivo: string | null
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function resolveConfigValue(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const payload = value as Record<string, unknown>
    const parsed = Number(payload.value ?? payload.numero ?? payload.defaultValue)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function resolveProviderValue(value: unknown): AttendanceBiometricProvider {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'disabled') {
      return 'disabled'
    }
  }

  return 'local-sharp'
}

function clampThreshold(value: number) {
  return Math.max(0.5, Math.min(0.99, value))
}

export async function resolveAttendanceBiometricConfig(
  service: TypedSupabaseClient
): Promise<AttendanceBiometricConfig> {
  const { data, error } = await service
    .from('configuracion')
    .select('clave, valor')
    .in('clave', [BIOMETRY_PROVIDER_CONFIG_KEY, 'biometria.umbral_similitud'])

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as Array<{ clave: string; valor: unknown }>
  const provider = resolveProviderValue(
    rows.find((item) => item.clave === BIOMETRY_PROVIDER_CONFIG_KEY)?.valor
  )
  const threshold = clampThreshold(
    resolveConfigValue(
      rows.find((item) => item.clave === 'biometria.umbral_similitud')?.valor,
      0.82
    )
  )

  return { provider, threshold }
}

export async function resolveEmployeeBiometricContext(
  service: TypedSupabaseClient,
  empleadoId: string
) {
  const { data, error } = await service
    .from('empleado')
    .select('supervisor_empleado_id, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible recuperar el contexto biometrico del empleado.')
  }

  return data as EmployeeBiometricRow
}

function resolveMetadataReferenceAsset(
  employeeMetadata: Record<string, unknown>
): AttendanceBiometricReferenceAsset | null {
  const biometricMetadata = normalizeMetadata(employeeMetadata.biometria)
  const asset = normalizeMetadata(
    biometricMetadata.reference_asset ??
      biometricMetadata.referenceAsset ??
      employeeMetadata.biometria_reference_asset
  )

  const bucket = typeof asset.bucket === 'string' ? asset.bucket.trim() : ''
  const path = typeof asset.path === 'string' ? asset.path.trim() : ''
  const hash = typeof asset.hash === 'string' ? asset.hash.trim() : null

  if (!bucket || !path) {
    return null
  }

  return {
    source: 'empleado_metadata',
    bucket,
    path,
    hash: hash || null,
  }
}

export async function resolveEmployeeBiometricReference(
  service: TypedSupabaseClient,
  empleadoId: string,
  employeeMetadata: Record<string, unknown>
): Promise<AttendanceBiometricReferenceAsset | null> {
  const metadataReference = resolveMetadataReferenceAsset(employeeMetadata)

  if (metadataReference) {
    return metadataReference
  }

  const { data: documentRows, error: documentError } = await service
    .from('empleado_documento')
    .select('id, archivo_hash_id, tipo_documento, estado_documento, metadata, created_at')
    .eq('empleado_id', empleadoId)
    .eq('tipo_documento', 'INE')
    .in('estado_documento', ['VALIDADO', 'CARGADO'])
    .order('created_at', { ascending: false })
    .limit(1)

  if (documentError) {
    throw new Error(documentError.message)
  }

  const latestDocument = ((documentRows ?? []) as EmployeeDocumentRow[])[0]

  if (!latestDocument?.archivo_hash_id) {
    return null
  }

  const { data: hashRow, error: hashError } = await service
    .from('archivo_hash')
    .select(
      'sha256, bucket, ruta_archivo, miniatura_sha256, miniatura_bucket, miniatura_ruta_archivo'
    )
    .eq('id', latestDocument.archivo_hash_id)
    .maybeSingle()

  if (hashError || !hashRow) {
    throw new Error(hashError?.message ?? 'No fue posible recuperar el hash del documento de referencia.')
  }

  const asset = hashRow as ArchivoHashRow
  const bucket = asset.miniatura_bucket ?? asset.bucket
  const path = asset.miniatura_ruta_archivo ?? asset.ruta_archivo
  const hash = asset.miniatura_sha256 ?? asset.sha256

  if (!bucket || !path) {
    return null
  }

  return {
    source: 'documento_ine',
    bucket,
    path,
    hash,
  }
}

async function downloadStorageAsset(
  service: TypedSupabaseClient,
  asset: AttendanceBiometricReferenceAsset
) {
  const { data, error } = await service.storage.from(asset.bucket).download(asset.path)

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible descargar el activo biometrico de referencia.')
  }

  return Buffer.from(await data.arrayBuffer())
}

async function buildFingerprint(buffer: Buffer) {
  const { data } = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(128, 128, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .grayscale()
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const blocksPerSide = 16
  const blockSize = 8
  const vector: number[] = []

  for (let by = 0; by < blocksPerSide; by += 1) {
    for (let bx = 0; bx < blocksPerSide; bx += 1) {
      let total = 0

      for (let y = 0; y < blockSize; y += 1) {
        for (let x = 0; x < blockSize; x += 1) {
          const pixelIndex = (by * blockSize + y) * 128 + (bx * blockSize + x)
          total += data[pixelIndex] ?? 0
        }
      }

      vector.push(total / (blockSize * blockSize * 255))
    }
  }

  const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length
  const centered = vector.map((value) => value - mean)
  const magnitude = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0)) || 1

  return centered.map((value) => value / magnitude)
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length)
  let total = 0

  for (let index = 0; index < length; index += 1) {
    total += left[index] * right[index]
  }

  return total
}

export async function compareBiometricBuffers({
  selfieBuffer,
  referenceBuffer,
}: {
  selfieBuffer: Buffer
  referenceBuffer: Buffer
}) {
  const [selfieFingerprint, referenceFingerprint] = await Promise.all([
    buildFingerprint(selfieBuffer),
    buildFingerprint(referenceBuffer),
  ])

  const cosine = cosineSimilarity(selfieFingerprint, referenceFingerprint)
  return Math.max(0, Math.min(1, (cosine + 1) / 2))
}

export async function validateAttendanceBiometrics({
  service,
  empleadoId,
  selfieBuffer,
}: {
  service: TypedSupabaseClient
  empleadoId: string
  selfieBuffer: Buffer
}): Promise<AttendanceBiometricValidationResult> {
  const config = await resolveAttendanceBiometricConfig(service)

  if (config.provider === 'disabled') {
    return {
      status: 'PENDIENTE',
      provider: config.provider,
      score: null,
      threshold: config.threshold,
      reason: 'PROVIDER_DISABLED',
      reference: null,
    }
  }

  const employee = await resolveEmployeeBiometricContext(service, empleadoId)
  const reference = await resolveEmployeeBiometricReference(
    service,
    empleadoId,
    normalizeMetadata(employee.metadata)
  )

  if (!reference) {
    return {
      status: 'PENDIENTE',
      provider: config.provider,
      score: null,
      threshold: config.threshold,
      reason: 'NO_REFERENCE',
      reference: null,
    }
  }

  try {
    const referenceBuffer = await downloadStorageAsset(service, reference)
    const score = await compareBiometricBuffers({
      selfieBuffer,
      referenceBuffer,
    })

    if (score >= config.threshold) {
      return {
        status: 'VALIDA',
        provider: config.provider,
        score,
        threshold: config.threshold,
        reason: 'MATCH',
        reference,
      }
    }

    return {
      status: 'RECHAZADA',
      provider: config.provider,
      score,
      threshold: config.threshold,
      reason: 'MISMATCH',
      reference,
    }
  } catch {
    return {
      status: 'PENDIENTE',
      provider: config.provider,
      score: null,
      threshold: config.threshold,
      reason: 'REFERENCE_DOWNLOAD_FAILED',
      reference,
    }
  }
}
