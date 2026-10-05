import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorActual } from '@/lib/auth/session';
import { buildModuleCacheTags } from '@/lib/cache/moduleTags';
import { createServiceClient } from '@/lib/supabase/server';
import type {
  Cadena,
  CuentaCliente,
  Empleado,
  MaterialCatalogo,
  MaterialConteoJornada,
  MaterialDistribucionDetalle,
  MaterialDistribucionLote,
  MaterialDistribucionMensual,
  MaterialEntregaPromocional,
  MaterialEntregaUltimaMilla,
  MaterialEntregaUltimaMillaDetalle,
  MaterialEntregaUltimaMillaEvidencia,
  MaterialEvidenciaMercadeo,
  MaterialInventarioMovimiento,
  Pdv,
  UsuarioSistema,
} from '@/types/database';
import type { MaterialDistributionPreview } from '../lib/materialDistributionImport';
import {
  SINGLE_TENANT_ACCOUNT_ID,
  SINGLE_TENANT_ACCOUNT_IDENTIFIER,
  SINGLE_TENANT_ACCOUNT_NAME,
  isSingleTenantBackendEnabled,
} from '@/lib/tenant/singleTenant';

type MaybeMany<T> = T | T[] | null;

function isSupabaseClient(value: unknown): value is SupabaseClient {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'from' in value &&
    typeof (value as { from?: unknown }).from === 'function'
  );
}

type AccountRowLike = CuentaClienteRelacion & {
  id: string;
};

function buildSingleTenantAccountRow(): AccountRowLike {
  return {
    id: SINGLE_TENANT_ACCOUNT_ID,
    nombre: SINGLE_TENANT_ACCOUNT_NAME,
    identificador: SINGLE_TENANT_ACCOUNT_IDENTIFIER,
  };
}

function ensureSingleTenantAccountRow(rows: CuentaClienteRelacion[]) {
  if (!isSingleTenantBackendEnabled()) {
    return rows;
  }

  const canonical = buildSingleTenantAccountRow();
  const hasCanonicalRow = rows.some((item) => item.id === canonical.id);

  return hasCanonicalRow ? rows : [canonical, ...rows];
}

type CuentaClienteRelacion = Pick<CuentaCliente, 'id' | 'nombre' | 'identificador'>;
type PdvRelacion = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'cadena_id' | 'id_cadena'>;
type CadenaRelacion = Pick<Cadena, 'id' | 'nombre'>;

interface MaterialCatalogoRow extends Pick<
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
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>;
}

interface MaterialDistribucionLoteRow extends Pick<
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
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>;
  tipo_dispersion?: string | null;
}

interface MaterialDistribucionRow extends Pick<
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
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>;
  pdv: MaybeMany<PdvRelacion>;
  tipo_dispersion?: string | null;
}

interface MaterialDistribucionDetalleRow extends Pick<
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
  material_catalogo: MaybeMany<Pick<MaterialCatalogo, 'id' | 'nombre' | 'tipo'>>;
}

interface MaterialEntregaPromocionalRow extends Pick<
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

interface MaterialInventarioMovimientoRow extends Pick<
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
  material_catalogo: MaybeMany<Pick<MaterialCatalogo, 'id' | 'nombre' | 'tipo'>>;
}

interface MaterialEvidenciaMercadeoRow extends Pick<
  MaterialEvidenciaMercadeo,
  | 'id'
  | 'distribucion_id'
  | 'pdv_id'
  | 'foto_url'
  | 'foto_hash'
  | 'foto_capturada_en'
  | 'observaciones'
> {}

interface MaterialConteoJornadaRow extends Pick<
  MaterialConteoJornada,
  'id' | 'pdv_id' | 'fecha_operacion' | 'momento' | 'observaciones'
> {}

interface MaterialDistribucionResumenRow {
  distribucion_id: string;
  detalle_count: number;
  ultima_milla_count: number;
}

interface MaterialUltimaMillaRow extends Pick<
  MaterialEntregaUltimaMilla,
  | 'id'
  | 'cuenta_cliente_id'
  | 'distribucion_id'
  | 'pdv_id'
  | 'cadena_id'
  | 'supervisor_empleado_id'
  | 'dermoconsejero_empleado_id'
  | 'estado'
  | 'pdv_snapshot'
  | 'cadena_snapshot'
  | 'dermoconsejero_snapshot'
  | 'correccion_solicitada'
  | 'latitud'
  | 'longitud'
  | 'gps_accuracy_metros'
  | 'capturado_en'
  | 'sincronizado_en'
  | 'offline_client_id'
  | 'metadata'
> {}

interface MaterialUltimaMillaDetalleRow extends Pick<
  MaterialEntregaUltimaMillaDetalle,
  | 'id'
  | 'entrega_id'
  | 'distribucion_detalle_id'
  | 'material_catalogo_id'
  | 'cantidad_teorica'
  | 'estado_item'
  | 'cantidad_real_recibida'
  | 'diferencia'
  | 'observaciones'
> {
  material_catalogo: MaybeMany<Pick<MaterialCatalogo, 'id' | 'nombre' | 'tipo'>>;
}

interface MaterialUltimaMillaEvidenciaRow extends Pick<
  MaterialEntregaUltimaMillaEvidencia,
  | 'id'
  | 'entrega_id'
  | 'tipo'
  | 'bucket'
  | 'ruta_archivo'
  | 'thumbnail_url'
  | 'capturada_en'
  | 'orden'
  | 'metadata'
> {}

interface MaterialReceiverEmployeeRow extends Pick<
  Empleado,
  'id' | 'nombre_completo' | 'id_nomina' | 'puesto' | 'estatus_laboral'
> {}

interface MaterialReceiverUsuarioRow extends Pick<
  UsuarioSistema,
  'empleado_id' | 'username' | 'estado_cuenta' | 'cuenta_cliente_id'
> {}

interface AsignacionContextRow {
  empleado_id: string;
  cuenta_cliente_id: string | null;
  pdv_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado_publicacion: 'BORRADOR' | 'PUBLICADA';
}

export interface SelectorOption {
  id: string;
  label: string;
}

export interface MaterialLastMileReceiverOption {
  id: string;
  nombre: string;
  username: string | null;
  idNomina: string | null;
  scope: 'ASIGNADO_PDV' | 'TODOS' | 'POR_CUBRIR' | 'SUPERVISOR';
  label: string;
}

export interface MaterialCatalogItem {
  id: string;
  cuentaClienteId: string;
  cuentaCliente: string | null;
  nombre: string;
  tipo: string;
  cantidadDefault: number;
  requiereTicketCompra: boolean;
  requiereEvidenciaObligatoria: boolean;
  activo: boolean;
}

export interface MaterialLotPreviewItem {
  id: string;
  cuentaClienteId: string;
  cuentaCliente: string | null;
  mesOperacion: string;
  estado: 'BORRADOR_PREVIEW' | 'CONFIRMADO' | 'CANCELADO';
  archivoNombre: string;
  archivoUrl: string | null;
  geminiStatus: string;
  warningCount: number;
  canConfirm: boolean;
  pdvCount: number;
  createdAt: string;
  confirmedAt: string | null;
  preview: MaterialDistributionPreview | null;
  geminiSummary: string | null;
  tipoDispersion?: string | null;
}

export interface MaterialDistributionDetailItem {
  id: string;
  distribucionId: string;
  materialCatalogoId: string;
  materialNombre: string;
  materialTipo: string;
  inventariable: boolean;
  requiereTicketCompra: boolean;
  requiereEvidenciaObligatoria: boolean;
  requiereTicketMes: boolean;
  requiereEvidenciaEntregaMes: boolean;
  requiereEvidenciaMercadeo: boolean;
  esRegaloDc: boolean;
  excluirDeRegistrarEntrega: boolean;
  mecanicaCanje: string | null;
  indicacionesProducto: string | null;
  instruccionesMercadeo: string | null;
  cantidadEnviada: number;
  cantidadRecibida: number;
  cantidadEntregada: number;
  cantidadObservada: number;
  saldoDisponible: number;
  observaciones: string | null;
}

export interface MaterialMercadeoEvidenceItem {
  id: string;
  distribucionId: string;
  pdvId: string;
  fotoUrl: string;
  fotoHash: string | null;
  fotoCapturadaEn: string;
  observaciones: string | null;
}

export interface MaterialDistributionItem {
  id: string;
  loteId: string | null;
  cuentaClienteId: string;
  cuentaCliente: string | null;
  supervisorEmpleadoId: string | null;
  supervisorNombre: string | null;
  pdvId: string;
  pdvClaveBtl: string | null;
  pdvNombre: string;
  idPdvCadena: string | null;
  zona: string | null;
  cadena: string | null;
  sucursal: string | null;
  nombreDc: string | null;
  territorio: string | null;
  hojaOrigen: string | null;
  mesOperacion: string;
  estado:
    | 'PENDIENTE_RECEPCION'
    | 'RECIBIDA_CONFORME'
    | 'RECIBIDA_CON_OBSERVACIONES'
    | 'PENDIENTE_ACLARACION'
    | 'CANCELADA';
  estadoEntregaActual: 'ENTREGADO' | 'NO_ENTREGADO';
  confirmadoEn: string | null;
  observaciones: string | null;
  firmaRecepcionUrl: string | null;
  fotoRecepcionUrl: string | null;
  fotoRecepcionCapturadaEn: string | null;
  mercadeoEvidence: MaterialMercadeoEvidenceItem | null;
  detalles: MaterialDistributionDetailItem[];
  configuredPackageCount: number;
  totalEnviado: number;
  totalRecibido: number;
  totalEntregado: number;
  totalDisponible: number;
  receptorOptions: MaterialLastMileReceiverOption[];
  tipoDispersion?: string | null;
}

export interface MaterialInventoryBalanceItem {
  materialCatalogoId: string;
  materialNombre: string;
  materialTipo: string;
  balanceActual: number;
}

export interface MaterialSupervisorViewItem {
  pdvId: string;
  pdvClaveBtl: string | null;
  pdvNombre: string;
  cadena: string | null;
  zona: string | null;
  mesOperacion: string;
  estadoRecepcion: string;
  estadoEntregaActual: 'ENTREGADO' | 'NO_ENTREGADO';
  enviado: number;
  recibido: number;
  entregado: number;
  restante: number;
  observaciones: number;
  evidencias: number;
  mercadeoRegistrado: boolean;
}

export interface MaterialReportRow {
  month: string;
  chain: string | null;
  pdv: string;
  pdvClaveBtl: string | null;
  material: string;
  materialTipo: string;
  estadoEntregaActual: 'ENTREGADO' | 'NO_ENTREGADO';
  enviado: number;
  recibido: number;
  entregado: number;
  restante: number;
  observaciones: number;
  evidencias: number;
  mercadeo: boolean;
  tipoDispersion?: string | null;
}

export interface MaterialDermoContext {
  pdvId: string;
  pdvNombre: string;
  pdvClaveBtl: string | null;
  cuentaClienteId: string | null;
  month: string;
}

export interface MaterialLastMileDetailItem {
  id: string;
  entregaId: string;
  distribucionDetalleId: string;
  materialCatalogoId: string;
  materialNombre: string;
  materialTipo: string;
  cantidadTeorica: number;
  cantidadRealRecibida: number;
  diferencia: number;
  estadoItem: 'COMPLETO' | 'CON_DISCREPANCIA';
  observaciones: string | null;
}

export interface MaterialLastMileEvidenceItem {
  id: string;
  entregaId: string;
  tipo: 'ENTREGA_FISICA' | 'ACUSE_FIRMADO';
  url: string | null;
  thumbnailUrl: string | null;
  capturadaEn: string;
  orden: number;
}

