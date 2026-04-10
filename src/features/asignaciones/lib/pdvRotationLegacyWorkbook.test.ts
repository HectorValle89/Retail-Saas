import { expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import {
  convertPdvRotationLegacyWorkbook,
  ISDIN_POR_CUBRIR_MANUAL_PAIRS,
} from './pdvRotationLegacyWorkbook'

function buildLegacyWorkbook(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Hoja1')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

test('convierte archivo legacy a rotacion oficial con grupos naturales y parejas manuales', () => {
  const buffer = buildLegacyWorkbook([
    {
      'BTL CVE': 'BTL-FIJO-001',
      CADENA: 'LIVERPOOL',
      'SUCURSAL ': 'Fijo Uno',
      IDNOM: 100,
      USUARIO: 'BTL-DC-0100',
      'NOMBRE DC': 'ANA FIJA',
      '# DC': 1,
      'ROL PERM': 'FIJA',
    },
    {
      'BTL CVE': 'BTL-ROT-001',
      CADENA: 'FAH',
      'SUCURSAL ': 'Rot A',
      IDNOM: 200,
      USUARIO: 'BTL-DC-0200',
      'NOMBRE DC': 'BEA ROTA',
      '# DC': 0.5,
      'ROL PERM': 'ROTATIVA',
    },
    {
      'BTL CVE': 'BTL-ROT-002',
      CADENA: 'FAH',
      'SUCURSAL ': 'Rot B',
      IDNOM: 200,
      USUARIO: 'BTL-DC-0200',
      'NOMBRE DC': 'BEA ROTA',
      '# DC': 0.5,
      'ROL PERM': 'ROTATIVA',
    },
    {
      'BTL CVE': 'BTL-TRI-001',
      CADENA: 'SP',
      'SUCURSAL ': 'Tri A',
      IDNOM: 300,
      USUARIO: 'BTL-DC-0300',
      'NOMBRE DC': 'CARO TRIO',
      '# DC': 0.3333333333333333,
      'ROL PERM': 'ROTATIVA',
    },
    {
      'BTL CVE': 'BTL-TRI-002',
      CADENA: 'SP',
      'SUCURSAL ': 'Tri B',
      IDNOM: 300,
      USUARIO: 'BTL-DC-0300',
      'NOMBRE DC': 'CARO TRIO',
      '# DC': 0.3333333333333333,
      'ROL PERM': 'ROTATIVA',
    },
    {
      'BTL CVE': 'BTL-TRI-003',
      CADENA: 'SP',
      'SUCURSAL ': 'Tri C',
      IDNOM: 300,
      USUARIO: 'BTL-DC-0300',
      'NOMBRE DC': 'CARO TRIO',
      '# DC': 0.3333333333333333,
      'ROL PERM': 'ROTATIVA',
    },
    {
      'BTL CVE': 'BTL-FAH-CUMB-WN',
      CADENA: 'FAH',
      'SUCURSAL ': 'Cumbres',
      'NOMBRE DC': 'POR CUBRIR',
      '# DC': 0.5,
      'ROL PERM': 'ROTATIVA',
    },
    {
      'BTL CVE': 'BTL-FAH-PLAZ-S5',
      CADENA: 'FAH',
      'SUCURSAL ': 'Plaza',
      'NOMBRE DC': 'POR CUBRIR',
      '# DC': 0.5,
      'ROL PERM': 'ROTATIVA',
    },
    {
      'BTL CVE': 'BTL-FIJO-VAC',
      CADENA: 'FAH',
      'SUCURSAL ': 'Vacante fija',
      'NOMBRE DC': 'POR CUBRIR',
      '# DC': 1,
      'ROL PERM': 'FIJA',
    },
  ])

  const result = convertPdvRotationLegacyWorkbook(buffer, {
    accountIdentifier: 'isdin_mexico',
    manualPairs: ISDIN_POR_CUBRIR_MANUAL_PAIRS,
  })

  expect(result.issues).toEqual([])
  expect(result.summary.convertedRows).toBe(9)
  expect(result.summary.fijos).toBe(2)
  expect(result.summary.rotativos).toBe(7)
  expect(result.summary.naturalGroups).toBe(2)
  expect(result.summary.manualGroups).toBe(1)

  expect(result.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        claveBtl: 'BTL-FIJO-001',
        clasificacionMaestra: 'FIJO',
        grupoRotacion: null,
      }),
      expect.objectContaining({
        claveBtl: 'BTL-ROT-001',
        clasificacionMaestra: 'ROTATIVO',
        grupoRotacion: 'ROT-ISDIN-MEXICO-001',
        tamanoGrupo: 2,
        posicion: 'A',
        pdvRelacionado1: 'BTL-ROT-002',
      }),
      expect.objectContaining({
        claveBtl: 'BTL-ROT-002',
        grupoRotacion: 'ROT-ISDIN-MEXICO-001',
        posicion: 'B',
      }),
      expect.objectContaining({
        claveBtl: 'BTL-TRI-001',
        grupoRotacion: 'ROT-ISDIN-MEXICO-002',
        tamanoGrupo: 3,
        posicion: 'A',
        pdvRelacionado1: 'BTL-TRI-002',
        pdvRelacionado2: 'BTL-TRI-003',
      }),
      expect.objectContaining({
        claveBtl: 'BTL-FAH-CUMB-WN',
        grupoRotacion: 'ROT-ISDIN-MAN-001',
        posicion: 'A',
        referenciaDcActual: 'POR CUBRIR',
      }),
      expect.objectContaining({
        claveBtl: 'BTL-FAH-PLAZ-S5',
        grupoRotacion: 'ROT-ISDIN-MAN-001',
        posicion: 'B',
      }),
      expect.objectContaining({
        claveBtl: 'BTL-FIJO-VAC',
        clasificacionMaestra: 'FIJO',
        referenciaDcActual: 'POR CUBRIR',
      }),
    ])
  )
})