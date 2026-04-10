import { expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import { parsePdvRotationCatalogWorkbook } from './pdvRotationCatalogImport'

test('parsea filas FIJO y ROTATIVO y conserva la ultima fila duplicada', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      'BTL CVE': 'BTL-A-001',
      'NOMBRE PDV': 'Farmacia A',
      'ESTATUS PDV': 'ACTIVO',
      'CLASIFICACION MAESTRA': 'FIJO',
      'REFERENCIA DC ACTUAL': 'ANA UNO',
    },
    {
      'BTL CVE': 'BTL-B-001',
      'NOMBRE PDV': 'Farmacia B',
      'ESTATUS PDV': 'ACTIVO',
      'CLASIFICACION MAESTRA': 'ROTATIVO',
      'GRUPO ROTACION': 'ROT-ISDIN-001',
      'TAMANO GRUPO': 2,
      POSICION: 'A',
      'PDV RELACIONADO 1': 'BTL-B-002',
      'REFERENCIA DC ACTUAL': 'BEA DOS',
    },
    {
      'BTL CVE': 'BTL-B-001',
      'NOMBRE PDV': 'Farmacia B actualizada',
      'ESTATUS PDV': 'ACTIVO',
      'CLASIFICACION MAESTRA': 'ROTATIVO',
      'GRUPO ROTACION': 'ROT-ISDIN-001',
      'TAMANO GRUPO': 2,
      POSICION: 'B',
      'PDV RELACIONADO 1': 'BTL-B-003',
      'REFERENCIA DC ACTUAL': 'BEA DOS',
      OBSERVACIONES: 'Se toma esta fila',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rotacion')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parsePdvRotationCatalogWorkbook(buffer)

  expect(result.skippedRows).toBe(0)
  expect(result.issues).toEqual([
    expect.objectContaining({ rowNumber: 4, code: 'FILA_DUPLICADA', severity: 'ALERTA' }),
  ])
  expect(result.rows).toEqual([
    {
      rowNumber: 2,
      claveBtl: 'BTL-A-001',
      nombrePdv: 'Farmacia A',
      estatusPdv: 'ACTIVO',
      clasificacionMaestra: 'FIJO',
      grupoRotacionCodigo: null,
      grupoTamano: null,
      slotRotacion: null,
      pdvRelacionado1: null,
      pdvRelacionado2: null,
      referenciaDcActual: 'ANA UNO',
      observaciones: null,
    },
    {
      rowNumber: 4,
      claveBtl: 'BTL-B-001',
      nombrePdv: 'Farmacia B actualizada',
      estatusPdv: 'ACTIVO',
      clasificacionMaestra: 'ROTATIVO',
      grupoRotacionCodigo: 'ROT-ISDIN-001',
      grupoTamano: 2,
      slotRotacion: 'B',
      pdvRelacionado1: 'BTL-B-003',
      pdvRelacionado2: null,
      referenciaDcActual: 'BEA DOS',
      observaciones: 'Se toma esta fila',
    },
  ])
})

test('reporta filas sin BTL y valores invalidos de clasificacion, tamano y posicion', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      'BTL CVE': '',
      'CLASIFICACION MAESTRA': 'FIJO',
    },
    {
      'BTL CVE': 'BTL-C-001',
      'CLASIFICACION MAESTRA': 'MIXTO',
      'TAMANO GRUPO': 4,
      POSICION: 'Z',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rotacion')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parsePdvRotationCatalogWorkbook(buffer)

  expect(result.skippedRows).toBe(1)
  expect(result.rows).toEqual([
    expect.objectContaining({
      claveBtl: 'BTL-C-001',
      clasificacionMaestra: null,
      grupoTamano: null,
      slotRotacion: null,
    }),
  ])
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'FILA_SIN_BTL', severity: 'ERROR' }),
      expect.objectContaining({ code: 'CLASIFICACION_INVALIDA', severity: 'ERROR' }),
      expect.objectContaining({ code: 'TAMANO_GRUPO_INVALIDO', severity: 'ERROR' }),
      expect.objectContaining({ code: 'SLOT_INVALIDO', severity: 'ERROR' }),
    ])
  )
})