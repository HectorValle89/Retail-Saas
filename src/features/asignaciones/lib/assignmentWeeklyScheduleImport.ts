import * as XLSX from 'xlsx'

export interface AssignmentWeeklyScheduleImportRow {
  rowNumber: number
  semanaInicio: string
  claveBtl: string
  diaSemana: number
  diaLabel: 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE' | 'SAB' | 'DOM'
  fechaEspecifica: string
  codigoTurno: string | null
  horaEntrada: string | null
  horaSalida: string | null
  observaciones: string | null
}

export interface AssignmentWeeklyScheduleImportResult {
  rows: AssignmentWeeklyScheduleImportRow[]
  skippedRows: number
}

const DAY_ALIASES: Array<{ pattern: RegExp; label: AssignmentWeeklyScheduleImportRow['diaLabel']; day: number }> = [
  { pattern: /^LUN(?:ES)?$/i, label: 'LUN', day: 1 },
  { pattern: /^MAR(?:TES)?$/i, label: 'MAR', day: 2 },
  { pattern: /^MIE(?:RCOLES)?$|^MIERCOLES$/i, label: 'MIE', day: 3 },
  { pattern: /^JUE(?:VES)?$/i, label: 'JUE', day: 4 },
  { pattern: /^VIE(?:RNES)?$/i, label: 'VIE', day: 5 },
  { pattern: /^SAB(?:ADO)?$|^SABADO$/i, label: 'SAB', day: 6 },
  { pattern: /^DOM(?:INGO)?$/i, label: 'DOM', day: 0 },
]

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
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeUpperText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized ? stripDiacritics(normalized).toUpperCase() : null
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

function normalizeTime(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  if (/^\d{2}:\d{2}$/.test(normalized)) {
    return normalized
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized.slice(0, 5)
  }

  return null
}

function normalizeDia(value: unknown) {
  const normalized = normalizeUpperText(value)
  if (!normalized) {
    return null
  }

  const numeric = Number(normalized)
  if (Number.isInteger(numeric)) {
    const mapped = DAY_ALIASES.find((item) => item.day === numeric)
    return mapped ?? null
  }

  return DAY_ALIASES.find((item) => item.pattern.test(normalized)) ?? null
}

function addDays(baseIso: string, delta: number) {
  const value = new Date(`${baseIso}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + delta)
  return value.toISOString().slice(0, 10)
}

function buildFechaEspecifica(semanaInicio: string, diaSemana: number) {
  const monday = new Date(`${semanaInicio}T00:00:00Z`)
  const mondayDay = monday.getUTCDay()
  const normalizedMonday = addDays(semanaInicio, mondayDay === 1 ? 0 : ((1 - mondayDay + 7) % 7))
  if (diaSemana === 0) {
    return addDays(normalizedMonday, 6)
  }
  return addDays(normalizedMonday, diaSemana - 1)
}

function lookupValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
  }
  return null
}

export function parseAssignmentWeeklyScheduleWorkbook(
  buffer: Buffer | Uint8Array
): AssignmentWeeklyScheduleImportResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('El archivo no contiene hojas legibles.')
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  const rows = new Map<string, AssignmentWeeklyScheduleImportRow>()
  let skippedRows = 0

  rawRows.forEach((rawRow, index) => {
    const normalizedRow = {} as Record<string, unknown>
    for (const [key, value] of Object.entries(rawRow)) {
      normalizedRow[normalizeHeaderKey(key)] = value
    }

    const semanaInicio = normalizeDate(lookupValue(normalizedRow, ['semana_inicio', 'semana', 'inicio_semana']))
    const claveBtl = normalizeText(lookupValue(normalizedRow, ['btl_cve', 'clave_btl', 'pdv_clave_btl']))
    const dia = normalizeDia(lookupValue(normalizedRow, ['dia', 'dia_semana']))
    const codigoTurno = normalizeText(lookupValue(normalizedRow, ['codigo_turno', 'turno', 'nomenclatura']))
    const horaEntrada = normalizeTime(lookupValue(normalizedRow, ['hora_entrada', 'entrada']))
    const horaSalida = normalizeTime(lookupValue(normalizedRow, ['hora_salida', 'salida']))
    const observaciones = normalizeText(lookupValue(normalizedRow, ['observaciones']))

    if (!semanaInicio || !claveBtl || !dia || (!codigoTurno && (!horaEntrada || !horaSalida))) {
      skippedRows += 1
      return
    }

    const row = {
      rowNumber: index + 2,
      semanaInicio,
      claveBtl,
      diaSemana: dia.day,
      diaLabel: dia.label,
      fechaEspecifica: buildFechaEspecifica(semanaInicio, dia.day),
      codigoTurno,
      horaEntrada,
      horaSalida,
      observaciones,
    } satisfies AssignmentWeeklyScheduleImportRow

    const dedupeKey = `${row.semanaInicio}::${row.claveBtl}::${row.fechaEspecifica}`
    if (rows.has(dedupeKey)) {
      skippedRows += 1
    }
    rows.set(dedupeKey, row)
  })

  if (rows.size === 0) {
    throw new Error('El archivo no contiene filas validas para importar horarios.')
  }

  return {
    rows: Array.from(rows.values()).sort((left, right) => left.rowNumber - right.rowNumber),
    skippedRows,
  }
}