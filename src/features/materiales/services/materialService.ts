import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import type {
  Cadena,
  CuentaCliente,
  MaterialCatalogo,
  MaterialConteoJornada,
  MaterialDistribucionDetalle,
  MaterialDistribucionLote,
  MaterialDistribucionMensual,
  MaterialEntregaPromocional,
  MaterialEvidenciaMercadeo,
  MaterialInventarioMovimiento,
  Pdv,
} from '@/types/database'
import type { MaterialDistributionPreview } from '../lib/materialDistributionImport'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'id' | 'nombre' | 'identificador'>
type PdvRelacion = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'cadena_id' | 'id_cadena'>
type CadenaRelacion = Pick<Cadena, 'id' | 'nombre'>

interface MaterialCatalogoRow
  extends Pick<
    MaterialCatalogo,
    | 'id'
    | 'cuenta_cliente_id'
    | 'nombre'
    | 'tipo'
    | 'cantidad_default'
    | 'requiere_ticket_compra'
    | 'requiere_evidencia_obligatoria'
    | 'activo'
    | 'metadata'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

interface MaterialDistribucionLoteRow
  extends Pick<
    MaterialDistribucionLote,
    | 'id'
    | 'cuenta_cliente_id'
    | 'mes_operacion'
    | 'estado'
    | 'archivo_nombre'
    | 'archivo_url'
    | 'gemini_status'
    | 'advertencias'
    | 'resumen'
    | 'preview_data'
    | 'confirmado_en'
    | 'created_at'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

interface MaterialDistribucionRow
  extends Pick<
    MaterialDistribucionMensual,
    | 'id'
    | 'cuenta_cliente_id'
    | 'lote_id'
    | 'pdv_id'
    | 'supervisor_empleado_id'
    | 'confirmado_por_empleado_id'
    | 'mes_operacion'
    | 'estado'
    | 'cadena_snapshot'
    | 'id_pdv_cadena_snapshot'
    | 'sucursal_snapshot'
    | 'nombre_dc_snapshot'
    | 'territorio_snapshot'
    | 'hoja_origen'
    | 'firma_recepcion_url'
    | 'firma_recepcion_hash'
    | 'foto_recepcion_url'
    | 'foto_recepcion_hash'
    | 'foto_recepcion_capturada_en'
    | 'confirmado_en'
    | 'observaciones'
    | 'metadata'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
  pdv: MaybeMany<PdvRelacion>
}

interface MaterialDistribucionDetalleRow
  extends Pick<
    MaterialDistribucionDetalle,
    | 'id'
    | 'distribucion_id'
    | 'material_catalogo_id'
    | 'cantidad_enviada'
    | 'cantidad_recibida'
    | 'cantidad_entregada'
    | 'cantidad_observada'
    | 'material_nombre_snapshot'
    | 'material_tipo_mes'
    | 'mecanica_canje'
    | 'indicaciones_producto'
    | 'instrucciones_mercadeo'
    | 'requiere_ticket_mes'
    | 'requiere_evidencia_entrega_mes'
    | 'requiere_evidencia_mercadeo'
    | 'es_regalo_dc'
    | 'excluir_de_registrar_entrega'
    | 'total_columna_hoja'
    | 'observaciones'
    | 'metadata'
  > {
  material_catalogo: MaybeMany<Pick<MaterialCatalogo, 'id' | 'nombre' | 'tipo'>>
}

interface MaterialEntregaPromocionalRow
  extends Pick<
    MaterialEntregaPromocional,
    | 'id'
    | 'cuenta_cliente_id'
    | 'distribucion_id'
    | 'distribucion_detalle_id'
    | 'material_catalogo_id'
    | 'empleado_id'
    | 'pdv_id'
    | 'cantidad_entregada'
    | 'fecha_utc'
    | 'evidencia_material_url'
    | 'evidencia_pdv_url'
    | 'ticket_compra_url'
  > {}

