import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseMaterialDistributionWorkbook } from './materialDistributionImport'

function buildWorkbookBuffer(rows: unknown[][], sheetName = 'Bloque HEB') {
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('materialDistributionImport', () => {
  it('interpreta el formato homologado con preset, totales, encabezados e ID Nómina', () => {
    const buffer = buildWorkbookBuffer([
      [
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'CANJE || Compra 2 y recibe 1 obsequio',
        'TESTER || Exhibir en anaquel principal',
      ],
      ['', '', '', '', '', '', '', '3', '3'],
      [
        'ID BTL',
        'CADENA',
        'ID',
        'SUCURSAL',
        'NOMBRE CDB',
        'ID NÓMINA',
        'TERRITORIO',
        'ISDIN CEUTICS SKIN DROPS',
        'CANJERAS NEGRAS ISDIN',
      ],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', 'ALAMO VANESSA', '584', '', '2', '0'],
      ['BTL-HEB-2', 'HEB', '2961', 'LINDA VISTA', '', '', 'MONTERREY', '1', '3'],
    ])

    const preview = parseMaterialDistributionWorkbook(buffer, {
      fileName: 'dispersion_2026-04.xlsx',
    })

    expect(preview.resolvedMonth).toBe('2026-04-01')
    expect(preview.sheetSummaries).toHaveLength(1)
    expect(preview.sheetSummaries[0]).toMatchObject({
      sheetName: 'Bloque HEB',
      packageCount: 2,
      productCount: 2,
      totalAssignedQuantity: 6,
    })

    expect(preview.pdvPackages[0]).toMatchObject({
      idBtl: 'BTL-HEB-1',
      idPdvCadena: '2987',
      sucursal: 'LAS FUENTES',
      nombreDc: 'ALAMO VANESSA',
      idNominaDc: '584',
    })
    expect(preview.pdvPackages[1]).toMatchObject({
      idBtl: 'BTL-HEB-2',
      idNominaDc: null,
    })

    const firstRule = preview.materialRules.find((item) => item.displayName === 'ISDIN CEUTICS SKIN DROPS')
    const secondRule = preview.materialRules.find((item) => item.displayName === 'CANJERAS NEGRAS ISDIN')

    expect(firstRule).toMatchObject({
      blockName: 'Bloque HEB',
      materialType: 'CANJE_PROMOCIONAL',
      selected: true,
      pdvCount: 2,
      assignedQuantityTotal: 3,
      mecanicaCanje: 'Compra 2 y recibe 1 obsequio',
    })
    expect(secondRule).toMatchObject({
      blockName: 'Bloque HEB',
      materialType: 'TESTER',
      selected: true,
      pdvCount: 1,
      assignedQuantityTotal: 3,
      instruccionesMercadeo: 'Exhibir en anaquel principal',
    })
  })
})
