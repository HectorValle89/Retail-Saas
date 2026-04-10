import * as XLSX from 'xlsx'

const TEMPLATE_FILENAME = 'isdin_plantilla_encuesta_mensajeria.xlsx'

export function getMessageSurveyTemplateFilename() {
  return TEMPLATE_FILENAME
}

export function buildMessageSurveyTemplateWorkbook() {
  const workbook = XLSX.utils.book_new()
  const rows = [
    {
      ORDEN: 1,
      PREGUNTA: 'Como evaluas la comunicacion interna de tu area?',
      DESCRIPCION: 'Encuesta de ejemplo',
      TIPO: 'OPCION_MULTIPLE',
      OPCIONES: 'Excelente|Buena|Regular|Mala',
      OBLIGATORIA: 'true',
    },
    {
      ORDEN: 2,
      PREGUNTA: 'Que podriamos mejorar?',
      DESCRIPCION: 'Respuesta libre',
      TIPO: 'RESPUESTA_LIBRE',
      OPCIONES: '',
      OBLIGATORIA: 'false',
    },
  ]

  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'preguntas')

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buffer)
}
