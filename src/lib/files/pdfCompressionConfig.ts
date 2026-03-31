export type PdfCompressionProvider = 'local' | 'stirling'

export const PDF_COMPRESSION_PROVIDER_CONFIG_KEY = 'integraciones.pdf.preferred_provider'
export const PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY =
  'integraciones.pdf.stirling_base_url'
export const PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY =
  'integraciones.pdf.stirling_optimize_level'
export const PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY =
  'integraciones.pdf.stirling_image_quality'
export const PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY =
  'integraciones.pdf.stirling_image_dpi'
export const PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY =
  'integraciones.pdf.stirling_fast_web_view'

export const PDF_COMPRESSION_PROVIDER_OPTIONS = [
  { value: 'local', label: 'Local (pdf-lib)' },
  { value: 'stirling', label: 'Stirling PDF' },
] as const

export interface ResolvedPdfCompressionConfiguration {
  provider: PdfCompressionProvider
  stirlingBaseUrl: string | null
  stirlingApiKey: string | null
  optimizeLevel: string
  imageQuality: string
  imageDpi: string
  fastWebView: string
  source: 'CONFIGURACION' | 'ENTORNO'
  available: boolean
  status: 'ready' | 'stirling_missing_base_url'
  apiKeyConfigured: boolean
}

export interface PdfCompressionProbeResult {
  healthy: boolean
  message: string
  endpoint: string | null
  statusCode: number | null
}

interface BuildPdfCompressionConfigurationInput {
  preferredProvider?: unknown
  preferredBaseUrl?: unknown
  preferredOptimizeLevel?: unknown
  preferredImageQuality?: unknown
  preferredImageDpi?: unknown
  preferredFastWebView?: unknown
  envProvider?: string | null
  envBaseUrl?: string | null
  envApiKey?: string | null
  envOptimizeLevel?: string | null
  envImageQuality?: string | null
  envImageDpi?: string | null
  envFastWebView?: string | null
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeProvider(value: unknown): PdfCompressionProvider | null {
  const normalized = normalizeText(value)?.toLowerCase()

  if (normalized === 'local' || normalized === 'stirling') {
    return normalized
  }

  return null
}

function normalizeBooleanString(value: unknown, fallback: string) {
  const normalized = normalizeText(value)?.toLowerCase()

  if (normalized === 'true' || normalized === 'false') {
    return normalized
  }

  return fallback
}

export function buildResolvedPdfCompressionConfiguration(
  input: BuildPdfCompressionConfigurationInput = {}
): ResolvedPdfCompressionConfiguration {
  const preferredProvider = normalizeProvider(input.preferredProvider)
  const preferredBaseUrl = normalizeText(input.preferredBaseUrl)
  const preferredOptimizeLevel = normalizeText(input.preferredOptimizeLevel)
  const preferredImageQuality = normalizeText(input.preferredImageQuality)
  const preferredImageDpi = normalizeText(input.preferredImageDpi)
  const preferredFastWebView = normalizeText(input.preferredFastWebView)
  const hasConfiguredOverride = Boolean(
    preferredProvider ||
      preferredBaseUrl ||
      preferredOptimizeLevel ||
      preferredImageQuality ||
      preferredImageDpi ||
      preferredFastWebView
  )

  const envProvider = normalizeProvider(input.envProvider)
  const provider = preferredProvider ?? envProvider ?? 'local'
  const stirlingBaseUrl = preferredBaseUrl ?? normalizeText(input.envBaseUrl)
  const optimizeLevel = preferredOptimizeLevel ?? normalizeText(input.envOptimizeLevel) ?? '2'
  const imageQuality = preferredImageQuality ?? normalizeText(input.envImageQuality) ?? '70'
  const imageDpi = preferredImageDpi ?? normalizeText(input.envImageDpi) ?? '150'
  const fastWebView = normalizeBooleanString(
    preferredFastWebView ?? input.envFastWebView,
    'true'
  )
  const stirlingApiKey = normalizeText(input.envApiKey)

  if (provider === 'stirling' && !stirlingBaseUrl) {
    return {
      provider,
      stirlingBaseUrl: null,
      stirlingApiKey,
      optimizeLevel,
      imageQuality,
      imageDpi,
      fastWebView,
      source: hasConfiguredOverride ? 'CONFIGURACION' : 'ENTORNO',
      available: false,
      status: 'stirling_missing_base_url',
      apiKeyConfigured: Boolean(stirlingApiKey),
    }
  }

  return {
    provider,
    stirlingBaseUrl,
    stirlingApiKey,
    optimizeLevel,
    imageQuality,
    imageDpi,
    fastWebView,
    source: hasConfiguredOverride ? 'CONFIGURACION' : 'ENTORNO',
    available: true,
    status: 'ready',
    apiKeyConfigured: Boolean(stirlingApiKey),
  }
}

export async function probePdfCompressionProvider(
  config: ResolvedPdfCompressionConfiguration,
  fetchImpl: typeof fetch = fetch
): Promise<PdfCompressionProbeResult> {
  if (config.provider === 'local') {
    return {
      healthy: true,
      message: 'Compresion PDF local lista con pdf-lib.',
      endpoint: null,
      statusCode: null,
    }
  }

  if (!config.stirlingBaseUrl) {
    return {
      healthy: false,
      message: 'Stirling PDF esta seleccionado, pero falta la URL base.',
      endpoint: null,
      statusCode: null,
    }
  }

  const baseUrl = config.stirlingBaseUrl.replace(/\/+$/g, '')
  const endpoints = ['/api/v1/info/status', '/api/v1/health', '/swagger-ui/index.html']
  const headers = new Headers()

  if (config.stirlingApiKey) {
    headers.set('X-API-KEY', config.stirlingApiKey)
  }

  for (const endpoint of endpoints) {
    try {
      const response = await fetchImpl(`${baseUrl}${endpoint}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(1500),
      })

      if (response.ok || response.status === 401 || response.status === 403) {
        return {
          healthy: response.ok,
          message: response.ok
            ? `Stirling PDF responde en ${endpoint}.`
            : `Stirling PDF responde en ${endpoint}, pero requiere API key valida.`,
          endpoint,
          statusCode: response.status,
        }
      }
    } catch {
      // Continue probing alternative endpoints.
    }
  }

  return {
    healthy: false,
    message: 'No fue posible alcanzar Stirling PDF desde la URL configurada.',
    endpoint: null,
    statusCode: null,
  }
}
