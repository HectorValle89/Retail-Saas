import type {
  AsignacionDiariaResuelta,
  ConfiguracionSistema,
  CuotaEmpleadoPeriodo,
  Empleado,
  PeriodoNomina,
  Pdv,
} from '@/types/database';

export const LOVE_DAILY_QUOTA_CONFIG_KEY = 'love_isdin.cuota_diaria_default';
export const LOVE_DAILY_QUOTA_DEFAULT = 3;
const MAX_ASSIGNMENT_ROWS_UNSCOPED = 12000;
const MAX_ASSIGNMENT_ROWS_SCOPED = 2000;
const MAX_QUOTA_ROWS = 2000;

type LoveQuotaSupabaseClient = {
  from(table: string): any;
};

type ConfiguracionQuotaRow = Pick<ConfiguracionSistema, 'clave' | 'valor'>;

type PeriodoQuotaRow = Pick<PeriodoNomina, 'id' | 'fecha_inicio' | 'fecha_fin'>;

type CuotaLoveRow = Pick<
  CuotaEmpleadoPeriodo,
  'id' | 'periodo_id' | 'cuenta_cliente_id' | 'empleado_id' | 'metadata'
> & {
  periodo: PeriodoQuotaRow | PeriodoQuotaRow[] | null;
};

type EmpleadoQuotaRow = Pick<
  Empleado,
  | 'id'
  | 'id_nomina'
  | 'nombre_completo'
  | 'puesto'
  | 'supervisor_empleado_id'
  | 'zona'
  | 'estatus_laboral'
  | 'fecha_baja'
>;

type PdvQuotaRow = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'cadena_id'>;

type CadenaQuotaRow = {
  id: string;
  nombre: string;
};

type FetchLoveQuotaTargetRowsOptions = {
  accountId?: string | null;
  dateFrom: string;
  dateTo: string;
  employeeIds?: string[];
  supervisorId?: string | null;
};

type AsignacionQuotaRow = Pick<
  AsignacionDiariaResuelta,
  | 'fecha'
  | 'empleado_id'
  | 'pdv_id'
  | 'supervisor_empleado_id'
  | 'cuenta_cliente_id'
  | 'trabaja_en_tienda'
>;

export interface LoveQuotaTargetRow {
  fechaOperacion: string;
  weekBucket: string;
  cuentaClienteId: string;
  empleadoId: string;
  empleadoLabel: string;
  empleadoNombre: string;
  idNomina: string | null;
  pdvId: string;
  pdvLabel: string;
  pdvNombre?: string | null;
  pdvClaveBtl: string | null;
  supervisorId: string | null;
  supervisorLabel: string;
  zona: string;
  cadena: string;
  objetivo: number;
  ausenciaTipo?: string | null;
  ausenciaDescuento?: number;
  ausenciaObservacion?: string | null;
  estatusLaboral?: string;
}

function getFirst<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
}

function normalizePositiveInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.max(0, Math.round(parsed));
}

function normalizeConfigQuota(rows: ConfiguracionQuotaRow[]) {
  const row = rows.find((item) => item.clave === LOVE_DAILY_QUOTA_CONFIG_KEY);
  return normalizePositiveInteger(row?.valor) ?? LOVE_DAILY_QUOTA_DEFAULT;
}

function resolveLoveQuotaFromMetadata(metadata: unknown, defaultQuota: number) {
  const normalized = normalizeMetadata(metadata);

  return (
    normalizePositiveInteger(normalized.love_objetivo_diario) ??
    normalizePositiveInteger(normalized.afiliaciones_love_objetivo_diario) ??
    normalizePositiveInteger(normalized.love_objetivo) ??
    normalizePositiveInteger(normalized.afiliaciones_love_objetivo) ??
    defaultQuota
  );
}

