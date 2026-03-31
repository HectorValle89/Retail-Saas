import { expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import { parseProductCatalogWorkbook } from './productCatalogImport'

test('parsea catalogo ISDIN con encabezados reales y normaliza categoria/top30', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      'CATEGORÍA ': 'Fotoprotección',
      SKY: '8429420107502',
      PRODUCTO: 'Fotoprotector ISDIN 50+ Fusion Water Magic 50ML',
      NOMBRE_CORTO: 'FP FW MAGIC 50ML',
      'TOP 30': 'SI',
    },
    {
      'CATEGORÍA ': 'Acné',
      SKY: '8429420107503',
      PRODUCTO: 'Acniben Gel',
      NOMBRE_CORTO: 'ACNIBEN GEL',
      'TOP 30': 'NO',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseProductCatalogWorkbook(buffer)

  expect(result.skippedRows).toBe(0)
  expect(result.rows).toEqual([
    {
      sku: '8429420107503',
      nombre: 'Acniben Gel',
      nombreCorto: 'ACNIBEN GEL',
      categoria: 'ACNE',
      top30: false,
      activo: true,
    },
    {
      sku: '8429420107502',
      nombre: 'Fotoprotector ISDIN 50+ Fusion Water Magic 50ML',
      nombreCorto: 'FP FW MAGIC 50ML',
      categoria: 'FOTOPROTECCION',
      top30: true,
      activo: true,
    },
  ])
})