interface MaterialInventarioMovimientoRow
  extends Pick<
    MaterialInventarioMovimiento,
    | 'id'
    | 'pdv_id'
    | 'material_catalogo_id'
    | 'distribucion_id'
    | 'distribucion_detalle_id'
    | 'tipo_movimiento'
    | 'cantidad'
    | 'cantidad_delta'
    | 'created_at'
  > {
  material_catalogo: MaybeMany<Pick<MaterialCatalogo, 'id' | 'nombre' | 'tipo'>>
}

interface MaterialEvidenciaMercadeoRow
  extends Pick<
    MaterialEvidenciaMercadeo,
    | 'id'
    | 'distribucion_id'
    | 'pdv_id'
    | 'foto_url'
    | 'foto_hash'
    | 'foto_capturada_en'
    | 'observaciones'
  > {}

interface MaterialConteoJornadaRow
  extends Pick<MaterialConteoJornada, 'id' | 'pdv_id' | 'fecha_operacion' | 'momento' | 'observaciones'> {}

interface AsignacionContextRow {
  empleado_id: string
  cuenta_cliente_id: string | null
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
}

export interface SelectorOption {
  id: string
  label: string
}

export interface MaterialCatalogItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  nombre: string
  tipo: string
  cantidadDefault: number
  requiereTicketCompra: boolean
  requiereEvidenciaObligatoria: boolean
  activo: boolean
}

export interface MaterialLotPreviewItem {
  id: string
  cuentaClienteId: string
  cuentaCliente: string | null
  mesOperacion: string
  estado: 'BORRADOR_PREVIEW' | 'CONFIRMADO' | 'CANCELADO'
  archivoNombre: string
  archivoUrl: string | null
  geminiStatus: string
  warningCount: number
  canConfirm: boolean
  pdvCount: number
  createdAt: string
  confirmedAt: string | null
  preview: MaterialDistributionPreview | null
  geminiSummary: string | null
}

export interface MaterialDistributionDetailItem {
  id: string
  distribucionId: string
  materialCatalogoId: string
  materialNombre: string
  materialTipo: string
  inventariable: boolean
  requiereTicketCompra: boolean
  requiereEvidenciaObligatoria: boolean
  requiereTicketMes: boolean
  requiereEvidenciaEntregaMes: boolean
  requiereEvidenciaMercadeo: boolean
  esRegaloDc: boolean
  excluirDeRegistrarEntrega: boolean
  mecanicaCanje: string | null
  indicacionesProducto: string | null
  instruccionesMercadeo: string | null
  cantidadEnviada: number
  cantidadRecibida: number
  cantidadEntregada: number
  cantidadObservada: number
  saldoDisponible: number
  observaciones: string | null
}

export interface MaterialMercadeoEvidenceItem {
  id: string
  distribucionId: string
  pdvId: string
  fotoUrl: string
  fotoHash: string | null
  fotoCapturadaEn: string
  observaciones: string | null
}

export interface MaterialDistributionItem {
  id: string
  loteId: string | null
  cuentaClienteId: string
  cuentaCliente: string | null
  pdvId: string
  pdvClaveBtl: string | null
  pdvNombre: string
  idPdvCadena: string | null
  zona: string | null
  cadena: string | null
  sucursal: string | null
  nombreDc: string | null
  territorio: string | null
  hojaOrigen: string | null
  mesOperacion: string
  estado:
    | 'PENDIENTE_RECEPCION'
    | 'RECIBIDA_CONFORME'
    | 'RECIBIDA_CON_OBSERVACIONES'
    | 'PENDIENTE_ACLARACION'
    | 'CANCELADA'
  confirmadoEn: string | null
  observaciones: string | null
  firmaRecepcionUrl: string | null
  fotoRecepcionUrl: string | null
  fotoRecepcionCapturadaEn: string | null
  mercadeoEvidence: MaterialMercadeoEvidenceItem | null
  detalles: MaterialDistributionDetailItem[]
  totalEnviado: number
  totalRecibido: number
  totalEntregado: number
  totalDisponible: number
}

