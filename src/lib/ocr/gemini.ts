const GEMINI_MODEL = process.env.GEMINI_OCR_MODEL?.trim() || 'gemini-2.5-flash'

export type OcrProvider = 'gemini'
export type ConfiguredOcrProvider = 'disabled' | 'gemini' | 'codex' | 'antigravity'
export type GeminiOcrStatus =
  | 'ok'
  | 'needs_review'
  | 'unreadable'
  | 'error'
  | 'ocr_no_configurado'
  | 'unsupported_provider'
  | 'gemini_missing_api_key'

export interface GeminiOcrExtractionResult {
  provider: OcrProvider | null
  model: string | null
  status: GeminiOcrStatus
  documentTypeExpected: string | null
  documentTypeDetected: string | null
  employeeName: string | null
  curp: string | null
  rfc: string | null
  nss: string | null
  address: string | null
  employer: string | null
  position: string | null
  documentNumber: string | null
  keyDates: string[]
  extractedText: string | null
  confidenceSummary: string | null
  mismatchHints: string[]
  observations: string[]
  errorMessage: string | null
  extractedAt: string | null
  usage: {
    promptTokenCount: number | null
    candidatesTokenCount: number | null
    totalTokenCount: number | null
  } | null
}

interface GeminiExtractionInput {
  apiKey: string
  buffer: Buffer
  mimeType: string
  fileName: string
  expectedDocumentType: string
  employeeName?: string | null
  model?: string
  fetchImpl?: typeof fetch
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  usage_metadata?: {
    prompt_token_count?: number
    candidates_token_count?: number
    total_token_count?: number
  }
  error?: {
    message?: string
  }
}

interface ConfiguredOcrInput {
  buffer: Buffer
  mimeType: string
  fileName: string
  expectedDocumentType: string
  employeeName?: string | null
  providerOverride?: string | null
  modelOverride?: string | null
}

export interface ResolvedOcrConfiguration {
  provider: ConfiguredOcrProvider | null
  model: string | null
  available: boolean
  status: 'disabled' | 'ready' | 'gemini_missing_api_key' | 'unsupported_provider'
  geminiApiKeyConfigured: boolean
}

function buildBaseResult(
  overrides: Partial<GeminiOcrExtractionResult>
): GeminiOcrExtractionResult {
  return {
    provider: 'gemini',
    model: GEMINI_MODEL,
    status: 'needs_review',
    documentTypeExpected: null,
    documentTypeDetected: null,
    employeeName: null,
    curp: null,
    rfc: null,
    nss: null,
    address: null,
    employer: null,
    position: null,
    documentNumber: null,
    keyDates: [],
    extractedText: null,
    confidenceSummary: null,
    mismatchHints: [],
    observations: [],
    errorMessage: null,
    extractedAt: new Date().toISOString(),
    usage: null,
    ...overrides,
  }
}

function normalizeIdentifier(value: unknown) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return normalized || null
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))
}

function extractJsonCandidate(rawText: string) {
  const trimmed = rawText.trim()

  if (!trimmed) {
    throw new Error('Gemini no devolvio contenido OCR.')
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return trimmed.slice(jsonStart, jsonEnd + 1)
  }

  return trimmed
}

function buildPrompt(expectedDocumentType: string, employeeName?: string | null) {
  return [
    'Eres un extractor OCR+IA para expedientes laborales de Mexico.',
    'Analiza el documento adjunto y devuelve solo JSON valido, sin markdown ni texto adicional.',
    'No inventes datos. Si un dato no aparece claramente, usa null.',
    'Usa status=ok cuando el documento sea legible y los campos clave esten claros.',
    'Usa status=needs_review cuando el documento sea parcial o exista ambiguedad.',
    'Usa status=unreadable cuando practicamente no se pueda leer.',
    `Tipo esperado: ${expectedDocumentType}.`,
    `Empleado esperado: ${employeeName ?? 'desconocido'}.`,
    'Schema JSON requerido:',
    JSON.stringify(
      {
        status: 'ok | needs_review | unreadable',
        documentTypeDetected: 'string | null',
        employeeName: 'string | null',
        curp: 'string | null',
        rfc: 'string | null',
        nss: 'string | null',
        address: 'string | null',
        employer: 'string | null',
        position: 'string | null',
        documentNumber: 'string | null',
        keyDates: ['YYYY-MM-DD or raw strings'],
        confidenceSummary: 'string | null',
        mismatchHints: ['string'],
        observations: ['string'],
        extractedText: 'string | null',
      },
      null,
      2
    ),
  ].join('\n')
}

