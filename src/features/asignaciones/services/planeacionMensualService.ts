import type {
  AplicarPlaneacionMensualInput,
  AplicarPlaneacionMensualResult,
  PlaneacionMensualIssue,
  PlaneacionMensualPreview,
  PrevisualizarPlaneacionMensualInput,
} from '@/features/asignaciones/types/planeacionMensual';

interface RpcErrorLike {
  message: string;
  code?: string;
  details?: string;
}

interface PlaneacionRpcClient {
  rpc(
    name:
      | 'previsualizar_planeacion_mensual'
      | 'aplicar_planeacion_mensual'
      | 'previsualizar_planeacion_supervisor_pdvs'
      | 'previsualizar_planeacion_mensual_versionada'
      | 'aplicar_planeacion_supervisor_pdvs',
    params: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: RpcErrorLike | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readIssues(value: unknown): PlaneacionMensualIssue[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item) => ({
    code: readString(item.code, 'PLANEACION_ERROR_DESCONOCIDO'),
    operationIndex: typeof item.operationIndex === 'number' ? item.operationIndex : undefined,
    empleadoId: typeof item.empleadoId === 'string' ? item.empleadoId : undefined,
    fecha: typeof item.fecha === 'string' ? item.fecha : undefined,
    pdvId: typeof item.pdvId === 'string' ? item.pdvId : undefined,
    pdvIds: Array.isArray(item.pdvIds)
      ? item.pdvIds.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
  }));
}

export function parsePlaneacionMensualPreview(value: unknown): PlaneacionMensualPreview {
  if (!isRecord(value)) {
    throw new Error('La vista previa de planeación devolvió un contrato inválido.');
  }

  const impact = isRecord(value.impact)
    ? {
        operations: readNumber(value.impact.operations),
        employees: readNumber(value.impact.employees),
        pdvs: readNumber(value.impact.pdvs),
      }
    : undefined;

  return {
    ok: value.ok === true,
    mes: readString(value.mes),
    versionBase: readNumber(value.versionBase),
    errors: readIssues(value.errors),
    warnings: readIssues(value.warnings),
    conflicts: readIssues(value.conflicts),
    impact,
  };
}

export async function previsualizarPlaneacionMensual(
  client: PlaneacionRpcClient,
  input: PrevisualizarPlaneacionMensualInput
) {
  const { data, error } = await client.rpc('previsualizar_planeacion_mensual_versionada', {
    p_cuenta_cliente_id: input.cuentaClienteId,
    p_mes: input.mes,
    p_operaciones: input.operaciones,
    p_alcance: 'GENERAL',
  });

  if (error) {
    throw new Error(error.message);
  }

  return parsePlaneacionMensualPreview(data);
}

export async function aplicarPlaneacionMensual(
  client: PlaneacionRpcClient,
  input: AplicarPlaneacionMensualInput
): Promise<AplicarPlaneacionMensualResult> {
  const { data, error } = await client.rpc('aplicar_planeacion_mensual', {
    p_cuenta_cliente_id: input.cuentaClienteId,
    p_mes: input.mes,
    p_idempotency_key: input.idempotencyKey,
    p_version_base: input.versionBase,
    p_operaciones: input.operaciones,
    p_usuario_id: input.usuarioId,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!isRecord(data) || data.ok !== true) {
    throw new Error('La aplicación de planeación no confirmó la transacción.');
  }

  return {
    ok: true,
    idempotent: data.idempotent === true,
    loteId: readString(data.loteId),
    version: readNumber(data.version),
    preview: data.preview ? parsePlaneacionMensualPreview(data.preview) : undefined,
  };
}

export async function previsualizarPlaneacionSupervisorPdvs(
  client: PlaneacionRpcClient,
  input: PrevisualizarPlaneacionMensualInput
) {
  const { data, error } = await client.rpc('previsualizar_planeacion_mensual_versionada', {
    p_cuenta_cliente_id: input.cuentaClienteId,
    p_mes: input.mes,
    p_operaciones: input.operaciones,
    p_alcance: 'SUPERVISOR_PDVS',
  });

  if (error) throw new Error(error.message);
  return parsePlaneacionMensualPreview(data);
}

export async function aplicarPlaneacionSupervisorPdvs(
  client: PlaneacionRpcClient,
  input: AplicarPlaneacionMensualInput
): Promise<AplicarPlaneacionMensualResult> {
  const { data, error } = await client.rpc('aplicar_planeacion_supervisor_pdvs', {
    p_cuenta_cliente_id: input.cuentaClienteId,
    p_mes: input.mes,
    p_idempotency_key: input.idempotencyKey,
    p_version_base: input.versionBase,
    p_operaciones: input.operaciones,
    p_usuario_id: input.usuarioId,
  });

  if (error) throw new Error(error.message);
  if (!isRecord(data) || data.ok !== true) {
    throw new Error('La reasignación de supervisores no confirmó la transacción.');
  }

  return {
    ok: true,
    idempotent: data.idempotent === true,
    loteId: readString(data.loteId),
    version: readNumber(data.version),
    preview: data.preview ? parsePlaneacionMensualPreview(data.preview) : undefined,
  };
}

export type { PlaneacionRpcClient };
