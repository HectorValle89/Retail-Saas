import * as XLSX from 'xlsx'

export type SurveyQuestionType = 'OPCION_MULTIPLE' | 'RESPUESTA_LIBRE'

export interface ImportedSurveyQuestion {
  orden: number
  titulo: string
  descripcion: string | null
  tipoPregunta: SurveyQuestionType
  obligatoria: boolean
  opciones: Array<{ id: string; label: string }>
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function parseBoolean(value: unknown) {
  const normalized = normalizeString(value).toLowerCase()
  return !(normalized === 'false' || normalized === '0' || normalized === 'no')
}

function parseQuestionType(value: unknown): SurveyQuestionType {
  const normalized = normalizeString(value).toUpperCase()
  if (normalized === 'RESPUESTA_LIBRE') {
    return 'RESPUESTA_LIBRE'
  }

  return 'OPCION_MULTIPLE'
}

function normalizeOptions(raw: unknown, tipoPregunta: SurveyQuestionType) {
  if (tipoPregunta === 'RESPUESTA_LIBRE') {
    return [] as Array<{ id: string; label: string }>
  }

  const labels = normalizeString(raw)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)

  if (labels.length < 2) {
    throw new Error('Cada pregunta de opcion multiple necesita al menos dos opciones separadas por "|".')
  }

  return labels.map((label, index) => ({ id: `opt-${index + 1}`, label }))
}

export function parseMessageSurveyWorkbook(buffer: Buffer, fileName: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error(`El archivo ${fileName} no contiene hojas legibles.`)
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
  })

  if (rows.length === 0) {
    throw new Error('La plantilla de encuesta viene vacia.')
  }

  const questions: ImportedSurveyQuestion[] = rows.map((row, index) => {
    const orden = Number(row.ORDEN ?? index + 1)
    const titulo = normalizeString(row.PREGUNTA)
    const descripcion = normalizeString(row.DESCRIPCION) || null
    const tipoPregunta = parseQuestionType(row.TIPO)
    const obligatoria = parseBoolean(row.OBLIGATORIA)

    if (!titulo) {
      throw new Error(`La fila ${index + 2} no contiene la pregunta.`)
    }

    return {
      orden: Number.isFinite(orden) && orden > 0 ? orden : index + 1,
      titulo,
      descripcion,
      tipoPregunta,
      obligatoria,
      opciones: normalizeOptions(row.OPCIONES, tipoPregunta),
    }
  })

  return questions.sort((a, b) => a.orden - b.orden)
}
