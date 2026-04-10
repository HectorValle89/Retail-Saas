import * as XLSX from 'xlsx'
import type { PdvRotationTemplateRow } from './pdvRotationTemplate'

export type LegacyPdvRole = 'FIJA' | 'ROTATIVA'

export interface PdvRotationLegacyRow {
  rowNumber: number
  claveBtl: string
  cadena: string | null
  idPdv: string | null
  nombrePdv: string | null
  idNomina: string | null
  usuario: string | null
  nombreDc: string | null
  fraccionDc: number | null
  rolPerm: LegacyPdvRole | null
}

export interface PdvRotationLegacyIssue {
  rowNumber: number | null
  claveBtl: string | null
  severity: 'ERROR' | 'ALERTA'
  code:
    | 'FILA_SIN_BTL'
    | 'ROL_PERM_INVALIDO'
    | 'FRACCION_INVALIDA'
    | 'ROTATIVA_SIN_REFERENCIA'
    | 'GRUPO_ROTATIVO_INVALIDO'
    | 'PAREJA_MANUAL_INCOMPLETA'
    | 'PAREJA_MANUAL_INVALIDA'
    | 'FILA_DUPLICADA'
  message: string
}

export interface ParsePdvRotationLegacyWorkbookResult {
  rows: PdvRotationLegacyRow[]
  skippedRows: number
  issues: PdvRotationLegacyIssue[]
}

export interface PdvRotationLegacyManualPair {
  code: string
  members: [string, string]
}

export interface ConvertPdvRotationLegacyResult {
  rows: PdvRotationTemplateRow[]
  summary: {
    parsedRows: number
    skippedRows: number
    convertedRows: number
    fijos: number
    rotativos: number
    naturalGroups: number
    manualGroups: number
    issues: number
  }
  issues: PdvRotationLegacyIssue[]
}

const LEGACY_OUTPUT_FILENAME = 'isdin_rotacion_maestra_convertida_desde_legacy.xlsx'

export const ISDIN_POR_CUBRIR_MANUAL_PAIRS: PdvRotationLegacyManualPair[] = [
  { code: 'ROT-ISDIN-MAN-001', members: ['BTL-FAH-CUMB-WN', 'BTL-FAH-PLAZ-S5'] },
  { code: 'ROT-ISDIN-MAN-002', members: ['BTL-FAH-RIOR-AF', 'BTL-FAH-SANP-J4'] },
  { code: 'ROT-ISDIN-MAN-003', members: ['BTL-FAH-LUIS-9S', 'BTL-FAH-POLA-HM'] },
  { code: 'ROT-ISDIN-MAN-004', members: ['BTL-LIV-GUAD-7E', 'BTL-LIV-LZAP-J5'] },
  { code: 'ROT-ISDIN-MAN-005', members: ['BTL-LIV-TLAQ-3W', 'BTL-LIV-ZAPO-DM'] },
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
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.length > 0 ? normalized : null
}

function normalizeUpperText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized ? stripDiacritics(normalized).toUpperCase() : null
}

function lookupValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
  }

  return null
}

function normalizeLegacyRole(value: unknown): LegacyPdvRole | null {
  const normalized = normalizeUpperText(value)
  if (!normalized) {
    return null
  }

  if (normalized.includes('ROTAT')) {
    return 'ROTATIVA'
  }

  if (normalized.includes('FIJ')) {
    return 'FIJA'
  }

  return null
}