export interface MaterialInventoryBalanceItem {
  materialCatalogoId: string
  materialNombre: string
  materialTipo: string
  balanceActual: number
}

export interface MaterialSupervisorViewItem {
  pdvId: string
  pdvClaveBtl: string | null
  pdvNombre: string
  cadena: string | null
  zona: string | null
  mesOperacion: string
  estadoRecepcion: string
  enviado: number
  recibido: number
  entregado: number
  restante: number
  observaciones: number
  evidencias: number
  mercadeoRegistrado: boolean
}

export interface MaterialReportRow {
  month: string
  chain: string | null
  pdv: string
  pdvClaveBtl: string | null
  material: string
  materialTipo: string
  enviado: number
  recibido: number
  entregado: number
  restante: number
  observaciones: number
  evidencias: number
  mercadeo: boolean
}

export interface MaterialDermoContext {
  pdvId: string
  pdvNombre: string
  pdvClaveBtl: string | null
  cuentaClienteId: string | null
  month: string
}

export interface MaterialesPanelData {
  actorRole: ActorActual['puesto']
  currentMonth: string
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  catalog: MaterialCatalogItem[]
  draftLots: MaterialLotPreviewItem[]
  confirmedLots: MaterialLotPreviewItem[]
  distributions: MaterialDistributionItem[]
  supervisorView: MaterialSupervisorViewItem[]
  reportRows: MaterialReportRow[]
  dermoContext: MaterialDermoContext | null
  dermoPendingReception: MaterialDistributionItem[]
  dermoDeliverableDetails: MaterialDistributionDetailItem[]
  dermoMercadeoPending: MaterialDistributionItem[]
  dermoInventoryItems: MaterialInventoryBalanceItem[]
  latestCloseDate: string | null
  accountOptions: SelectorOption[]
  pdvOptions: SelectorOption[]
  monthOptions: string[]
}

function getFirst<T>(value: MaybeMany<T>): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7) + '-01'
}

function isDistributionStatePending(value: MaterialDistributionItem['estado']) {
  return value === 'PENDIENTE_RECEPCION' || value === 'PENDIENTE_ACLARACION'
}

function sumInventory(rows: MaterialInventarioMovimientoRow[]) {
  return rows.reduce((total, row) => total + Number(row.cantidad_delta ?? 0), 0)
}

async function cancelActorPreviewLots(client: SupabaseClient, actorUsuarioId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedClient = client as SupabaseClient<any>
  await typedClient
    .from('material_distribucion_lote')
    .update({
      estado: 'CANCELADO',
      metadata: {
        cancelado_desde: 'recarga_panel_materiales',
        cancelado_en: new Date().toISOString(),
      },
    })
    .eq('created_by_usuario_id', actorUsuarioId)
    .eq('estado', 'BORRADOR_PREVIEW')
}

