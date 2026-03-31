import { expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import { parseAssignmentCatalogWorkbook } from './assignmentCatalogImport'
import { parseDiasLaborales } from './assignmentPlanning'

test('parsea el catalogo maestro inicial de asignaciones y deduplica filas repetidas', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      CLAVE_BTL: 'BTL-001',
      IDNOM: '439',
      TIPO: 'Fija',
      DIAS: 'Lunes, Martes, Miercoles, Jueves, Viernes',
      DESCANSO: 'Sabado',
      HORARIO: '09:00 - 18:00',
      OBSERVACIONES: 'Base operativa',
    },
    {
      CLAVE_BTL: 'BTL-001',
      IDNOM: '439',
      TIPO: 'Fija',
      DIAS: 'Lunes, Martes, Miercoles, Jueves, Viernes',
      DESCANSO: 'Sabado',
      HORARIO: '09:00 - 18:00',
      OBSERVACIONES: 'Duplicada',
    },
    {
      CLAVE_BTL: 'BTL-002',
      USUARIO: 'dc_noreste_01',
      TIPO: 'Cobertura',
      DIAS_LABORALES: 'LUN VIE',
      DIA_DESCANSO: 'DOM',
      FACTOR_TIEMPO: '0.5',
    },
    {
      CLAVE_BTL: '',
      IDNOM: '999',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Asignaciones')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseAssignmentCatalogWorkbook(buffer)

  expect(result.skippedRows).toBe(2)
  expect(result.issues.map((item) => item.code)).toEqual(['FILA_DUPLICADA', 'FILA_SIN_BTL'])
  expect(result.rows).toEqual([
    {
      rowNumber: 3,
      claveBtl: 'BTL-001',
      idNomina: '439',
      username: null,
      nombreDc: null,
      tipo: 'FIJA',
      factorTiempo: 1,
      diasLaborales: 'LUN,MAR,MIE,JUE,VIE',
      diaDescanso: 'SAB',
      horarioReferencia: '09:00 - 18:00',
      fechaInicio: null,
      observaciones: 'Duplicada',
    },
    {
      rowNumber: 4,
      claveBtl: 'BTL-002',
      idNomina: null,
      username: 'dc_noreste_01',
      nombreDc: null,
      tipo: 'COBERTURA',
      factorTiempo: 0.5,
      diasLaborales: 'LUN,VIE',
      diaDescanso: 'DOM',
      horarioReferencia: null,
      fechaInicio: null,
      observaciones: null,
    },
  ])
})

test('acepta la nomenclatura compacta y rangos envolventes para dias laborales', () => {
  expect(parseDiasLaborales('L-M-X-J-V-S').dias).toEqual(['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'])
  expect(parseDiasLaborales('JUE-MAR').dias).toEqual(['LUN', 'MAR', 'JUE', 'VIE', 'SAB', 'DOM'])
  expect(parseDiasLaborales('LUN-MIER-VIER').dias).toEqual(['LUN', 'MIE', 'VIE'])
  expect(parseDiasLaborales('M-J-S').dias).toEqual(['MAR', 'JUE', 'SAB'])
})

test('reporta dias y descansos invalidos del catalogo maestro', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([
    {
      CLAVE_BTL: 'BTL-003',
      IDNOM: '501',
      DIAS: 'L-Q-Z',
      DESCANSO: 'Q',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Asignaciones')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = parseAssignmentCatalogWorkbook(buffer)

  expect(result.issues.map((item) => item.code)).toEqual([
    'DIAS_LABORALES_INVALIDOS',
    'DESCANSO_INVALIDO',
  ])
})