export interface MaterialLastMileDeliveryItem {
  id: string;
  cuentaClienteId: string;
  distribucionId: string;
  pdvId: string;
  cadenaId: string | null;
  supervisorEmpleadoId: string;
  dermoconsejeroEmpleadoId: string | null;
  supervisorNombre: string | null;
  estado: MaterialEntregaUltimaMilla['estado'];
  pdvNombre: string;
  pdvClaveBtl: string | null;
  idPdvCadena: string | null;
  cadena: string | null;
  receptor: string | null;
  correccionSolicitada: Record<string, unknown>;
  latitud: number | null;
  longitud: number | null;
  gpsAccuracyMetros: number | null;
  capturadoEn: string;
  sincronizadoEn: string | null;
  offlineClientId: string;
  detalles: MaterialLastMileDetailItem[];
  evidencias: MaterialLastMileEvidenceItem[];
  receptorOptions: MaterialLastMileReceiverOption[];
  totalItems: number;
  totalTeorico: number;
  totalReal: number;
  diferenciaTotal: number;
  tipoDispersion: string;
  modoEntrega: 'POR_CUBRIR' | 'ENTREGA_DC';
  mesOperacion: string;
  metadata?: Record<string, any> | null;
}

export interface MaterialesPanelData {
  actorRole: ActorActual['puesto'];
  currentMonth: string;
  loadMode: 'overview' | 'upload' | 'review' | 'reports' | 'full';
  infraestructuraLista: boolean;
  mensajeInfraestructura?: string;
  catalog: MaterialCatalogItem[];
  draftLots: MaterialLotPreviewItem[];
  confirmedLots: MaterialLotPreviewItem[];
  distributions: MaterialDistributionItem[];
  supervisorView: MaterialSupervisorViewItem[];
  reportRows: MaterialReportRow[];
  dermoContext: MaterialDermoContext | null;
  dermoPendingReception: MaterialDistributionItem[];
  dermoDeliverableDetails: MaterialDistributionDetailItem[];
  dermoMercadeoPending: MaterialDistributionItem[];
  dermoInventoryItems: MaterialInventoryBalanceItem[];
  supervisorLastMileDistributions: MaterialDistributionItem[];
  lastMileDeliveries: MaterialLastMileDeliveryItem[];
  latestCloseDate: string | null;
  accountOptions: SelectorOption[];
  supervisorOptions: SelectorOption[];
  pdvOptions: SelectorOption[];
  monthOptions: string[];
  supervisorScopePdvs?: {
    id: string;
    claveBtl: string;
    nombre: string;
    zona: string | null;
    cadenaId: string | null;
    idCadena: string | null;
  }[];
  receiverOptionsByPdv?: Record<string, MaterialLastMileReceiverOption[]>;
}

export function buildFullMonthOptions(currentMonth: string, extraMonths: string[] = []): string[] {
  const currentYear = new Date().getFullYear();
  const yearMonths: string[] = [];
  for (let year = currentYear - 1; year <= currentYear + 1; year++) {
    for (let m = 1; m <= 12; m++) {
      yearMonths.push(`${year}-${String(m).padStart(2, '0')}`);
    }
  }
  const set = new Set([currentMonth, ...yearMonths, ...extraMonths.filter(Boolean)]);
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function getFirst<T>(value: MaybeMany<T>): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7) + '-01';
}

function isDistributionStatePending(value: MaterialDistributionItem['estado']) {
  return value === 'PENDIENTE_RECEPCION' || value === 'PENDIENTE_ACLARACION';
}

function isTestSupervisorEmployee(
  employee: Pick<Empleado, 'nombre_completo' | 'id_nomina' | 'puesto'> | null | undefined
) {
  if (!employee || employee.puesto !== 'SUPERVISOR') {
    return false;
  }

  const name = employee.nombre_completo.trim().toLowerCase();
  const payrollId = employee.id_nomina?.trim().toUpperCase() ?? '';
  return name.startsWith('test supervisor') || payrollId.startsWith('TST-SUP-');
}

function buildLastMileQuantityByDistributionDetail(rows: MaterialUltimaMillaDetalleRow[]) {
  const quantities = new Map<string, number>();

  for (const row of rows) {
    const quantity = row.cantidad_real_recibida ?? row.cantidad_teorica;
    quantities.set(
      row.distribucion_detalle_id,
      (quantities.get(row.distribucion_detalle_id) ?? 0) + quantity
    );
  }

  return quantities;
}

function normalizeEvidenceStorageReference(value: string | null) {
  const reference = typeof value === 'string' ? value.trim() : '';
  return reference || null;
}

function isDirectEvidenceUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith('/api/storage/');
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function buildOrphanRouteCandidates(route: string, capturedAt: string | null) {
  const normalizedRoute = route.trim().replace(/^\/+/, '');
  if (!normalizedRoute || normalizedRoute.startsWith('_orphans/')) {
    return [];
  }

  const parsedDate = capturedAt ? new Date(capturedAt) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return [];
  }

  return Array.from({ length: 8 }, (_, daysAfterCapture) => {
    const day = addDays(parsedDate, daysAfterCapture).toISOString().slice(0, 10);
    return `_orphans/${day}/${normalizedRoute}`;
  });
}

async function signEvidenceStorageRoute(
  client: SupabaseClient,
  bucket: string | null,
  route: string | null,
  capturedAt: string | null = null
) {
  const normalizedBucket = normalizeEvidenceStorageReference(bucket);
  const normalizedRoute = normalizeEvidenceStorageReference(route);

  if (!normalizedBucket || !normalizedRoute || !('storage' in client)) {
    return null;
  }

  const storageClient = client as SupabaseClient & {
    storage?: {
      from?: (bucket: string) => {
        createSignedUrl?: (
          path: string,
          expiresIn: number
        ) => Promise<{ data: { signedUrl?: string } | null; error: { message: string } | null }>;
      };
    };
  };
  const bucketClient = storageClient.storage?.from?.(normalizedBucket);

  if (!bucketClient?.createSignedUrl) {
    return null;
  }

  const candidateRoutes = [
    normalizedRoute,
    ...buildOrphanRouteCandidates(normalizedRoute, capturedAt),
  ];

  for (const candidateRoute of candidateRoutes) {
    const { data, error } = await bucketClient.createSignedUrl(candidateRoute, 60 * 60);
    if (!error && data?.signedUrl) {
      return `/api/reportes/imagen-proxy?bucket=${encodeURIComponent(normalizedBucket)}&route=${encodeURIComponent(candidateRoute)}`;
    }
  }

  return null;
}

export async function resolveEvidenceStorageUrl(
  client: SupabaseClient,
  reference: string | null,
  bucket: string | null,
  route: string | null,
  capturedAt: string | null = null
) {
  const normalizedReference = normalizeEvidenceStorageReference(reference);

  if (normalizedReference && isDirectEvidenceUrl(normalizedReference)) {
    return normalizedReference;
  }

  const signedFromColumns = await signEvidenceStorageRoute(client, bucket, route, capturedAt);
  if (signedFromColumns) {
    return signedFromColumns;
  }

  if (!normalizedReference) {
    return null;
  }

  const [referenceBucket, ...referenceRouteParts] = normalizedReference.split('/').filter(Boolean);
  if (!referenceBucket || referenceRouteParts.length === 0) {
    return null;
  }

  return signEvidenceStorageRoute(
    client,
    referenceBucket,
    referenceRouteParts.join('/'),
    capturedAt
  );
}