function addDaysIso(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function countDaysInclusive(dateFrom: string, dateTo: string) {
  const start = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const end = Date.parse(`${dateTo}T00:00:00.000Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 1;
  }

  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

function clampLimit(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.ceil(value)));
}

function getWeekStartIso(dayIso: string) {
  const [year, month, day] = dayIso.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function getQuotaMap(rows: CuotaLoveRow[]) {
  const map = new Map<string, CuotaLoveRow[]>();

  for (const row of rows) {
    const key = `${row.empleado_id}::${row.cuenta_cliente_id}`;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }

  return map;
}

function findQuotaForDate(dateIso: string, rows: CuotaLoveRow[] | undefined) {
  if (!rows || rows.length === 0) {
    return null;
  }

  const candidates = rows
    .map((row) => ({ row, periodo: getFirst(row.periodo) }))
    .filter((item) => item.periodo)
    .filter((item) => item.periodo!.fecha_inicio <= dateIso && item.periodo!.fecha_fin >= dateIso)
    .sort((left, right) =>
      right.periodo!.fecha_inicio.localeCompare(left.periodo!.fecha_inicio, 'es-MX')
    );

  return candidates[0]?.row ?? null;
}

function inferSupervisorLabel(
  supervisorId: string | null,
  employeeById: Map<string, EmpleadoQuotaRow>
) {
  if (!supervisorId) {
    return 'Sin supervisor';
  }

  return (
    employeeById.get(supervisorId)?.nombre_completo ?? `Supervisor ${supervisorId.slice(0, 8)}`
  );
}

function resolveAssignmentLimit(options: FetchLoveQuotaTargetRowsOptions) {
  const days = countDaysInclusive(options.dateFrom, options.dateTo);

  if (options.employeeIds?.length) {
    return clampLimit(options.employeeIds.length * days * 2, 50, MAX_ASSIGNMENT_ROWS_SCOPED);
  }

  if (options.supervisorId) {
    return clampLimit(days * 300, 100, MAX_ASSIGNMENT_ROWS_SCOPED);
  }

  if (options.accountId) {
    return clampLimit(days * 800, 200, MAX_ASSIGNMENT_ROWS_UNSCOPED);
  }

  return clampLimit(days * 800, 200, MAX_ASSIGNMENT_ROWS_UNSCOPED);
}

function resolveQuotaLimit(employeeCount: number) {
  return clampLimit(employeeCount * 4, 50, MAX_QUOTA_ROWS);
}

export async function fetchLoveQuotaTargetRows(
  supabase: LoveQuotaSupabaseClient,
  options: FetchLoveQuotaTargetRowsOptions
): Promise<{ data: LoveQuotaTargetRow[]; error: string | null }> {
  const maxLimit = resolveAssignmentLimit(options);
  const pageSize = 1000;
  let allAssignmentRows: AsignacionQuotaRow[] = [];
  let page = 0;
  let fetchError: any = null;

  while (allAssignmentRows.length < maxLimit) {
    const fromOffset = page * pageSize;
    const toOffset = Math.min(fromOffset + pageSize - 1, maxLimit - 1);

    let query = supabase
      .from('asignacion_diaria_resuelta')
      .select('fecha, empleado_id, pdv_id, supervisor_empleado_id, cuenta_cliente_id, trabaja_en_tienda');

    if (!query || typeof query.range !== 'function') {
      break;
    }

    query = query.gte('fecha', options.dateFrom);

    if (typeof query.lte === 'function') {
      query = query.lte('fecha', options.dateTo);
    } else if (typeof query.lt === 'function') {
      query = query.lt('fecha', addDaysIso(options.dateTo, 1));
    } else {
      break;
    }

    if (typeof query.order === 'function') {
      query = query.order('fecha', { ascending: true });
    }

    if (options.accountId && typeof query.eq === 'function') {
      query = query.eq('cuenta_cliente_id', options.accountId);
    }

    if (options.supervisorId && typeof query.eq === 'function') {
      query = query.eq('supervisor_empleado_id', options.supervisorId);
    }

    if (typeof query.eq === 'function') {
      query = query.eq('trabaja_en_tienda', true);
    }

    if (
      options.employeeIds &&
      options.employeeIds.length === 1 &&
      typeof query.eq === 'function'
    ) {
      query = query.eq('empleado_id', options.employeeIds[0]);
    } else if (
      options.employeeIds &&
      options.employeeIds.length > 1 &&
      typeof query.in === 'function'
    ) {
      query = query.in('empleado_id', options.employeeIds);
    }

    const pageResult = await query.range(fromOffset, toOffset);
    if (pageResult.error) {
      fetchError = pageResult.error;
      break;
    }

    const pageRows = (pageResult.data ?? []) as unknown as AsignacionQuotaRow[];
    allAssignmentRows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }
    page++;
  }

  if (fetchError) {
    return { data: [], error: fetchError.message };
  }

  const configQuery = supabase.from('configuracion').select('clave, valor');
  const configResult =
    configQuery && typeof configQuery.eq === 'function' && typeof configQuery.limit === 'function'
      ? await configQuery.eq('clave', LOVE_DAILY_QUOTA_CONFIG_KEY).limit(4)
      : { data: [], error: null };

  if (configResult.error) {
    return { data: [], error: configResult.error.message };
  }

  const assignmentRows = allAssignmentRows.filter(
    (row): row is AsignacionQuotaRow & { cuenta_cliente_id: string; pdv_id: string } =>
      Boolean(row.cuenta_cliente_id && row.pdv_id && row.trabaja_en_tienda)
  );

  if (assignmentRows.length === 0) {
    return { data: [], error: null };
  }

  const employeeIds = Array.from(new Set(assignmentRows.map((row) => row.empleado_id)));
  const supervisorIds = Array.from(
    new Set(
      assignmentRows
        .map((row) => row.supervisor_empleado_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const pdvIds = Array.from(new Set(assignmentRows.map((row) => row.pdv_id)));

  const [employeesResult, pdvsResult, quotasResult, publicReportsResult] = await Promise.all([
    supabase
      .from('empleado')
      .select(
        'id, id_nomina, nombre_completo, puesto, supervisor_empleado_id, zona, estatus_laboral, fecha_baja'
      )
      .in('id', Array.from(new Set([...employeeIds, ...supervisorIds])))
      .limit(Math.max(employeeIds.length + supervisorIds.length, 1)),
    supabase
      .from('pdv')
      .select('id, clave_btl, nombre, zona, cadena_id')
      .in('id', pdvIds)
      .limit(Math.max(pdvIds.length, 1)),
    (() => {
      let query = supabase
        .from('cuota_empleado_periodo')
        .select(
          'id, periodo_id, cuenta_cliente_id, empleado_id, metadata, periodo:periodo_id(id, fecha_inicio, fecha_fin)'
        )
        .in('empleado_id', employeeIds)
        .limit(resolveQuotaLimit(employeeIds.length));

      if (options.accountId) {
        query = query.eq('cuenta_cliente_id', options.accountId);
      }

      return query;
    })(),
    supabase
      .from('captura_publica_registro')
      .select('empleado_id, fecha_operativa, subtipo_registro, observaciones')
      .in('subtipo_registro', ['VACACIONES', 'INCAPACIDAD', 'LOVE_FALLIDO', 'SIN_REGISTROS', 'FALTA', 'FORMACION', 'FORMACIÓN'])
      .gte('fecha_operativa', options.dateFrom)
      .lte('fecha_operativa', options.dateTo)
      .limit(Math.max(employeeIds.length * 31, 200)),
  ]);

  if (employeesResult.error) {
    return { data: [], error: employeesResult.error.message };
  }

  if (pdvsResult.error) {
    return { data: [], error: pdvsResult.error.message };
  }

  if (quotasResult.error) {
    return { data: [], error: quotasResult.error.message };
  }

  if (publicReportsResult.error) {
    return { data: [], error: publicReportsResult.error.message };
  }

  const employeeById = new Map(
    ((employeesResult.data ?? []) as unknown as EmpleadoQuotaRow[]).map(
      (row) => [row.id, row] as const
    )
  );
  const pdvById = new Map(
    ((pdvsResult.data ?? []) as unknown as PdvQuotaRow[]).map((row) => [row.id, row] as const)
  );
  const quotaRows = (quotasResult.data ?? []) as unknown as CuotaLoveRow[];
  const quotaMap = getQuotaMap(quotaRows);

  const cadenaIds = Array.from(
    new Set(
      Array.from(pdvById.values())
        .map((row) => row.cadena_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const cadenaResult =
    cadenaIds.length > 0
      ? await supabase
          .from('cadena')
          .select('id, nombre')
          .in('id', cadenaIds)
          .limit(Math.max(cadenaIds.length, 1))
      : { data: [] as CadenaQuotaRow[], error: null };

  if (cadenaResult.error) {
    return { data: [], error: cadenaResult.error.message };
  }

  const cadenaById = new Map(
    ((cadenaResult.data ?? []) as unknown as CadenaQuotaRow[]).map(
      (row) => [row.id, row.nombre] as const
    )
  );
  const absencesMap = new Map<string, string>();
  const absencesObsMap = new Map<string, string>();
  if (publicReportsResult.data) {
    for (const row of (publicReportsResult.data as any[])) {
      const key = `${row.empleado_id}::${row.fecha_operativa}`;
      absencesMap.set(key, row.subtipo_registro);
      if (row.observaciones) {
        absencesObsMap.set(key, row.observaciones);
      }
    }
  }

  const defaultQuota = normalizeConfigQuota((configResult.data ?? []) as ConfiguracionQuotaRow[]);

  const rows = assignmentRows.flatMap((assignment) => {
    const employee = employeeById.get(assignment.empleado_id);
    const pdv = pdvById.get(assignment.pdv_id);

    if (
      !employee ||
      employee.puesto !== 'DERMOCONSEJERO' ||
      (employee.estatus_laboral === 'BAJA' &&
        employee.fecha_baja &&
        assignment.fecha > employee.fecha_baja)
    ) {
      return [];
    }

    const quota = findQuotaForDate(
      assignment.fecha,
      quotaMap.get(`${assignment.empleado_id}::${assignment.cuenta_cliente_id}`)
    );

    const baseObjetivo = resolveLoveQuotaFromMetadata(quota?.metadata, defaultQuota);
    const keyAbsence = `${assignment.empleado_id}::${assignment.fecha}`;
    const absenceType = absencesMap.get(keyAbsence);
    const absenceObs = absencesObsMap.get(keyAbsence) || null;
    const isExclType = absenceType === 'VACACIONES' || absenceType === 'INCAPACIDAD' || absenceType === 'FORMACION' || absenceType === 'FORMACIÓN';
    const objetivo = isExclType ? Math.max(0, baseObjetivo - 3) : baseObjetivo;

    const zona = pdv?.zona ?? employee.zona ?? 'Sin zona';
    const cadena = pdv?.cadena_id ? (cadenaById.get(pdv.cadena_id) ?? 'Sin cadena') : 'Sin cadena';

    return [
      {
        fechaOperacion: assignment.fecha,
        weekBucket: getWeekStartIso(assignment.fecha),
        cuentaClienteId: assignment.cuenta_cliente_id,
        empleadoId: assignment.empleado_id,
        empleadoLabel: employee.nombre_completo,
        empleadoNombre: employee.nombre_completo,
        idNomina: employee.id_nomina ?? null,
        pdvId: assignment.pdv_id,
        pdvLabel: `${pdv?.clave_btl ?? 'SIN BTL'} - ${pdv?.nombre ?? 'PDV sin nombre'}`,
        pdvNombre: pdv?.nombre ?? null,
        pdvClaveBtl: pdv?.clave_btl ?? null,
        supervisorId: assignment.supervisor_empleado_id ?? employee.supervisor_empleado_id ?? null,
        supervisorLabel: inferSupervisorLabel(
          assignment.supervisor_empleado_id ?? employee.supervisor_empleado_id ?? null,
          employeeById
        ),
        zona,
        cadena,
        objetivo,
        ausenciaTipo: absenceType ?? null,
        ausenciaDescuento: isExclType ? 3 : 0,
        ausenciaObservacion: absenceObs,
        estatusLaboral: employee.estatus_laboral ?? 'ACTIVO',
      } satisfies LoveQuotaTargetRow,
    ];
  });

  return { data: rows, error: null };
}

export function computeLoveQuotaProgress(actual: number, objetivo: number) {
  const safeActual = Math.max(0, Math.round(actual));
  const safeObjetivo = Math.max(0, Math.round(objetivo));
  const cumplimientoPct =
    safeObjetivo > 0 ? Math.round((safeActual / safeObjetivo) * 10000) / 100 : 0;

  return {
    actual: safeActual,
    objetivo: safeObjetivo,
    restante: Math.max(safeObjetivo - safeActual, 0),
    cumplimientoPct,
  };
}
