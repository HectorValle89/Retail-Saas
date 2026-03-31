import * as XLSX from 'xlsx'

const TEMPLATE_SHEET_NAME = 'Metas_PDV_Producto'
const INSTRUCTIONS_SHEET_NAME = 'Instrucciones'
const TEMPLATE_FILENAME = 'isdin_plantilla_campana_metas_pdv_producto.xlsx'

const TEMPLATE_HEADERS = [
  'BTL CVE',
  'SKU',
  'ARTICULO',
  'CUOTA',
  'TIPO META',
  'OBSERVACIONES',
] as const

const SAMPLE_ROWS = [
  ['BTL-FAH-50SU-ME', '8429420288003', 'Fusion Water Magic 50 ml', 24, 'VENTA', 'Meta principal del PDV para el periodo'],
  ['BTL-FAH-50SU-ME', '8429420211933', 'Acniben Cleanser', 8, 'EXHIBICION', 'Exhibicion en cabecera y anaquel'],
  ['BTL-SPB-CUMBRES-MTY', '8429420288003', 'Fusion Water Magic 50 ml', 12, 'VENTA', 'Cuota menor por aforo del punto'],
]

function buildInstructionRows() {
  return [
    ['Plantilla oficial ISDIN - Metas de campaña por PDV y producto'],
    [''],
    ['Qué hace esta carga'],
    ['1.', 'Permite definir cuotas distintas por producto en cada PDV participante de la campaña.'],
    ['2.', 'La matriz cargada en Excel sustituye la meta global por producto y se vuelve la fuente oficial por tienda.'],
    [''],
    ['Columnas reconocidas'],
    ['BTL CVE', 'Obligatoria. Clave BTL exacta del PDV en el sistema.'],
    ['SKU', 'Recomendada. SKU exacto del producto; si viene vacío, el sistema intenta resolver con ARTICULO.'],
    ['ARTICULO', 'Opcional si ya viene SKU. Nombre o nombre corto del producto para validación.'],
    ['CUOTA', 'Obligatoria. Cuota asignada a ese producto en ese PDV.'],
    ['TIPO META', 'Opcional. Valores válidos: VENTA o EXHIBICION. Si se omite, el sistema usa VENTA.'],
    ['OBSERVACIONES', 'Opcional. Nota operativa para esa meta específica.'],
    [''],
    ['Reglas importantes'],
    ['1.', 'Cada fila representa una combinación única de PDV + producto.'],
    ['2.', 'No repitas la misma combinación BTL CVE + SKU/ARTICULO dentro del mismo archivo.'],
    ['3.', 'Solo se aceptan PDVs vigentes dentro de la cuenta operativa ISDIN.'],
    ['4.', 'Solo se aceptan productos activos del catálogo.'],
    ['5.', 'Si subes esta matriz en la campaña, prevalece sobre la meta global por producto.'],
  ]
}

export function buildCampaignProductQuotaTemplateWorkbook() {
  const workbook = XLSX.utils.book_new()

  const templateSheet = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS],
    ...SAMPLE_ROWS,
  ])

  templateSheet['!cols'] = [
    { wch: 22 },
    { wch: 18 },
    { wch: 34 },
    { wch: 12 },
    { wch: 16 },
    { wch: 48 },
  ]

  const instructionsSheet = XLSX.utils.aoa_to_sheet(buildInstructionRows())
  instructionsSheet['!cols'] = [{ wch: 22 }, { wch: 120 }]

  XLSX.utils.book_append_sheet(workbook, templateSheet, TEMPLATE_SHEET_NAME)
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, INSTRUCTIONS_SHEET_NAME)

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buffer)
}

export function getCampaignProductQuotaTemplateFilename() {
  return TEMPLATE_FILENAME
}
