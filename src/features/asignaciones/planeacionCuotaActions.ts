'use server';

import { revalidateTag } from 'next/cache';
import { requerirPuestosActivos } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { publishUiChanges } from '@/lib/ui-change/server';
import { buildUiChangeScope, buildUiChangeTargetsFromBusinessEvent } from '@/lib/ui-change/types';
import {
  distributeMonthlyQuota,
  parsePlaneacionCuotaWorkbook,
  validateQuotaImportMonth,
  type PlaneacionCuotaImportIssue,
  type PlaneacionCuotaImportRow,
} from '@/features/asignaciones/lib/planeacionCuotaImport';
import {
  aplicarCuotasMensuales,
  loadPlaneacionCuotaPdvScope,
  type AplicarCuotaRpcRow,
  type PlaneacionCuotaPdvScope,
  type QuotaRpcClient,
} from '@/features/asignaciones/services/planeacionCuotaService';
import {
  getPlaneacionMensualCacheTag,
  refrescarPlaneacionMensualSnapshot,
  type PlaneacionMensualReadRpcClient,
} from '@/features/asignaciones/services/planeacionMensualReadService';
import type {
  PlaneacionCuotaImportActionState,
  PlaneacionCuotaImportIssueView,
  PlaneacionCuotaImportPreviewRow,
} from '@/features/asignaciones/types/planeacionMensual';
import {
  refrescarCuotaMensualResumen,
  type PlaneacionCuotaResumenRpcClient,
} from '@/features/asignaciones/services/planeacionCuotaResumenService';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-\d{2}-01$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;

interface PreparedQuotaImport {
  hash: string | null;
  issues: PlaneacionCuotaImportIssueView[];
  previewRows: PlaneacionCuotaImportPreviewRow[];
  rpcRows: AplicarCuotaRpcRow[];
  summary: PlaneacionCuotaImportActionState['summary'];
}

function state(
  partial: Partial<PlaneacionCuotaImportActionState>
): PlaneacionCuotaImportActionState {
  return {
    ok: false,
    readyToApply: false,
    applied: false,
    idempotent: false,
    message: '',
    hash: null,
    loteId: null,
    issues: [],
    rows: [],
    summary: null,
    refreshPending: false,
    ...partial,
  };
}

function readRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function validateContext(cuentaClienteId: string, mes: string) {
  if (!UUID_PATTERN.test(cuentaClienteId)) throw new Error('La cuenta de cliente no es válida.');
  if (!MONTH_PATTERN.test(mes)) {
    throw new Error('El mes debe enviarse como el primer día en formato YYYY-MM-01.');
  }
}

function readWorkbookFile(formData: FormData) {
  const file = formData.get('archivo');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Adjunta un archivo XLSX de cuotas.');
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('La carga de cuotas sólo acepta archivos XLSX.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('El archivo excede el límite de 8 MB.');
  }
  return file;
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toIssueView(issue: PlaneacionCuotaImportIssue): PlaneacionCuotaImportIssueView {
  return { rowNumber: issue.rowNumber, code: issue.code, message: issue.message };
}

function buildSemanticPayload(rows: PlaneacionCuotaImportRow[]) {
  return rows
    .map((row) => ({
      mes: row.mes,
      claveBtl: row.claveBtl,
      cuotaMensual: row.cuotaMensual,
      pesos: row.pesos,
    }))
    .sort((left, right) => left.claveBtl.localeCompare(right.claveBtl, 'es'));
}

function resolveRows(
  rows: PlaneacionCuotaImportRow[],
  scope: PlaneacionCuotaPdvScope[],
  issues: PlaneacionCuotaImportIssueView[]
) {
  const scopeByKey = new Map(scope.map((pdv) => [pdv.claveBtl.toUpperCase(), pdv]));
  const previewRows: PlaneacionCuotaImportPreviewRow[] = [];
  const rpcRows: AplicarCuotaRpcRow[] = [];

  for (const row of rows) {
    const pdv = scopeByKey.get(row.claveBtl.toUpperCase());
    if (!pdv) {
      issues.push({
        rowNumber: row.rowNumber,
        code: 'PDV_NO_DISPONIBLE',
        message: `El PDV ${row.claveBtl} no existe o no pertenece a la cuenta durante el mes seleccionado.`,
      });
      continue;
    }

    const distribution = distributeMonthlyQuota(row);
    const amounts = distribution.map((day) => day.montoCuota);
    previewRows.push({
      rowNumber: row.rowNumber,
      pdvId: pdv.pdvId,
      claveBtl: pdv.claveBtl,
      cadenaNombre: pdv.cadenaNombre,
      pdvNombre: pdv.pdvNombre,
      cuotaMensual: row.cuotaMensual,
      diasMes: distribution.length,
      cuotaDiariaMinima: Math.min(...amounts),
      cuotaDiariaMaxima: Math.max(...amounts),
    });
    rpcRows.push({
      pdvId: pdv.pdvId,
      claveBtl: pdv.claveBtl,
      cuotaMensual: row.cuotaMensual,
      pesos: row.pesos,
    });
  }

  return { previewRows, rpcRows };
}

async function prepareImport(formData: FormData): Promise<{
  cuentaClienteId: string;
  mes: string;
  file: File;
  prepared: PreparedQuotaImport;
}> {
  const cuentaClienteId = readRequiredString(formData, 'cuentaClienteId');
  const mes = readRequiredString(formData, 'mes');
  validateContext(cuentaClienteId, mes);
  const file = readWorkbookFile(formData);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = parsePlaneacionCuotaWorkbook(bytes);
  const parsedIssues = [...parsed.issues, ...validateQuotaImportMonth(parsed, mes)];
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    parsedIssues.push({
      rowNumber: 0,
      code: 'MONTO_INVALIDO',
      severity: 'ERROR',
      message: `El lote supera el máximo de ${MAX_IMPORT_ROWS} PDVs.`,
    });
  }

  const service = createServiceClient();
  const scope = await loadPlaneacionCuotaPdvScope(service, cuentaClienteId, mes);
  const issues = parsedIssues.map(toIssueView);
  const { previewRows, rpcRows } = resolveRows(parsed.rows, scope, issues);
  const semanticRows = buildSemanticPayload(parsed.rows);
  const hash = issues.length === 0 ? await sha256(JSON.stringify(semanticRows)) : null;

  return {
    cuentaClienteId,
    mes,
    file,
    prepared: {
      hash,
      issues: issues.sort((left, right) => left.rowNumber - right.rowNumber),
      previewRows,
      rpcRows,
      summary: {
        pdvs: previewRows.length,
        dias: previewRows.reduce((total, row) => total + row.diasMes, 0),
        cuotaMensual: previewRows.reduce((total, row) => total + row.cuotaMensual, 0),
      },
    },
  };
}