function normalizeGeminiResult(
  payload: Record<string, unknown>,
  expectedDocumentType: string,
  model: string,
  usage: GeminiOcrExtractionResult['usage']
) {
  const statusRaw = normalizeText(payload.status)?.toLowerCase() ?? 'needs_review'
  const status: GeminiOcrStatus =
    statusRaw === 'ok' || statusRaw === 'needs_review' || statusRaw === 'unreadable'
      ? statusRaw
      : 'needs_review'

  return buildBaseResult({
    provider: 'gemini',
    model,
    status,
    documentTypeExpected: expectedDocumentType,
    documentTypeDetected: normalizeText(payload.documentTypeDetected),
    employeeName: normalizeText(payload.employeeName),
    curp: normalizeIdentifier(payload.curp),
    rfc: normalizeIdentifier(payload.rfc),
    nss: normalizeIdentifier(payload.nss),
    address: normalizeText(payload.address),
    employer: normalizeText(payload.employer),
    position: normalizeText(payload.position),
    documentNumber: normalizeText(payload.documentNumber),
    keyDates: normalizeStringArray(payload.keyDates),
    extractedText: normalizeText(payload.extractedText),
    confidenceSummary: normalizeText(payload.confidenceSummary),
    mismatchHints: normalizeStringArray(payload.mismatchHints),
    observations: normalizeStringArray(payload.observations),
    usage,
  })
}

export async function extractDocumentWithGemini({
  apiKey,
  buffer,
  mimeType,
  fileName,
  expectedDocumentType,
  employeeName,
  model = GEMINI_MODEL,
  fetchImpl = fetch,
}: GeminiExtractionInput): Promise<GeminiOcrExtractionResult> {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildPrompt(expectedDocumentType, employeeName) },
          {
            inline_data: {
              mime_type: mimeType,
              data: buffer.toString('base64'),
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  }

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    }
  )

  const responseJson = (await response.json()) as GeminiApiResponse

  if (!response.ok) {
    return buildBaseResult({
      provider: 'gemini',
      model,
      status: 'error',
      documentTypeExpected: expectedDocumentType,
      errorMessage:
        responseJson?.error?.message ?? `Gemini devolvio HTTP ${response.status} para ${fileName}.`,
      usage: null,
    })
  }

  const rawText = String(
    responseJson?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text ?? '')
      .join('') ?? ''
  ).trim()

  const usageCamel = responseJson?.usageMetadata
  const usageSnake = responseJson?.usage_metadata
  const usageSummary = usageCamel || usageSnake
    ? {
        promptTokenCount:
          Number(usageCamel?.promptTokenCount ?? usageSnake?.prompt_token_count ?? 0) || null,
        candidatesTokenCount:
          Number(usageCamel?.candidatesTokenCount ?? usageSnake?.candidates_token_count ?? 0) || null,
        totalTokenCount:
          Number(usageCamel?.totalTokenCount ?? usageSnake?.total_token_count ?? 0) || null,
      }
    : null

  try {
    const payload = JSON.parse(extractJsonCandidate(rawText)) as Record<string, unknown>
    return normalizeGeminiResult(payload, expectedDocumentType, model, usageSummary)
  } catch (error) {
    return buildBaseResult({
      provider: 'gemini',
      model,
      status: 'error',
      documentTypeExpected: expectedDocumentType,
      extractedText: rawText || null,
      errorMessage:
        error instanceof Error ? error.message : 'No fue posible interpretar la respuesta JSON de Gemini.',
      usage: usageSummary,
    })
  }
}

