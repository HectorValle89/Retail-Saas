import * as XLSX from 'xlsx'
import {
  normalizeDiaLaboralCode,
  parseDiasLaborales,
  serializeDiasLaborales,
} from './assignmentPlanning'

export interface AssignmentCatalogImportRow {
  rowNumber: number
  claveBtl: string
  idNomina: string | null
  username: string | null
  nombreDc: string | null
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA'
  factorTiempo: number
  diasLaborales: string | null
  diaDescanso: string | null
  horarioReferencia: string | null
  fechaInicio: string | null
  observaciones: string | null
}

export interface AssignmentCatalogImportIssue {
  rowNumber: number
  code:
    | 'FILA_SIN_BTL'
    | 'FILA_SIN_REFERENCIA_DC'
    | 'FILA_DUPLICADA'
    | 'DIAS_LABORALES_INVALIDOS'
    | 'DESCANSO_INVALIDO'
  severity: 'ERROR' | 'ALERTA'
  message: string
}

export interface AssignmentCatalogImportResult {
  rows: AssignmentCatalogImportRow[]
  skippedRows: number
  issues: AssignmentCatalogImportIssue[]
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

function normalizeTipo(value: unknown): 'FIJA' | 'ROTATIVA' | 'COBERTURA' | null {
  const normalized = normalizeUpperText(value)

  if (!normalized) {
    return null
  }

  if (normalized.includes('COBERT')) {
    return 'COBERTURA'
  }

  if (normalized.includes('ROTAT')) {
    return 'ROTATIVA'
  }

  if (normalized.includes('FIJA')) {
    return 'FIJA'
  }

  return null
}

function normalizeFactorTiempo(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/g, '.').trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      const year = String(parsed.y).padStart(4, '0')
      const month = String(parsed.m).padStart(2, '0')
      const day = String(parsed.d).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split('/')
    return `${year}-${month}-${day}`
  }

  const parsed = Date.parse(normalized)
  if (Number.isNaN(parsed)) {
    return null
  }

  return new Date(parsed).toISOString().slice(0, 10)
}

function normalizeDiaDescanso(value: unknown) {
  const normalized = normalizeUpperText(value)
  if (!normalized) {
    return null
  }

  return normalizeDiaLaboralCode(normalized)
}

function normalizeDiasLaborales(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return {
      diasLaborales: null,
      invalidTokens: [] as string[],
      duplicates: [] as string[],
    }
  }

  const parsed = parseDiasLaborales(normalized)

  return {
    diasLaborales: parsed.dias.length > 0 ? serializeDiasLaborales(parsed.dias) : null,
    invalidTokens: parsed.invalidTokens,
    duplicates: parsed.duplicates,
  }
}

function lookupValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
  }

  return null
}

export function parseAssignmentCatalogWorkbook(
  buffer: Buffer | Uint8Array
): AssignmentCatalogImportResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('El archivo no contiene hojas legibles.')
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  const rows = new Map<string, AssignmentCatalogImportRow>()
  const issues: AssignmentCatalogImportIssue[] = []
  let skippedRows = 0

  rawRows.forEach((rawRow, index) => {
    const normalizedRow: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(rawRow)) {
      normalizedRow[normalizeHeaderKey(key)] = value
    }

    const rowNumber = index + 2
    const claveBtl = normalizeText(
      lookupValue(normalizedRow, ['btl_cve', 'clave_btl', 'pdv_clave_btl'])
    )
    const idNomina = normalizeText(
      lookupValue(normalizedRow, ['idnom', 'id_nomina', 'id_nom'])
    )
    const username = normalizeText(lookupValue(normalizedRow, ['usuario', 'username']))
    const nombreDc = normalizeText(
      lookupValue(normalizedRow, ['nombre_dc', 'nombre_dermoconsejera', 'nombre'])
    )
    const tipo =
      normalizeTipo(lookupValue(normalizedRow, ['rol', 'tipo', 'tipo_demo'])) ?? 'FIJA'
    const factorTiempo = normalizeFactorTiempo(
      lookupValue(normalizedRow, ['dc', 'numero_dc', 'factor_tiempo', '_dc'])
    )
    const diasNormalizados = normalizeDiasLaborales(
      lookupValue(normalizedRow, ['dias', 'dias_laborales', 'nom'])
    )
    const diaDescanso = normalizeDiaDescanso(
      lookupValue(normalizedRow, ['descanso', 'dia_descanso', 'dia_de_descanso'])
    )
    const horarioReferencia = normalizeText(
      lookupValue(normalizedRow, ['horario', 'horario_referencia'])
    )
    const fechaInicio = normalizeDate(
      lookupValue(normalizedRow, ['inicio', 'fecha_inicio'])
    )
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

    if (!idNomina && !username && !nombreDc) {
      issues.push({
        rowNumber,
        code: 'FILA_SIN_REFERENCIA_DC',
        severity: 'ERROR',
        message: 'La fila no tiene IDNOM, USUARIO ni NOMBRE DC para resolver a la dermoconsejera.',
      })
      skippedRows += 1
      return
    }

    if (diasNormalizados.invalidTokens.length > 0 || diasNormalizados.duplicates.length > 0) {
      issues.push({
        rowNumber,
        code: 'DIAS_LABORALES_INVALIDOS',
        severity: 'ERROR',
        message: `Los dias laborales contienen valores invalidos o repetidos: ${[
          ...diasNormalizados.invalidTokens,
          ...diasNormalizados.duplicates,
        ].join(', ')}.`,
      })
    }

    const descansoCapturado = lookupValue(normalizedRow, ['descanso', 'dia_descanso', 'dia_de_descanso'])
    if (descansoCapturado && !diaDescanso) {
      issues.push({
        rowNumber,
        code: 'DESCANSO_INVALIDO',
        severity: 'ERROR',
        message: 'El dia de descanso no usa una nomenclatura valida.',
      })
    }

    const row: AssignmentCatalogImportRow = {
      rowNumber,
      claveBtl,
      idNomina,
      username,
      nombreDc,
      tipo,
      factorTiempo,
      diasLaborales: diasNormalizados.diasLaborales,
      diaDescanso,
      horarioReferencia,
      fechaInicio,
      observaciones,
    }

    const employeeKey = idNomina ?? username ?? nombreDc ?? `row-${row.rowNumber}`
    const dedupeKey = `${employeeKey}::${claveBtl}::${tipo}`
    if (rows.has(dedupeKey)) {
      issues.push({
        rowNumber,
        code: 'FILA_DUPLICADA',
        severity: 'ALERTA',
        message: 'La fila repite la misma combinacion de DC + PDV + tipo. Se conserva la ultima captura.',
      })
      skippedRows += 1
    }

    rows.set(dedupeKey, row)
  })

  if (rows.size === 0) {
    throw new Error('El archivo no contiene filas validas para importar.')
  }

  return {
    rows: Array.from(rows.values()).sort((left, right) => left.rowNumber - right.rowNumber),
    skippedRows,
    issues: issues.sort((left, right) => left.rowNumber - right.rowNumber),
  }
}