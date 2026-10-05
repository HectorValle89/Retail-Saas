import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlaneacionCuotaPesos } from '@/features/asignaciones/lib/planeacionCuotaImport';
import type { PlaneacionCuotaImportSummary } from '@/features/asignaciones/types/planeacionMensual';

interface QuotaPdvScopeRaw {
  pdv_id: string;
  pdv:
    | {
        id: string;
        clave_btl: string;
        nombre: string;
        cadena: { nombre: string } | { nombre: string }[] | null;
      }
    | Array<{
        id: string;
        clave_btl: string;
        nombre: string;
        cadena: { nombre: string } | { nombre: string }[] | null;
      }>
    | null;
}

export interface PlaneacionCuotaPdvScope {
  pdvId: string;
  claveBtl: string;
  pdvNombre: string;
  cadenaNombre: string | null;
}

export interface AplicarCuotaRpcRow {
  pdvId: string;
  claveBtl: string;
  cuotaMensual: number;
  pesos: PlaneacionCuotaPesos;
}

export interface AplicarCuotasMensualesResult {
  ok: true;
  idempotent: boolean;
  loteId: string;
  version: number;
  pdvIds: string[];
  summary: PlaneacionCuotaImportSummary;
}

interface RpcErrorLike {
  message: string;
}

interface QuotaRpcClient {
  rpc(
    name: 'aplicar_cuotas_mensuales',
    params: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: RpcErrorLike | null }>;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function loadPlaneacionCuotaPdvScope(
  client: SupabaseClient,
  cuentaClienteId: string,
  mes: string
): Promise<PlaneacionCuotaPdvScope[]> {
  const monthDate = new Date(`${mes.slice(0, 7)}-01T12:00:00Z`);
  monthDate.setUTCMonth(monthDate.getUTCMonth() + 1, 0);
  const monthEnd = monthDate.toISOString().slice(0, 10);

  const { data, error } = await client
    .from('cuenta_cliente_pdv')
    .select('pdv_id,pdv:pdv_id(id,clave_btl,nombre,cadena:cadena_id(nombre))')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('activo', true)
    .lte('fecha_inicio', monthEnd)
    .or(`fecha_fin.is.null,fecha_fin.gte.${mes}`)
    .limit(5000);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as QuotaPdvScopeRaw[]).flatMap((row) => {
    const pdv = firstRelation(row.pdv);
    if (!pdv?.id || !pdv.clave_btl) return [];
    const cadena = firstRelation(pdv.cadena);
    return [
      {
        pdvId: pdv.id,
        claveBtl: pdv.clave_btl.toUpperCase(),
        pdvNombre: pdv.nombre,
        cadenaNombre: cadena?.nombre ?? null,
      },
    ];
  });
}

export async function aplicarCuotasMensuales(
  client: QuotaRpcClient,
  input: {
    cuentaClienteId: string;
    mes: string;
    nombreArchivo: string;
    hashArchivo: string;
    cuotas: AplicarCuotaRpcRow[];
    usuarioId: string;
  }
): Promise<AplicarCuotasMensualesResult> {
  const { data, error } = await client.rpc('aplicar_cuotas_mensuales', {
    p_cuenta_cliente_id: input.cuentaClienteId,
    p_mes: input.mes,
    p_nombre_archivo: input.nombreArchivo,
    p_hash_archivo: input.hashArchivo,
    p_cuotas: input.cuotas.map((row) => ({
      pdv_id: row.pdvId,
      clave_btl: row.claveBtl,
      cuota_mensual: row.cuotaMensual,
      pesos: row.pesos,
    })),
    p_usuario_id: input.usuarioId,
  });

  if (error) throw new Error(error.message);
  if (!isRecord(data) || data.ok !== true) {
    throw new Error('La publicación de cuotas no confirmó la transacción.');
  }

  const summaryValue = isRecord(data.summary) ? data.summary : {};
  return {
    ok: true,
    idempotent: data.idempotent === true,
    loteId: typeof data.loteId === 'string' ? data.loteId : '',
    version: readNumber(data.version),
    pdvIds: Array.isArray(data.pdvIds)
      ? data.pdvIds.filter((value): value is string => typeof value === 'string')
      : [],
    summary: {
      pdvs: readNumber(summaryValue.pdvs),
      dias: readNumber(summaryValue.dias),
      atribuciones: readNumber(summaryValue.atribuciones),
      cuotaMensual: readNumber(summaryValue.cuotaMensual),
      cuotaAtribuida: readNumber(summaryValue.cuotaAtribuida),
      cuotaNoAtribuida: readNumber(summaryValue.cuotaNoAtribuida),
    },
  };
}

export type { QuotaRpcClient };
