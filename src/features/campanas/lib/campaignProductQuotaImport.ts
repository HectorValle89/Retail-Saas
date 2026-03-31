import * as XLSX from 'xlsx'
import type { CampaignGoalType } from './campaignProgress'

export interface CampaignProductQuotaImportRow {
  rowNumber: number
  claveBtl: string
  sku: string | null
  articulo: string | null
  cuota: number
  goalType: CampaignGoalType
  notes: string | null
}

export interface CampaignProductQuotaImportResult {
  rows: CampaignProductQuotaImportRow[]
}

const HEADER_ALIASES = {
  claveBtl: ['BTL CVE', 'ID BTL', 'CLAVE BTL', 'BTL_CVE'],
  sku: ['SKU', 'CODIGO ARTICULO', 'ARTICULO SKU', 'SKU ARTICULO'],
  articulo: ['ARTICULO', 'PRODUCTO', 'NOMBRE ARTICULO', 'NOMBRE PRODUCTO', 'NOMBRE_CORTO'],
  cuota: ['CUOTA', 'META', 'CUOTA ASIGNADA', 'CUOTA_PRODUCTO'],
  goalType: ['TIPO META', 'TIPO_META', 'TIPO'],
  notes: ['OBSERVACIONES', 'NOTAS', 'DESCRIPCION'],
} as const

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function normalizeValue(value: unknown) {
  return String(value ?? '').trim()
}

function resolveHeaderKey(headers: string[], aliases: readonly string[]) {
  const normalizedAliasSet = new Set(aliases.map((alias) => normalizeHeader(alias)))
  return headers.find((header) => normalizedAliasSet.has(normalizeHeader(header))) ?? null
}

function resolveGoalType(rawValue: string): CampaignGoalType {
  const normalized = normalizeHeader(rawValue)
  return normalized === 'EXHIBICION' ? 'EXHIBICION' : 'VENTA'
}

function buildDuplicateKey(row: CampaignProductQuotaImportRow) {
  return `${row.claveBtl}::${row.sku ?? row.articulo ?? 'SIN-ARTICULO'}`
}

export function parseCampaignProductQuotaWorkbook(buffer: Buffer): CampaignProductQuotaImportResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('El archivo de metas por PDV no contiene hojas.')
  }

  const worksheet = workbook.Sheets[firstSheetName]
  if (!worksheet) {
    throw new Error('No fue posible leer la hoja principal del archivo.')
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
  })

  if (rows.length === 0) {
    throw new Error('El archivo de metas por PDV no contiene registros.')
  }

  const headers = Object.keys(rows[0] ?? {})
  const claveBtlHeader = resolveHeaderKey(headers, HEADER_ALIASES.claveBtl)
  const skuHeader = resolveHeaderKey(headers, HEADER_ALIASES.sku)
  const articuloHeader = resolveHeaderKey(headers, HEADER_ALIASES.articulo)
  const cuotaHeader = resolveHeaderKey(headers, HEADER_ALIASES.cuota)
  const goalTypeHeader = resolveHeaderKey(headers, HEADER_ALIASES.goalType)
  const notesHeader = resolveHeaderKey(headers, HEADER_ALIASES.notes)

  if (!claveBtlHeader || !cuotaHeader || (!skuHeader && !articuloHeader)) {
    throw new Error(
      'La plantilla debe incluir al menos las columnas BTL CVE, CUOTA y SKU o ARTICULO.'
    )
  }

  const parsedRows = rows
    .map((row, index) => {
      const claveBtl = normalizeValue(row[claveBtlHeader])
      const sku = skuHeader ? normalizeValue(row[skuHeader]) : ''
      const articulo = articuloHeader ? normalizeValue(row[articuloHeader]) : ''
      const cuotaValue = Number(normalizeValue(row[cuotaHeader]))
      const rowNumber = index + 2

      if (!claveBtl && !sku && !articulo && !normalizeValue(row[cuotaHeader])) {
        return null
      }

      if (!claveBtl) {
        throw new Error(`La fila ${rowNumber} no trae BTL CVE.`)
      }

      if (!sku && !articulo) {
        throw new Error(`La fila ${rowNumber} debe traer SKU o ARTICULO.`)
      }

      if (!Number.isFinite(cuotaValue) || cuotaValue < 0) {
        throw new Error(`La fila ${rowNumber} tiene una cuota invalida.`)
      }

      return {
        rowNumber,
        claveBtl,
        sku: sku || null,
        articulo: articulo || null,
        cuota: Number(cuotaValue.toFixed(2)),
        goalType: resolveGoalType(goalTypeHeader ? normalizeValue(row[goalTypeHeader]) : ''),
        notes: notesHeader ? normalizeValue(row[notesHeader]) || null : null,
      } satisfies CampaignProductQuotaImportRow
    })
    .filter((row): row is CampaignProductQuotaImportRow => row !== null)

  if (parsedRows.length === 0) {
    throw new Error('El archivo de metas por PDV no contiene filas operativas.')
  }

  const seen = new Set<string>()
  for (const row of parsedRows) {
    const key = buildDuplicateKey(row)
    if (seen.has(key)) {
      throw new Error(
        `El archivo repite la combinacion ${row.claveBtl} + ${row.sku ?? row.articulo} en la fila ${row.rowNumber}.`
      )
    }
    seen.add(key)
  }

  return { rows: parsedRows }
}
