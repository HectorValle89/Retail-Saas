import type { MaterialDistributionPreview, MaterialRulePreview } from './materialDistributionImport'

const GEMINI_MODEL = process.env.GEMINI_MATERIALS_MODEL?.trim() || process.env.GEMINI_OCR_MODEL?.trim() || 'gemini-2.5-flash'

export type MaterialGeminiStatus = 'ok' | 'warning' | 'error' | 'no_configurado'

export interface MaterialGeminiRuleSuggestion {
  materialKey: string
  materialType: string | null
  excluirDeRegistrarEntrega: boolean | null
  requiereTicketMes: boolean | null
  requiereEvidenciaEntregaMes: boolean | null
  requiereEvidenciaMercadeo: boolean | null
  esRegaloDc: boolean | null
  mecanicaCanje: string | null
  indicacionesProducto: string | null
  instruccionesMercadeo: string | null
  observaciones: string | null
}

export interface MaterialDistributionGeminiAnalysis {
  status: MaterialGeminiStatus
  provider: 'gemini' | null
  model: string | null
  summary: string | null
  warnings: string[]
  observations: string[]
  ruleSuggestions: MaterialGeminiRuleSuggestion[]
  rawText: string | null
  errorMessage: string | null
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  error?: { message?: string }
}

function buildPrompt(preview: MaterialDistributionPreview) {
  const summarizedRules = preview.materialRules.slice(0, 120).map((rule) => ({
    materialKey: rule.key,
    blockName: rule.blockName,
    displayName: rule.displayName,
    materialType: rule.materialType,
    selected: rule.selected,
    assignedQuantityTotal: rule.assignedQuantityTotal,
    pdvCount: rule.pdvCount,
    flags: rule.flags,
  }))

  const sheetSummaries = preview.sheetSummaries
  const warningSummaries = preview.warnings.slice(0, 80)

  return [
    'Quiero que analices una estructura resumida de un archivo Excel que representa la dispersión mensual de materiales por punto de venta (PDV).',
    'No quiero explicación libre. Devuelve exclusivamente JSON válido.',
    'Tu objetivo es mejorar la interpretación del archivo para un sistema operativo.',
    'Analiza hojas o bloques, materiales, encabezados homologados y advertencias detectadas.',
    'Por cada producto del bloque, si puedes inferir mejor el tipo y sus reglas mensuales, devuélvelo.',
    'Si no estás seguro, deja los campos en null y agrega observaciones o warnings.',
    'Salida esperada:',
    '{',
    '  "summary": string | null,',
    '  "warnings": string[],',
    '  "observations": string[],',
    '  "ruleSuggestions": [{',
    '    "materialKey": string,',
    '    "materialType": string | null,',
    '    "excluirDeRegistrarEntrega": boolean | null,',
    '    "requiereTicketMes": boolean | null,',
    '    "requiereEvidenciaEntregaMes": boolean | null,',
    '    "requiereEvidenciaMercadeo": boolean | null,',
    '    "esRegaloDc": boolean | null,',
    '    "mecanicaCanje": string | null,',
    '    "indicacionesProducto": string | null,',
    '    "instruccionesMercadeo": string | null,',
    '    "observaciones": string | null',
    '  }]',
    '}',
    '',
    'Resumen de hojas:',
    JSON.stringify(sheetSummaries, null, 2),
    '',
    'Reglas detectadas por parser:',
    JSON.stringify(summarizedRules, null, 2),
    '',
    'Advertencias existentes:',
    JSON.stringify(warningSummaries, null, 2),
  ].join('\n')
}

function extractJsonCandidate(rawText: string) {
  const trimmed = rawText.trim()
  if (!trimmed) {
    throw new Error('Gemini no devolvió contenido.')
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

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item))
}

function normalizeRuleSuggestions(value: unknown, baseRules: MaterialRulePreview[]) {
  if (!Array.isArray(value)) {
    return [] as MaterialGeminiRuleSuggestion[]
  }

  const knownKeys = new Set(baseRules.map((rule) => rule.key))
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const record = item as Record<string, unknown>
      const materialKey = normalizeText(record.materialKey)
      if (!materialKey || !knownKeys.has(materialKey)) {
        return null
      }
      return {
        materialKey,
        materialType: normalizeText(record.materialType),
        excluirDeRegistrarEntrega:
          typeof record.excluirDeRegistrarEntrega === 'boolean' ? record.excluirDeRegistrarEntrega : null,
        requiereTicketMes: typeof record.requiereTicketMes === 'boolean' ? record.requiereTicketMes : null,
        requiereEvidenciaEntregaMes:
          typeof record.requiereEvidenciaEntregaMes === 'boolean' ? record.requiereEvidenciaEntregaMes : null,
        requiereEvidenciaMercadeo:
          typeof record.requiereEvidenciaMercadeo === 'boolean' ? record.requiereEvidenciaMercadeo : null,
        esRegaloDc: typeof record.esRegaloDc === 'boolean' ? record.esRegaloDc : null,
        mecanicaCanje: normalizeText(record.mecanicaCanje),
        indicacionesProducto: normalizeText(record.indicacionesProducto),
        instruccionesMercadeo: normalizeText(record.instruccionesMercadeo),
        observaciones: normalizeText(record.observaciones),
      } satisfies MaterialGeminiRuleSuggestion
    })
    .filter((item): item is MaterialGeminiRuleSuggestion => Boolean(item))
}

export async function analyzeMaterialDistributionWithGemini(
  preview: MaterialDistributionPreview
): Promise<MaterialDistributionGeminiAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    return {
      status: 'no_configurado',
      provider: null,
      model: null,
      summary: null,
      warnings: ['Gemini no está configurado en el servidor. Se usa solo el parser estructurado.'],
      observations: [],
      ruleSuggestions: [],
      rawText: null,
      errorMessage: null,
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(preview) }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    const payload = (await response.json()) as GeminiApiResponse
    if (!response.ok || payload.error?.message) {
      throw new Error(payload.error?.message ?? `Gemini devolvió ${response.status}.`)
    }

    const rawText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
    const jsonCandidate = extractJsonCandidate(rawText)
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>

    return {
      status: 'ok',
      provider: 'gemini',
      model: GEMINI_MODEL,
      summary: normalizeText(parsed.summary),
      warnings: normalizeStringArray(parsed.warnings),
      observations: normalizeStringArray(parsed.observations),
      ruleSuggestions: normalizeRuleSuggestions(parsed.ruleSuggestions, preview.materialRules),
      rawText,
      errorMessage: null,
    }
  } catch (error) {
    return {
      status: 'warning',
      provider: 'gemini',
      model: GEMINI_MODEL,
      summary: null,
      warnings: ['El análisis Gemini falló; se conserva el preview estructurado del parser.'],
      observations: [],
      ruleSuggestions: [],
      rawText: null,
      errorMessage: error instanceof Error ? error.message : 'No fue posible analizar el archivo con Gemini.',
    }
  }
}
