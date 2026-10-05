import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { getSingleTenantAccountId } from '@/lib/tenant/singleTenant';
import { recalculateMaterializedAssignmentsRange } from '@/features/asignaciones/services/asignacionMaterializationService';
import {
  buildPlaneacionProjectionMonths,
  chunkPlaneacionEmployees,
  getPlaneacionEligibleEmployeeIds,
  getPlaneacionMonthRange,
  isPlaneacionProjectionComplete,
  type PlaneacionProjectionAssignment,
} from '@/features/asignaciones/lib/planeacionProjectionHorizon';
import {
  getPlaneacionMensualCacheTag,
  refrescarPlaneacionMensualSnapshot,
} from '@/features/asignaciones/services/planeacionMensualReadService';
import { refrescarCuotaMensualResumen } from '@/features/asignaciones/services/planeacionCuotaResumenService';
import { publishUiChanges } from '@/lib/ui-change/server';
import { buildUiChangeScope, buildUiChangeTargetsFromBusinessEvent } from '@/lib/ui-change/types';

type TypedSupabaseClient = ReturnType<typeof createServiceClient>;

interface PublishedAssignmentRow extends PlaneacionProjectionAssignment {
  id: string;
}

function getCurrentMxMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function getCurrentMxDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function startOfMonth(month: string) {
  return getPlaneacionMonthRange(month).fechaInicio;
}

