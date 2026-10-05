/**
 * Tipos del Sistema de Control de Inventarios Robusto
 * Alineados con la migracion 20260429030000_inventario_control_robusto.sql
 */

// ─── Producto Catálogo ───────────────────────────────

export type CategoriaProducto = 'PROMOCIONAL' | 'MUESTRA' | 'POP' | 'TESTERS' | 'OTRO';

export type UnidadMedida = 'PZA' | 'CAJA' | 'KIT' | 'ML' | 'GR' | 'SOBRE' | 'OTRO';

export interface ProductoCatalogo {
  id: string;
  cuenta_cliente_id: string;
  sku: string;
  descripcion: string;
  categoria: CategoriaProducto;
  unidad_medida: UnidadMedida;
  material_catalogo_id: string | null;
  activo: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Producto Lote ───────────────────────────────────

export type EstadoLote = 'VIGENTE' | 'PROXIMO_VENCER' | 'VENCIDO' | 'AGOTADO';

export interface ProductoLote {
  id: string;
  producto_catalogo_id: string;
  cuenta_cliente_id: string;
  numero_lote: string;
  fecha_caducidad: string;
  cantidad_inicial: number;
  estado: EstadoLote;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Inventario Movimiento ───────────────────────────

export type TipoMovimientoInventario =
  | 'CARGA_INICIAL'
  | 'ENTRADA_COMPRA'
  | 'ENTRADA_DEVOLUCION'
  | 'SALIDA_MERMA'
  | 'SALIDA_AJUSTE'
  | 'SALIDA_DANIO'
  | 'COMPROMISO_DISPERSION'
  | 'LIBERACION_COMPROMISO'
  | 'ENVIO_DISPERSION';

export type SentidoMovimiento = 'ENTRADA' | 'SALIDA';

export type ReferenciaTipoMovimiento = 'DISPERSION' | 'CARGA_MASIVA' | 'MANUAL';

export interface InventarioMovimientoV2 {
  id: string;
  producto_catalogo_id: string;
  producto_lote_id: string | null;
  cuenta_cliente_id: string;
  tipo: TipoMovimientoInventario;
  sentido: SentidoMovimiento;
  cantidad: number;
  motivo: string | null;
  referencia_tipo: ReferenciaTipoMovimiento | null;
  referencia_id: string | null;
  empleado_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Dispersiones (estados extendidos) ───────────────

export type EstadoDispersion =
  | 'PENDIENTE_RECEPCION'
  | 'RECIBIDA_CONFORME'
  | 'RECIBIDA_CON_OBSERVACIONES'
  | 'PENDIENTE_ACLARACION'
  | 'CANCELADA'
  | 'PLANEADA'
  | 'EN_TRANSITO'
  | 'ENTREGADA';

// ─── Carga Masiva ────────────────────────────────────

export type TipoCargaMasiva = 'INVENTARIO_INICIAL' | 'ENTRADA_COMPRA' | 'DISPERSION_MENSUAL';

export type EstadoCargaMasiva =
  | 'VALIDANDO'
  | 'CON_ERRORES'
  | 'LISTO_PARA_PROCESAR'
  | 'PROCESADO'
  | 'CANCELADO';

export interface CargaMasivaErrorItem {
  fila: number;
  campo: string;
  codigo: string;
  mensaje: string;
  valor_actual?: string;
}

export interface CargaMasivaLog {
  id: string;
  cuenta_cliente_id: string;
  tipo_carga: TipoCargaMasiva;
  archivo_nombre: string;
  archivo_url: string | null;
  archivo_hash: string | null;
  archivo_mime_type: string | null;
  archivo_tamano_bytes: number | null;
  estado: EstadoCargaMasiva;
  filas_totales: number;
  filas_validas: number;
  filas_con_error: number;
  errores: CargaMasivaErrorItem[];
  resumen: Record<string, unknown>;
  preview_data: Record<string, unknown>;
  procesado_en: string | null;
  empleado_id: string | null;
  created_by_usuario_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Vista de Stock Actual ───────────────────────────

export type EstadoCaducidad = 'VIGENTE' | 'PROXIMO_VENCER' | 'VENCIDO' | 'SIN_LOTE';

export interface StockActual {
  producto_catalogo_id: string;
  producto_lote_id: string | null;
  cuenta_cliente_id: string;
  sku: string;
  descripcion: string;
  categoria: CategoriaProducto;
  unidad_medida: UnidadMedida;
  numero_lote: string | null;
  fecha_caducidad: string | null;
  stock_fisico: number;
  stock_comprometido: number;
  stock_disponible: number;
  estado_caducidad: EstadoCaducidad;
}

// ─── Helpers de formulario ───────────────────────────

export interface ProductoCatalogoFormInput {
  sku: string;
  descripcion: string;
  categoria: CategoriaProducto;
  unidad_medida: UnidadMedida;
  cuenta_cliente_id: string;
}

export interface ProductoLoteFormInput {
  producto_catalogo_id: string;
  numero_lote: string;
  fecha_caducidad: string;
  cantidad_inicial: number;
  cuenta_cliente_id: string;
}

export interface MovimientoFormInput {
  producto_catalogo_id: string;
  producto_lote_id: string | null;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  motivo: string | null;
  cuenta_cliente_id: string;
}

export interface PreValidacionExcelResult {
  valido: boolean;
  filas_totales: number;
  filas_validas: number;
  filas_con_error: number;
  errores: CargaMasivaErrorItem[];
  preview: Array<{
    fila: number;
    sku: string;
    descripcion: string;
    numero_lote: string;
    fecha_caducidad: string;
    cantidad: number;
    pdv_nombre?: string;
    estado: 'OK' | 'ERROR';
    error_mensaje?: string;
  }>;
}
