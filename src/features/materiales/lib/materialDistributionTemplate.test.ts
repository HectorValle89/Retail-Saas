import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildMaterialDistributionTemplateWorkbook,
  getMaterialDistributionTemplateFilename,
} from './materialDistributionTemplate'

describe('materialDistributionTemplate', () => {
  it('genera una plantilla XLSX con el formato homologado de ISDIN', () => {
    const buffer = buildMaterialDistributionTemplateWorkbook()
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    expect(getMaterialDistributionTemplateFilename()).toBe('isdin_plantilla_dispersion_materiales.xlsx')
    expect(workbook.SheetNames).toEqual(['Bloque_ISDIN', 'Instrucciones'])

    const blockRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Bloque_ISDIN, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    })

    expect(blockRows[0]).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'CANJE || Escribe aquí la mecánica heredada del canje',
      'TESTER || Escribe aquí la instrucción de mercadeo',
      'DOSIS || Observación operativa del material',
      'REGALO_DC || Obsequio para dermoconsejera',
    ])
    expect(blockRows[1]).toEqual(['', '', '', '', '', '', '', '0', '0', '0', '0'])
    expect(blockRows[2]).toEqual([
      'ID BTL',
      'CADENA',
      'ID',
      'SUCURSAL',
      'NOMBRE DC',
      'ID NÓMINA',
      'TERRITORIO',
      'PRODUCTO 1',
      'PRODUCTO 2',
      'PRODUCTO 3',
      'PRODUCTO 4',
    ])

    const instructionRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Instrucciones, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    })

    expect(instructionRows.flat().join(' ')).toContain('Si ID NÓMINA viene vacío')
    expect(instructionRows.flat().join(' ')).toContain('ID BTL')
  })
})