export async function obtenerPanelMateriales(
  supabase: SupabaseClient,
  actor: ActorActual
): Promise<MaterialesPanelData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>
  const currentMonth = getCurrentMonth()

  const [
    catalogResult,
    lotesResult,
    distributionsResult,
    detailResult,
    deliveryResult,
    inventoryResult,
    mercadeoResult,
    conteoResult,
    pdvResult,
    accountResult,
  ] = await Promise.all([
    client
      .from('material_catalogo')
      .select(
        'id, cuenta_cliente_id, nombre, tipo, cantidad_default, requiere_ticket_compra, requiere_evidencia_obligatoria, activo, metadata, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador)'
      )
      .order('nombre', { ascending: true }),
    client
      .from('material_distribucion_lote')
      .select(
        'id, cuenta_cliente_id, mes_operacion, estado, archivo_nombre, archivo_url, gemini_status, advertencias, resumen, preview_data, confirmado_en, created_at, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador)'
      )
      .order('created_at', { ascending: false })
      .limit(120),
    client
      .from('material_distribucion_mensual')
      .select(
        'id, cuenta_cliente_id, lote_id, pdv_id, supervisor_empleado_id, confirmado_por_empleado_id, mes_operacion, estado, cadena_snapshot, id_pdv_cadena_snapshot, sucursal_snapshot, nombre_dc_snapshot, territorio_snapshot, hoja_origen, firma_recepcion_url, firma_recepcion_hash, foto_recepcion_url, foto_recepcion_hash, foto_recepcion_capturada_en, confirmado_en, observaciones, metadata, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador), pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id, id_cadena)'
      )
      .order('mes_operacion', { ascending: false })
      .limit(600),
    client
      .from('material_distribucion_detalle')
      .select(
        'id, distribucion_id, material_catalogo_id, cantidad_enviada, cantidad_recibida, cantidad_entregada, cantidad_observada, material_nombre_snapshot, material_tipo_mes, mecanica_canje, indicaciones_producto, instrucciones_mercadeo, requiere_ticket_mes, requiere_evidencia_entrega_mes, requiere_evidencia_mercadeo, es_regalo_dc, excluir_de_registrar_entrega, total_columna_hoja, observaciones, metadata, material_catalogo:material_catalogo_id(id, nombre, tipo)'
      )
      .limit(6000),
    client
      .from('material_entrega_promocional')
      .select(
        'id, cuenta_cliente_id, distribucion_id, distribucion_detalle_id, material_catalogo_id, empleado_id, pdv_id, cantidad_entregada, fecha_utc, evidencia_material_url, evidencia_pdv_url, ticket_compra_url'
      )
      .order('fecha_utc', { ascending: false })
      .limit(5000),
    client
      .from('material_inventario_movimiento')
      .select(
        'id, pdv_id, material_catalogo_id, distribucion_id, distribucion_detalle_id, tipo_movimiento, cantidad, cantidad_delta, created_at, material_catalogo:material_catalogo_id(id, nombre, tipo)'
      )
      .order('created_at', { ascending: false })
      .limit(8000),
    client
      .from('material_evidencia_mercadeo')
      .select('id, distribucion_id, pdv_id, foto_url, foto_hash, foto_capturada_en, observaciones')
      .order('foto_capturada_en', { ascending: false })
      .limit(2000),
    client
      .from('material_conteo_jornada')
      .select('id, pdv_id, fecha_operacion, momento, observaciones')
      .order('fecha_operacion', { ascending: false })
      .limit(2000),
    client
      .from('pdv')
      .select('id, clave_btl, nombre, zona, cadena_id, id_cadena')
      .eq('estatus', 'ACTIVO')
      .limit(600),
    client.from('cuenta_cliente').select('id, nombre, identificador').eq('activa', true).order('nombre'),
  ])

  const tablesReady =
    !catalogResult.error &&
    !lotesResult.error &&
    !distributionsResult.error &&
    !detailResult.error &&
    !deliveryResult.error &&
    !inventoryResult.error &&
    !mercadeoResult.error &&
    !conteoResult.error

  if (!tablesReady) {
    const message =
      catalogResult.error?.message ||
      lotesResult.error?.message ||
      distributionsResult.error?.message ||
      detailResult.error?.message ||
      deliveryResult.error?.message ||
      inventoryResult.error?.message ||
      mercadeoResult.error?.message ||
      conteoResult.error?.message ||
      'La infraestructura de logística promocional aún no está disponible.'

    return {
      actorRole: actor.puesto,
      currentMonth,
      infraestructuraLista: false,
      mensajeInfraestructura: message,
      catalog: [],
      draftLots: [],
      confirmedLots: [],
      distributions: [],
      supervisorView: [],
      reportRows: [],
      dermoContext: null,
      dermoPendingReception: [],
      dermoDeliverableDetails: [],
      dermoMercadeoPending: [],
      dermoInventoryItems: [],
      latestCloseDate: null,
      accountOptions: [],
      pdvOptions: [],
      monthOptions: [currentMonth],
    }
  }

  if (['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA'].includes(actor.puesto)) {
    try {
      await cancelActorPreviewLots(client, actor.usuarioId)
    } catch {
      // Si la limpieza del preview efímero falla, no bloqueamos la lectura del panel.
    }
  }

  const pdvById = new Map(
    (((pdvResult.data ?? []) as PdvRelacion[]) ?? []).map((item) => [item.id, item])
  )
  const chainIds = Array.from(
    new Set(Array.from(pdvById.values()).map((item) => item.cadena_id).filter((value): value is string => Boolean(value)))
  )
  const cadenaResult = chainIds.length
    ? await client.from('cadena').select('id, nombre').in('id', chainIds).limit(chainIds.length)
    : { data: [], error: null }
  const cadenaById = new Map(
    (((cadenaResult.data ?? []) as CadenaRelacion[]) ?? []).map((item) => [item.id, item.nombre])
  )

  const accountRows = ((accountResult.data ?? []) as CuentaClienteRelacion[]) ?? []
  const fallbackIsdinAccount = accountRows.find((item) => item.identificador === 'isdin_mexico') ?? null
  const effectiveAccountId = actor.cuentaClienteId ?? fallbackIsdinAccount?.id ?? accountRows[0]?.id ?? null

  const catalogRowsScoped = (((catalogResult.data ?? []) as MaterialCatalogoRow[]) ?? []).filter(
    (item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId
  )
  const lotRowsScoped = (((lotesResult.data ?? []) as MaterialDistribucionLoteRow[]) ?? []).filter(
    (item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId
  )
  const distributionRowsScoped = (((distributionsResult.data ?? []) as MaterialDistribucionRow[]) ?? []).filter(
    (item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId
  )
  const deliveryRowsScoped = (((deliveryResult.data ?? []) as MaterialEntregaPromocionalRow[]) ?? []).filter(
    (item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId
  )

  const catalog = catalogRowsScoped.map((item) => ({
    id: item.id,
    cuentaClienteId: item.cuenta_cliente_id,
    cuentaCliente: getFirst(item.cuenta_cliente)?.nombre ?? null,
    nombre: item.nombre,
    tipo: item.tipo,
    cantidadDefault: item.cantidad_default,
    requiereTicketCompra: item.requiere_ticket_compra,
    requiereEvidenciaObligatoria: item.requiere_evidencia_obligatoria,
    activo: item.activo,
  }))

  const mercadeoByDistribution = new Map<string, MaterialMercadeoEvidenceItem>()
  for (const row of (mercadeoResult.data ?? []) as MaterialEvidenciaMercadeoRow[]) {
    mercadeoByDistribution.set(row.distribucion_id, {
      id: row.id,
      distribucionId: row.distribucion_id,
      pdvId: row.pdv_id,
      fotoUrl: row.foto_url,
      fotoHash: row.foto_hash,
      fotoCapturadaEn: row.foto_capturada_en,
      observaciones: row.observaciones,
    })
  }

  const detailByDistribution = new Map<string, MaterialDistributionDetailItem[]>()
  for (const row of (detailResult.data ?? []) as MaterialDistribucionDetalleRow[]) {
    const material = getFirst(row.material_catalogo)
    const detail: MaterialDistributionDetailItem = {
      id: row.id,
      distribucionId: row.distribucion_id,
      materialCatalogoId: row.material_catalogo_id,
      materialNombre: row.material_nombre_snapshot ?? material?.nombre ?? 'Sin material',
      materialTipo: row.material_tipo_mes ?? material?.tipo ?? 'PROMOCIONAL',
      inventariable: !row.excluir_de_registrar_entrega,
      requiereTicketCompra: row.requiere_ticket_mes,
      requiereEvidenciaObligatoria: row.requiere_evidencia_entrega_mes,
      requiereTicketMes: row.requiere_ticket_mes,
      requiereEvidenciaEntregaMes: row.requiere_evidencia_entrega_mes,
      requiereEvidenciaMercadeo: row.requiere_evidencia_mercadeo,
      esRegaloDc: row.es_regalo_dc,
      excluirDeRegistrarEntrega: row.excluir_de_registrar_entrega,
      mecanicaCanje: row.mecanica_canje,
      indicacionesProducto: row.indicaciones_producto,
      instruccionesMercadeo: row.instrucciones_mercadeo,
      cantidadEnviada: row.cantidad_enviada,
      cantidadRecibida: row.cantidad_recibida,
      cantidadEntregada: row.cantidad_entregada,
      cantidadObservada: row.cantidad_observada,
      saldoDisponible: Math.max(row.cantidad_recibida - row.cantidad_entregada, 0),
      observaciones: row.observaciones,
    }
    const current = detailByDistribution.get(row.distribucion_id) ?? []
    current.push(detail)
    detailByDistribution.set(row.distribucion_id, current)
  }

  const deliveries = deliveryRowsScoped
  const deliveryEvidenceCountByDistribution = new Map<string, number>()
  for (const delivery of deliveries) {
    if (!delivery.distribucion_id) {
      continue
    }
    const count =
      (delivery.evidencia_material_url ? 1 : 0) +
      (delivery.evidencia_pdv_url ? 1 : 0) +
      (delivery.ticket_compra_url ? 1 : 0)
    deliveryEvidenceCountByDistribution.set(
      delivery.distribucion_id,
      (deliveryEvidenceCountByDistribution.get(delivery.distribucion_id) ?? 0) + count
    )
  }

  const inventoryRows = (inventoryResult.data ?? []) as MaterialInventarioMovimientoRow[]
  const inventoryByPdvMaterial = new Map<string, MaterialInventoryBalanceItem>()
  for (const row of inventoryRows) {
    const material = getFirst(row.material_catalogo)
    if (!material) {
      continue
    }
    const key = `${row.pdv_id}::${row.material_catalogo_id}`
    const current = inventoryByPdvMaterial.get(key) ?? {
      materialCatalogoId: row.material_catalogo_id,
      materialNombre: material.nombre,
      materialTipo: material.tipo,
      balanceActual: 0,
    }
    current.balanceActual += Number(row.cantidad_delta ?? 0)
    inventoryByPdvMaterial.set(key, current)
  }

  const distributions = distributionRowsScoped.map((row) => {
    const pdv = getFirst(row.pdv) ?? pdvById.get(row.pdv_id) ?? null
    const details = (detailByDistribution.get(row.id) ?? []).sort((left, right) =>
      left.materialNombre.localeCompare(right.materialNombre, 'es')
    )
    return {
      id: row.id,
      loteId: row.lote_id,
      cuentaClienteId: row.cuenta_cliente_id,
      cuentaCliente: getFirst(row.cuenta_cliente)?.nombre ?? null,
      pdvId: row.pdv_id,
      pdvClaveBtl: pdv?.clave_btl ?? null,
      pdvNombre: pdv?.nombre ?? row.sucursal_snapshot ?? 'Sin PDV',
      idPdvCadena: row.id_pdv_cadena_snapshot ?? pdv?.id_cadena ?? null,
      zona: pdv?.zona ?? null,
      cadena: row.cadena_snapshot ?? (pdv?.cadena_id ? cadenaById.get(pdv.cadena_id) ?? null : null),
      sucursal: row.sucursal_snapshot,
      nombreDc: row.nombre_dc_snapshot,
      territorio: row.territorio_snapshot,
      hojaOrigen: row.hoja_origen,
      mesOperacion: row.mes_operacion,
      estado: row.estado,
      confirmadoEn: row.confirmado_en,
      observaciones: row.observaciones,
      firmaRecepcionUrl: row.firma_recepcion_url,
      fotoRecepcionUrl: row.foto_recepcion_url,
      fotoRecepcionCapturadaEn: row.foto_recepcion_capturada_en,
      mercadeoEvidence: mercadeoByDistribution.get(row.id) ?? null,
      detalles: details,
      totalEnviado: details.reduce((total, item) => total + item.cantidadEnviada, 0),
      totalRecibido: details.reduce((total, item) => total + item.cantidadRecibida, 0),
      totalEntregado: details.reduce((total, item) => total + item.cantidadEntregada, 0),
      totalDisponible: details.reduce((total, item) => total + Math.max(item.saldoDisponible, 0), 0),
    } satisfies MaterialDistributionItem
  })

  const lotes = lotRowsScoped.map((row) => {
    const previewRecord = (row.preview_data ?? {}) as Record<string, unknown>
    const preview =
      previewRecord && Array.isArray((previewRecord as Record<string, unknown>).pdvPackages)
        ? (previewRecord as unknown as MaterialDistributionPreview)
        : null
    const resumen = (row.resumen ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      cuentaClienteId: row.cuenta_cliente_id,
      cuentaCliente: getFirst(row.cuenta_cliente)?.nombre ?? null,
      mesOperacion: row.mes_operacion,
      estado: row.estado,
      archivoNombre: row.archivo_nombre,
      archivoUrl: row.archivo_url,
      geminiStatus: row.gemini_status,
      warningCount: Array.isArray(row.advertencias) ? row.advertencias.length : 0,
      canConfirm: Boolean(resumen.can_confirm ?? preview?.canConfirm ?? false),
      pdvCount: Number(resumen.pdv_count ?? preview?.pdvPackages.length ?? 0),
      createdAt: row.created_at,
      confirmedAt: row.confirmado_en,
      preview,
      geminiSummary: typeof resumen.gemini_summary === 'string' ? resumen.gemini_summary : null,
    } satisfies MaterialLotPreviewItem
  })

  const supervisorView = distributions.map((item) => ({
    pdvId: item.pdvId,
    pdvClaveBtl: item.pdvClaveBtl,
    pdvNombre: item.pdvNombre,
    cadena: item.cadena,
    zona: item.zona,
    mesOperacion: item.mesOperacion,
    estadoRecepcion: item.estado,
    enviado: item.totalEnviado,
    recibido: item.totalRecibido,
    entregado: item.totalEntregado,
    restante: item.totalDisponible,
    observaciones: item.detalles.reduce((total, detail) => total + detail.cantidadObservada, 0),
    evidencias: deliveryEvidenceCountByDistribution.get(item.id) ?? 0,
    mercadeoRegistrado: Boolean(item.mercadeoEvidence),
  }))

  const reportRows = distributions.flatMap((distribution) =>
    distribution.detalles.map((detail) => ({
      month: distribution.mesOperacion,
      chain: distribution.cadena,
      pdv: distribution.pdvNombre,
      pdvClaveBtl: distribution.pdvClaveBtl,
      material: detail.materialNombre,
      materialTipo: detail.materialTipo,
      enviado: detail.cantidadEnviada,
      recibido: detail.cantidadRecibida,
      entregado: detail.cantidadEntregada,
      restante: detail.saldoDisponible,
      observaciones: detail.cantidadObservada,
      evidencias:
        deliveries.filter((item) => item.distribucion_detalle_id === detail.id).reduce((total, item) => {
          return total + (item.evidencia_material_url ? 1 : 0) + (item.evidencia_pdv_url ? 1 : 0) + (item.ticket_compra_url ? 1 : 0)
        }, 0),
      mercadeo: detail.requiereEvidenciaMercadeo,
    }))
  )

  let dermoContext: MaterialDermoContext | null = null
  if (actor.puesto === 'DERMOCONSEJERO') {
    const assignmentResult = await client
      .from('asignacion')
      .select('empleado_id, cuenta_cliente_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion')
      .eq('empleado_id', actor.empleadoId)
      .eq('estado_publicacion', 'PUBLICADA')
      .limit(20)

    const today = new Date().toISOString().slice(0, 10)
    const activeAssignments = ((assignmentResult.data ?? []) as AsignacionContextRow[]).filter((item) => {
      const starts = item.fecha_inicio <= today
      const ends = !item.fecha_fin || item.fecha_fin >= today
      return starts && ends
    })
    const assignment = activeAssignments[0]
    if (assignment) {
      const pdv = pdvById.get(assignment.pdv_id)
      dermoContext = {
        pdvId: assignment.pdv_id,
        pdvNombre: pdv?.nombre ?? 'Sin PDV',
        pdvClaveBtl: pdv?.clave_btl ?? null,
        cuentaClienteId: assignment.cuenta_cliente_id,
        month: currentMonth,
      }
    }
  }

  const dermoPendingReception = dermoContext
    ? distributions.filter(
        (item) =>
          item.pdvId === dermoContext.pdvId &&
          item.mesOperacion === currentMonth &&
          isDistributionStatePending(item.estado)
      )
    : []

  const dermoDeliverableDetails = dermoContext
    ? distributions
        .filter((item) => item.pdvId === dermoContext.pdvId && item.mesOperacion === currentMonth)
        .flatMap((item) => item.detalles.map((detail) => ({ ...detail, distribucionId: item.id })))
        .filter((item) => item.saldoDisponible > 0 && item.inventariable && !item.esRegaloDc)
    : []

  const dermoMercadeoPending = dermoContext
    ? distributions.filter(
        (item) =>
          item.pdvId === dermoContext.pdvId &&
          item.mesOperacion === currentMonth &&
          ['RECIBIDA_CONFORME', 'RECIBIDA_CON_OBSERVACIONES'].includes(item.estado) &&
          item.detalles.some((detail) => detail.requiereEvidenciaMercadeo) &&
          !item.mercadeoEvidence
      )
    : []

  const dermoInventoryItems = dermoContext
    ? Array.from(inventoryByPdvMaterial.entries())
        .filter(([key, item]) => key.startsWith(`${dermoContext?.pdvId}::`) && item.balanceActual > 0)
        .map(([, item]) => item)
        .sort((left, right) => left.materialNombre.localeCompare(right.materialNombre, 'es'))
    : []

  const latestCloseDate =
    dermoContext
      ? ((conteoResult.data ?? []) as MaterialConteoJornadaRow[])
          .filter((item) => item.pdv_id === dermoContext.pdvId && item.momento === 'CIERRE')
          .sort((left, right) => right.fecha_operacion.localeCompare(left.fecha_operacion))[0]?.fecha_operacion ?? null
      : null

  const accountOptions = accountRows
    .filter((item) => !effectiveAccountId || item.id === effectiveAccountId)
    .map((item) => ({
      id: item.id,
      label: item.nombre,
    }))
  const pdvOptions = Array.from(pdvById.values())
    .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'))
    .map((item) => ({
      id: item.id,
      label: `${item.clave_btl} / ${item.nombre}`,
    }))
  const monthOptions = Array.from(
    new Set([
      ...distributions.map((item) => item.mesOperacion),
      ...lotes.map((item) => item.mesOperacion),
    ])
  ).sort((left, right) => right.localeCompare(left))

  return {
    actorRole: actor.puesto,
    currentMonth,
    infraestructuraLista: true,
    catalog,
    draftLots: [],
    confirmedLots: lotes.filter((item) => item.estado === 'CONFIRMADO'),
    distributions,
    supervisorView,
    reportRows,
    dermoContext,
    dermoPendingReception,
    dermoDeliverableDetails,
    dermoMercadeoPending,
    dermoInventoryItems,
    latestCloseDate,
    accountOptions,
    pdvOptions,
    monthOptions: monthOptions.length > 0 ? monthOptions : [currentMonth],
  }
}
