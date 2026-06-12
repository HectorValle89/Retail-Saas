export interface LastMileValidationDetail {
  distribucion_detalle_id: string;
  material_catalogo_id: string;
  cantidad_teorica: number;
  estado_item: 'COMPLETO' | 'CON_DISCREPANCIA';
  cantidad_real_recibida: number | null;
}

export interface LastMileValidationInput {
  detalles: LastMileValidationDetail[];
  hasEntregaFisica: boolean;
  acuseCount: number;
  modoEntrega?: 'ENTREGA_DC' | 'POR_CUBRIR';
  receptorOrigen?: string | null;
}

export interface LastMileCorrectionValidationInput {
  detalles: LastMileValidationDetail[];
  hasEffectiveEntregaFisica: boolean;
  effectiveAcuseCount: number;
  modoEntrega?: 'ENTREGA_DC' | 'POR_CUBRIR';
  receptorOrigen?: string | null;
}

export function validateLastMileDelivery(input: LastMileValidationInput) {
  if (!input.hasEntregaFisica) {
    throw new Error('La evidencia de entrega fisica es obligatoria.');
  }

  if (input.modoEntrega !== 'POR_CUBRIR' && input.receptorOrigen !== 'TODOS' && input.acuseCount < 1) {
    throw new Error('Al menos un acuse firmado es obligatorio.');
  }

  if (input.detalles.length === 0) {
    throw new Error('La entrega debe incluir al menos un material.');
  }

  for (const detail of input.detalles) {
    if (!Number.isInteger(detail.cantidad_teorica) || detail.cantidad_teorica < 0) {
      throw new Error('La cantidad teorica debe ser cero o mayor.');
    }

    if (detail.estado_item === 'CON_DISCREPANCIA') {
      if (
        detail.cantidad_real_recibida === null ||
        !Number.isInteger(detail.cantidad_real_recibida) ||
        detail.cantidad_real_recibida < 0
      ) {
        throw new Error('La cantidad real es obligatoria cuando existe discrepancia.');
      }
    }
  }
}

export function validateLastMileCorrection(input: LastMileCorrectionValidationInput) {
  if (!input.hasEffectiveEntregaFisica) {
    throw new Error('La correccion debe conservar o reemplazar la evidencia de entrega fisica.');
  }

  if (input.modoEntrega !== 'POR_CUBRIR' && input.receptorOrigen !== 'TODOS' && input.effectiveAcuseCount < 1) {
    throw new Error('La correccion debe conservar o reemplazar al menos un acuse firmado.');
  }

  validateLastMileDelivery({
    detalles: input.detalles,
    hasEntregaFisica: true,
    acuseCount: Math.max(input.effectiveAcuseCount, 1),
    modoEntrega: input.modoEntrega,
    receptorOrigen: input.receptorOrigen,
  });
}

export function resolveLastMileRealQuantity(detail: LastMileValidationDetail) {
  return detail.estado_item === 'CON_DISCREPANCIA'
    ? detail.cantidad_real_recibida
    : detail.cantidad_teorica;
}