function assertActorScope(actorAccountId: string | null, requestedAccountId: string) {
  if (actorAccountId && actorAccountId !== requestedAccountId) {
    throw new Error('La cuenta solicitada queda fuera del alcance del usuario.');
  }
}

export async function previsualizarCuotasMensualesAction(
  formData: FormData
): Promise<PlaneacionCuotaImportActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);

  try {
    assertActorScope(actor.cuentaClienteId, readRequiredString(formData, 'cuentaClienteId'));
    const { prepared } = await prepareImport(formData);
    const ready = prepared.issues.length === 0 && prepared.rpcRows.length > 0;

    return state({
      ok: ready,
      readyToApply: ready,
      message: ready
        ? 'Vista previa validada. El lote completo está listo para publicarse.'
        : 'La vista previa contiene errores; no se publicará ninguna fila.',
      hash: prepared.hash,
      issues: prepared.issues,
      rows: prepared.previewRows,
      summary: prepared.summary,
    });
  } catch (error) {
    return state({
      message: error instanceof Error ? error.message : 'No fue posible validar el archivo.',
    });
  }
}

export async function aplicarCuotasMensualesAction(
  formData: FormData
): Promise<PlaneacionCuotaImportActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR']);

  try {
    assertActorScope(actor.cuentaClienteId, readRequiredString(formData, 'cuentaClienteId'));
    const { cuentaClienteId, mes, file, prepared } = await prepareImport(formData);
    const expectedHash = readRequiredString(formData, 'hash');
    if (!prepared.hash || prepared.hash !== expectedHash) {
      return state({
        message: 'El contenido cambió después de la vista previa. Vuelve a validarlo.',
        issues: prepared.issues,
        rows: prepared.previewRows,
        summary: prepared.summary,
      });
    }
    if (prepared.issues.length > 0 || prepared.rpcRows.length === 0) {
      return state({
        message: 'El lote contiene errores y no puede publicarse.',
        issues: prepared.issues,
        rows: prepared.previewRows,
        summary: prepared.summary,
      });
    }

    const service = createServiceClient();
    const result = await aplicarCuotasMensuales(service as unknown as QuotaRpcClient, {
      cuentaClienteId,
      mes,
      nombreArchivo: file.name,
      hashArchivo: prepared.hash,
      cuotas: prepared.rpcRows,
      usuarioId: actor.usuarioId,
    });

    let refreshPending = false;
    if (!result.idempotent) {
      try {
        await refrescarCuotaMensualResumen(
          service as unknown as PlaneacionCuotaResumenRpcClient,
          { cuentaClienteId, mes, pdvIds: result.pdvIds }
        );
        await refrescarPlaneacionMensualSnapshot(
          service as unknown as PlaneacionMensualReadRpcClient,
          cuentaClienteId,
          mes,
          result.pdvIds
        );
        revalidateTag(getPlaneacionMensualCacheTag(cuentaClienteId, mes), 'max');
        await publishUiChanges(
          buildUiChangeTargetsFromBusinessEvent({
            eventType: 'cuotas_mensuales_publicadas',
            modules: ['asignaciones', 'dashboard', 'reportes', 'ventas'],
            surfaces: ['all'],
            scopes: [buildUiChangeScope('cuenta', cuentaClienteId)],
            cuentaClienteId,
            empleadoId: actor.empleadoId,
            roleTargets: ['ALL'],
            metadata: { source: 'planeacion_cuotas', loteId: result.loteId, mes },
          }),
          { service }
        );
      } catch {
        refreshPending = true;
      }
    }

    return state({
      ok: true,
      applied: true,
      idempotent: result.idempotent,
      message: refreshPending
        ? 'Cuotas publicadas; la actualización de vistas quedó en cola para reintento.'
        : result.idempotent
          ? 'Este mismo contenido ya estaba publicado; no se duplicaron cuotas.'
          : 'Cuotas publicadas y atribuciones individuales recalculadas.',
      hash: prepared.hash,
      loteId: result.loteId,
      rows: prepared.previewRows,
      summary: result.summary,
      refreshPending,
    });
  } catch (error) {
    return state({
      message: error instanceof Error ? error.message : 'No fue posible publicar las cuotas.',
    });
  }
}
