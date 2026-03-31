import * as XLSX from 'xlsx'

export type MaterialImportWarningSeverity = 'warning' | 'error'

export interface MaterialImportWarning {
  code: string
  severity: MaterialImportWarningSeverity
  message: string
  sheetName?: string | null
  rowNumber?: number | null
  idBtl?: string | null
  idPdvCadena?: string | null
  materialKey?: string | null
}

export interface MaterialRuleFlags {
  excluirDeRegistrarEntrega: boolean
  requiereTicketMes: boolean
  requiereEvidenciaEntregaMes: boolean
  requiereEvidenciaMercadeo: boolean
  esRegaloDc: boolean
}

export interface MaterialRulePreview {
  key: string
  blockKey: string
  blockName: string
  displayName: string
  materialType: string
  sourceContext: string | null
  totalColumn: number | null
  sheetNames: string[]
  mecanicaCanje: string | null
  indicacionesProducto: string | null
  instruccionesMercadeo: string | null
  selected: boolean
  assignedQuantityTotal: number
  pdvCount: number
  flags: MaterialRuleFlags
}

export interface MaterialPdvPackageItem {
  materialKey: string
  blockKey: string
  blockName: string
  materialDisplayName: string
  quantity: number
  totalColumn: number | null
  sourceContext: string | null
  sheetName: string
  rowNumber: number
}

export interface MaterialPdvMatch {
  matched: boolean
  pdvId: string | null
  pdvNombre: string | null
  pdvClaveBtl: string | null
}

export interface MaterialPdvPackage {
  packageKey: string
  idBtl: string | null
  cadena: string | null
  idPdvCadena: string | null
  sucursal: string | null
  nombreDc: string | null
  idNominaDc: string | null
  territorio: string | null
  sheetNames: string[]
  rowNumbers: number[]
  pdvMatch: MaterialPdvMatch
  materials: MaterialPdvPackageItem[]
}

export interface MaterialSheetSummary {
  sheetName: string
  rowCount: number
  packageCount: number
  productCount: number
  totalAssignedQuantity: number
  warningCount: number
}

export interface MaterialDistributionPreview {
  resolvedMonth: string
  sheetSummaries: MaterialSheetSummary[]
  pdvPackages: MaterialPdvPackage[]
  materialRules: MaterialRulePreview[]
  warnings: MaterialImportWarning[]
  unmatchedRows: MaterialImportWarning[]
  canConfirm: boolean
}

export interface ParseWorkbookOptions {
  fileName?: string | null
  monthOverride?: string | null
}

type BaseColumnKey = 'id_btl' | 'cadena' | 'id' | 'sucursal' | 'nombre_dc' | 'id_nomina' | 'territorio'

const HEADER_ALIASES: Record<BaseColumnKey, string[]> = {
  id_btl: ['ID BTL', 'CLAVE BTL', 'BTL', 'IDBTL'],
  cadena: ['CADENA'],
  id: ['ID', 'ID PDV CADENA', 'ID CADENA'],
  sucursal: ['SUCURSAL', 'NOMBRE SUCURSAL'],
  nombre_dc: ['NOMBRE DC', 'NOMBRE CDB', 'DERMOCONSEJERA', 'NOMBRE DERMOCONSEJERA'],
  id_nomina: ['ID NOMINA', 'ID NÓMINA', 'NOMINA', 'NÓMINA'],
  territorio: ['TERRITORIO'],
}

const SPANISH_MONTHS: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
}

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return normalized || null
}