function pickSnapshotString(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildEmptyMaterialesPanelData(
  actor: ActorActual,
  currentMonth: string,
  overrides: Partial<MaterialesPanelData> = {}
): MaterialesPanelData {
  return {
    actorRole: actor.puesto,
    currentMonth,
    loadMode: 'full',
    infraestructuraLista: true,
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
    supervisorLastMileDistributions: [],
    lastMileDeliveries: [],
    latestCloseDate: null,
    accountOptions: [],
    supervisorOptions: [],
    pdvOptions: [],
    monthOptions: [currentMonth],
    supervisorScopePdvs: [],
    receiverOptionsByPdv: {},
    ...overrides,
  };
}

function buildReceiverOption(
  employee: MaterialReceiverEmployeeRow,
  username: string | null,
  scope: MaterialLastMileReceiverOption['scope']
): MaterialLastMileReceiverOption {
  return {
    id: employee.id,
    nombre: employee.nombre_completo,
    username,
    idNomina: employee.id_nomina,
    scope: employee.puesto === 'SUPERVISOR' ? 'SUPERVISOR' : scope,
    label: employee.nombre_completo,
  };
}

function buildPorCubrirReceiverOption(): MaterialLastMileReceiverOption {
  return {
    id: '__POR_CUBRIR__',
    nombre: 'Por cubrir',
    username: null,
    idNomina: null,
    scope: 'POR_CUBRIR',
    label: 'Por cubrir',
  };
}

async function buildLastMileReceiverOptionsByPdv(
  client: SupabaseClient,
  distributions: { pdvId: string }[],
  accountId: string | null
) {
  const optionsByPdv = new Map<string, MaterialLastMileReceiverOption[]>();
  const pdvIds = Array.from(new Set(distributions.map((item) => item.pdvId).filter(Boolean)));
  if (pdvIds.length === 0) {
    return optionsByPdv;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedClient = client as SupabaseClient<any>;
  const today = new Date().toISOString().slice(0, 10);
  const assignmentResult = await typedClient
    .from('asignacion')
    .select('empleado_id, cuenta_cliente_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion')
    .in('pdv_id', pdvIds)
    .eq('estado_publicacion', 'PUBLICADA')
    .limit(Math.max(100, pdvIds.length * 8));

  const activeAssignments = ((assignmentResult.data ?? []) as AsignacionContextRow[]).filter(
    (item) => {
      const sameAccount =
        !accountId || !item.cuenta_cliente_id || item.cuenta_cliente_id === accountId;
      const starts = item.fecha_inicio <= today;
      const ends = !item.fecha_fin || item.fecha_fin >= today;
      return sameAccount && starts && ends;
    }
  );

  const assignedEmployeeIds = Array.from(
    new Set(activeAssignments.map((item) => item.empleado_id))
  );
  const accountUsersResult = accountId
    ? await typedClient
        .from('usuario')
        .select('empleado_id, username, estado_cuenta, cuenta_cliente_id')
        .eq('cuenta_cliente_id', accountId)
        .limit(500)
    : { data: [], error: null };

  const accountUsers = (
    ((accountUsersResult.data ?? []) as MaterialReceiverUsuarioRow[]) ?? []
  ).filter((user) => user.estado_cuenta !== 'BAJA');
  const accountEmployeeIds = accountUsers.map((user) => user.empleado_id);
  const employeeIdsToLoad = Array.from(new Set([...assignedEmployeeIds, ...accountEmployeeIds]));
  const employeesResult =
    employeeIdsToLoad.length > 0
      ? await typedClient
          .from('empleado')
          .select('id, nombre_completo, id_nomina, puesto, estatus_laboral')
          .in('id', employeeIdsToLoad)
          .limit(employeeIdsToLoad.length)
      : { data: [], error: null };

  const employees = (((employeesResult.data ?? []) as MaterialReceiverEmployeeRow[]) ?? []).filter(
    (employee) =>
      (employee.puesto === 'DERMOCONSEJERO' || employee.puesto === 'SUPERVISOR') &&
      employee.estatus_laboral !== 'BAJA'
  );

  const employeeById = new Map<string, MaterialReceiverEmployeeRow>();
  for (const employee of employees) {
    employeeById.set(employee.id, employee);
  }

  const employeeIds = Array.from(employeeById.keys());
  const userResult =
    employeeIds.length > 0
      ? await typedClient
          .from('usuario')
          .select('empleado_id, username, estado_cuenta, cuenta_cliente_id')
          .in('empleado_id', employeeIds)
          .limit(employeeIds.length * 2)
      : { data: [], error: null };
  const usernameByEmployeeId = new Map(
    (((userResult.data ?? []) as MaterialReceiverUsuarioRow[]) ?? [])
      .filter(
        (user) =>
          user.estado_cuenta !== 'BAJA' &&
          (!accountId || !user.cuenta_cliente_id || user.cuenta_cliente_id === accountId)
      )
      .map((user) => [user.empleado_id, user.username])
  );

  const allFallbackOptions = Array.from(employeeById.values())
    .sort((left, right) => left.nombre_completo.localeCompare(right.nombre_completo, 'es'))
    .map((employee) =>
      buildReceiverOption(employee, usernameByEmployeeId.get(employee.id) ?? null, 'TODOS')
    );

  const assignedByPdv = new Map<string, string[]>();
  for (const assignment of activeAssignments) {
    const current = assignedByPdv.get(assignment.pdv_id) ?? [];
    if (!current.includes(assignment.empleado_id)) {
      current.push(assignment.empleado_id);
    }
    assignedByPdv.set(assignment.pdv_id, current);
  }

  for (const pdvId of pdvIds) {
    const assignedOptions = (assignedByPdv.get(pdvId) ?? [])
      .map((employeeId) => employeeById.get(employeeId))
      .filter((employee): employee is MaterialReceiverEmployeeRow => Boolean(employee))
      .sort((left, right) => left.nombre_completo.localeCompare(right.nombre_completo, 'es'))
      .map((employee) =>
        buildReceiverOption(employee, usernameByEmployeeId.get(employee.id) ?? null, 'ASIGNADO_PDV')
      );

    const assignedIds = new Set(assignedOptions.map((item) => item.id));
    optionsByPdv.set(pdvId, [
      ...assignedOptions,
      buildPorCubrirReceiverOption(),
      ...allFallbackOptions.filter((option) => !assignedIds.has(option.id)),
    ]);
  }

  return optionsByPdv;
}

async function cancelActorPreviewLots(client: SupabaseClient, actorUsuarioId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedClient = client as SupabaseClient<any>;
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
    .eq('estado', 'BORRADOR_PREVIEW');
}

const MATERIALES_PANEL_REVALIDATE_SECONDS = 60;
const MATERIAL_ADMIN_DISTRIBUTION_LIMIT = 600;
const MATERIAL_ADMIN_LAST_MILE_LIMIT = 800;
const MATERIAL_MAX_DETAILS_PER_DISTRIBUTION = 30;
const MATERIAL_MAX_DELIVERIES_PER_DISTRIBUTION = 12;
const MATERIAL_MAX_INVENTORY_MOVEMENTS_PER_PDV = 60;
const MATERIAL_MAX_EVIDENCES_PER_LAST_MILE = 4;

function boundedLimit(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function buildMaterialesCacheKey(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>
) {
  return JSON.stringify({
    cuentaClienteId: actor.cuentaClienteId ?? null,
    empleadoId: actor.empleadoId,
    puesto: actor.puesto,
  });
}

function buildMaterialesCacheTags(
  actor: Pick<ActorActual, 'cuentaClienteId' | 'empleadoId' | 'puesto'>
) {
  return buildModuleCacheTags({
    module: 'materiales',
    accountId: actor.cuentaClienteId ?? null,
    employeeId: actor.empleadoId,
    supervisorId: actor.puesto === 'SUPERVISOR' ? actor.empleadoId : null,
    period: getCurrentMonth(),
  });
}

async function obtenerPanelMaterialesSupervisorFast(
  supabase: SupabaseClient,
  actor: ActorActual
): Promise<MaterialesPanelData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>;
  const currentMonth = getCurrentMonth();
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(`${currentMonth.slice(0, 7)}-01T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const nextMonthValue = nextMonth.toISOString().slice(0, 7) + '-01';
  const prevMonth = new Date(`${currentMonth.slice(0, 7)}-01T00:00:00.000Z`);
  prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
  const prevMonthValue = prevMonth.toISOString().slice(0, 7) + '-01';
  const emptyScopeUuid = '00000000-0000-0000-0000-000000000000';

  const [scopeResult, accountResult, supervisorResult] = await Promise.all([
    client
      .from('supervisor_pdv')
      .select(
        'pdv_id, empleado_id, activo, fecha_inicio, fecha_fin, pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id, id_cadena)'
      )
      .eq('empleado_id', actor.empleadoId)
      .eq('activo', true)
      .limit(500),
    client
      .from('cuenta_cliente')
      .select('id, nombre, identificador')
      .eq('activa', true)
      .order('nombre')
      .limit(20),
    client
      .from('empleado')
      .select('id, nombre_completo, id_nomina, puesto, estatus_laboral')
      .eq('id', actor.empleadoId)
      .limit(1),
  ]);

  if (scopeResult.error || accountResult.error || supervisorResult.error) {
    return buildEmptyMaterialesPanelData(actor, currentMonth, {
      infraestructuraLista: false,
      mensajeInfraestructura:
        scopeResult.error?.message ||
        accountResult.error?.message ||
        supervisorResult.error?.message ||
        'No fue posible cargar tus entregas de materiales.',
    });
  }

  const supervisorScopePdvRows =
    ((scopeResult.data ?? []) as {
      pdv_id: string;
      empleado_id: string;
      activo: boolean;
      fecha_inicio: string | null;
      fecha_fin: string | null;
      pdv:
        | {
            id: string;
            clave_btl: string;
            nombre: string;
            zona: string | null;
            cadena_id: string | null;
            id_cadena: string | null;
          }
        | {
            id: string;
            clave_btl: string;
            nombre: string;
            zona: string | null;
            cadena_id: string | null;
            id_cadena: string | null;
          }[]
        | null;
    }[]) ?? [];

  const activeSupervisorScopePdvs = supervisorScopePdvRows
    .filter(
      (item) =>
        item.activo &&
        Boolean(item.fecha_inicio) &&
        item.fecha_inicio! <= today &&
        (!item.fecha_fin || item.fecha_fin >= today)
    )
    .map((item) => {
      const pdv = getFirst(item.pdv);
      return {
        id: pdv?.id ?? item.pdv_id,
        claveBtl: pdv?.clave_btl ?? '',
        nombre: pdv?.nombre ?? 'Sin PDV',
        zona: pdv?.zona ?? null,
        cadenaId: pdv?.cadena_id ?? null,
        idCadena: pdv?.id_cadena ?? null,
      };
    });

  const supervisorScopePdvIds = new Set(activeSupervisorScopePdvs.map((item) => item.id));
  const supervisorScopePdvIdList = Array.from(supervisorScopePdvIds);
  const accountRows = ((accountResult.data ?? []) as CuentaClienteRelacion[]) ?? [];
  const accountRowsWithFallback = ensureSingleTenantAccountRow(accountRows);
  const fallbackIsdinAccount =
    accountRowsWithFallback.find((item) => item.identificador === 'isdin_mexico') ??
    accountRowsWithFallback.find((item) => item.id === SINGLE_TENANT_ACCOUNT_ID) ??
    null;
  const effectiveAccountId =
    fallbackIsdinAccount?.id ?? accountRowsWithFallback[0]?.id ?? actor.cuentaClienteId ?? null;

  const distributionsQuery = client
    .from('material_distribucion_mensual')
    .select(
      'id, cuenta_cliente_id, lote_id, pdv_id, supervisor_empleado_id, confirmado_por_empleado_id, mes_operacion, estado, cadena_snapshot, id_pdv_cadena_snapshot, sucursal_snapshot, nombre_dc_snapshot, territorio_snapshot, hoja_origen, firma_recepcion_url, firma_recepcion_hash, foto_recepcion_url, foto_recepcion_hash, foto_recepcion_capturada_en, confirmado_en, observaciones, metadata, tipo_dispersion, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador), pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id, id_cadena)'
    )
    .eq('cuenta_cliente_id', effectiveAccountId ?? emptyScopeUuid)
    .in('mes_operacion', [prevMonthValue, currentMonth, nextMonthValue])
    .order('mes_operacion', { ascending: false })
    .limit(300);

  if (supervisorScopePdvIdList.length > 0) {
    distributionsQuery.in('pdv_id', supervisorScopePdvIdList);
  } else {
    distributionsQuery.eq('supervisor_empleado_id', actor.empleadoId);
  }

  const distributionsResult = await distributionsQuery;

  if (distributionsResult.error) {
    return buildEmptyMaterialesPanelData(actor, currentMonth, {
      infraestructuraLista: false,
      mensajeInfraestructura: distributionsResult.error.message,
      accountOptions: accountRowsWithFallback
        .filter((item) => !effectiveAccountId || item.id === effectiveAccountId)
        .map((item) => ({ id: item.id, label: item.nombre })),
    });
  }

  const distributionRowsScoped = (
    ((distributionsResult.data ?? []) as MaterialDistribucionRow[]) ?? []
  ).filter(
    (item) =>
      (!effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId) &&
      (item.supervisor_empleado_id === actor.empleadoId || supervisorScopePdvIds.has(item.pdv_id))
  );
  const distributionIds = distributionRowsScoped.map((item) => item.id);

  const [detailResult, lastMileResult] = await Promise.all([
    distributionIds.length > 0
      ? client
          .from('material_distribucion_detalle')
          .select(
            'id, distribucion_id, material_catalogo_id, cantidad_enviada, cantidad_recibida, cantidad_entregada, cantidad_observada, material_nombre_snapshot, material_tipo_mes, mecanica_canje, indicaciones_producto, instrucciones_mercadeo, requiere_ticket_mes, requiere_evidencia_entrega_mes, requiere_evidencia_mercadeo, es_regalo_dc, excluir_de_registrar_entrega, total_columna_hoja, observaciones, metadata, material_catalogo:material_catalogo_id(id, nombre, tipo)'
          )
          .in('distribucion_id', distributionIds)
          .limit(Math.max(100, distributionIds.length * 30))
      : { data: [], error: null },
    distributionIds.length > 0
      ? client
          .from('material_entrega_ultima_milla')
          .select(
            'id, cuenta_cliente_id, distribucion_id, pdv_id, cadena_id, supervisor_empleado_id, dermoconsejero_empleado_id, estado, pdv_snapshot, cadena_snapshot, dermoconsejero_snapshot, correccion_solicitada, latitud, longitud, gps_accuracy_metros, capturado_en, sincronizado_en, offline_client_id, metadata'
          )
          .eq('supervisor_empleado_id', actor.empleadoId)
          .in('distribucion_id', distributionIds)
          .order('capturado_en', { ascending: false })
          .limit(300)
      : { data: [], error: null },
  ]);

  if (detailResult.error || lastMileResult.error) {
    return buildEmptyMaterialesPanelData(actor, currentMonth, {
      infraestructuraLista: false,
      mensajeInfraestructura:
        detailResult.error?.message ||
        lastMileResult.error?.message ||
        'No fue posible cargar el detalle de tus materiales.',
    });
  }

  const lastMileRowsScoped = (
    ((lastMileResult.data ?? []) as MaterialUltimaMillaRow[]) ?? []
  ).filter(
    (item) =>
      (!effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId) &&
      item.supervisor_empleado_id === actor.empleadoId &&
      (supervisorScopePdvIds.size === 0 || supervisorScopePdvIds.has(item.pdv_id))
  );
  const lastMileDeliveryIds = lastMileRowsScoped.map((item) => item.id);
  const [lastMileDetailResult, lastMileEvidenceResult] = await Promise.all([
    lastMileDeliveryIds.length > 0
      ? client
          .from('material_entrega_ultima_milla_detalle')
          .select(
            'id, entrega_id, distribucion_detalle_id, material_catalogo_id, cantidad_teorica, estado_item, cantidad_real_recibida, diferencia, observaciones, material_catalogo:material_catalogo_id(id, nombre, tipo)'
          )
          .in('entrega_id', lastMileDeliveryIds)
          .limit(Math.max(100, lastMileDeliveryIds.length * 30))
      : { data: [], error: null },
    lastMileDeliveryIds.length > 0
      ? client
          .from('material_entrega_ultima_milla_evidencia')
          .select(
            'id, entrega_id, tipo, bucket, ruta_archivo, thumbnail_url, capturada_en, orden, metadata'
          )
          .in('entrega_id', lastMileDeliveryIds)
          .order('orden', { ascending: true })
          .limit(Math.max(50, lastMileDeliveryIds.length * 4))
      : { data: [], error: null },
  ]);

  if (lastMileDetailResult.error || lastMileEvidenceResult.error) {
    return buildEmptyMaterialesPanelData(actor, currentMonth, {
      infraestructuraLista: false,
      mensajeInfraestructura:
        lastMileDetailResult.error?.message ||
        lastMileEvidenceResult.error?.message ||
        'No fue posible cargar evidencias de tus entregas.',
    });
  }

  const lastMileQuantityByDistributionDetail = buildLastMileQuantityByDistributionDetail(
    (lastMileDetailResult.data ?? []) as MaterialUltimaMillaDetalleRow[]
  );
  const detailByDistribution = new Map<string, MaterialDistributionDetailItem[]>();
  for (const row of (detailResult.data ?? []) as MaterialDistribucionDetalleRow[]) {
    const material = getFirst(row.material_catalogo);
    const current = detailByDistribution.get(row.distribucion_id) ?? [];
    const deliveredByLastMile = lastMileQuantityByDistributionDetail.get(row.id);
    const cantidadRecibida = deliveredByLastMile ?? row.cantidad_recibida;
    const cantidadEntregada = deliveredByLastMile ?? row.cantidad_entregada;
    current.push({
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
      cantidadRecibida,
      cantidadEntregada,
      cantidadObservada: row.cantidad_observada,
      saldoDisponible: Math.max(cantidadRecibida - cantidadEntregada, 0),
      observaciones: row.observaciones,
    });
    detailByDistribution.set(row.distribucion_id, current);
  }

  const supervisor = ((supervisorResult.data ?? []) as MaterialReceiverEmployeeRow[])[0] ?? null;
  const deliveredDistributionIds = new Set(lastMileRowsScoped.map((item) => item.distribucion_id));
  const distributions = distributionRowsScoped.map((row) => {
    const pdv = getFirst(row.pdv);
    const details = (detailByDistribution.get(row.id) ?? []).sort((left, right) =>
      left.materialNombre.localeCompare(right.materialNombre, 'es')
    );
    return {
      id: row.id,
      loteId: row.lote_id,
      cuentaClienteId: row.cuenta_cliente_id,
      cuentaCliente: getFirst(row.cuenta_cliente)?.nombre ?? null,
      supervisorEmpleadoId: actor.empleadoId,
      supervisorNombre: supervisor?.nombre_completo ?? actor.nombreCompleto ?? null,
      pdvId: row.pdv_id,
      pdvClaveBtl: pdv?.clave_btl ?? null,
      pdvNombre: pdv?.nombre ?? row.sucursal_snapshot ?? 'Sin PDV',
      idPdvCadena: row.id_pdv_cadena_snapshot ?? pdv?.id_cadena ?? null,
      zona: pdv?.zona ?? null,
      cadena: row.cadena_snapshot ?? null,
      sucursal: row.sucursal_snapshot,
      nombreDc: row.nombre_dc_snapshot,
      territorio: row.territorio_snapshot,
      hojaOrigen: row.hoja_origen,
      mesOperacion: row.mes_operacion,
      tipoDispersion: row.tipo_dispersion ?? 'MENSUAL',
      estado: row.estado,
      estadoEntregaActual: deliveredDistributionIds.has(row.id) ? 'ENTREGADO' : 'NO_ENTREGADO',
      confirmadoEn: row.confirmado_en,
      observaciones: row.observaciones,
      firmaRecepcionUrl: row.firma_recepcion_url,
      fotoRecepcionUrl: row.foto_recepcion_url,
      fotoRecepcionCapturadaEn: row.foto_recepcion_capturada_en,
      mercadeoEvidence: null,
      detalles: details,
      configuredPackageCount: details.length,
      totalEnviado: details.reduce((total, item) => total + item.cantidadEnviada, 0),
      totalRecibido: details.reduce((total, item) => total + item.cantidadRecibida, 0),
      totalEntregado: details.reduce((total, item) => total + item.cantidadEntregada, 0),
      totalDisponible: details.reduce(
        (total, item) => total + Math.max(item.saldoDisponible, 0),
        0
      ),
      receptorOptions: [],
    } satisfies MaterialDistributionItem;
  });

  const supervisorView = distributions.map((item) => ({
    pdvId: item.pdvId,
    pdvClaveBtl: item.pdvClaveBtl,
    pdvNombre: item.pdvNombre,
    cadena: item.cadena,
    zona: item.zona,
    mesOperacion: item.mesOperacion,
    estadoRecepcion: item.estado,
    estadoEntregaActual: item.estadoEntregaActual,
    enviado: item.totalEnviado,
    recibido: item.totalRecibido,
    entregado: item.totalEntregado,
    restante: item.totalDisponible,
    observaciones: item.detalles.reduce((total, detail) => total + detail.cantidadObservada, 0),
    evidencias: 0,
    mercadeoRegistrado: false,
  }));

  const lastMileDetailsByDelivery = new Map<string, MaterialLastMileDetailItem[]>();
  for (const row of (lastMileDetailResult.data ?? []) as MaterialUltimaMillaDetalleRow[]) {
    const material = getFirst(row.material_catalogo);
    const current = lastMileDetailsByDelivery.get(row.entrega_id) ?? [];
    current.push({
      id: row.id,
      entregaId: row.entrega_id,
      distribucionDetalleId: row.distribucion_detalle_id,
      materialCatalogoId: row.material_catalogo_id,
      materialNombre: material?.nombre ?? row.material_catalogo_id,
      materialTipo: material?.tipo ?? 'MATERIAL',
      cantidadTeorica: row.cantidad_teorica,
      cantidadRealRecibida: row.cantidad_real_recibida ?? row.cantidad_teorica,
      diferencia: row.diferencia,
      estadoItem: row.estado_item,
      observaciones: row.observaciones,
    });
    lastMileDetailsByDelivery.set(row.entrega_id, current);
  }

  const lastMileEvidenceByDelivery = new Map<string, MaterialLastMileEvidenceItem[]>();
  for (const row of (lastMileEvidenceResult.data ?? []) as MaterialUltimaMillaEvidenciaRow[]) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const current = lastMileEvidenceByDelivery.get(row.entrega_id) ?? [];
    const archivoUrl = typeof metadata.archivo_url === 'string' ? metadata.archivo_url : null;
    current.push({
      id: row.id,
      entregaId: row.entrega_id,
      tipo: row.tipo,
      url: await resolveEvidenceStorageUrl(
        client,
        archivoUrl,
        row.bucket,
        row.ruta_archivo,
        row.capturada_en
      ),
      thumbnailUrl: await resolveEvidenceStorageUrl(
        client,
        row.thumbnail_url,
        null,
        null,
        row.capturada_en
      ),
      capturadaEn: row.capturada_en,
      orden: row.orden,
    });
    lastMileEvidenceByDelivery.set(row.entrega_id, current);
  }

  const supervisorLastMileDistributionBase = distributions.filter(
    (item) =>
      [prevMonthValue, currentMonth, nextMonthValue].includes(item.mesOperacion) &&
      isDistributionStatePending(item.estado) &&
      !deliveredDistributionIds.has(item.id)
  );
  const lastMileDistributionIds = new Set(lastMileRowsScoped.map((row) => row.distribucion_id));
  const correctionReceiverDistributionBase = distributions.filter((item) =>
    lastMileDistributionIds.has(item.id)
  );
  const receiverOptionDistributionBase = Array.from(
    new Map(
      [...supervisorLastMileDistributionBase, ...correctionReceiverDistributionBase].map((item) => [
        item.id,
        item,
      ])
    ).values()
  );
  const receiverOptionPdvs = Array.from(
    new Set([
      ...receiverOptionDistributionBase.map((item) => item.pdvId),
      ...supervisorScopePdvIdList,
    ])
  ).map((pdvId) => ({ pdvId }));

  const receiverOptionsByPdv =
    receiverOptionPdvs.length > 0
      ? await buildLastMileReceiverOptionsByPdv(client, receiverOptionPdvs, effectiveAccountId)
      : new Map<string, MaterialLastMileReceiverOption[]>();

  const distributionById = new Map(distributions.map((item) => [item.id, item]));
  const lastMileDeliveries = lastMileRowsScoped.map((row) => {
    const distribution = distributionById.get(row.distribucion_id);
    const pdvSnapshot = row.pdv_snapshot ?? {};
    const cadenaSnapshot = row.cadena_snapshot ?? {};
    const dermoSnapshot = row.dermoconsejero_snapshot ?? {};
    const details = (lastMileDetailsByDelivery.get(row.id) ?? []).sort((left, right) =>
      left.materialNombre.localeCompare(right.materialNombre, 'es')
    );
    const evidencias = (lastMileEvidenceByDelivery.get(row.id) ?? []).sort(
      (left, right) => left.orden - right.orden
    );
    const totalTeorico = details.reduce((total, item) => total + item.cantidadTeorica, 0);
    const totalReal = details.reduce((total, item) => total + item.cantidadRealRecibida, 0);

    return {
      id: row.id,
      cuentaClienteId: row.cuenta_cliente_id,
      distribucionId: row.distribucion_id,
      pdvId: row.pdv_id,
      cadenaId: row.cadena_id,
      supervisorEmpleadoId: row.supervisor_empleado_id,
      dermoconsejeroEmpleadoId: row.dermoconsejero_empleado_id,
      supervisorNombre: supervisor?.nombre_completo ?? actor.nombreCompleto ?? null,
      estado: row.estado,
      pdvNombre: distribution?.pdvNombre ?? pickSnapshotString(pdvSnapshot, 'nombre') ?? 'Sin PDV',
      pdvClaveBtl: distribution?.pdvClaveBtl ?? pickSnapshotString(pdvSnapshot, 'clave_btl'),
      idPdvCadena: distribution?.idPdvCadena ?? pickSnapshotString(pdvSnapshot, 'id_cadena'),
      cadena: distribution?.cadena ?? pickSnapshotString(cadenaSnapshot, 'nombre'),
      receptor: pickSnapshotString(dermoSnapshot, 'nombre') ?? distribution?.nombreDc ?? null,
      correccionSolicitada: row.correccion_solicitada ?? {},
      latitud: row.latitud,
      longitud: row.longitud,
      gpsAccuracyMetros: row.gps_accuracy_metros,
      capturadoEn: row.capturado_en,
      sincronizadoEn: row.sincronizado_en,
      offlineClientId: row.offline_client_id,
      detalles: details,
      evidencias,
      receptorOptions: receiverOptionsByPdv.get(row.pdv_id) ?? [],
      totalItems: details.length,
      totalTeorico,
      totalReal,
      diferenciaTotal: totalReal - totalTeorico,
      tipoDispersion:
        distribution?.tipoDispersion ?? (row.metadata as any)?.tipo_dispersion ?? 'MENSUAL',
      modoEntrega:
        (row.metadata as any)?.modo_entrega === 'POR_CUBRIR' ? 'POR_CUBRIR' : 'ENTREGA_DC',
      mesOperacion:
        distribution?.mesOperacion ?? (row.metadata as any)?.mes_operacion ?? currentMonth,
      metadata: row.metadata as any,
    } satisfies MaterialLastMileDeliveryItem;
  });

  const supervisorLastMileDistributions = supervisorLastMileDistributionBase.map((item) => ({
    ...item,
    receptorOptions: receiverOptionsByPdv.get(item.pdvId) ?? [],
  }));
  const monthOptions = buildFullMonthOptions(
    currentMonth,
    distributions.map((item) => item.mesOperacion)
  );

  const receiverOptionsByPdvRecord: Record<string, MaterialLastMileReceiverOption[]> = {};
  for (const [pdvId, options] of receiverOptionsByPdv.entries()) {
    receiverOptionsByPdvRecord[pdvId] = options;
  }

  return buildEmptyMaterialesPanelData(actor, currentMonth, {
    accountOptions: accountRowsWithFallback
      .filter((item) => !effectiveAccountId || item.id === effectiveAccountId)
      .map((item) => ({ id: item.id, label: item.nombre })),
    distributions,
    supervisorView,
    supervisorLastMileDistributions,
    lastMileDeliveries,
    monthOptions,
    supervisorScopePdvs: activeSupervisorScopePdvs,
    receiverOptionsByPdv: receiverOptionsByPdvRecord,
  });
}

async function obtenerPanelMaterialesUncached(
  supabase: SupabaseClient,
  actor: ActorActual
): Promise<MaterialesPanelData> {
  if (actor.puesto === 'SUPERVISOR') {
    return obtenerPanelMaterialesSupervisorFast(supabase, actor);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>;
  const typedClient = client as SupabaseClient<any>;
  const currentMonth = getCurrentMonth();
  const isSupervisorActor = false;
  const supervisorScopePdvIds = new Set<string>();
  const supervisorScopePdvIdList: string[] = [];
  const emptyScopeUuid = '00000000-0000-0000-0000-000000000000';

  const distributionsQuery = client
    .from('material_distribucion_mensual')
    .select(
      'id, cuenta_cliente_id, lote_id, pdv_id, supervisor_empleado_id, confirmado_por_empleado_id, mes_operacion, estado, cadena_snapshot, id_pdv_cadena_snapshot, sucursal_snapshot, nombre_dc_snapshot, territorio_snapshot, hoja_origen, firma_recepcion_url, firma_recepcion_hash, foto_recepcion_url, foto_recepcion_hash, foto_recepcion_capturada_en, confirmado_en, observaciones, metadata, tipo_dispersion, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador), pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id, id_cadena)'
    )
    .order('mes_operacion', { ascending: false })
    .limit(MATERIAL_ADMIN_DISTRIBUTION_LIMIT);

  if (isSupervisorActor) {
    if (supervisorScopePdvIdList.length > 0) {
      distributionsQuery.in('pdv_id', supervisorScopePdvIdList);
    } else {
      distributionsQuery.eq('supervisor_empleado_id', actor.empleadoId);
    }
  }

  const pdvQuery = client
    .from('pdv')
    .select('id, clave_btl, nombre, zona, cadena_id, id_cadena')
    .eq('estatus', 'ACTIVO')
    .limit(600);

  if (isSupervisorActor) {
    if (supervisorScopePdvIdList.length > 0) {
      pdvQuery.in('id', supervisorScopePdvIdList);
    } else {
      pdvQuery.eq('id', emptyScopeUuid);
    }
  }

  const [catalogResult, lotesResult, distributionsResult, pdvResult, accountResult] =
    await Promise.all([
      client
        .from('material_catalogo')
        .select(
          'id, cuenta_cliente_id, nombre, tipo, cantidad_default, requiere_ticket_compra, requiere_evidencia_obligatoria, activo, metadata, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador)'
        )
        .order('nombre', { ascending: true }),
      client
        .from('material_distribucion_lote')
        .select(
          'id, cuenta_cliente_id, mes_operacion, estado, archivo_nombre, archivo_url, gemini_status, advertencias, resumen, preview_data, tipo_dispersion, confirmado_en, created_at, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador)'
        )
        .order('created_at', { ascending: false })
        .limit(120),
      distributionsQuery,
      pdvQuery,
      client
        .from('cuenta_cliente')
        .select('id, nombre, identificador')
        .eq('activa', true)
        .order('nombre'),
    ]);

  const accountRows = ((accountResult.data ?? []) as CuentaClienteRelacion[]) ?? [];
  const accountRowsWithFallback = ensureSingleTenantAccountRow(accountRows);
  const fallbackIsdinAccount =
    accountRowsWithFallback.find((item) => item.identificador === 'isdin_mexico') ??
    accountRowsWithFallback.find((item) => item.id === SINGLE_TENANT_ACCOUNT_ID) ??
    null;
  const effectiveAccountId = isSingleTenantBackendEnabled()
    ? (fallbackIsdinAccount?.id ?? accountRowsWithFallback[0]?.id ?? null)
    : (actor.cuentaClienteId ?? fallbackIsdinAccount?.id ?? accountRowsWithFallback[0]?.id ?? null);

  const distributionRowsScoped = (
    ((distributionsResult.data ?? []) as MaterialDistribucionRow[]) ?? []
  ).filter((item) => {
    if (effectiveAccountId && item.cuenta_cliente_id !== effectiveAccountId) {
      return false;
    }
    if (!isSupervisorActor) {
      return true;
    }
    return (
      item.supervisor_empleado_id === actor.empleadoId || supervisorScopePdvIds.has(item.pdv_id)
    );
  });
  const distributionIds = Array.from(new Set(distributionRowsScoped.map((item) => item.id)));
  const distributionPdvIds = Array.from(
    new Set(
      distributionRowsScoped
        .map((item) => item.pdv_id)
        .filter((item): item is string => Boolean(item))
    )
  );

  const [
    detailResult,
    deliveryResult,
    inventoryResult,
    mercadeoResult,
    conteoResult,
    distributionSummaryResult,
    lastMileResult,
  ] = await Promise.all([
    distributionIds.length > 0
      ? client
          .from('material_distribucion_detalle')
          .select(
            'id, distribucion_id, material_catalogo_id, cantidad_enviada, cantidad_recibida, cantidad_entregada, cantidad_observada, material_nombre_snapshot, material_tipo_mes, mecanica_canje, indicaciones_producto, instrucciones_mercadeo, requiere_ticket_mes, requiere_evidencia_entrega_mes, requiere_evidencia_mercadeo, es_regalo_dc, excluir_de_registrar_entrega, total_columna_hoja, observaciones, metadata, material_catalogo:material_catalogo_id(id, nombre, tipo)'
          )
          .in('distribucion_id', distributionIds)
          .limit(
            boundedLimit(distributionIds.length * MATERIAL_MAX_DETAILS_PER_DISTRIBUTION, 100, 6000)
          )
      : { data: [], error: null },
    distributionIds.length > 0
      ? client
          .from('material_entrega_promocional')
          .select(
            'id, cuenta_cliente_id, distribucion_id, distribucion_detalle_id, material_catalogo_id, empleado_id, pdv_id, cantidad_entregada, fecha_utc, evidencia_material_url, evidencia_pdv_url, ticket_compra_url'
          )
          .in('distribucion_id', distributionIds)
          .order('fecha_utc', { ascending: false })
          .limit(
            boundedLimit(
              distributionIds.length * MATERIAL_MAX_DELIVERIES_PER_DISTRIBUTION,
              100,
              4000
            )
          )
      : { data: [], error: null },
    distributionPdvIds.length > 0
      ? client
          .from('material_inventario_movimiento')
          .select(
            'id, pdv_id, material_catalogo_id, distribucion_id, distribucion_detalle_id, tipo_movimiento, cantidad, cantidad_delta, created_at, material_catalogo:material_catalogo_id(id, nombre, tipo)'
          )
          .in('pdv_id', distributionPdvIds)
          .order('created_at', { ascending: false })
          .limit(
            boundedLimit(
              distributionPdvIds.length * MATERIAL_MAX_INVENTORY_MOVEMENTS_PER_PDV,
              100,
              4000
            )
          )
      : { data: [], error: null },
    distributionIds.length > 0
      ? client
          .from('material_evidencia_mercadeo')
          .select(
            'id, distribucion_id, pdv_id, foto_url, foto_hash, foto_capturada_en, observaciones'
          )
          .in('distribucion_id', distributionIds)
          .order('foto_capturada_en', { ascending: false })
          .limit(boundedLimit(distributionIds.length, 50, 1200))
      : { data: [], error: null },
    distributionPdvIds.length > 0
      ? client
          .from('material_conteo_jornada')
          .select('id, pdv_id, fecha_operacion, momento, observaciones')
          .in('pdv_id', distributionPdvIds)
          .order('fecha_operacion', { ascending: false })
          .limit(boundedLimit(distributionPdvIds.length * 3, 50, 1000))
      : { data: [], error: null },
    distributionIds.length > 0
      ? client
          .from('material_distribucion_mensual_estado_resumen')
          .select('distribucion_id, detalle_count, ultima_milla_count')
          .in('distribucion_id', distributionIds)
          .limit(distributionIds.length)
      : { data: [], error: null },
    distributionIds.length > 0
      ? client
          .from('material_entrega_ultima_milla')
          .select(
            'id, cuenta_cliente_id, distribucion_id, pdv_id, cadena_id, supervisor_empleado_id, dermoconsejero_empleado_id, estado, pdv_snapshot, cadena_snapshot, dermoconsejero_snapshot, correccion_solicitada, latitud, longitud, gps_accuracy_metros, capturado_en, sincronizado_en, offline_client_id, metadata'
          )
          .in('distribucion_id', distributionIds)
          .order('capturado_en', { ascending: false })
          .limit(boundedLimit(distributionIds.length * 2, 100, MATERIAL_ADMIN_LAST_MILE_LIMIT))
      : { data: [], error: null },
  ]);

  const lastMileRowsForScopedDistributions = (
    ((lastMileResult.data ?? []) as MaterialUltimaMillaRow[]) ?? []
  ).filter((item) => {
    if (effectiveAccountId && item.cuenta_cliente_id !== effectiveAccountId) {
      return false;
    }
    if (!isSupervisorActor) {
      return true;
    }
    return (
      item.supervisor_empleado_id === actor.empleadoId && supervisorScopePdvIds.has(item.pdv_id)
    );
  });
  const lastMileDeliveryIds = Array.from(
    new Set(lastMileRowsForScopedDistributions.map((item) => item.id))
  );

  const [lastMileDetailResult, lastMileEvidenceResult] = await Promise.all([
    lastMileDeliveryIds.length > 0
      ? client
          .from('material_entrega_ultima_milla_detalle')
          .select(
            'id, entrega_id, distribucion_detalle_id, material_catalogo_id, cantidad_teorica, estado_item, cantidad_real_recibida, diferencia, observaciones, material_catalogo:material_catalogo_id(id, nombre, tipo)'
          )
          .in('entrega_id', lastMileDeliveryIds)
          .limit(
            boundedLimit(
              lastMileDeliveryIds.length * MATERIAL_MAX_DETAILS_PER_DISTRIBUTION,
              100,
              5000
            )
          )
      : { data: [], error: null },
    lastMileDeliveryIds.length > 0
      ? client
          .from('material_entrega_ultima_milla_evidencia')
          .select(
            'id, entrega_id, tipo, bucket, ruta_archivo, thumbnail_url, capturada_en, orden, metadata'
          )
          .in('entrega_id', lastMileDeliveryIds)
          .order('orden', { ascending: true })
          .limit(
            boundedLimit(
              lastMileDeliveryIds.length * MATERIAL_MAX_EVIDENCES_PER_LAST_MILE,
              50,
              2000
            )
          )
      : { data: [], error: null },
  ]);

  const tablesReady =
    !catalogResult.error &&
    !lotesResult.error &&
    !distributionsResult.error &&
    !detailResult.error &&
    !deliveryResult.error &&
    !inventoryResult.error &&
    !mercadeoResult.error &&
    !conteoResult.error &&
    !distributionSummaryResult.error &&
    !lastMileResult.error &&
    !lastMileDetailResult.error &&
    !lastMileEvidenceResult.error;

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
      distributionSummaryResult.error?.message ||
      lastMileResult.error?.message ||
      lastMileDetailResult.error?.message ||
      lastMileEvidenceResult.error?.message ||
      'La infraestructura de logística promocional aún no está disponible.';

    return {
      actorRole: actor.puesto,
      currentMonth,
      loadMode: 'full',
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
      supervisorLastMileDistributions: [],
      lastMileDeliveries: [],
      latestCloseDate: null,
      accountOptions: [],
      supervisorOptions: [],
      pdvOptions: [],
      monthOptions: [currentMonth],
    };
  }

  if (['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA'].includes(actor.puesto)) {
    try {
      await cancelActorPreviewLots(client, actor.usuarioId);
    } catch {
      // Si la limpieza del preview efímero falla, no bloqueamos la lectura del panel.
    }
  }

  const pdvById = new Map(
    (((pdvResult.data ?? []) as PdvRelacion[]) ?? []).map((item) => [item.id, item])
  );
  const chainIds = Array.from(
    new Set(
      Array.from(pdvById.values())
        .map((item) => item.cadena_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const cadenaResult = chainIds.length
    ? await client.from('cadena').select('id, nombre').in('id', chainIds).limit(chainIds.length)
    : { data: [], error: null };
  const cadenaById = new Map(
    (((cadenaResult.data ?? []) as CadenaRelacion[]) ?? []).map((item) => [item.id, item.nombre])
  );

  const catalogRowsScoped = (((catalogResult.data ?? []) as MaterialCatalogoRow[]) ?? []).filter(
    (item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId
  );
  const lotRowsScoped = (((lotesResult.data ?? []) as MaterialDistribucionLoteRow[]) ?? []).filter(
    (item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId
  );
  const deliveryRowsScoped = (
    ((deliveryResult.data ?? []) as MaterialEntregaPromocionalRow[]) ?? []
  ).filter((item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId);

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
  }));

  const mercadeoByDistribution = new Map<string, MaterialMercadeoEvidenceItem>();
  for (const row of (mercadeoResult.data ?? []) as MaterialEvidenciaMercadeoRow[]) {
    mercadeoByDistribution.set(row.distribucion_id, {
      id: row.id,
      distribucionId: row.distribucion_id,
      pdvId: row.pdv_id,
      fotoUrl: row.foto_url,
      fotoHash: row.foto_hash,
      fotoCapturadaEn: row.foto_capturada_en,
      observaciones: row.observaciones,
    });
  }

  const lastMileQuantityByDistributionDetail = buildLastMileQuantityByDistributionDetail(
    (lastMileDetailResult.data ?? []) as MaterialUltimaMillaDetalleRow[]
  );
  const summaryByDistribution = new Map(
    (((distributionSummaryResult.data ?? []) as MaterialDistribucionResumenRow[]) ?? []).map(
      (item) => [item.distribucion_id, item]
    )
  );
  const detailByDistribution = new Map<string, MaterialDistributionDetailItem[]>();
  for (const row of (detailResult.data ?? []) as MaterialDistribucionDetalleRow[]) {
    const material = getFirst(row.material_catalogo);
    const deliveredByLastMile = lastMileQuantityByDistributionDetail.get(row.id);
    const cantidadRecibida = deliveredByLastMile ?? row.cantidad_recibida;
    const cantidadEntregada = deliveredByLastMile ?? row.cantidad_entregada;
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
      cantidadRecibida,
      cantidadEntregada,
      cantidadObservada: row.cantidad_observada,
      saldoDisponible: Math.max(cantidadRecibida - cantidadEntregada, 0),
      observaciones: row.observaciones,
    };
    const current = detailByDistribution.get(row.distribucion_id) ?? [];
    current.push(detail);
    detailByDistribution.set(row.distribucion_id, current);
  }

  const deliveries = deliveryRowsScoped;
  const deliveryEvidenceCountByDistribution = new Map<string, number>();
  for (const delivery of deliveries) {
    if (!delivery.distribucion_id) {
      continue;
    }
    const count =
      (delivery.evidencia_material_url ? 1 : 0) +
      (delivery.evidencia_pdv_url ? 1 : 0) +
      (delivery.ticket_compra_url ? 1 : 0);
    deliveryEvidenceCountByDistribution.set(
      delivery.distribucion_id,
      (deliveryEvidenceCountByDistribution.get(delivery.distribucion_id) ?? 0) + count
    );
  }

  const activeSupervisorRowsResult =
    distributionPdvIds.length > 0
      ? await typedClient
          .from('supervisor_pdv')
          .select('pdv_id, empleado_id, activo, fecha_inicio, fecha_fin')
          .in('pdv_id', distributionPdvIds)
          .limit(Math.max(50, distributionPdvIds.length * 3))
      : { data: [], error: null };
  const activeSupervisorByPdv = new Map<string, string | null>();
  const activeSupervisorRows =
    ((activeSupervisorRowsResult.data ?? []) as {
      pdv_id: string;
      empleado_id: string;
      activo: boolean;
      fecha_inicio: string | null;
      fecha_fin: string | null;
    }[]) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  for (const pdvId of distributionPdvIds) {
    const current = activeSupervisorRows
      .filter((item) => item.pdv_id === pdvId)
      .filter(
        (item) =>
          item.activo &&
          Boolean(item.fecha_inicio) &&
          item.fecha_inicio! <= today &&
          (!item.fecha_fin || item.fecha_fin >= today)
      )
      .sort((left, right) => (right.fecha_inicio ?? '').localeCompare(left.fecha_inicio ?? ''))[0];
    activeSupervisorByPdv.set(pdvId, current?.empleado_id ?? null);
  }

  const deliveredDistributionIds = new Set(
    lastMileRowsForScopedDistributions.map((item) => item.distribucion_id)
  );

  const supervisorIds = Array.from(
    new Set(
      distributionRowsScoped
        .map(
          (item) => item.supervisor_empleado_id ?? activeSupervisorByPdv.get(item.pdv_id) ?? null
        )
        .filter((item): item is string => Boolean(item))
    )
  );
  const supervisorEmployeesResult =
    supervisorIds.length > 0
      ? await typedClient
          .from('empleado')
          .select('id, nombre_completo, id_nomina, puesto, estatus_laboral')
          .in('id', supervisorIds)
          .limit(supervisorIds.length)
      : { data: [], error: null };
  const supervisorById = new Map(
    (((supervisorEmployeesResult.data ?? []) as MaterialReceiverEmployeeRow[]) ?? [])
      .filter((employee) => supervisorIds.includes(employee.id))
      .map((employee) => [employee.id, employee])
  );
  const hiddenTestSupervisorIds = new Set(
    Array.from(supervisorById.values())
      .filter((employee) => isTestSupervisorEmployee(employee))
      .map((employee) => employee.id)
  );

  const inventoryRows = (inventoryResult.data ?? []) as MaterialInventarioMovimientoRow[];
  const inventoryByPdvMaterial = new Map<string, MaterialInventoryBalanceItem>();
  for (const row of inventoryRows) {
    const material = getFirst(row.material_catalogo);
    if (!material) {
      continue;
    }
    const key = `${row.pdv_id}::${row.material_catalogo_id}`;
    const current = inventoryByPdvMaterial.get(key) ?? {
      materialCatalogoId: row.material_catalogo_id,
      materialNombre: material.nombre,
      materialTipo: material.tipo,
      balanceActual: 0,
    };
    current.balanceActual += Number(row.cantidad_delta ?? 0);
    inventoryByPdvMaterial.set(key, current);
  }

  const distributions = distributionRowsScoped
    .filter((row) => !hiddenTestSupervisorIds.has(row.supervisor_empleado_id ?? ''))
    .map((row) => {
      const pdv = getFirst(row.pdv) ?? pdvById.get(row.pdv_id) ?? null;
      const details = (detailByDistribution.get(row.id) ?? []).sort((left, right) =>
        left.materialNombre.localeCompare(right.materialNombre, 'es')
      );
      const effectiveSupervisorId =
        row.supervisor_empleado_id ?? activeSupervisorByPdv.get(row.pdv_id) ?? null;
      return {
        id: row.id,
        loteId: row.lote_id,
        cuentaClienteId: row.cuenta_cliente_id,
        cuentaCliente: getFirst(row.cuenta_cliente)?.nombre ?? null,
        supervisorEmpleadoId: effectiveSupervisorId,
        supervisorNombre: effectiveSupervisorId
          ? (supervisorById.get(effectiveSupervisorId)?.nombre_completo ?? null)
          : null,
        pdvId: row.pdv_id,
        pdvClaveBtl: pdv?.clave_btl ?? null,
        pdvNombre: pdv?.nombre ?? row.sucursal_snapshot ?? 'Sin PDV',
        idPdvCadena: row.id_pdv_cadena_snapshot ?? pdv?.id_cadena ?? null,
        zona: pdv?.zona ?? null,
        cadena:
          row.cadena_snapshot ?? (pdv?.cadena_id ? (cadenaById.get(pdv.cadena_id) ?? null) : null),
        sucursal: row.sucursal_snapshot,
        nombreDc: row.nombre_dc_snapshot,
        territorio: row.territorio_snapshot,
        hojaOrigen: row.hoja_origen,
        mesOperacion: row.mes_operacion,
        tipoDispersion: row.tipo_dispersion ?? 'MENSUAL',
        estado: row.estado,
        estadoEntregaActual: deliveredDistributionIds.has(row.id) ? 'ENTREGADO' : 'NO_ENTREGADO',
        confirmadoEn: row.confirmado_en,
        observaciones: row.observaciones,
        firmaRecepcionUrl: row.firma_recepcion_url,
        fotoRecepcionUrl: row.foto_recepcion_url,
        fotoRecepcionCapturadaEn: row.foto_recepcion_capturada_en,
        mercadeoEvidence: mercadeoByDistribution.get(row.id) ?? null,
        detalles: details,
        configuredPackageCount: summaryByDistribution.get(row.id)?.detalle_count ?? details.length,
        totalEnviado: details.reduce((total, item) => total + item.cantidadEnviada, 0),
        totalRecibido: details.reduce((total, item) => total + item.cantidadRecibida, 0),
        totalEntregado: details.reduce((total, item) => total + item.cantidadEntregada, 0),
        totalDisponible: details.reduce(
          (total, item) => total + Math.max(item.saldoDisponible, 0),
          0
        ),
        receptorOptions: [],
      } satisfies MaterialDistributionItem;
    });

  const lotes = lotRowsScoped.map((row) => {
    const previewRecord = (row.preview_data ?? {}) as Record<string, unknown>;
    const preview =
      previewRecord && Array.isArray((previewRecord as Record<string, unknown>).pdvPackages)
        ? (previewRecord as unknown as MaterialDistributionPreview)
        : null;
    const resumen = (row.resumen ?? {}) as Record<string, unknown>;
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
      tipoDispersion: row.tipo_dispersion ?? 'MENSUAL',
    } satisfies MaterialLotPreviewItem;
  });

  const supervisorView = distributions.map((item) => ({
    pdvId: item.pdvId,
    pdvClaveBtl: item.pdvClaveBtl,
    pdvNombre: item.pdvNombre,
    cadena: item.cadena,
    zona: item.zona,
    mesOperacion: item.mesOperacion,
    estadoRecepcion: item.estado,
    estadoEntregaActual: item.estadoEntregaActual,
    enviado: item.totalEnviado,
    recibido: item.totalRecibido,
    entregado: item.totalEntregado,
    restante: item.totalDisponible,
    observaciones: item.detalles.reduce((total, detail) => total + detail.cantidadObservada, 0),
    evidencias: deliveryEvidenceCountByDistribution.get(item.id) ?? 0,
    mercadeoRegistrado: Boolean(item.mercadeoEvidence),
  }));

  const reportRows = distributions.flatMap((distribution) =>
    distribution.detalles.map((detail) => ({
      month: distribution.mesOperacion,
      chain: distribution.cadena,
      pdv: distribution.pdvNombre,
      pdvClaveBtl: distribution.pdvClaveBtl,
      material: detail.materialNombre,
      materialTipo: detail.materialTipo,
      estadoEntregaActual: distribution.estadoEntregaActual,
      enviado: detail.cantidadEnviada,
      recibido: detail.cantidadRecibida,
      entregado: detail.cantidadEntregada,
      restante: detail.saldoDisponible,
      observaciones: detail.cantidadObservada,
      evidencias: deliveries
        .filter((item) => item.distribucion_detalle_id === detail.id)
        .reduce((total, item) => {
          return (
            total +
            (item.evidencia_material_url ? 1 : 0) +
            (item.evidencia_pdv_url ? 1 : 0) +
            (item.ticket_compra_url ? 1 : 0)
          );
        }, 0),
      mercadeo: detail.requiereEvidenciaMercadeo,
      tipoDispersion: distribution.tipoDispersion,
    }))
  );

  const lastMileDetailsByDelivery = new Map<string, MaterialLastMileDetailItem[]>();
  for (const row of (lastMileDetailResult.data ?? []) as MaterialUltimaMillaDetalleRow[]) {
    const material = getFirst(row.material_catalogo);
    const current = lastMileDetailsByDelivery.get(row.entrega_id) ?? [];
    current.push({
      id: row.id,
      entregaId: row.entrega_id,
      distribucionDetalleId: row.distribucion_detalle_id,
      materialCatalogoId: row.material_catalogo_id,
      materialNombre: material?.nombre ?? row.material_catalogo_id,
      materialTipo: material?.tipo ?? 'MATERIAL',
      cantidadTeorica: row.cantidad_teorica,
      cantidadRealRecibida: row.cantidad_real_recibida ?? row.cantidad_teorica,
      diferencia: row.diferencia,
      estadoItem: row.estado_item,
      observaciones: row.observaciones,
    });
    lastMileDetailsByDelivery.set(row.entrega_id, current);
  }

  const lastMileEvidenceByDelivery = new Map<string, MaterialLastMileEvidenceItem[]>();
  for (const row of (lastMileEvidenceResult.data ?? []) as MaterialUltimaMillaEvidenciaRow[]) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const current = lastMileEvidenceByDelivery.get(row.entrega_id) ?? [];
    const archivoUrl = typeof metadata.archivo_url === 'string' ? metadata.archivo_url : null;
    current.push({
      id: row.id,
      entregaId: row.entrega_id,
      tipo: row.tipo,
      url: await resolveEvidenceStorageUrl(
        client,
        archivoUrl,
        row.bucket,
        row.ruta_archivo,
        row.capturada_en
      ),
      thumbnailUrl: await resolveEvidenceStorageUrl(
        client,
        row.thumbnail_url,
        null,
        null,
        row.capturada_en
      ),
      capturadaEn: row.capturada_en,
      orden: row.orden,
    });
    lastMileEvidenceByDelivery.set(row.entrega_id, current);
  }

  const distributionById = new Map(distributions.map((item) => [item.id, item]));
  const lastMileRowsScoped = lastMileRowsForScopedDistributions;
  const lastMileDistributionIds = new Set(lastMileRowsScoped.map((row) => row.distribucion_id));
  const correctionReceiverDistributionBase = distributions.filter((item) =>
    lastMileDistributionIds.has(item.id)
  );
  const receiverOptionsByPdv =
    correctionReceiverDistributionBase.length > 0
      ? await buildLastMileReceiverOptionsByPdv(
          client,
          correctionReceiverDistributionBase,
          effectiveAccountId
        )
      : new Map<string, MaterialLastMileReceiverOption[]>();

  const lastMileDeliveries = lastMileRowsScoped.map((row) => {
    const distribution = distributionById.get(row.distribucion_id);
    const pdvSnapshot = row.pdv_snapshot ?? {};
    const cadenaSnapshot = row.cadena_snapshot ?? {};
    const dermoSnapshot = row.dermoconsejero_snapshot ?? {};
    const details = (lastMileDetailsByDelivery.get(row.id) ?? []).sort((left, right) =>
      left.materialNombre.localeCompare(right.materialNombre, 'es')
    );
    const evidencias = (lastMileEvidenceByDelivery.get(row.id) ?? []).sort(
      (left, right) => left.orden - right.orden
    );
    const totalTeorico = details.reduce((total, item) => total + item.cantidadTeorica, 0);
    const totalReal = details.reduce((total, item) => total + item.cantidadRealRecibida, 0);

    return {
      id: row.id,
      cuentaClienteId: row.cuenta_cliente_id,
      distribucionId: row.distribucion_id,
      pdvId: row.pdv_id,
      cadenaId: row.cadena_id,
      supervisorEmpleadoId: row.supervisor_empleado_id,
      dermoconsejeroEmpleadoId: row.dermoconsejero_empleado_id,
      supervisorNombre: row.supervisor_empleado_id
        ? (supervisorById.get(row.supervisor_empleado_id)?.nombre_completo ?? null)
        : null,
      estado: row.estado,
      pdvNombre: distribution?.pdvNombre ?? pickSnapshotString(pdvSnapshot, 'nombre') ?? 'Sin PDV',
      pdvClaveBtl: distribution?.pdvClaveBtl ?? pickSnapshotString(pdvSnapshot, 'clave_btl'),
      idPdvCadena: distribution?.idPdvCadena ?? pickSnapshotString(pdvSnapshot, 'id_cadena'),
      cadena: distribution?.cadena ?? pickSnapshotString(cadenaSnapshot, 'nombre'),
      receptor: pickSnapshotString(dermoSnapshot, 'nombre') ?? distribution?.nombreDc ?? null,
      correccionSolicitada: row.correccion_solicitada ?? {},
      latitud: row.latitud,
      longitud: row.longitud,
      gpsAccuracyMetros: row.gps_accuracy_metros,
      capturadoEn: row.capturado_en,
      sincronizadoEn: row.sincronizado_en,
      offlineClientId: row.offline_client_id,
      detalles: details,
      evidencias,
      receptorOptions: receiverOptionsByPdv.get(row.pdv_id) ?? [],
      totalItems: details.length,
      totalTeorico,
      totalReal,
      diferenciaTotal: totalReal - totalTeorico,
      tipoDispersion:
        distribution?.tipoDispersion ?? (row.metadata as any)?.tipo_dispersion ?? 'MENSUAL',
      modoEntrega:
        (row.metadata as any)?.modo_entrega === 'POR_CUBRIR' ? 'POR_CUBRIR' : 'ENTREGA_DC',
      mesOperacion:
        distribution?.mesOperacion ?? (row.metadata as any)?.mes_operacion ?? currentMonth,
      metadata: row.metadata as any,
    } satisfies MaterialLastMileDeliveryItem;
  });

  let dermoContext: MaterialDermoContext | null = null;
  if (actor.puesto === 'DERMOCONSEJERO') {
    const assignmentResult = await client
      .from('asignacion')
      .select('empleado_id, cuenta_cliente_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion')
      .eq('empleado_id', actor.empleadoId)
      .eq('estado_publicacion', 'PUBLICADA')
      .limit(20);

    const today = new Date().toISOString().slice(0, 10);
    const activeAssignments = ((assignmentResult.data ?? []) as AsignacionContextRow[]).filter(
      (item) => {
        const starts = item.fecha_inicio <= today;
        const ends = !item.fecha_fin || item.fecha_fin >= today;
        return starts && ends;
      }
    );
    const assignment = activeAssignments[0];
    if (assignment) {
      const pdv = pdvById.get(assignment.pdv_id);
      dermoContext = {
        pdvId: assignment.pdv_id,
        pdvNombre: pdv?.nombre ?? 'Sin PDV',
        pdvClaveBtl: pdv?.clave_btl ?? null,
        cuentaClienteId: assignment.cuenta_cliente_id,
        month: currentMonth,
      };
    }
  }

  const dermoPendingReception = dermoContext
    ? distributions.filter(
        (item) =>
          item.pdvId === dermoContext.pdvId &&
          item.mesOperacion === currentMonth &&
          isDistributionStatePending(item.estado)
      )
    : [];

  const dermoDeliverableDetails = dermoContext
    ? distributions
        .filter((item) => item.pdvId === dermoContext.pdvId && item.mesOperacion === currentMonth)
        .flatMap((item) => item.detalles.map((detail) => ({ ...detail, distribucionId: item.id })))
        .filter((item) => item.saldoDisponible > 0 && item.inventariable && !item.esRegaloDc)
    : [];

  const dermoMercadeoPending = dermoContext
    ? distributions.filter(
        (item) =>
          item.pdvId === dermoContext.pdvId &&
          item.mesOperacion === currentMonth &&
          ['RECIBIDA_CONFORME', 'RECIBIDA_CON_OBSERVACIONES'].includes(item.estado) &&
          item.detalles.some((detail) => detail.requiereEvidenciaMercadeo) &&
          !item.mercadeoEvidence
      )
    : [];

  const dermoInventoryItems = dermoContext
    ? Array.from(inventoryByPdvMaterial.entries())
        .filter(
          ([key, item]) => key.startsWith(`${dermoContext?.pdvId}::`) && item.balanceActual > 0
        )
        .map(([, item]) => item)
        .sort((left, right) => left.materialNombre.localeCompare(right.materialNombre, 'es'))
    : [];

  const latestCloseDate = dermoContext
    ? (((conteoResult.data ?? []) as MaterialConteoJornadaRow[])
        .filter((item) => item.pdv_id === dermoContext.pdvId && item.momento === 'CIERRE')
        .sort((left, right) => right.fecha_operacion.localeCompare(left.fecha_operacion))[0]
        ?.fecha_operacion ?? null)
    : null;

  const supervisorLastMileDistributionBase: MaterialDistributionItem[] = [];
  const supervisorLastMileDistributions = supervisorLastMileDistributionBase.map((item) => ({
    ...item,
    receptorOptions: receiverOptionsByPdv.get(item.pdvId) ?? [],
  }));

  const accountOptions = accountRowsWithFallback
    .filter((item) => !effectiveAccountId || item.id === effectiveAccountId)
    .map((item) => ({
      id: item.id,
      label: item.nombre,
    }));
  const supervisorOptions = supervisorIds
    .filter((id) => !hiddenTestSupervisorIds.has(id))
    .map((id) => {
      const employee = supervisorById.get(id);
      return {
        id,
        label: employee
          ? `${employee.nombre_completo}${employee.id_nomina ? ` / Nómina ${employee.id_nomina}` : ''}`
          : `Supervisor ${id}`,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'es'));
  const pdvOptions = Array.from(pdvById.values())
    .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'))
    .map((item) => ({
      id: item.id,
      label: `${item.clave_btl} / ${item.nombre}`,
    }));
  const monthOptions = buildFullMonthOptions(currentMonth, [
    ...distributions.map((item) => item.mesOperacion),
    ...lotes.map((item) => item.mesOperacion),
  ]);

  return {
    actorRole: actor.puesto,
    currentMonth,
    loadMode: 'full',
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
    supervisorLastMileDistributions,
    lastMileDeliveries,
    latestCloseDate,
    accountOptions,
    supervisorOptions,
    pdvOptions,
    monthOptions: monthOptions.length > 0 ? monthOptions : [currentMonth],
  };
}

async function obtenerPanelMaterialesOverviewUncached(
  supabase: SupabaseClient,
  actor: ActorActual
): Promise<MaterialesPanelData> {
  if (actor.puesto === 'SUPERVISOR' || actor.puesto === 'DERMOCONSEJERO') {
    return obtenerPanelMaterialesUncached(supabase, actor);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>;
  const currentMonth = getCurrentMonth();
  const [accountResult, distributionsResult, lotesResult] = await Promise.all([
    client
      .from('cuenta_cliente')
      .select('id, nombre, identificador')
      .eq('activa', true)
      .order('nombre'),
    client
      .from('material_distribucion_mensual')
      .select(
        'id, cuenta_cliente_id, lote_id, pdv_id, supervisor_empleado_id, mes_operacion, estado, cadena_snapshot, id_pdv_cadena_snapshot, sucursal_snapshot, nombre_dc_snapshot, territorio_snapshot, hoja_origen, confirmado_en, observaciones, tipo_dispersion, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador), pdv:pdv_id(id, clave_btl, nombre, zona, cadena_id, id_cadena)'
      )
      .order('mes_operacion', { ascending: false })
      .limit(MATERIAL_ADMIN_DISTRIBUTION_LIMIT),
    client
      .from('material_distribucion_lote')
      .select(
        'id, cuenta_cliente_id, mes_operacion, estado, archivo_nombre, confirmado_en, created_at, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador)'
      )
      .order('created_at', { ascending: false })
      .limit(120),
  ]);

  if (accountResult.error || distributionsResult.error || lotesResult.error) {
    const message =
      accountResult.error?.message ||
      distributionsResult.error?.message ||
      lotesResult.error?.message ||
      'No fue posible cargar el resumen de inventarios.';

    return buildEmptyMaterialesPanelData(actor, currentMonth, {
      loadMode: 'overview',
      infraestructuraLista: false,
      mensajeInfraestructura: message,
    });
  }

  const accountRows = ensureSingleTenantAccountRow(
    ((accountResult.data ?? []) as CuentaClienteRelacion[]) ?? []
  );
  const fallbackIsdinAccount =
    accountRows.find((item) => item.identificador === 'isdin_mexico') ??
    accountRows.find((item) => item.id === SINGLE_TENANT_ACCOUNT_ID) ??
    null;
  const effectiveAccountId = isSingleTenantBackendEnabled()
    ? (fallbackIsdinAccount?.id ?? accountRows[0]?.id ?? null)
    : (actor.cuentaClienteId ?? fallbackIsdinAccount?.id ?? accountRows[0]?.id ?? null);

  const distributionRowsScoped = (
    ((distributionsResult.data ?? []) as MaterialDistribucionRow[]) ?? []
  ).filter((item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId);
  const distributionIds = Array.from(new Set(distributionRowsScoped.map((item) => item.id)));
  const supervisorIds = Array.from(
    new Set(
      distributionRowsScoped
        .map((item) => item.supervisor_empleado_id)
        .filter((item): item is string => Boolean(item))
    )
  );

  const [summaryResult, lastMileResult, supervisorEmployeesResult] = await Promise.all([
    distributionIds.length > 0
      ? client
          .from('material_distribucion_mensual_estado_resumen')
          .select('distribucion_id, detalle_count, ultima_milla_count')
          .in('distribucion_id', distributionIds)
          .limit(distributionIds.length)
      : { data: [], error: null },
    distributionIds.length > 0
      ? client
          .from('material_entrega_ultima_milla')
          .select('id, distribucion_id')
          .in('distribucion_id', distributionIds)
          .limit(boundedLimit(distributionIds.length * 2, 100, MATERIAL_ADMIN_LAST_MILE_LIMIT))
      : { data: [], error: null },
    supervisorIds.length > 0
      ? client
          .from('empleado')
          .select('id, nombre_completo, id_nomina, puesto, estatus_laboral')
          .in('id', supervisorIds)
          .limit(supervisorIds.length)
      : { data: [], error: null },
  ]);

  if (summaryResult.error || lastMileResult.error || supervisorEmployeesResult.error) {
    const message =
      summaryResult.error?.message ||
      lastMileResult.error?.message ||
      supervisorEmployeesResult.error?.message ||
      'No fue posible cargar el avance por supervisor.';

    return buildEmptyMaterialesPanelData(actor, currentMonth, {
      loadMode: 'overview',
      infraestructuraLista: false,
      mensajeInfraestructura: message,
    });
  }

  const summaryByDistribution = new Map(
    (((summaryResult.data ?? []) as MaterialDistribucionResumenRow[]) ?? []).map((item) => [
      item.distribucion_id,
      item,
    ])
  );
  const deliveredDistributionIds = new Set(
    (((lastMileResult.data ?? []) as Array<{ distribucion_id: string }>) ?? []).map(
      (item) => item.distribucion_id
    )
  );
  const supervisorById = new Map(
    (((supervisorEmployeesResult.data ?? []) as MaterialReceiverEmployeeRow[]) ?? []).map(
      (employee) => [employee.id, employee]
    )
  );
  const hiddenTestSupervisorIds = new Set(
    Array.from(supervisorById.values())
      .filter((employee) => isTestSupervisorEmployee(employee))
      .map((employee) => employee.id)
  );

  const distributions = distributionRowsScoped
    .filter((row) => !hiddenTestSupervisorIds.has(row.supervisor_empleado_id ?? ''))
    .map((row) => {
      const pdv = getFirst(row.pdv);
      const summary = summaryByDistribution.get(row.id);
      const packageCount = summary?.detalle_count ?? 0;
      const delivered = deliveredDistributionIds.has(row.id);
      const supervisor = row.supervisor_empleado_id
        ? supervisorById.get(row.supervisor_empleado_id)
        : null;

      return {
        id: row.id,
        loteId: row.lote_id,
        cuentaClienteId: row.cuenta_cliente_id,
        cuentaCliente: getFirst(row.cuenta_cliente)?.nombre ?? null,
        supervisorEmpleadoId: row.supervisor_empleado_id,
        supervisorNombre: supervisor?.nombre_completo ?? null,
        pdvId: row.pdv_id,
        pdvClaveBtl: pdv?.clave_btl ?? null,
        pdvNombre: pdv?.nombre ?? row.sucursal_snapshot ?? 'Sin PDV',
        idPdvCadena: row.id_pdv_cadena_snapshot ?? pdv?.id_cadena ?? null,
        zona: pdv?.zona ?? null,
        cadena: row.cadena_snapshot ?? null,
        sucursal: row.sucursal_snapshot,
        nombreDc: row.nombre_dc_snapshot,
        territorio: row.territorio_snapshot,
        hojaOrigen: row.hoja_origen,
        mesOperacion: row.mes_operacion,
        tipoDispersion: row.tipo_dispersion ?? 'MENSUAL',
        estado: row.estado,
        estadoEntregaActual: delivered ? 'ENTREGADO' : 'NO_ENTREGADO',
        confirmadoEn: row.confirmado_en,
        observaciones: row.observaciones,
        firmaRecepcionUrl: null,
        fotoRecepcionUrl: null,
        fotoRecepcionCapturadaEn: null,
        mercadeoEvidence: null,
        detalles: [],
        configuredPackageCount: packageCount,
        totalEnviado: packageCount,
        totalRecibido: delivered ? packageCount : 0,
        totalEntregado: delivered ? packageCount : 0,
        totalDisponible: delivered ? 0 : packageCount,
        receptorOptions: [],
      } satisfies MaterialDistributionItem;
    });

  const lotRowsScoped = (((lotesResult.data ?? []) as MaterialDistribucionLoteRow[]) ?? []).filter(
    (item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId
  );
  const supervisorOptions = supervisorIds
    .filter((id) => !hiddenTestSupervisorIds.has(id))
    .map((id) => {
      const employee = supervisorById.get(id);
      return {
        id,
        label: employee
          ? `${employee.nombre_completo}${employee.id_nomina ? ` / Nómina ${employee.id_nomina}` : ''}`
          : `Supervisor ${id}`,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'es'));
  const monthOptions = buildFullMonthOptions(currentMonth, [
    ...distributions.map((item) => item.mesOperacion),
    ...lotRowsScoped.map((item) => item.mes_operacion),
  ]);

  return buildEmptyMaterialesPanelData(actor, currentMonth, {
    loadMode: 'overview',
    accountOptions: accountRows
      .filter((item) => !effectiveAccountId || item.id === effectiveAccountId)
      .map((item) => ({ id: item.id, label: item.nombre })),
    confirmedLots: [],
    distributions,
    supervisorOptions,
    monthOptions: monthOptions.length > 0 ? monthOptions : [currentMonth],
  });
}

async function obtenerPanelMaterialesUploadUncached(
  supabase: SupabaseClient,
  actor: ActorActual
): Promise<MaterialesPanelData> {
  if (!['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA'].includes(actor.puesto)) {
    return obtenerPanelMaterialesUncached(supabase, actor);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>;
  const currentMonth = getCurrentMonth();
  const [accountResult, catalogResult] = await Promise.all([
    client
      .from('cuenta_cliente')
      .select('id, nombre, identificador')
      .eq('activa', true)
      .order('nombre'),
    client
      .from('material_catalogo')
      .select(
        'id, cuenta_cliente_id, nombre, tipo, cantidad_default, requiere_ticket_compra, requiere_evidencia_obligatoria, activo, metadata, cuenta_cliente:cuenta_cliente_id(id, nombre, identificador)'
      )
      .order('nombre', { ascending: true })
      .limit(200),
  ]);

  if (accountResult.error || catalogResult.error) {
    return buildEmptyMaterialesPanelData(actor, currentMonth, {
      loadMode: 'upload',
      infraestructuraLista: false,
      mensajeInfraestructura:
        accountResult.error?.message ||
        catalogResult.error?.message ||
        'No fue posible cargar la cápsula de dispersión.',
    });
  }

  const accountRows = ensureSingleTenantAccountRow(
    ((accountResult.data ?? []) as CuentaClienteRelacion[]) ?? []
  );
  const fallbackIsdinAccount =
    accountRows.find((item) => item.identificador === 'isdin_mexico') ??
    accountRows.find((item) => item.id === SINGLE_TENANT_ACCOUNT_ID) ??
    null;
  const effectiveAccountId = isSingleTenantBackendEnabled()
    ? (fallbackIsdinAccount?.id ?? accountRows[0]?.id ?? null)
    : (actor.cuentaClienteId ?? fallbackIsdinAccount?.id ?? accountRows[0]?.id ?? null);
  const catalogRowsScoped = (((catalogResult.data ?? []) as MaterialCatalogoRow[]) ?? []).filter(
    (item) => !effectiveAccountId || item.cuenta_cliente_id === effectiveAccountId
  );

  return buildEmptyMaterialesPanelData(actor, currentMonth, {
    loadMode: 'upload',
    accountOptions: accountRows
      .filter((item) => !effectiveAccountId || item.id === effectiveAccountId)
      .map((item) => ({ id: item.id, label: item.nombre })),
    catalog: catalogRowsScoped.map((item) => ({
      id: item.id,
      cuentaClienteId: item.cuenta_cliente_id,
      cuentaCliente: getFirst(item.cuenta_cliente)?.nombre ?? null,
      nombre: item.nombre,
      tipo: item.tipo,
      cantidadDefault: item.cantidad_default,
      requiereTicketCompra: item.requiere_ticket_compra,
      requiereEvidenciaObligatoria: item.requiere_evidencia_obligatoria,
      activo: item.activo,
    })),
  });
}

export async function obtenerPanelMateriales(
  actorOrSupabase: ActorActual | SupabaseClient,
  actorOrCustomSupabase?: ActorActual | SupabaseClient
): Promise<MaterialesPanelData> {
  if (isSupabaseClient(actorOrSupabase)) {
    return obtenerPanelMaterialesUncached(actorOrSupabase, actorOrCustomSupabase as ActorActual);
  }

  const actor = actorOrSupabase;
  const customSupabase =
    actorOrCustomSupabase && isSupabaseClient(actorOrCustomSupabase)
      ? actorOrCustomSupabase
      : undefined;

  if (customSupabase) {
    return obtenerPanelMaterialesUncached(customSupabase, actor);
  }

  const cacheKey = buildMaterialesCacheKey(actor);

  return unstable_cache(
    async () => {
      const service = createServiceClient() as unknown as SupabaseClient;
      return obtenerPanelMaterialesUncached(service, actor);
    },
    ['materiales:panel', cacheKey],
    {
      tags: buildMaterialesCacheTags(actor),
      revalidate: MATERIALES_PANEL_REVALIDATE_SECONDS,
    }
  )();
}

export async function obtenerPanelMaterialesOverview(
  actor: ActorActual
): Promise<MaterialesPanelData> {
  const cacheKey = buildMaterialesCacheKey(actor);

  return unstable_cache(
    async () => {
      const service = createServiceClient() as unknown as SupabaseClient;
      return obtenerPanelMaterialesOverviewUncached(service, actor);
    },
    ['materiales:panel-overview', cacheKey],
    {
      tags: buildMaterialesCacheTags(actor),
      revalidate: MATERIALES_PANEL_REVALIDATE_SECONDS,
    }
  )();
}

export async function obtenerPanelMaterialesUpload(
  actor: ActorActual
): Promise<MaterialesPanelData> {
  const cacheKey = buildMaterialesCacheKey(actor);

  return unstable_cache(
    async () => {
      const service = createServiceClient() as unknown as SupabaseClient;
      return obtenerPanelMaterialesUploadUncached(service, actor);
    },
    ['materiales:panel-upload', cacheKey],
    {
      tags: buildMaterialesCacheTags(actor),
      revalidate: MATERIALES_PANEL_REVALIDATE_SECONDS,
    }
  )();
}