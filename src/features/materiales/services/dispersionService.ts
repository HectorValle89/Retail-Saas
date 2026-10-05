/**
 * Servicio de Dispersiones — Flujo de estados y distribucion
 *
 * Gestiona el ciclo de vida de dispersiones mensuales:
 * PLANEADA → EN_TRANSITO → ENTREGADA / CANCELADA
 *
 * Los supervisores se encargan de la entrega a PDV y DC.
 * Algunos productos pueden etiquetarse como "no requiere reporte".
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EstadoDispersion } from '../types/inventario';
import {
  registrarMovimiento,
  seleccionarLotesFEFO,
  validarDisponibilidadDispersion,
} from './inventarioService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedClient = SupabaseClient<any>;

// ─── Transiciones de estado validas ──────────────────

const TRANSICIONES_VALIDAS: Record<EstadoDispersion, EstadoDispersion[]> = {
  PLANEADA: ['EN_TRANSITO', 'CANCELADA'],
  EN_TRANSITO: ['ENTREGADA', 'CANCELADA'],
  ENTREGADA: [],
  CANCELADA: [],
  // Legacy states
  PENDIENTE_RECEPCION: ['RECIBIDA_CONFORME', 'RECIBIDA_CON_OBSERVACIONES', 'CANCELADA'],
  RECIBIDA_CONFORME: [],
  RECIBIDA_CON_OBSERVACIONES: ['PENDIENTE_ACLARACION'],
  PENDIENTE_ACLARACION: ['RECIBIDA_CONFORME', 'CANCELADA'],
};

// ─── Crear dispersion planeada ───────────────────────

export interface ItemDispersion {
  productoCatalogoId: string;
  productoLoteId?: string | null;
  cantidadPlaneada: number;
  requiereReporteEntrega: boolean;
}

export async function crearDispersionPlaneada(
  service: TypedClient,
  input: {
    cuentaClienteId: string;
    pdvId: string;
    supervisorEmpleadoId: string | null;
    mesOperacion: string;
    loteId?: string | null;
    items: ItemDispersion[];
    empleadoId: string;
  }
): Promise<{ distribucionId: string }> {
  // Validar disponibilidad de stock
  const validacion = await validarDisponibilidadDispersion(
    service,
    input.cuentaClienteId,
    input.items.map((i) => ({
      productoCatalogoId: i.productoCatalogoId,
      productoLoteId: i.productoLoteId,
      cantidad: i.cantidadPlaneada,
    }))
  );

  if (!validacion.valido) {
    const detalles = validacion.errores
      .map((e) => `${e.sku}: disponible ${e.disponible}, solicitado ${e.solicitado}`)
      .join('; ');
    throw new Error(`Stock insuficiente: ${detalles}`);
  }

  // Crear cabecera de dispersion
  const { data: distribucion, error: distError } = await service
    .from('material_distribucion_mensual')
    .insert({
      cuenta_cliente_id: input.cuentaClienteId,
      pdv_id: input.pdvId,
      supervisor_empleado_id: input.supervisorEmpleadoId,
      mes_operacion: input.mesOperacion,
      estado: 'PLANEADA',
      lote_id: input.loteId ?? null,
    })
    .select('id')
    .single();

  if (distError || !distribucion) {
    throw new Error(`Error al crear dispersión: ${distError?.message ?? 'Sin datos'}`);
  }

  const distribucionId = distribucion.id as string;

  // Insertar detalles
  for (const item of input.items) {
    // Seleccionar lotes FEFO si no se especifica lote
    let loteId = item.productoLoteId ?? null;
    if (!loteId) {
      try {
        const lotes = await seleccionarLotesFEFO(
          service,
          input.cuentaClienteId,
          item.productoCatalogoId,
          item.cantidadPlaneada
        );
        loteId = lotes[0]?.loteId ?? null;
      } catch {
        // Continuar sin lote si no hay
      }
    }

    const { error: detError } = await service.from('material_distribucion_detalle').insert({
      distribucion_id: distribucionId,
      material_catalogo_id: item.productoCatalogoId,
      cantidad_enviada: item.cantidadPlaneada,
      cantidad_recibida: 0,
      cantidad_entregada: 0,
      requiere_reporte_entrega: item.requiereReporteEntrega,
    });

    if (detError) {
      throw new Error(`Error al crear detalle: ${detError.message}`);
    }

    // Registrar compromiso de stock
    await registrarMovimiento(service, {
      productoCatalogoId: item.productoCatalogoId,
      productoLoteId: loteId,
      cuentaClienteId: input.cuentaClienteId,
      tipo: 'COMPROMISO_DISPERSION',
      cantidad: item.cantidadPlaneada,
      motivo: `Compromiso para dispersión PDV ${input.pdvId}`,
      referenciaTipo: 'DISPERSION',
      referenciaId: distribucionId,
      empleadoId: input.empleadoId,
    });
  }

  return { distribucionId };
}

// ─── Cambiar estado de dispersion ────────────────────

export async function cambiarEstadoDispersion(
  service: TypedClient,
  input: {
    distribucionId: string;
    nuevoEstado: EstadoDispersion;
    empleadoId: string;
    cuentaClienteId: string;
    observaciones?: string | null;
  }
): Promise<void> {
  // Obtener estado actual
  const { data: actual, error: fetchError } = await service
    .from('material_distribucion_mensual')
    .select('id, estado, cuenta_cliente_id')
    .eq('id', input.distribucionId)
    .single();

  if (fetchError || !actual) {
    throw new Error('Dispersión no encontrada.');
  }

  const estadoActual = actual.estado as EstadoDispersion;
  const permitidos = TRANSICIONES_VALIDAS[estadoActual] ?? [];

  if (!permitidos.includes(input.nuevoEstado)) {
    throw new Error(
      `Transición no permitida: ${estadoActual} → ${input.nuevoEstado}. Permitidos: ${permitidos.join(', ') || 'ninguno'}`
    );
  }

  // Preparar update
  const updatePayload: Record<string, unknown> = {
    estado: input.nuevoEstado,
    observaciones: input.observaciones ?? null,
  };

  if (input.nuevoEstado === 'EN_TRANSITO') {
    updatePayload.enviado_en = new Date().toISOString();
  }

  if (input.nuevoEstado === 'ENTREGADA') {
    updatePayload.entregado_en = new Date().toISOString();
    updatePayload.confirmado_por_empleado_id = input.empleadoId;
    updatePayload.confirmado_en = new Date().toISOString();
  }

  const { error: updateError } = await service
    .from('material_distribucion_mensual')
    .update(updatePayload)
    .eq('id', input.distribucionId);

  if (updateError) {
    throw new Error(`Error al actualizar estado: ${updateError.message}`);
  }

  // Acciones por estado
  if (input.nuevoEstado === 'EN_TRANSITO') {
    // Convertir compromisos en envios reales
    const { data: detalles } = await service
      .from('material_distribucion_detalle')
      .select('id, material_catalogo_id, cantidad_enviada')
      .eq('distribucion_id', input.distribucionId);

    for (const detalle of (detalles ?? []) as Array<{
      id: string;
      material_catalogo_id: string;
      cantidad_enviada: number;
    }>) {
      await registrarMovimiento(service, {
        productoCatalogoId: detalle.material_catalogo_id,
        productoLoteId: null,
        cuentaClienteId: input.cuentaClienteId,
        tipo: 'ENVIO_DISPERSION',
        cantidad: detalle.cantidad_enviada,
        motivo: `Envío de dispersión ${input.distribucionId}`,
        referenciaTipo: 'DISPERSION',
        referenciaId: input.distribucionId,
        empleadoId: input.empleadoId,
      });
    }
  }

  if (input.nuevoEstado === 'CANCELADA' && estadoActual === 'PLANEADA') {
    // Liberar stock comprometido
    const { data: detalles } = await service
      .from('material_distribucion_detalle')
      .select('id, material_catalogo_id, cantidad_enviada')
      .eq('distribucion_id', input.distribucionId);

    for (const detalle of (detalles ?? []) as Array<{
      id: string;
      material_catalogo_id: string;
      cantidad_enviada: number;
    }>) {
      await registrarMovimiento(service, {
        productoCatalogoId: detalle.material_catalogo_id,
        productoLoteId: null,
        cuentaClienteId: input.cuentaClienteId,
        tipo: 'LIBERACION_COMPROMISO',
        cantidad: detalle.cantidad_enviada,
        motivo: `Cancelación de dispersión ${input.distribucionId}`,
        referenciaTipo: 'DISPERSION',
        referenciaId: input.distribucionId,
        empleadoId: input.empleadoId,
      });
    }
  }
}

// ─── Consultar dispersiones por estado ───────────────

export async function consultarDispersiones(
  service: TypedClient,
  cuentaClienteId: string,
  filtros?: {
    estado?: EstadoDispersion | EstadoDispersion[];
    mesOperacion?: string;
    pdvId?: string;
    supervisorEmpleadoId?: string;
    limit?: number;
  }
) {
  let query = service
    .from('material_distribucion_mensual')
    .select(
      `
      id,
      cuenta_cliente_id,
      pdv_id,
      supervisor_empleado_id,
      mes_operacion,
      estado,
      enviado_en,
      entregado_en,
      confirmado_por_empleado_id,
      confirmado_en,
      observaciones,
      lote_id,
      cadena_snapshot,
      sucursal_snapshot,
      nombre_dc_snapshot,
      created_at,
      updated_at
    `
    )
    .eq('cuenta_cliente_id', cuentaClienteId)
    .order('created_at', { ascending: false });

  if (filtros?.estado) {
    if (Array.isArray(filtros.estado)) {
      query = query.in('estado', filtros.estado);
    } else {
      query = query.eq('estado', filtros.estado);
    }
  }
  if (filtros?.mesOperacion) {
    query = query.eq('mes_operacion', filtros.mesOperacion);
  }
  if (filtros?.pdvId) {
    query = query.eq('pdv_id', filtros.pdvId);
  }
  if (filtros?.supervisorEmpleadoId) {
    query = query.eq('supervisor_empleado_id', filtros.supervisorEmpleadoId);
  }
  if (filtros?.limit) {
    query = query.limit(filtros.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error al consultar dispersiones: ${error.message}`);
  }

  return data ?? [];
}

// ─── Resumen de dispersiones por estado ──────────────

export interface DispersionResumen {
  planeadas: number;
  en_transito: number;
  entregadas: number;
  canceladas: number;
}

export async function contarDispersionesPorEstado(
  service: TypedClient,
  cuentaClienteId: string,
  mesOperacion?: string
): Promise<DispersionResumen> {
  let query = service
    .from('material_distribucion_mensual')
    .select('estado')
    .eq('cuenta_cliente_id', cuentaClienteId);

  if (mesOperacion) {
    query = query.eq('mes_operacion', mesOperacion);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error al contar dispersiones: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ estado: string }>;

  return {
    planeadas: rows.filter((r) => r.estado === 'PLANEADA').length,
    en_transito: rows.filter((r) => r.estado === 'EN_TRANSITO').length,
    entregadas: rows.filter((r) => r.estado === 'ENTREGADA').length,
    canceladas: rows.filter((r) => r.estado === 'CANCELADA').length,
  };
}