export async function performConfiguredDocumentOcr({
  buffer,
  mimeType,
  fileName,
  expectedDocumentType,
  employeeName,
  providerOverride,
  modelOverride,
}: ConfiguredOcrInput): Promise<{ provider: string | null; result: GeminiOcrExtractionResult }> {
  const resolved = resolveConfiguredOcrConfiguration({
    providerOverride,
    modelOverride,
  })
  const provider = resolved.provider

  if (!provider) {
    return {
      provider: null,
      result: buildBaseResult({
        provider: null,
        model: null,
        status: 'ocr_no_configurado',
        documentTypeExpected: expectedDocumentType,
        extractedAt: null,
      }),
    }
  }

  if (provider !== 'gemini') {
    return {
      provider,
      result: buildBaseResult({
        provider: null,
        model: null,
        status: 'unsupported_provider',
        documentTypeExpected: expectedDocumentType,
        errorMessage: `OCR_PROVIDER=${provider} todavia no esta implementado.`,
      }),
    }
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    return {
      provider,
      result: buildBaseResult({
        provider: 'gemini',
        model: resolved.model ?? GEMINI_MODEL,
        status: 'gemini_missing_api_key',
        documentTypeExpected: expectedDocumentType,
        errorMessage: 'Falta GEMINI_API_KEY en el entorno del servidor.',
      }),
    }
  }

  try {
    const result = await extractDocumentWithGemini({
      apiKey,
      buffer,
      mimeType,
      fileName,
      expectedDocumentType,
      employeeName,
      model: resolved.model ?? GEMINI_MODEL,
    })

    return {
      provider,
      result,
    }
  } catch (error) {
    return {
      provider,
      result: buildBaseResult({
        provider: 'gemini',
        model: GEMINI_MODEL,
        status: 'error',
        documentTypeExpected: expectedDocumentType,
        errorMessage:
          error instanceof Error ? error.message : 'Fallo inesperado al consultar Gemini OCR.',
      }),
    }
  }
}

export function isConfiguredOcrAvailable() {
  return resolveConfiguredOcrConfiguration().available
}

function normalizeConfiguredProvider(value: string | null | undefined): ConfiguredOcrProvider | null {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (!normalized || normalized === 'disabled') {
    return null
  }

  if (
    normalized === 'gemini' ||
    normalized === 'codex' ||
    normalized === 'antigravity'
  ) {
    return normalized
  }

  return null
}

export function resolveConfiguredOcrConfiguration(options?: {
  providerOverride?: string | null
  modelOverride?: string | null
}): ResolvedOcrConfiguration {
  const provider = normalizeConfiguredProvider(
    options?.providerOverride ?? process.env.OCR_PROVIDER?.trim() ?? null
  )
  const geminiApiKeyConfigured = Boolean(process.env.GEMINI_API_KEY?.trim())
  const model =
    String(options?.modelOverride ?? '').trim() || process.env.GEMINI_OCR_MODEL?.trim() || GEMINI_MODEL

  if (!provider) {
    return {
      provider: null,
      model: null,
      available: false,
      status: 'disabled',
      geminiApiKeyConfigured,
    }
  }

  if (provider !== 'gemini') {
    return {
      provider,
      model: null,
      available: false,
      status: 'unsupported_provider',
      geminiApiKeyConfigured,
    }
  }

  if (!geminiApiKeyConfigured) {
    return {
      provider,
      model,
      available: false,
      status: 'gemini_missing_api_key',
      geminiApiKeyConfigured,
    }
  }

  return {
    provider,
    model,
    available: true,
    status: 'ready',
    geminiApiKeyConfigured,
  }
}
