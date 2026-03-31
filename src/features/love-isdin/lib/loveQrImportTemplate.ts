import * as XLSX from 'xlsx'

const TEMPLATE_SHEET_NAME = 'Manifiesto_QR_ISDIN'
const INSTRUCTIONS_SHEET_NAME = 'Instrucciones'
const TEMPLATE_FILENAME = 'isdin_plantilla_qr_love.xlsx'

const TEMPLATE_HEADERS = [
  'CODIGO_QR',
  'NUMERO_QR',
  'ID_NOMINA_DC',
  'ID_DC_INTERNO',
  'NOMBRE_DC',
  'ESTADO_QR',
  'IMAGEN_ARCHIVO',
  'FECHA_INICIO',
  'MOTIVO',
  'OBSERVACIONES',
] as const

const SAMPLE_ACTIVE_ROW = [
  'ISDIN-QR-0001',
  '0001',
  '594',
  '',
  'ANA PATRICIA ORTEGA RAMIREZ',
  'ACTIVO',
  '001-FGYNZLZQBB0610KJQGYVS625.tiff',
  '2026-03-28',
  'ASIGNACION_INICIAL',
  'Carga inicial para dermoconsejera activa',
]

const SAMPLE_AVAILABLE_ROW = [
  'ISDIN-QR-0002',
  '0002',
  '',
  '',
  '',
  'DISPONIBLE',
  'ISDIN-QR-0002.tiff',
  '2026-03-28',
  'STOCK',
  'QR disponible para futura reasignacion',
]

function buildInstructionRows() {
  return [
    ['Plantilla oficial ISDIN - Inventario y asignacion de QR LOVE'],
    [''],
    ['Que subes al sistema'],
    ['1.', 'Un Excel o CSV con una fila por QR.'],
    ['2.', 'Un ZIP con todas las imagenes oficiales de esos QR.'],
    [''],
    ['Columnas del manifiesto'],
    ['CODIGO_QR', 'Obligatorio. Valor unico del QR que identifica a la dermoconsejera dentro del programa LOVE ISDIN.'],
    ['NUMERO_QR', 'Opcional pero recomendado. Folio o consecutivo operativo del QR si tu base lo maneja por separado.'],
    ['ID_NOMINA_DC', 'Recomendado para amarre principal con la dermoconsejera del sistema. Tambien se acepta el alias ID_NOMINA_BC. Si el QR esta disponible puede ir vacio.'],
    ['ID_DC_INTERNO', 'Opcional. Solo llenarlo si ya tienes el id interno del empleado en la app. Si no lo conoces, dejalo vacio y usa la nomina.'],
    ['NOMBRE_DC', 'Opcional pero recomendado para validacion visual del lote.'],
    ['ESTADO_QR', 'Obligatorio. Valores permitidos: ACTIVO, DISPONIBLE, BLOQUEADO, BAJA.'],
    ['IMAGEN_ARCHIVO', 'Obligatorio. Debe coincidir exactamente con el nombre del archivo dentro del ZIP.'],
    ['FECHA_INICIO', 'Opcional. Formato recomendado: YYYY-MM-DD. Si viene vacia, el sistema usa la fecha de la carga.'],
    ['MOTIVO', 'Opcional. Si viene vacio, el sistema completa uno por default segun el estado: ACTIVO=ASIGNACION_INICIAL, DISPONIBLE=STOCK, BLOQUEADO=BLOQUEO_OPERATIVO, BAJA=BAJA_OPERATIVA.'],
    ['OBSERVACIONES', 'Opcional. Notas operativas adicionales; puede ir vacio.'],
    [''],
    ['Reglas del ZIP'],
    ['1.', 'El ZIP debe venir plano, sin subcarpetas.'],
    ['2.', 'Cada imagen debe existir una sola vez.'],
    ['3.', 'Los nombres de archivo deben empatar exactamente con IMAGEN_ARCHIVO.'],
    ['4.', 'Formatos aceptados: .png, .jpg, .jpeg, .webp, .tif y .tiff.'],
    ['5.', 'Si subes TIFF/TIF, el sistema los convierte automaticamente a PNG para que el dashboard pueda mostrarlos sin que tu tengas que hacer la conversion.'],
    [''],
    ['Reglas operativas'],
    ['1.', 'Si ESTADO_QR = ACTIVO, el QR debe venir ligado a una DC.'],
    ['2.', 'Si el QR esta libre para futura asignacion, usa ESTADO_QR = DISPONIBLE y deja vacias las columnas de DC.'],
    ['3.', 'El QR pertenece a la dermoconsejera, pero las afiliaciones siempre se reportan por el PDV real donde se capturaron.'],
    ['4.', 'La imagen del QR debe mostrarse siempre en LOVE ISDIN del dashboard de la DC hasta que exista una reasignacion o cambio por QR defectuoso.'],
    [''],
    ['Formato recomendado del ZIP'],
    ['Ejemplo', '001-FGYNZLZQBB0610KJQGYVS625.tiff, ISDIN-QR-0002.tiff, ISDIN-QR-0003.png'],
    [''],
    ['Nota del flujo actual'],
    ['El sistema procesa el manifiesto y el ZIP al registrar la carga. Si hay errores operativos, el lote se cancela y te devuelve advertencias claras.'],
  ]
}

export function buildLoveQrImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new()

  const templateSheet = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS],
    SAMPLE_ACTIVE_ROW,
    SAMPLE_AVAILABLE_ROW,
  ])

  templateSheet['!cols'] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 38 },
    { wch: 34 },
    { wch: 16 },
    { wch: 28 },
    { wch: 16 },
    { wch: 22 },
    { wch: 46 },
  ]

  const instructionsSheet = XLSX.utils.aoa_to_sheet(buildInstructionRows())
  instructionsSheet['!cols'] = [{ wch: 22 }, { wch: 120 }]

  XLSX.utils.book_append_sheet(workbook, templateSheet, TEMPLATE_SHEET_NAME)
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, INSTRUCTIONS_SHEET_NAME)

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buffer)
}

export function getLoveQrImportTemplateFilename() {
  return TEMPLATE_FILENAME
}
