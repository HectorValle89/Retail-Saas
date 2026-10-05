/**
 * Utilidades para la validación y gestión del traspaso de operación
 * entre supervisores ante bajas inmediatas o programadas.
 */

export interface SupervisorSucesorValidationResult {
  valid: boolean;
  error?: string;
}

export interface EmpleadoSupervisorCheck {
  id: string;
  puesto: string;
  estatus_laboral: string;
}

/**
 * Valida que el supervisor sucesor seleccionado sea válido, distinto al saliente
 * y que cuente con perfil de supervisor activo.
 */
export function validateSupervisorSucesor(
  originId: string,
  successorId: string | null | undefined,
  successorEmployee: EmpleadoSupervisorCheck | null | undefined
): SupervisorSucesorValidationResult {
  if (!successorId || !successorId.trim()) {
    return {
      valid: false,
      error: 'Debes seleccionar un supervisor sucesor para traspasar la operación.',
    };
  }

  if (successorId.trim() === originId.trim()) {
    return {
      valid: false,
      error: 'El supervisor sucesor debe ser un colaborador distinto al que se da de baja.',
    };
  }

  if (
    !successorEmployee ||
    successorEmployee.puesto !== 'SUPERVISOR' ||
    successorEmployee.estatus_laboral !== 'ACTIVO'
  ) {
    return {
      valid: false,
      error: 'El supervisor sucesor seleccionado no es un supervisor activo.',
    };
  }

  return { valid: true };
}

/**
 * Construye el mensaje amigable de confirmación tras procesar una baja de supervisor
 * con traspaso de tiendas y dermoconsejeras.
 */
export function buildSupervisorBajaMessage(
  nombreCompleto: string,
  pdvsCount: number,
  dcsCount: number
): string {
  if (pdvsCount > 0 || dcsCount > 0) {
    return `La baja de ${nombreCompleto} ha sido procesada de forma directa e inmediata y se traspasaron ${pdvsCount} tienda(s) y ${dcsCount} colaboradora(s) al nuevo supervisor.`;
  }
  return `La baja de ${nombreCompleto} ha sido procesada de forma directa e inmediata.`;
}

export interface SupervisorPdvRecordPayload {
  pdv_id: string;
  empleado_id: string;
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string | null;
}

/**
 * Genera el payload estricto y limpio para la tabla supervisor_pdv,
 * evitando campos inexistentes como observaciones o cuenta_cliente_id.
 */
export function buildSupervisorPdvPayload(
  pdvId: string,
  supervisorId: string,
  fechaInicio: string
): SupervisorPdvRecordPayload {
  return {
    pdv_id: pdvId,
    empleado_id: supervisorId,
    activo: true,
    fecha_inicio: fechaInicio,
    fecha_fin: null,
  };
}