function normalizeKey(value: string | null) {
  if (!value) {
    return null
  }

  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeHeaderToken(value: string | null) {
  return stripDiacritics(value ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeInteger(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(String(value).replace(/,/g, '').trim())
  return Number.isInteger(parsed) ? parsed : null
}

function inferMaterialType(label: string, context: string | null) {
  const haystack = stripDiacritics(`${label} ${context ?? ''}`).toLowerCase()

  if (haystack.includes('tester')) {
    return 'TESTER'
  }
  if (haystack.includes('dosis')) {
    return 'DOSIS'
  }
  if (haystack.includes('muestra')) {
    return 'MUESTRA'
  }
  if (haystack.includes('regalo')) {
    return 'REGALO'
  }
  if (haystack.includes('canje')) {
    return 'CANJE_PROMOCIONAL'
  }
  return 'PROMOCIONAL'
}

function normalizePresetToken(value: string | null) {
  const token = normalizeHeaderToken(value)
  if (!token) {
    return null
  }

  if (token.startsWith('TESTER')) {
    return 'TESTER'
  }
  if (token.startsWith('DOSIS')) {
    return 'DOSIS'
  }
  if (token.startsWith('CANJE')) {
    return 'CANJE'
  }
  if (token.startsWith('REGALO_DC') || token.startsWith('REGALO DC')) {
    return 'REGALO_DC'
  }

  return null
}

function parsePresetAndMechanic(value: string | null) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return {
      preset: null,
      mechanic: null,
      raw: null,
    }
  }

  const separators = ['||', '|', '::', ' - ', ':']
  for (const separator of separators) {
    if (!normalized.includes(separator)) {
      continue
    }

    const [left, ...rest] = normalized.split(separator)
    const preset = normalizePresetToken(left)
    if (!preset) {
      continue
    }

    return {
      preset,
      mechanic: normalizeText(rest.join(separator)),
      raw: normalized,
    }
  }

  return {
    preset: normalizePresetToken(normalized),
    mechanic: null,
    raw: normalized,
  }
}

function resolveMaterialType(label: string, context: string | null, preset: string | null) {
  if (preset === 'CANJE') {
    return 'CANJE_PROMOCIONAL'
  }

  if (preset === 'REGALO_DC') {
    return 'REGALO'
  }

  if (preset) {
    return preset
  }

  return inferMaterialType(label, context)
}

function inferFlags(label: string, context: string | null, preset: string | null): MaterialRuleFlags {
  if (preset === 'TESTER') {
    return {
      excluirDeRegistrarEntrega: true,
      requiereTicketMes: false,
      requiereEvidenciaEntregaMes: false,
      requiereEvidenciaMercadeo: true,
      esRegaloDc: false,
    }
  }

  if (preset === 'DOSIS') {
    return {
      excluirDeRegistrarEntrega: true,
      requiereTicketMes: false,
      requiereEvidenciaEntregaMes: false,
      requiereEvidenciaMercadeo: false,
      esRegaloDc: false,
    }
  }

  if (preset === 'REGALO_DC') {
    return {
      excluirDeRegistrarEntrega: true,
      requiereTicketMes: false,
      requiereEvidenciaEntregaMes: false,
      requiereEvidenciaMercadeo: false,
      esRegaloDc: true,
    }
  }

  if (preset === 'CANJE') {
    return {
      excluirDeRegistrarEntrega: false,
      requiereTicketMes: false,
      requiereEvidenciaEntregaMes: true,
      requiereEvidenciaMercadeo: false,
      esRegaloDc: false,
    }
  }

  const haystack = stripDiacritics(`${label} ${context ?? ''}`).toLowerCase()
  const exclude = /tester|dosis de inicio|dosis|muestra/.test(haystack)
  const regaloDc = /regalo/.test(haystack) && /dc|dermoconsej/.test(haystack)
  const requiereMercadeo = /mercadeo|exhib|exhibicion|planograma|display|tester/.test(haystack)
  const requiereTicket = /ticket/.test(haystack)
  const requiereEvidenciaEntrega = !/no requiere evidencia/.test(haystack) && !exclude && !regaloDc

  return {
    excluirDeRegistrarEntrega: exclude || regaloDc,
    requiereTicketMes: requiereTicket,
    requiereEvidenciaEntregaMes: requiereEvidenciaEntrega,
    requiereEvidenciaMercadeo: requiereMercadeo,
    esRegaloDc: regaloDc,
  }
}

function buildMonth(year: string, month: string) {
  return `${year}-${month}-01`
}

function inferMonthFromText(value: string | null) {
  if (!value) {
    return null
  }

  const normalized = stripDiacritics(value).toLowerCase()
  const isoMatch = normalized.match(/(20\d{2})[-_/\. ](0?[1-9]|1[0-2])/)
  if (isoMatch) {
    return buildMonth(isoMatch[1], isoMatch[2].padStart(2, '0'))
  }

  for (const [monthName, monthNumber] of Object.entries(SPANISH_MONTHS)) {
    const monthIndex = normalized.indexOf(monthName)
    if (monthIndex >= 0) {
      const yearMatch = normalized.slice(monthIndex).match(/(20\d{2})/)
      if (yearMatch) {
        return buildMonth(yearMatch[1], monthNumber)
      }
    }
  }

  return null
}

function uniquePush(values: string[], next: string | null) {
  if (next && !values.includes(next)) {
    values.push(next)
  }
}

function isRowCompletelyEmpty(row: unknown[]) {
  return row.every((value) => normalizeText(value) === null)
}

function resolveHeaderIndexes(row: unknown[]) {
  const indexes = new Map<BaseColumnKey, number>()

  row.forEach((cell, index) => {
    const token = normalizeHeaderToken(normalizeText(cell))
    if (!token) {
      return
    }

    ;(Object.entries(HEADER_ALIASES) as Array<[BaseColumnKey, string[]]>).forEach(([key, aliases]) => {
      if (!indexes.has(key) && aliases.includes(token)) {
        indexes.set(key, index)
      }
    })
  })

  const requiredKeys: BaseColumnKey[] = ['id_btl', 'cadena', 'id', 'sucursal', 'nombre_dc', 'id_nomina']
  const hasAllRequired = requiredKeys.every((key) => indexes.has(key))

  return {
    indexes,
    hasAllRequired,
  }
}

function findHeaderRowIndex(rows: unknown[][]) {
  const scanLimit = Math.min(rows.length, 8)

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const resolved = resolveHeaderIndexes(rows[rowIndex] ?? [])
    if (resolved.hasAllRequired) {
      return {
        rowIndex,
        indexes: resolved.indexes,
      }
    }
  }

  return null
}