function formatMonthLabel(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

async function loadPublishedAssignments(
  service: TypedSupabaseClient,
  cuentaClienteId: string,
  fechaInicio: string,
  fechaFin: string
) {
  const { data, error } = await service
    .from('asignacion')
    .select('id, empleado_id, fecha_inicio, fecha_fin')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('estado_publicacion', 'PUBLICADA')
    .lte('fecha_inicio', fechaFin)
    .or(`fecha_fin.is.null,fecha_fin.gte.${fechaInicio}`)
    .order('empleado_id', { ascending: true })
    .order('fecha_inicio', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PublishedAssignmentRow[];
}

async function hasCurrentMonthlySnapshot(
  service: TypedSupabaseClient,
  cuentaClienteId: string,
  month: string
) {
  const { data, error } = await service
    .from('planeacion_mensual_snapshot_fila')
    .select('id')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('mes', startOfMonth(month))
    .eq('es_vigente', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function countMaterializedMonthRows(
  service: TypedSupabaseClient,
  month: string,
  employeeIds: string[]
) {
  if (employeeIds.length === 0) return 0;
  const { fechaInicio, fechaFin } = getPlaneacionMonthRange(month);
  const { count, error } = await service
    .from('asignacion_diaria_resuelta')
    .select('empleado_id', { count: 'exact', head: true })
    .in('empleado_id', employeeIds)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function materializeProjectionRange(
  service: TypedSupabaseClient,
  employeeIds: string[],
  fechaInicio: string,
  fechaFin: string
) {
  for (const batch of chunkPlaneacionEmployees(employeeIds)) {
    await recalculateMaterializedAssignmentsRange(
      { empleadoIds: batch, fechaInicio, fechaFin },
      service as never
    );
  }
}

async function recordProjectedMonth(
  service: TypedSupabaseClient,
  cuentaClienteId: string,
  month: string,
  assignments: PublishedAssignmentRow[],
  employeeIds: string[]
) {
  const { fechaInicio, fechaFin } = getPlaneacionMonthRange(month);
  const eligibleRows = assignments.filter(
    (row) =>
      row.fecha_inicio.slice(0, 10) <= fechaFin &&
      (row.fecha_fin?.slice(0, 10) ?? fechaFin) >= fechaInicio
  );

  await service.from('audit_log').insert({
    tabla: 'asignacion',
    registro_id: `operacion-mensual-automatica-${month}`,
    accion: 'EVENTO',
    payload: {
      evento: 'asignacion_operacion_mensual_automatica',
      month,
      month_label: formatMonthLabel(month),
      asignaciones_cubiertas: eligibleRows.length,
      empleados_materializados: employeeIds.length,
      source: 'scheduled-publication-horizon',
    },
    usuario_id: null,
    cuenta_cliente_id: cuentaClienteId,
  });

  return eligibleRows.length;
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.ASIGNACIONES_CRON_SECRET;
  if (!expectedSecret || request.headers.get('x-asignaciones-cron-secret') !== expectedSecret) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const service = createServiceClient();
    const accountId = getSingleTenantAccountId();
    const effectiveDate = getCurrentMxDate();
    const [pdvStateResult, rotationResult, supervisorResult, employeeOffboardingResult] =
      await Promise.all([
        service.rpc('aplicar_pdv_estados_vigentes', { p_fecha: effectiveDate }),
        service.rpc('aplicar_pdv_rotaciones_vigentes', { p_fecha: effectiveDate }),
        service.rpc('aplicar_supervisor_reasignaciones_vigentes', {
          p_fecha: effectiveDate,
        }),
        service.rpc(
          'aplicar_bajas_empleado_vigentes' as never,
          {
            p_fecha: effectiveDate,
          } as never
        ),
      ]);
    const scheduledError =
      pdvStateResult.error ??
      rotationResult.error ??
      supervisorResult.error ??
      employeeOffboardingResult.error ??
      null;
    if (scheduledError) {
      throw new Error(scheduledError.message);
    }
    // El snapshot de catálogo se aplica después del estado operativo. Así un
    // PDV activo de naturaleza TEMPORAL conserva esa etiqueta en el catálogo.
    const pdvDetailResult = await service.rpc(
      'aplicar_pdv_detalles_vigentes' as never,
      { p_fecha: effectiveDate } as never
    );
    if (pdvDetailResult.error) {
      throw new Error(pdvDetailResult.error.message);
    }
    const forcedMonth = request.nextUrl.searchParams.get('month');
    // Uso administrativo y autenticado: reconstruye un único mes cuando una
    // carga programada corrigió vigencias antes de su fecha efectiva.
    const forceProjection = request.nextUrl.searchParams.get('force') === '1';
    const baseMonth = /^\d{4}-\d{2}$/.test(forcedMonth ?? '')
      ? String(forcedMonth)
      : getCurrentMxMonth();
    const months = forceProjection ? [baseMonth] : buildPlaneacionProjectionMonths(baseMonth);
    const results = [] as Array<{
      month: string;
      monthLabel: string;
      publishedRows: number;
      materializedEmployees: number;
      skipped: boolean;
    }>;

    const appliedPdvDetails = Number(pdvDetailResult.data ?? 0);
    const appliedPdvStates = Number(pdvStateResult.data ?? 0);
    const appliedRotations = Number(rotationResult.data ?? 0);
    const appliedSupervisorChanges = Number(supervisorResult.data ?? 0);
    const appliedEmployeeOffboardings = Number(employeeOffboardingResult.data ?? 0);
    const hasEffectiveChanges =
      appliedPdvDetails > 0 ||
      appliedPdvStates > 0 ||
      appliedRotations > 0 ||
      appliedSupervisorChanges > 0 ||
      appliedEmployeeOffboardings > 0;
    const projectionStart = getPlaneacionMonthRange(months[0]).fechaInicio;
    const projectionEnd = getPlaneacionMonthRange(months[months.length - 1]).fechaFin;
    const assignments = await loadPublishedAssignments(
      service,
      accountId,
      projectionStart,
      projectionEnd
    );
    const monthStates = await Promise.all(
      months.map(async (month) => {
        const employeeIds = getPlaneacionEligibleEmployeeIds(assignments, month);
        const { days } = getPlaneacionMonthRange(month);
        const [hasSnapshot, materializedRows] = await Promise.all([
          hasCurrentMonthlySnapshot(service, accountId, month),
          countMaterializedMonthRows(service, month, employeeIds),
        ]);
        const expectedMaterializedRows = employeeIds.length * days;
        return {
          month,
          employeeIds,
          hasSnapshot,
          materializedRows,
          expectedMaterializedRows,
          needsProjection:
            forceProjection ||
            hasEffectiveChanges ||
            !isPlaneacionProjectionComplete({
              hasSnapshot,
              materializedRows,
              expectedMaterializedRows,
            }),
        };
      })
    );
    const pendingMonths = monthStates.filter((state) => state.needsProjection);

    if (pendingMonths.length > 0) {
      const firstRange = getPlaneacionMonthRange(pendingMonths[0].month);
      const lastRange = getPlaneacionMonthRange(pendingMonths[pendingMonths.length - 1].month);
      const affectedEmployees = Array.from(
        new Set(pendingMonths.flatMap((state) => state.employeeIds))
      );
      await materializeProjectionRange(
        service,
        affectedEmployees,
        firstRange.fechaInicio,
        lastRange.fechaFin
      );
    }

    for (const state of monthStates) {
      const { month, employeeIds } = state;
      if (!state.needsProjection) {
        results.push({
          month,
          monthLabel: formatMonthLabel(month),
          publishedRows: 0,
          materializedEmployees: 0,
          skipped: true,
        });
        continue;
      }

      const monthStart = startOfMonth(month);
      await refrescarCuotaMensualResumen(service as never, {
        cuentaClienteId: accountId,
        mes: monthStart,
      });
      await refrescarPlaneacionMensualSnapshot(service as never, accountId, monthStart, []);
      revalidateTag(getPlaneacionMensualCacheTag(accountId, monthStart), 'max');
      const publishedRows = await recordProjectedMonth(
        service,
        accountId,
        month,
        assignments,
        employeeIds
      );
      results.push({
        month,
        monthLabel: formatMonthLabel(month),
        publishedRows,
        materializedEmployees: employeeIds.length,
        skipped: false,
      });
    }

    if (hasEffectiveChanges) {
      await publishUiChanges(
        buildUiChangeTargetsFromBusinessEvent({
          eventType: 'planeacion_programada_vigente',
          modules: [
            'asignaciones',
            'dashboard',
            'asistencias',
            'pdvs',
            'reportes',
            'ventas',
            'love-isdin',
            'materiales',
            'ruta-semanal',
            'empleados',
            'usuarios',
          ],
          surfaces: ['all'],
          scopes: [
            buildUiChangeScope('cuenta', accountId),
            ...months.map((month) => buildUiChangeScope('periodo', startOfMonth(month))),
          ],
          cuentaClienteId: accountId,
          roleTargets: ['ALL'],
          metadata: {
            periodo: startOfMonth(baseMonth),
            fecha_efectiva: effectiveDate,
            pdv_detalles_aplicados: appliedPdvDetails,
            pdv_estados_aplicados: appliedPdvStates,
            rotaciones_aplicadas: appliedRotations,
            supervisor_reasignaciones_aplicadas: appliedSupervisorChanges,
            bajas_empleado_aplicadas: appliedEmployeeOffboardings,
          },
        }),
        { service }
      );
    }

    return NextResponse.json({
      ok: true,
      accountId,
      appliedPdvDetails,
      appliedPdvStates,
      appliedRotations,
      appliedSupervisorChanges,
      appliedEmployeeOffboardings,
      months: results,
      message: results.every((result) => result.skipped)
        ? 'Sin cambios efectivos: se conservaron los snapshots mensuales vigentes.'
        : 'Publicacion mensual automatica ejecutada para los meses que requerian actualizacion.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No fue posible ejecutar la publicacion automatica de asignaciones.',
      },
      { status: 500 }
    );
  }
}
