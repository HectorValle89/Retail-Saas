import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseMessageSurveyWorkbook } from './messageSurveyImport'

function buildWorkbookBuffer() {
  const workbook = XLSX.utils.book_new()
  const rows = [
    {
      ORDEN: 1,
      PREGUNTA: 'Como evaluas la comunicacion interna?',
      DESCRIPCION: 'Pregunta de opcion multiple',
      TIPO: 'OPCION_MULTIPLE',
      OPCIONES: 'Excelente|Buena|Regular',
      OBLIGATORIA: 'true',
    },
    {
      ORDEN: 2,
      PREGUNTA: 'Que mejorarias?',
      DESCRIPCION: '',
      TIPO: 'RESPUESTA_LIBRE',
      OPCIONES: '',
      OBLIGATORIA: 'false',
    },
  ]

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'preguntas')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

describe('parseMessageSurveyWorkbook', () => {
  it('parsea preguntas de opcion multiple y respuesta libre', () => {
    const parsed = parseMessageSurveyWorkbook(buildWorkbookBuffer(), 'encuesta.xlsx')

    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({
      orden: 1,
      titulo: 'Como evaluas la comunicacion interna?',
      tipoPregunta: 'OPCION_MULTIPLE',
      obligatoria: true,
    })
    expect(parsed[0]?.opciones).toHaveLength(3)
    expect(parsed[1]).toMatchObject({
      orden: 2,
      titulo: 'Que mejorarias?',
      tipoPregunta: 'RESPUESTA_LIBRE',
      obligatoria: false,
    })
  })
})