function normalizeBtlKey(value: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

export function parseMaterialDistributionWorkbook(
  buffer: Buffer | Uint8Array,
  options: ParseWorkbookOptions = {}
): MaterialDistributionPreview {
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  if (workbook.SheetNames.length === 0) {
    throw new Error('El archivo no contiene hojas legibles.')
  }

  const warnings: MaterialImportWarning[] = []
  const rulesByKey = new Map<string, MaterialRulePreview>()
  const packagesByKey = new Map<string, MaterialPdvPackage>()
  const sheetSummaries: MaterialSheetSummary[] = []
  const inferredMonths: string[] = []

  const fileMonth = inferMonthFromText(options.monthOverride ?? options.fileName ?? null)
  if (fileMonth) {
    inferredMonths.push(fileMonth)
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    })

    if (rows.length < 2) {
      warnings.push({
        code: 'sheet_too_short',
        severity: 'error',
        message: `La hoja ${sheetName} no tiene registros suficientes para leer dispersión por bloque.`,
        sheetName,
      })
      sheetSummaries.push({
        sheetName,
        rowCount: 0,
        packageCount: 0,
        productCount: 0,
        totalAssignedQuantity: 0,
        warningCount: 1,
      })
      continue
    }

    const header = findHeaderRowIndex(rows)
    if (!header) {
      warnings.push({
        code: 'sheet_header_not_found',
        severity: 'error',
        message: `La hoja ${sheetName} no contiene el encabezado homologado esperado con ID BTL, CADENA, ID, SUCURSAL, NOMBRE DC e ID NÓMINA.`,
        sheetName,
      })
      sheetSummaries.push({
        sheetName,
        rowCount: 0,
        packageCount: 0,
        productCount: 0,
        totalAssignedQuantity: 0,
        warningCount: 1,
      })
      continue
    }

    const blockKey = normalizeKey(sheetName) ?? `bloque_${sheetSummaries.length + 1}`
    const headerRow = rows[header.rowIndex] ?? []
    const idBtlIndex = header.indexes.get('id_btl')!
    const cadenaIndex = header.indexes.get('cadena')!
    const idIndex = header.indexes.get('id')!
    const sucursalIndex = header.indexes.get('sucursal')!
    const nombreDcIndex = header.indexes.get('nombre_dc')!
    const idNominaIndex = header.indexes.get('id_nomina')!
    const territorioIndex = header.indexes.get('territorio') ?? null
    const productStartIndex = Math.max(...Array.from(header.indexes.values())) + 1
    const contextRow = header.rowIndex >= 2 ? rows[header.rowIndex - 2] ?? [] : []
    const totalsRow = header.rowIndex >= 1 ? rows[header.rowIndex - 1] ?? [] : []
    const dataRows = rows.slice(header.rowIndex + 1)

    let packageCount = 0
    let warningCount = 0
    let totalAssignedQuantity = 0
    const seenProductKeys = new Set<string>()
    const productColumns: Array<{ index: number; materialKey: string; materialName: string }> = []

    for (let columnIndex = productStartIndex; columnIndex < headerRow.length; columnIndex += 1) {
      const materialName = normalizeText(headerRow[columnIndex])
      if (!materialName) {
        continue
      }

      const materialKeyBase = normalizeKey(materialName)
      if (!materialKeyBase) {
        continue
      }

      const materialKey = `${blockKey}__${materialKeyBase}`
      if (seenProductKeys.has(materialKey)) {
        warnings.push({
          code: 'duplicate_product_header',
          severity: 'warning',
          message: `La hoja ${sheetName} repite el encabezado de producto ${materialName}. Se consolidará dentro del mismo bloque.`,
          sheetName,
          materialKey,
        })
        warningCount += 1
        continue
      }
      seenProductKeys.add(materialKey)
      productColumns.push({ index: columnIndex, materialKey, materialName })

      const presetInfo = parsePresetAndMechanic(normalizeText(contextRow[columnIndex]))
      const materialType = resolveMaterialType(materialName, presetInfo.raw, presetInfo.preset)
      const flags = inferFlags(materialName, presetInfo.raw, presetInfo.preset)

      rulesByKey.set(materialKey, {
        key: materialKey,
        blockKey,
        blockName: sheetName,
        displayName: materialName,
        materialType,
        sourceContext: presetInfo.raw,
        totalColumn: normalizeInteger(totalsRow[columnIndex]) ?? 0,
        sheetNames: [sheetName],
        mecanicaCanje: presetInfo.preset === 'CANJE' ? presetInfo.mechanic : null,
        indicacionesProducto: presetInfo.preset === 'CANJE' ? null : presetInfo.mechanic,
        instruccionesMercadeo: presetInfo.preset === 'TESTER' ? presetInfo.mechanic : null,
        selected: true,
        assignedQuantityTotal: 0,
        pdvCount: 0,
        flags,
      })
    }

    if (productColumns.length === 0) {
      warnings.push({
        code: 'sheet_without_products',
        severity: 'error',
        message: `La hoja ${sheetName} no contiene columnas de producto después de TERRITORIO.`,
        sheetName,
      })
      sheetSummaries.push({
        sheetName,
        rowCount: dataRows.length,
        packageCount: 0,
        productCount: 0,
        totalAssignedQuantity: 0,
        warningCount: warningCount + 1,
      })
      continue
    }

    dataRows.forEach((row, rowOffset) => {
      const rowNumber = header.rowIndex + rowOffset + 2
      if (isRowCompletelyEmpty(row)) {
        return
      }

      const idBtl = normalizeText(row[idBtlIndex])
      const cadena = normalizeText(row[cadenaIndex])
      const idPdvCadena = normalizeText(row[idIndex])
      const sucursal = normalizeText(row[sucursalIndex])
      const nombreDc = normalizeText(row[nombreDcIndex])
      const idNominaDc = normalizeText(row[idNominaIndex])
      const territorio = territorioIndex === null ? null : normalizeText(row[territorioIndex])

      if (!idBtl) {
        warnings.push({
          code: 'missing_id_btl',
          severity: 'error',
          message: `La hoja ${sheetName} tiene una fila sin ID BTL en la fila ${rowNumber}.`,
          sheetName,
          rowNumber,
        })
        warningCount += 1
        return
      }

      if (!idNominaDc && nombreDc) {
        warnings.push({
          code: 'missing_nomina_dc',
          severity: 'warning',
          message: `La fila ${rowNumber} del PDV ${idBtl} trae nombre de DC pero no ID Nómina; se tratará como vacante hasta que exista asignación viva.`,
          sheetName,
          rowNumber,
          idBtl,
          idPdvCadena,
        })
        warningCount += 1
      }

      if (idNominaDc && !nombreDc) {
        warnings.push({
          code: 'missing_dc',
          severity: 'warning',
          message: `La fila ${rowNumber} del PDV ${idBtl} trae ID Nómina pero no nombre de dermoconsejera.`,
          sheetName,
          rowNumber,
          idBtl,
          idPdvCadena,
        })
        warningCount += 1
      }

      let rowHasAnyMaterial = false
      const packageKey = normalizeBtlKey(idBtl) || idBtl
      let pdvPackage = packagesByKey.get(packageKey)
      if (!pdvPackage) {
        pdvPackage = {
          packageKey,
          idBtl,
          cadena,
          idPdvCadena,
          sucursal,
          nombreDc,
          idNominaDc,
          territorio,
          sheetNames: [sheetName],
          rowNumbers: [rowNumber],
          pdvMatch: {
            matched: false,
            pdvId: null,
            pdvNombre: null,
            pdvClaveBtl: null,
          },
          materials: [],
        }
        packagesByKey.set(packageKey, pdvPackage)
      } else {
        uniquePush(pdvPackage.sheetNames, sheetName)
        if (!pdvPackage.rowNumbers.includes(rowNumber)) {
          pdvPackage.rowNumbers.push(rowNumber)
        }
        pdvPackage.cadena ??= cadena
        pdvPackage.idPdvCadena ??= idPdvCadena
        pdvPackage.sucursal ??= sucursal
        pdvPackage.nombreDc ??= nombreDc
        pdvPackage.idNominaDc ??= idNominaDc
        pdvPackage.territorio ??= territorio
      }

      for (const productColumn of productColumns) {
        const rawValue = row[productColumn.index]
        const quantity = normalizeInteger(rawValue)
        const hasValue = normalizeText(rawValue) !== null

        if (quantity === null && hasValue) {
          warnings.push({
            code: 'non_numeric_material_value',
            severity: 'warning',
            message: `La fila ${rowNumber} del PDV ${idBtl} tiene un valor no numérico para ${productColumn.materialName}.`,
            sheetName,
            rowNumber,
            idBtl,
            idPdvCadena,
            materialKey: productColumn.materialKey,
          })
          warningCount += 1
          continue
        }

        if ((quantity ?? 0) <= 0) {
          continue
        }

        rowHasAnyMaterial = true
        totalAssignedQuantity += quantity ?? 0
        const rule = rulesByKey.get(productColumn.materialKey)
        if (rule) {
          rule.assignedQuantityTotal += quantity ?? 0
          rule.totalColumn = rule.assignedQuantityTotal
          rule.pdvCount += 1
        }

        pdvPackage.materials.push({
          materialKey: productColumn.materialKey,
          blockKey,
          blockName: sheetName,
          materialDisplayName: productColumn.materialName,
          quantity: quantity ?? 0,
          totalColumn: rule?.totalColumn ?? quantity ?? 0,
          sourceContext: rule?.sourceContext ?? null,
          sheetName,
          rowNumber,
        })
      }

      if (rowHasAnyMaterial) {
        packageCount += 1
      } else {
        warnings.push({
          code: 'row_without_positive_materials',
          severity: 'warning',
          message: `La fila ${rowNumber} del PDV ${idBtl} no tiene productos con cantidad mayor a cero.`,
          sheetName,
          rowNumber,
          idBtl,
          idPdvCadena,
        })
        warningCount += 1
      }
    })

    sheetSummaries.push({
      sheetName,
      rowCount: dataRows.length,
      packageCount,
      productCount: productColumns.length,
      totalAssignedQuantity,
      warningCount,
    })
  }

  const resolvedMonth =
    options.monthOverride ??
    inferredMonths[0] ??
    new Date().toISOString().slice(0, 7) + '-01'

  const pdvPackages = Array.from(packagesByKey.values()).filter((item) => item.materials.length > 0)
  const unmatchedRows = warnings.filter((warning) =>
    ['missing_id_btl', 'pdv_not_found', 'pdv_duplicated_in_system'].includes(warning.code)
  )
  const canConfirm = unmatchedRows.length === 0 && !warnings.some((warning) => warning.severity === 'error')

  if (pdvPackages.length === 0) {
    throw new Error('El archivo no contiene PDVs con productos positivos para dispersar.')
  }

  return {
    resolvedMonth,
    sheetSummaries,
    pdvPackages: pdvPackages.sort((left, right) =>
      (left.sucursal ?? left.idBtl ?? '').localeCompare(right.sucursal ?? right.idBtl ?? '', 'es')
    ),
    materialRules: Array.from(rulesByKey.values()).sort((left, right) => {
      const blockComparison = left.blockName.localeCompare(right.blockName, 'es')
      if (blockComparison !== 0) {
        return blockComparison
      }
      return left.displayName.localeCompare(right.displayName, 'es')
    }),
    warnings,
    unmatchedRows,
    canConfirm,
  }
}