function normalizeFraction(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeReferenceName(value: string | null) {
  if (!value) {
    return null
  }

  return stripDiacritics(value).replace(/\s+/g, ' ').trim().toUpperCase()
}

function buildNaturalGroupCode(accountIdentifier: string, ordinal: number) {
  const normalized = accountIdentifier
    .replace(/[^A-Z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()

  return `ROT-${normalized || 'CUENTA'}-${String(ordinal).padStart(3, '0')}`
}

function buildManualPairLookup(pairs: PdvRotationLegacyManualPair[]) {
  const lookup = new Map<string, { code: string; position: 'A' | 'B'; related: string }>()

  for (const pair of pairs) {
    lookup.set(pair.members[0], { code: pair.code, position: 'A', related: pair.members[1] })
    lookup.set(pair.members[1], { code: pair.code, position: 'B', related: pair.members[0] })
  }

  return lookup
}

export function parsePdvRotationLegacyWorkbook(
  buffer: Buffer | Uint8Array
): ParsePdvRotationLegacyWorkbookResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('El archivo legacy no contiene hojas legibles.')
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  const rows = new Map<string, PdvRotationLegacyRow>()
  const issues: PdvRotationLegacyIssue[] = []
  let skippedRows = 0

  rawRows.forEach((rawRow, index) => {
    const normalizedRow: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(rawRow)) {
      normalizedRow[normalizeHeaderKey(key)] = value
    }

    const rowNumber = index + 2
    const claveBtl = normalizeText(lookupValue(normalizedRow, ['btl_cve', 'clave_btl']))
    const cadena = normalizeText(lookupValue(normalizedRow, ['cadena']))
    const idPdv = normalizeText(lookupValue(normalizedRow, ['id_pdv']))
    const nombrePdv = normalizeText(lookupValue(normalizedRow, ['sucursal', 'sucursal_', 'nombre_pdv']))
    const idNomina = normalizeText(lookupValue(normalizedRow, ['idnom', 'id_nomina']))
    const usuario = normalizeText(lookupValue(normalizedRow, ['usuario']))
    const nombreDc = normalizeText(lookupValue(normalizedRow, ['nombre_dc']))
    const fraccionRaw = lookupValue(normalizedRow, ['dc', '_dc', 'fraccion_dc'])
    const fraccionDc = normalizeFraction(fraccionRaw)
    const rolRaw = lookupValue(normalizedRow, ['rol_perm', 'rol'])
    const rolPerm = normalizeLegacyRole(rolRaw)

    if (!claveBtl) {
      issues.push({
        rowNumber,
        claveBtl: null,
        severity: 'ERROR',
        code: 'FILA_SIN_BTL',
        message: 'La fila no tiene BTL CVE y no puede convertirse.',
      })
      skippedRows += 1
      return
    }

    if (rolRaw && !rolPerm) {
      issues.push({
        rowNumber,
        claveBtl,
        severity: 'ERROR',
        code: 'ROL_PERM_INVALIDO',
        message: 'ROL PERM debe ser FIJA o ROTATIVA.',
      })
    }

    if (fraccionRaw && fraccionDc === null) {
      issues.push({
        rowNumber,
        claveBtl,
        severity: 'ERROR',
        code: 'FRACCION_INVALIDA',
        message: '# DC debe ser numerico.',
      })
    }

    if (rows.has(claveBtl)) {
      issues.push({
        rowNumber,
        claveBtl,
        severity: 'ALERTA',
        code: 'FILA_DUPLICADA',
        message: 'La clave BTL ya venia en el archivo legacy. Se toma la ultima fila visible.',
      })
    }

    rows.set(claveBtl, {
      rowNumber,
      claveBtl,
      cadena,
      idPdv,
      nombrePdv,
      idNomina,
      usuario,
      nombreDc,
      fraccionDc,
      rolPerm,
    })
  })

  return {
    rows: Array.from(rows.values()),
    skippedRows,
    issues,
  }
}

export function convertPdvRotationLegacyRows(
  rows: PdvRotationLegacyRow[],
  options: {
    accountIdentifier: string
    manualPairs?: PdvRotationLegacyManualPair[]
  }
): ConvertPdvRotationLegacyResult {
  const issues: PdvRotationLegacyIssue[] = []
  const manualPairs = options.manualPairs ?? []
  const manualPairLookup = buildManualPairLookup(manualPairs)
  const rowsByClave = new Map(rows.map((row) => [row.claveBtl, row]))
  const outputByClave = new Map<string, PdvRotationTemplateRow>()
  const naturalGroups = new Map<string, PdvRotationLegacyRow[]>()

  for (const pair of manualPairs) {
    for (const clave of pair.members) {
      const row = rowsByClave.get(clave) ?? null
      if (!row) {
        issues.push({
          rowNumber: null,
          claveBtl: clave,
          severity: 'ERROR',
          code: 'PAREJA_MANUAL_INCOMPLETA',
          message: `La pareja manual ${pair.code} referencia ${clave} y ese PDV no existe en el archivo legacy.`,
        })
        continue
      }

      if (row.rolPerm !== 'ROTATIVA') {
        issues.push({
          rowNumber: row.rowNumber,
          claveBtl: row.claveBtl,
          severity: 'ERROR',
          code: 'PAREJA_MANUAL_INVALIDA',
          message: `La pareja manual ${pair.code} solo puede usarse con PDVs ROTATIVA.`,
        })
      }
    }
  }

  for (const row of rows) {
    if (manualPairLookup.has(row.claveBtl)) {
      continue
    }

    const isPorCubrir = normalizeReferenceName(row.nombreDc) === 'POR CUBRIR'
    if (row.rolPerm === 'ROTATIVA' && !isPorCubrir) {
      const key = row.idNomina ?? row.usuario ?? normalizeReferenceName(row.nombreDc)

      if (!key) {
        issues.push({
          rowNumber: row.rowNumber,
          claveBtl: row.claveBtl,
          severity: 'ERROR',
          code: 'ROTATIVA_SIN_REFERENCIA',
          message: 'El PDV ROTATIVA no tiene referencia de DC para formar grupo automatico.',
        })
        continue
      }

      const current = naturalGroups.get(key) ?? []
      current.push(row)
      naturalGroups.set(key, current)
    }
  }

  let naturalOrdinal = 1
  const sortedNaturalGroups = Array.from(naturalGroups.entries()).sort((left, right) =>
    left[0].localeCompare(right[0], 'es-MX')
  )

  for (const [, groupRows] of sortedNaturalGroups) {
    if (groupRows.length !== 2 && groupRows.length !== 3) {
      for (const row of groupRows) {
        issues.push({
          rowNumber: row.rowNumber,
          claveBtl: row.claveBtl,
          severity: 'ERROR',
          code: 'GRUPO_ROTATIVO_INVALIDO',
          message: 'Un grupo rotativo natural debe cerrar con 2 o 3 PDVs.',
        })
      }
      continue
    }

    const groupCode = buildNaturalGroupCode(options.accountIdentifier, naturalOrdinal)
    naturalOrdinal += 1
    const orderedRows = groupRows.slice().sort((left, right) => left.claveBtl.localeCompare(right.claveBtl, 'es-MX'))
    const slots = groupRows.length === 3 ? (['A', 'B', 'C'] as const) : (['A', 'B'] as const)

    orderedRows.forEach((row, index) => {
      const related = orderedRows.filter((candidate) => candidate.claveBtl !== row.claveBtl)
      outputByClave.set(row.claveBtl, {
        claveBtl: row.claveBtl,
        nombrePdv: row.nombrePdv,
        estatusPdv: 'ACTIVO',
        clasificacionMaestra: 'ROTATIVO',
        grupoRotacion: groupCode,
        tamanoGrupo: orderedRows.length as 2 | 3,
        posicion: slots[index],
        pdvRelacionado1: related[0]?.claveBtl ?? null,
        pdvRelacionado2: related[1]?.claveBtl ?? null,
        referenciaDcActual: row.nombreDc,
        observaciones: 'Convertido automaticamente desde archivo legacy por grupo natural de la DC.',
      })
    })
  }

  for (const row of rows) {
    const manualPair = manualPairLookup.get(row.claveBtl) ?? null
    const isPorCubrir = normalizeReferenceName(row.nombreDc) === 'POR CUBRIR'

    if (manualPair) {
      outputByClave.set(row.claveBtl, {
        claveBtl: row.claveBtl,
        nombrePdv: row.nombrePdv,
        estatusPdv: 'ACTIVO',
        clasificacionMaestra: 'ROTATIVO',
        grupoRotacion: manualPair.code,
        tamanoGrupo: 2,
        posicion: manualPair.position,
        pdvRelacionado1: manualPair.related,
        pdvRelacionado2: null,
        referenciaDcActual: row.nombreDc ?? 'POR CUBRIR',
        observaciones: 'Pareja manual definida por operacion para PDV rotativo vacante.',
      })
      continue
    }

    if (outputByClave.has(row.claveBtl)) {
      continue
    }

    if (row.rolPerm === 'FIJA' && row.fraccionDc === 1) {
      outputByClave.set(row.claveBtl, {
        claveBtl: row.claveBtl,
        nombrePdv: row.nombrePdv,
        estatusPdv: 'ACTIVO',
        clasificacionMaestra: 'FIJO',
        grupoRotacion: null,
        tamanoGrupo: null,
        posicion: null,
        pdvRelacionado1: null,
        pdvRelacionado2: null,
        referenciaDcActual: row.nombreDc,
        observaciones: isPorCubrir
          ? 'PDV fijo vacante conservado como FIJO desde archivo legacy.'
          : 'Convertido automaticamente desde archivo legacy.',
      })
      continue
    }

    issues.push({
      rowNumber: row.rowNumber,
      claveBtl: row.claveBtl,
      severity: 'ERROR',
      code: 'GRUPO_ROTATIVO_INVALIDO',
      message: 'La fila legacy no pudo convertirse a la topologia maestra oficial.',
    })
  }

  const outputRows = rows
    .map((row) => outputByClave.get(row.claveBtl) ?? null)
    .filter((row): row is PdvRotationTemplateRow => Boolean(row))

  return {
    rows: outputRows,
    summary: {
      parsedRows: rows.length,
      skippedRows: 0,
      convertedRows: outputRows.length,
      fijos: outputRows.filter((row) => row.clasificacionMaestra === 'FIJO').length,
      rotativos: outputRows.filter((row) => row.clasificacionMaestra === 'ROTATIVO').length,
      naturalGroups: new Set(
        outputRows
          .filter((row) => row.grupoRotacion && !row.grupoRotacion.includes('-MAN-'))
          .map((row) => row.grupoRotacion as string)
      ).size,
      manualGroups: new Set(
        outputRows
          .filter((row) => row.grupoRotacion && row.grupoRotacion.includes('-MAN-'))
          .map((row) => row.grupoRotacion as string)
      ).size,
      issues: issues.length,
    },
    issues,
  }
}

export function convertPdvRotationLegacyWorkbook(
  buffer: Buffer | Uint8Array,
  options: {
    accountIdentifier: string
    manualPairs?: PdvRotationLegacyManualPair[]
  }
) {
  const parsed = parsePdvRotationLegacyWorkbook(buffer)
  const converted = convertPdvRotationLegacyRows(parsed.rows, options)

  return {
    rows: converted.rows,
    summary: {
      ...converted.summary,
      skippedRows: parsed.skippedRows,
    },
    issues: [...parsed.issues, ...converted.issues],
  }
}

export function getPdvRotationLegacyOutputFilename() {
  return LEGACY_OUTPUT_FILENAME
}