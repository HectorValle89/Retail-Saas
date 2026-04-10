import * as XLSX from 'xlsx'

export type PdvRotacionClasificacionImport = 'FIJO' | 'ROTATIVO'
export type PdvRotacionSlot = 'A' | 'B' | 'C'

export interface PdvRotacionCatalogImportRow {
  rowNumber: number
  claveBtl: string
  nombrePdv: string | null
  estatusPdv: string | null
  clasificacionMaestra: PdvRotacionClasificacionImport | null
  grupoRotacionCodigo: string | null
  grupoTamano: 2 | 3 | null
  slotRotacion: PdvRotacionSlot | null
  pdvRelacionado1: string | null
  pdvRelacionado2: string | null
  referenciaDcActual: string | null
  observaciones: string | null
}

export interface PdvRotacionCatalogImportIssue {
  rowNumber: number
  code:
    | 'FILA_SIN_BTL'
    | 'FILA_DUPLICADA'
    | 'CLASIFICACION_INVALIDA'
    | 'TAMANO_GRUPO_INVALIDO'
    | 'SLOT_INVALIDO'
  severity: 'ERROR' | 'ALERTA'
  message: string
}

export interface PdvRotacionCatalogImportResult {
  rows: PdvRotacionCatalogImportRow[]
  skippedRows: number
  issues: PdvRotacionCatalogImportIssue[]
}

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeHeaderKey(header: unknown) {
  return stripDiacritics(String(header ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.length > 0 ? normalized : null
}

function normalizeUpperText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized ? stripDiacritics(normalized).toUpperCase() : null
}

function normalizeClasificacion(value: unknown): PdvRotacionClasificacionImport | null {
  const normalized = normalizeUpperText(value)

  if (!normalized) {
    return null
  }

  if (normalized.includes('ROTAT')) {
    return 'ROTATIVO'
  }

  if (normalized.includes('FIJ')) {
    return 'FIJO'
  }

  return null
}

function normalizeGroupSize(value: unknown): 2 | 3 | null {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  if (parsed === 2 || parsed === 3) {
    return parsed
  }

  return null
}

function normalizeSlot(value: unknown): PdvRotacionSlot | null {
  const normalized = normalizeUpperText(value)
  if (!normalized) {
    return null
  }

  if (normalized === 'A' || normalized === 'B' || normalized === 'C') {
    return normalized
  }

  return null
}

function lookupValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
  }

  return null
}

export function parsePdvRotationCatalogWorkbook(
  buffer: Buffer | Uint8Array
): PdvRotacionCatalogImportResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('El archivo no contiene hojas legibles.')
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  const rows = new Map<string, PdvRotacionCatalogImportRow>()
  const issues: PdvRotacionCatalogImportIssue[] = []
  let skippedRows = 0

  rawRows.forEach((rawRow, index) => {
    const normalizedRow: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(rawRow)) {
      normalizedRow[normalizeHeaderKey(key)] = value
    }

    const rowNumber = index + 2
    const claveBtl = normalizeText(lookupValue(normalizedRow, ['btl_cve', 'clave_btl', 'pdv_clave_btl']))
    const nombrePdv = normalizeText(lookupValue(normalizedRow, ['nombre_pdv', 'nombre_sucursal', 'nombre']))
    const estatusPdv = normalizeUpperText(lookupValue(normalizedRow, ['estatus_pdv', 'estatus']))
    const clasificacionRaw = lookupValue(normalizedRow, ['clasificacion_maestra', 'clasificacion', 'tipo_pdv'])
    const clasificacionMaestra = normalizeClasificacion(clasificacionRaw)
    const grupoRotacionCodigo = normalizeText(lookupValue(normalizedRow, ['grupo_rotacion', 'grupo_rotacion_codigo', 'grupo']))
    const tamanoRaw = lookupValue(normalizedRow, ['tamano_grupo', 'grupo_tamano', 'tamano'])
    const grupoTamano = normalizeGroupSize(tamanoRaw)
    const slotRaw = lookupValue(normalizedRow, ['posicion', 'slot_rotacion', 'slot'])
    const slotRotacion = normalizeSlot(slotRaw)
    const pdvRelacionado1 = normalizeText(lookupValue(normalizedRow, ['pdv_relacionado_1', 'relacionado_1']))
    const pdvRelacionado2 = normalizeText(lookupValue(normalizedRow, ['pdv_relacionado_2', 'relacionado_2']))
    const referenciaDcActual = normalizeText(lookupValue(normalizedRow, ['referencia_dc_actual', 'dc_actual', 'referencia_dc']))
    const observaciones = normalizeText(lookupValue(normalizedRow, ['observaciones']))

    if (!claveBtl) {
      issues.push({
        rowNumber,
        code: 'FILA_SIN_BTL',
        severity: 'ERROR',
        message: 'La fila no tiene BTL CVE y no puede importarse.',
      })
      skippedRows += 1
      return
    }

    if (clasificacionRaw && !clasificacionMaestra) {
      issues.push({
        rowNumber,
        code: 'CLASIFICACION_INVALIDA',
        severity: 'ERROR',
        message: 'La clasificacion maestra debe ser FIJO o ROTATIVO.',
      })
    }

    if (tamanoRaw && !grupoTamano) {
      issues.push({
        rowNumber,
        code: 'TAMANO_GRUPO_INVALIDO',
        severity: 'ERROR',
        message: 'El tamano del grupo debe ser 2 o 3.',
      })
    }

    if (slotRaw && !slotRotacion) {
      issues.push({
        rowNumber,
        code: 'SLOT_INVALIDO',
        severity: 'ERROR',
        message: 'La posicion del grupo debe ser A, B o C.',
      })
    }

    if (rows.has(claveBtl)) {
      issues.push({
        rowNumber,
        code: 'FILA_DUPLICADA',
        severity: 'ALERTA',
        message: 'La clave BTL ya venia en el archivo. Se toma la ultima fila visible.',
      })
    }

    rows.set(claveBtl, {
      rowNumber,
      claveBtl,
      nombrePdv,
      estatusPdv,
      clasificacionMaestra,
      grupoRotacionCodigo,
      grupoTamano,
      slotRotacion,
      pdvRelacionado1,
      pdvRelacionado2,
      referenciaDcActual,
      observaciones,
    })
  })

  return {
    rows: Array.from(rows.values()),
    skippedRows,
    issues,
  }
}