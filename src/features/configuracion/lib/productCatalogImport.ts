import * as XLSX from 'xlsx'

export interface ProductCatalogImportRow {
  sku: string
  nombre: string
  nombreCorto: string
  categoria: string
  top30: boolean
  activo: boolean
}

export interface ProductCatalogImportResult {
  rows: ProductCatalogImportRow[]
  skippedRows: number
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

function normalizeWhitespace(value: unknown) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.length > 0 ? normalized : null
}

function normalizeUpperAscii(value: unknown) {
  const normalized = normalizeWhitespace(value)
  return normalized ? stripDiacritics(normalized).toUpperCase() : null
}

function normalizeBooleanFlag(value: unknown) {
  return normalizeUpperAscii(value) === 'SI'
}

export function parseProductCatalogWorkbook(buffer: Buffer | Uint8Array): ProductCatalogImportResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('El archivo no contiene hojas legibles.')
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  const bySku = new Map<string, ProductCatalogImportRow>()
  let skippedRows = 0

  for (const rawRow of rawRows) {
    const normalizedRow: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(rawRow)) {
      normalizedRow[normalizeHeaderKey(key)] = value
    }

    const sku = normalizeWhitespace(normalizedRow.sky ?? normalizedRow.sku)
    const nombre = normalizeWhitespace(normalizedRow.producto ?? normalizedRow.nombre)
    const nombreCorto = normalizeWhitespace(
      normalizedRow.nombre_corto ?? normalizedRow.nombrecorto ?? normalizedRow.nombre_corto_1
    )
    const categoria = normalizeUpperAscii(normalizedRow.categoria)

    if (!sku || !nombre || !nombreCorto || !categoria) {
      skippedRows += 1
      continue
    }

    bySku.set(sku, {
      sku,
      nombre,
      nombreCorto,
      categoria,
      top30: normalizeBooleanFlag(normalizedRow.top_30 ?? normalizedRow.top30),
      activo: true,
    })
  }

  if (bySku.size === 0) {
    throw new Error('El archivo no contiene productos validos para importar.')
  }

  return {
    rows: Array.from(bySku.values()).sort((left, right) =>
      left.nombreCorto.localeCompare(right.nombreCorto, 'es')
    ),
    skippedRows,
  }
}
