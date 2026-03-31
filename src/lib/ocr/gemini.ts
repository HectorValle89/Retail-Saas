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
  postalCode: string | null
  phoneNumber: string | null
  email: string | null
  birthDate: string | null
  employmentStartDate: string | null
  age: number | null
  yearsWorking: number | null
  sex: string | null
  maritalStatus: string | null
  originPlace: string | null
  dailyBaseSalary: number | null
  addressSourceDocumentType: string | null
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
    postalCode: null,
    phoneNumber: null,
    email: null,
    birthDate: null,
    employmentStartDate: null,
    age: null,
    yearsWorking: null,
    sex: null,
    maritalStatus: null,
    originPlace: null,
    dailyBaseSalary: null,
    addressSourceDocumentType: null,
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

function translateGeminiNarrative(value: string | null) {
  if (!value) {
    return null
  }

  let translated = value.trim()

  const replacements: Array<[RegExp, string]> = [
    [/The document is mostly legible, but there are inconsistencies in personal data and employment history\./gi, 'El documento es mayormente legible, pero hay inconsistencias en los datos personales y en el historial laboral.'],
    [/The document is mostly legible\./gi, 'El documento es mayormente legible.'],
    [/The document is legible and the key fields are clear\./gi, 'El documento es legible y los campos clave son claros.'],
    [/The document is legible\./gi, 'El documento es legible.'],
    [/Multiple addresses are present, and the sex on the INE mismatches other documents\./gi, 'Hay multiples domicilios y el sexo que aparece en la INE no coincide con otros documentos.'],
    [/Multiple addresses are present\./gi, 'Hay multiples domicilios en el expediente.'],
    [/Employment start date and daily base salary are not clearly defined\./gi, 'La fecha de ingreso y el SBC diario no estan claramente definidos.'],
    [/Employment start date is not clearly defined\./gi, 'La fecha de ingreso no esta claramente definida.'],
    [/Daily base salary is not clearly defined\./gi, 'El SBC diario no esta claramente definido.'],
    [/Personal data/gi, 'datos personales'],
    [/employment history/gi, 'historial laboral'],
    [/daily base salary/gi, 'SBC diario'],
    [/employment start date/gi, 'fecha de ingreso'],
    [/Multiple addresses/gi, 'Multiples domicilios'],
    [/The sex on the INE mismatches other documents/gi, 'El sexo que aparece en la INE no coincide con otros documentos'],
  ]

  for (const [pattern, replacement] of replacements) {
    translated = translated.replace(pattern, replacement)
  }

  return translated
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(String(value).replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeIsoDate(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
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
    'Analiza TODO el expediente adjunto antes de extraer cualquier dato y devuelve solo JSON valido, sin markdown ni texto adicional.',
    'Todas las cadenas narrativas que devuelvas deben estar en espanol latino.',
    'No inventes datos. Si un dato no aparece claramente, usa null.',
    'Ignora informacion de documentos no oficiales aunque parezca plausible. No completes campos con inferencias ni con datos estimados.',
    'Usa status=ok cuando el documento sea legible y los campos clave esten claros.',
    'Usa status=needs_review cuando el documento sea parcial o exista ambiguedad.',
    'Usa status=unreadable cuando practicamente no se pueda leer.',
    `Tipo esperado: ${expectedDocumentType}.`,
    `Empleado esperado: ${employeeName ?? 'desconocido'}.`,
    'Si el archivo es un expediente completo con multiples documentos, primero identifica cada documento y despues consolida solo los datos provenientes de fuentes autorizadas.',
    'FUENTES AUTORIZADAS POR CAMPO:',
    '- employeeName: usar solo CURP, acta de nacimiento, constancia RFC o INE. Ignorar nombre de CV, cartas o formatos internos si contradicen documentos oficiales.',
    '- curp: usar solo documento CURP o acta de nacimiento si la CURP aparece claramente. No tomar CURP de CV ni de formatos internos.',
    '- rfc: usar solo constancia de situacion fiscal / RFC oficial del SAT. Ignorar RFC escrito en CV, solicitudes o formatos internos.',
    '- nss: usar solo carta de derechos del IMSS / documento oficial donde aparezca el NSS. Ignorar NSS de CV, contratos o notas internas.',
    '- birthDate: usar solo CURP, acta de nacimiento o INE. Si se puede derivar con certeza desde la CURP oficial, se permite; si hay conflicto, usa null.',
    '- address y postalCode: usar solo COMPROBANTE_DOMICILIO. COMPROBANTE_DOMICILIO valido incluye recibo de luz, agua, telefono, internet, gas u otro servicio del hogar. Prioriza SIEMPRE el comprobante de domicilio por encima de la INE. Solo usa la INE para domicilio si no existe un comprobante de domicilio legible en el expediente.',
    '- phoneNumber y email: usar solo CV o solicitud del candidato cuando esten claramente visibles. Si no existe CV legible, usa null.',
    '- sex: usar solo CURP, acta de nacimiento o INE.',
    '- maritalStatus: usar solo acta de nacimiento, INE u otro documento oficial que lo exprese claramente. No inferirlo.',
    '- originPlace: usar solo acta de nacimiento, CURP o INE cuando el lugar de origen/nacimiento sea explicito.',
    '- employmentStartDate, yearsWorking, dailyBaseSalary, employer, position: tratarlos como irrelevantes para este flujo si no vienen en un documento oficial laboral expresamente autorizado. No inferirlos desde CV ni desde cartas informales.',
    'DOCUMENTOS IRRELEVANTES PARA DATOS PERSONALES: cartas simples, formatos internos, curriculum vitae (excepto telefono y correo), contratos borrador, notas manuscritas, checklist internos, solicitudes sin soporte oficial y cualquier hoja no oficial.',
    'Si dos documentos oficiales se contradicen, usa null en el campo afectado, agrega una explicacion en mismatchHints y deja status=needs_review.',
    'Si un campo solo aparece en una fuente no autorizada, usa null y puedes explicar en observations que fue descartado por no ser oficial.',
    'Devuelve birthDate y employmentStartDate en formato YYYY-MM-DD cuando sea posible.',
    'Devuelve age y yearsWorking como enteros.',
    'Devuelve dailyBaseSalary como numero decimal sin simbolos.',
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
        postalCode: 'string | null',
        phoneNumber: 'string | null',
        email: 'string | null',
        birthDate: 'YYYY-MM-DD | null',
        employmentStartDate: 'YYYY-MM-DD | null',
        age: 'number | null',
        yearsWorking: 'number | null',
        sex: 'string | null',
        maritalStatus: 'string | null',
        originPlace: 'string | null',
        dailyBaseSalary: 'number | null',
        addressSourceDocumentType: 'COMPROBANTE_DOMICILIO | INE | OTRO | null',
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
    postalCode: normalizeText(payload.postalCode),
    phoneNumber: normalizeText(payload.phoneNumber),
    email: normalizeText(payload.email),
    birthDate: normalizeIsoDate(payload.birthDate),
    employmentStartDate: normalizeIsoDate(payload.employmentStartDate),
    age: normalizeNumber(payload.age),
    yearsWorking: normalizeNumber(payload.yearsWorking),
    sex: normalizeText(payload.sex),
    maritalStatus: normalizeText(payload.maritalStatus),
    originPlace: normalizeText(payload.originPlace),
    dailyBaseSalary: normalizeNumber(payload.dailyBaseSalary),
    addressSourceDocumentType: normalizeText(payload.addressSourceDocumentType),
    employer: normalizeText(payload.employer),
    position: normalizeText(payload.position),
    documentNumber: normalizeText(payload.documentNumber),
    keyDates: normalizeStringArray(payload.keyDates),
    extractedText: normalizeText(payload.extractedText),
    confidenceSummary: translateGeminiNarrative(normalizeText(payload.confidenceSummary)),
    mismatchHints: normalizeStringArray(payload.mismatchHints).map((item) => translateGeminiNarrative(item) ?? item),
    observations: normalizeStringArray(payload.observations).map((item) => translateGeminiNarrative(item) ?? item),
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
      thinkingConfig: {
        thinkingBudget: 0,
      },
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
