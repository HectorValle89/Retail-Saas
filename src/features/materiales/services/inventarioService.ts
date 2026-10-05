/**
 * Servicio de Inventario — Stock multicapa, movimientos y FEFO
 *
 * Logica central del sistema de control de inventarios:
 * - Calculo de stock fisico, comprometido y disponible
 * - Registro de movimientos con trazabilidad
 * - Regla FEFO (First Expired, First Out) para comprometer lotes
 * - Pre-validacion de cargas masivas Excel
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StockActual,
  TipoMovimientoInventario,
  SentidoMovimiento,
  CargaMasivaErrorItem,
  PreValidacionExcelResult,
} from '../types/inventario';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedClient = SupabaseClient<any>;

// ─── Sentido por tipo de movimiento ──────────────────

const SENTIDO_POR_TIPO: Record<TipoMovimientoInventario, SentidoMovimiento> = {
  CARGA_INICIAL: 'ENTRADA',
  ENTRADA_COMPRA: 'ENTRADA',
  ENTRADA_DEVOLUCION: 'ENTRADA',
  SALIDA_MERMA: 'SALIDA',
  SALIDA_AJUSTE: 'SALIDA',
  SALIDA_DANIO: 'SALIDA',
  COMPROMISO_DISPERSION: 'SALIDA',
  LIBERACION_COMPROMISO: 'ENTRADA',
  ENVIO_DISPERSION: 'SALIDA',
};

// ─── Consultar stock actual ──────────────────────────

export async function consultarStockActual(
  service: TypedClient,
  cuentaClienteId: string,
  filtros?: {
    productoId?: string;
    categoria?: string;
    soloConStock?: boolean;
    soloVigentes?: boolean;
  }
): Promise<StockActual[]> {
  let query = service.from('v_stock_actual').select('*').eq('cuenta_cliente_id', cuentaClienteId);

  if (filtros?.productoId) {
    query = query.eq('producto_catalogo_id', filtros.productoId);
  }
  if (filtros?.categoria) {
    query = query.eq('categoria', filtros.categoria);
  }
  if (filtros?.soloConStock) {
    query = query.gt('stock_fisico', 0);
  }
  if (filtros?.soloVigentes) {
    query = query.neq('estado_caducidad', 'VENCIDO');
  }

  const { data, error } = await query.order('sku', { ascending: true });

  if (error) {
    throw new Error(`Error al consultar stock: ${error.message}`);
  }

  return (data ?? []) as StockActual[];
}

// ─── KPIs de stock ───────────────────────────────────

export interface StockKpis {
  stock_total_fisico: number;
  stock_total_comprometido: number;
  stock_total_disponible: number;
  productos_por_vencer: number;
  productos_vencidos: number;
  skus_activos: number;
  lotes_activos: number;
}

export async function calcularStockKpis(
  service: TypedClient,
  cuentaClienteId: string
): Promise<StockKpis> {
  const stock = await consultarStockActual(service, cuentaClienteId);

  const skuSet = new Set<string>();
  const loteSet = new Set<string>();

  let stockFisico = 0;
  let stockComprometido = 0;
  let stockDisponible = 0;
  let porVencer = 0;
  let vencidos = 0;

  for (const row of stock) {
    skuSet.add(row.sku);
    if (row.numero_lote) loteSet.add(`${row.sku}-${row.numero_lote}`);

    stockFisico += row.stock_fisico;
    stockComprometido += row.stock_comprometido;
    stockDisponible += row.stock_disponible;

    if (row.estado_caducidad === 'PROXIMO_VENCER') porVencer += row.stock_fisico;
    if (row.estado_caducidad === 'VENCIDO') vencidos += row.stock_fisico;
  }

  return {
    stock_total_fisico: stockFisico,
    stock_total_comprometido: stockComprometido,
    stock_total_disponible: stockDisponible,
    productos_por_vencer: porVencer,
    productos_vencidos: vencidos,
    skus_activos: skuSet.size,
    lotes_activos: loteSet.size,
  };
}

// ─── Registrar movimiento de inventario ──────────────

export async function registrarMovimiento(
  service: TypedClient,
  input: {
    productoCatalogoId: string;
    productoLoteId: string | null;
    cuentaClienteId: string;
    tipo: TipoMovimientoInventario;
    cantidad: number;
    motivo: string | null;
    referenciaTipo?: 'DISPERSION' | 'CARGA_MASIVA' | 'MANUAL' | null;
    referenciaId?: string | null;
    empleadoId: string | null;
  }
): Promise<{ id: string }> {
  if (input.cantidad <= 0) {
    throw new Error('La cantidad debe ser mayor a cero.');
  }

  const sentido = SENTIDO_POR_TIPO[input.tipo];
  if (!sentido) {
    throw new Error(`Tipo de movimiento no reconocido: ${input.tipo}`);
  }

  // Validar stock disponible para salidas (excepto compromiso que ya tiene su propia logica)
  if (
    sentido === 'SALIDA' &&
    input.tipo !== 'COMPROMISO_DISPERSION' &&
    input.tipo !== 'LIBERACION_COMPROMISO'
  ) {
    const stock = await consultarStockActual(service, input.cuentaClienteId, {
      productoId: input.productoCatalogoId,
    });

    const stockLote = input.productoLoteId
      ? stock.find((s) => s.producto_lote_id === input.productoLoteId)
      : stock.find((s) => s.producto_catalogo_id === input.productoCatalogoId);

    if (!stockLote || stockLote.stock_fisico < input.cantidad) {
      throw new Error(
        `Stock insuficiente. Disponible: ${stockLote?.stock_fisico ?? 0}, solicitado: ${input.cantidad}`
      );
    }
  }

  const { data, error } = await service
    .from('inventario_movimiento_v2')
    .insert({
      producto_catalogo_id: input.productoCatalogoId,
      producto_lote_id: input.productoLoteId,
      cuenta_cliente_id: input.cuentaClienteId,
      tipo: input.tipo,
      sentido,
      cantidad: input.cantidad,
      motivo: input.motivo,
      referencia_tipo: input.referenciaTipo ?? null,
      referencia_id: input.referenciaId ?? null,
      empleado_id: input.empleadoId,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Error al registrar movimiento: ${error?.message ?? 'Datos no retornados'}`);
  }

  return { id: data.id as string };
}

// ─── FEFO: seleccionar lotes por caducidad ───────────

export async function seleccionarLotesFEFO(
  service: TypedClient,
  cuentaClienteId: string,
  productoCatalogoId: string,
  cantidadRequerida: number
): Promise<Array<{ loteId: string; cantidad: number }>> {
  const stock = await consultarStockActual(service, cuentaClienteId, {
    productoId: productoCatalogoId,
    soloConStock: true,
    soloVigentes: true,
  });

  // Ordenar por fecha de caducidad ascendente (primero el que vence antes)
  const lotesSorted = stock
    .filter((s) => s.producto_lote_id && s.stock_disponible > 0)
    .sort((a, b) => {
      if (!a.fecha_caducidad) return 1;
      if (!b.fecha_caducidad) return -1;
      return a.fecha_caducidad.localeCompare(b.fecha_caducidad);
    });

  const seleccion: Array<{ loteId: string; cantidad: number }> = [];
  let restante = cantidadRequerida;

  for (const lote of lotesSorted) {
    if (restante <= 0) break;

    const tomarDeLote = Math.min(restante, lote.stock_disponible);
    seleccion.push({
      loteId: lote.producto_lote_id!,
      cantidad: tomarDeLote,
    });
    restante -= tomarDeLote;
  }

  if (restante > 0) {
    throw new Error(`Stock insuficiente para el producto. Faltan ${restante} unidades.`);
  }

  return seleccion;
}

// ─── Validar disponibilidad de stock para dispersion ─

export async function validarDisponibilidadDispersion(
  service: TypedClient,
  cuentaClienteId: string,
  items: Array<{
    productoCatalogoId: string;
    productoLoteId?: string | null;
    cantidad: number;
  }>
): Promise<{
  valido: boolean;
  errores: Array<{ sku: string; disponible: number; solicitado: number }>;
}> {
  const stock = await consultarStockActual(service, cuentaClienteId, {
    soloConStock: true,
  });

  const errores: Array<{ sku: string; disponible: number; solicitado: number }> = [];

  for (const item of items) {
    const productoStock = item.productoLoteId
      ? stock.find(
          (s) =>
            s.producto_catalogo_id === item.productoCatalogoId &&
            s.producto_lote_id === item.productoLoteId
        )
      : stock
          .filter((s) => s.producto_catalogo_id === item.productoCatalogoId)
          .reduce(
            (acc, s) => ({
              ...acc,
              stock_disponible: acc.stock_disponible + s.stock_disponible,
              sku: s.sku,
            }),
            { stock_disponible: 0, sku: '' } as { stock_disponible: number; sku: string }
          );

    const disponible = productoStock?.stock_disponible ?? 0;
    if (disponible < item.cantidad) {
      const skuInfo = stock.find((s) => s.producto_catalogo_id === item.productoCatalogoId);
      errores.push({
        sku: skuInfo?.sku ?? item.productoCatalogoId,
        disponible,
        solicitado: item.cantidad,
      });
    }
  }

  return {
    valido: errores.length === 0,
    errores,
  };
}

// ─── Pre-validacion de filas Excel ───────────────────

export interface ExcelRowInput {
  fila: number;
  sku: string;
  descripcion?: string;
  numero_lote: string;
  fecha_caducidad: string;
  cantidad: number;
  pdv_clave_btl?: string;
}

export async function preValidarFilasExcel(
  service: TypedClient,
  cuentaClienteId: string,
  filas: ExcelRowInput[],
  tipoCarga: 'INVENTARIO_INICIAL' | 'ENTRADA_COMPRA' | 'DISPERSION_MENSUAL'
): Promise<PreValidacionExcelResult> {
  const errores: CargaMasivaErrorItem[] = [];
  const preview: PreValidacionExcelResult['preview'] = [];

  // Cargar catalogo de SKUs activos
  const { data: productosRaw } = await service
    .from('producto_catalogo')
    .select('id, sku, descripcion')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('activo', true);

  const productos = (productosRaw ?? []) as Array<{ id: string; sku: string; descripcion: string }>;
  const skuMap = new Map(productos.map((p) => [p.sku.toLowerCase(), p]));

  // Cargar PDVs si es dispersion
  let pdvMap = new Map<string, { id: string; nombre: string }>();
  if (tipoCarga === 'DISPERSION_MENSUAL') {
    const { data: pdvsRaw } = await service
      .from('pdv')
      .select('id, nombre, clave_btl')
      .eq('estatus', 'ACTIVO');

    const pdvs = (pdvsRaw ?? []) as Array<{ id: string; nombre: string; clave_btl: string | null }>;
    pdvMap = new Map(
      pdvs
        .filter((p) => p.clave_btl)
        .map((p) => [p.clave_btl!.toLowerCase(), { id: p.id, nombre: p.nombre }])
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);

  for (const fila of filas) {
    let tieneError = false;
    const errorMensajes: string[] = [];

    // Validar SKU
    if (!fila.sku || !fila.sku.trim()) {
      errores.push({ fila: fila.fila, campo: 'sku', codigo: 'SKU_VACIO', mensaje: 'SKU vacío' });
      tieneError = true;
      errorMensajes.push('SKU vacío');
    } else if (!skuMap.has(fila.sku.toLowerCase())) {
      errores.push({
        fila: fila.fila,
        campo: 'sku',
        codigo: 'SKU_NO_EXISTE',
        mensaje: `SKU "${fila.sku}" no existe en el catálogo`,
        valor_actual: fila.sku,
      });
      tieneError = true;
      errorMensajes.push(`SKU "${fila.sku}" no existe`);
    }

    // Validar lote
    if (!fila.numero_lote || !fila.numero_lote.trim()) {
      errores.push({
        fila: fila.fila,
        campo: 'numero_lote',
        codigo: 'LOTE_VACIO',
        mensaje: 'Número de lote vacío',
      });
      tieneError = true;
      errorMensajes.push('Lote vacío');
    }

    // Validar fecha caducidad
    if (!fila.fecha_caducidad || !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha_caducidad)) {
      errores.push({
        fila: fila.fila,
        campo: 'fecha_caducidad',
        codigo: 'FECHA_FORMATO_INVALIDO',
        mensaje: 'Formato de fecha inválido (esperado: YYYY-MM-DD)',
        valor_actual: fila.fecha_caducidad,
      });
      tieneError = true;
      errorMensajes.push('Fecha con formato inválido');
    } else if (fila.fecha_caducidad < hoy) {
      errores.push({
        fila: fila.fila,
        campo: 'fecha_caducidad',
        codigo: 'LOTE_VENCIDO',
        mensaje: `El lote "${fila.numero_lote}" caducó el ${fila.fecha_caducidad}`,
        valor_actual: fila.fecha_caducidad,
      });
      tieneError = true;
      errorMensajes.push(`Lote vencido: ${fila.fecha_caducidad}`);
    }

    // Validar cantidad
    if (!Number.isInteger(fila.cantidad) || fila.cantidad <= 0) {
      errores.push({
        fila: fila.fila,
        campo: 'cantidad',
        codigo: 'CANTIDAD_INVALIDA',
        mensaje: 'La cantidad debe ser un entero positivo',
        valor_actual: String(fila.cantidad),
      });
      tieneError = true;
      errorMensajes.push('Cantidad inválida');
    }

    // Validar PDV si es dispersion
    if (tipoCarga === 'DISPERSION_MENSUAL' && fila.pdv_clave_btl) {
      if (!pdvMap.has(fila.pdv_clave_btl.toLowerCase())) {
        errores.push({
          fila: fila.fila,
          campo: 'pdv_clave_btl',
          codigo: 'PDV_NO_EXISTE',
          mensaje: `PDV con clave "${fila.pdv_clave_btl}" no encontrado`,
          valor_actual: fila.pdv_clave_btl,
        });
        tieneError = true;
        errorMensajes.push(`PDV "${fila.pdv_clave_btl}" no existe`);
      }
    }

    const pdvInfo = fila.pdv_clave_btl ? pdvMap.get(fila.pdv_clave_btl.toLowerCase()) : undefined;

    preview.push({
      fila: fila.fila,
      sku: fila.sku,
      descripcion: fila.descripcion ?? skuMap.get(fila.sku?.toLowerCase())?.descripcion ?? '',
      numero_lote: fila.numero_lote,
      fecha_caducidad: fila.fecha_caducidad,
      cantidad: fila.cantidad,
      pdv_nombre: pdvInfo?.nombre,
      estado: tieneError ? 'ERROR' : 'OK',
      error_mensaje: tieneError ? errorMensajes.join('; ') : undefined,
    });
  }

  const filasValidas = preview.filter((p) => p.estado === 'OK').length;

  return {
    valido: errores.length === 0,
    filas_totales: filas.length,
    filas_validas: filasValidas,
    filas_con_error: filas.length - filasValidas,
    errores,
    preview,
  };
}
