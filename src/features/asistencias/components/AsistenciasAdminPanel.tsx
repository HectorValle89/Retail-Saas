'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ModalPanel } from '@/components/ui/modal-panel';
import type {
  AttendanceAdminDayCell,
  AttendanceAdminDayDetail,
  AttendanceAdminMonthData,
} from '@/features/asistencias/services/attendanceAdminService';

function buildSearchHref(
  data: AttendanceAdminMonthData,
  overrides: Record<string, string | null | undefined>
) {
  const params = new URLSearchParams();
  const next = {
    month: data.filters.month,
    supervisorId: data.filters.supervisorId ?? '',
    cadena: data.filters.cadena ?? '',
    ciudad: data.filters.ciudad ?? '',
    zona: data.filters.zona ?? '',
    estadoDia: data.filters.estadoDia ?? '',
    ...overrides,
  };

  for (const [key, value] of Object.entries(next)) {
    if (!value) continue;
    params.set(key, value);
  }

  return `/asistencias${params.size > 0 ? `?${params.toString()}` : ''}`;
}

function shiftMonth(month: string, offset: number) {
  const value = new Date(`${month}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset, 1);
  return value.toISOString().slice(0, 7);
}

function formatMonthLabel(monthStr: string) {
  if (!monthStr) return 'Calendario mensual';
  const [year, month] = monthStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  const formatted = date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function cellClassName(cell: AttendanceAdminDayCell) {
  const tone = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100',
    amber: 'border-amber-300 bg-amber-100 text-amber-900 hover:border-amber-400 hover:bg-amber-200 font-bold',
    rose: 'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 hover:bg-rose-100',
    violet: 'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300 hover:bg-violet-100',
    sky: 'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100',
    slate: 'border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400 hover:bg-slate-200',
    neutral: 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50',
  }[cell.tone];

  return `flex min-h-7 min-w-7 w-full flex-col items-center justify-center overflow-hidden rounded-lg border text-[10px] font-bold leading-none transition focus:outline-none focus:ring-1 focus:ring-sky-400 hover:scale-105 hover:shadow-2xs cursor-pointer lg:min-h-7 lg:min-w-0 ${tone}`;
}

function buildEvidenceHref(item: AttendanceAdminDayDetail['evidencias'][number]) {
  const params = new URLSearchParams();
  params.set(
    'kind',
    item.kind === 'JUSTIFICANTE'
      ? 'justificante'
      : item.kind === 'SELFIE_OUT'
        ? 'check-out-thumbnail'
        : 'check-in-thumbnail'
  );

  if (item.kind === 'JUSTIFICANTE') {
    if (!item.requestId) return item.url;
    params.set('requestId', item.requestId);
  } else {
    if (!item.attendanceId) return item.url;
    params.set('attendanceId', item.attendanceId);
  }

  return `/api/asistencias/evidencia?${params.toString()}`;
}

export function AsistenciasAdminPanel({ data }: { data: AttendanceAdminMonthData }) {
  const [selectedCell, setSelectedCell] = useState<{
    empleadoId: string;
    nombre: string;
    fecha: string;
  } | null>(null);
  const [detail, setDetail] = useState<AttendanceAdminDayDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('month', data.filters.month);
    if (data.filters.supervisorId) params.set('supervisorId', data.filters.supervisorId);
    if (data.filters.cadena) params.set('cadena', data.filters.cadena);
    if (data.filters.ciudad) params.set('ciudad', data.filters.ciudad);
    if (data.filters.zona) params.set('zona', data.filters.zona);
    if (data.filters.estadoDia) params.set('estadoDia', data.filters.estadoDia);
    params.set('format', 'xlsx');
    return `/api/asistencias/export?${params.toString()}`;
  }, [data.filters]);

  const handleOpenDetail = (empleadoId: string, nombre: string, fecha: string) => {
    setSelectedCell({ empleadoId, nombre, fecha });
    setDetail(null);
    setDetailError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ empleadoId, fecha, month: data.month });
        const response = await fetch(`/api/asistencias/detalle?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as {
          detail?: AttendanceAdminDayDetail;
          error?: string;
        };
        if (!response.ok || !payload.detail) {
          setDetailError(payload.error ?? 'No fue posible cargar el detalle.');
          return;
        }
        setDetail(payload.detail);
      } catch (error) {
        setDetailError(
          error instanceof Error ? error.message : 'No fue posible cargar el detalle.'
        );
      }
    });
  };

  return (
    <div className="space-y-3">
      {!data.infraestructuraLista && data.mensajeInfraestructura ? (
        <Card className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
            Infraestructura pendiente
          </p>
          <p className="mt-1.5 text-xs leading-5 text-amber-900">{data.mensajeInfraestructura}</p>
        </Card>
      ) : null}

      {/* SECCIÓN SUPERIOR: CALENDARIO MENSUAL Y FILTROS */}
      <Card className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-xs text-sky-700">
              📅
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                {formatMonthLabel(data.month)}
              </h2>
              <p className="text-[11px] text-slate-500">
                {data.summary.empleadosVisibles} colaboradoras visibles · {data.summary.asistencias} asistencias · {data.summary.faltas} faltas
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={buildSearchHref(data, { month: shiftMonth(data.month, -1) })}
              className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              ← Mes anterior
            </Link>
            <Link
              href={buildSearchHref(data, { month: shiftMonth(data.month, 1) })}
              className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Mes siguiente →
            </Link>
            {data.canExport ? (
              <a
                href={exportHref}
                className="inline-flex h-8 items-center justify-center rounded-xl border border-emerald-600 bg-emerald-600 px-3 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700"
              >
                📊 Descargar Excel
              </a>
            ) : (
              <span className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-400">
                Exportación no disponible
              </span>
            )}
          </div>
        </div>

        {/* Formulario de filtros compacto */}
        <form
          action="/asistencias"
          method="get"
          className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 items-end"
        >
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Mes
            <input
              name="month"
              type="month"
              defaultValue={data.filters.month}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-sky-500 focus:outline-none"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Supervisor
            <select
              name="supervisorId"
              defaultValue={data.filters.supervisorId ?? ''}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-sky-500 focus:outline-none"
            >
              {data.supervisors.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Cadena
            <select
              name="cadena"
              defaultValue={data.filters.cadena ?? ''}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-sky-500 focus:outline-none"
            >
              {data.cadenas.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Ciudad
            <select
              name="ciudad"
              defaultValue={data.filters.ciudad ?? ''}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-sky-500 focus:outline-none"
            >
              {data.ciudades.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Zona
            <select
              name="zona"
              defaultValue={data.filters.zona ?? ''}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-sky-500 focus:outline-none"
            >
              {data.zonas.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Estado del día
            <select
              name="estadoDia"
              defaultValue={data.filters.estadoDia ?? ''}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-sky-500 focus:outline-none"
            >
              {data.estadosDia.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <Button type="submit" size="sm" className="h-8 rounded-xl px-3 text-xs font-bold">
              Filtrar
            </Button>
            <Link
              href="/asistencias"
              className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </Card>

      {/* SECCIÓN PRINCIPAL: MATRIZ COMPLETA DEL MES */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xs">
        <div className="border-b border-slate-200 px-4 py-2.5 bg-slate-50/50">
          <p className="text-xs font-bold text-slate-900">{formatMonthLabel(data.month)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Selecciona cualquier día para abrir el detalle consultivo de la jornada. El mes completo se ajusta al ancho en escritorio; en móvil puedes deslizar para conservar objetivos táctiles legibles.
          </p>
        </div>

        <div
          data-testid="monthly-attendance-scroll-container"
          className="overflow-x-auto lg:overflow-x-hidden"
        >
          <table
            data-testid="monthly-attendance-table"
            aria-label={`Matriz mensual de asistencias de ${formatMonthLabel(data.month)}`}
            className="min-w-[1300px] table-fixed border-separate border-spacing-0 text-xs lg:w-full lg:min-w-0"
          >
            <colgroup>
              <col className="w-[200px] lg:w-[170px] xl:w-[200px]" />
              <col className="w-[150px] lg:w-[130px] xl:w-[150px]" />
              <col className="w-[130px] lg:w-[110px] xl:w-[130px]" />
              {data.days.map((day) => (
                <col key={day.fecha} className="w-9 lg:w-auto" />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-30 border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                >
                  Colaboradora
                </th>
                <th
                  scope="col"
                  className="sticky left-[200px] lg:left-[170px] xl:left-[200px] z-30 border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                >
                  Supervisor
                </th>
                <th
                  scope="col"
                  className="sticky left-[350px] lg:left-[300px] xl:left-[350px] z-30 border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                >
                  Cadena
                </th>
                {data.days.map((day) => (
                  <th
                    key={day.fecha}
                    className="border-b border-r border-slate-200 px-px py-1 text-center bg-slate-50"
                  >
                    <div className="text-[8px] font-bold text-slate-500 xl:text-[9px]">
                      {day.weekdayLetter}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-950 xl:text-[11px]">
                      {day.dayNumber}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3 + data.days.length}
                    className="px-6 py-12 text-center text-sm text-slate-500"
                  >
                    No hay asistencias visibles con los filtros actuales.
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => (
                  <tr key={row.empleadoId} className="odd:bg-slate-50/30 hover:bg-sky-50/25 transition-colors">
                    <td
                      className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 transition"
                    >
                      <div className="truncate text-[11px] font-bold text-slate-950" title={row.nombre}>
                        {row.nombre}
                      </div>
                      <div className="mt-0.5 truncate text-[9px] font-medium text-slate-400">
                        {row.idNomina ? `ID ${row.idNomina}` : 'Sin nómina'}
                      </div>
                    </td>
                    <td
                      className="sticky left-[200px] lg:left-[170px] xl:left-[200px] z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 transition"
                    >
                      <div
                        className="truncate text-[10px] font-medium text-slate-700"
                        title={row.supervisor ?? 'Sin supervisor'}
                      >
                        {row.supervisor ?? 'Sin supervisor'}
                      </div>
                    </td>
                    <td
                      className="sticky left-[350px] lg:left-[300px] xl:left-[350px] z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 transition"
                    >
                      <div
                        className="truncate text-[10px] font-medium text-slate-700"
                        title={row.cadenaPrincipalMes ?? 'Sin cadena'}
                      >
                        {row.cadenaPrincipalMes ?? 'Sin cadena'}
                      </div>
                    </td>
                    {row.dias.map((day) => (
                      <td
                        key={day.fecha}
                        className="border-b border-r border-slate-200 px-0.5 py-1 text-center"
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(row.empleadoId, row.nombre, day.fecha)}
                          className={cellClassName(day)}
                          title={`${day.fecha} · ${day.label}`}
                        >
                          <span className="block max-w-full truncate">{day.codigo || '·'}</span>
                        </button>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Leyenda de estados */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-2.5 text-[11px] text-slate-600 bg-slate-50/40">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Leyenda:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-800">
            A · Asistencia
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 font-bold text-amber-900">
            R · Retardo
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 font-bold text-rose-800">
            F · Falta
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 font-bold text-slate-700">
            D · Descanso
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 font-bold text-sky-800">
            V · Vacaciones
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 font-bold text-violet-800">
            I · Incapacidad
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-bold text-amber-800">
            JUS · Justificada
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-slate-400">
            · · Sin registro
          </span>
        </div>
      </Card>

      <ModalPanel
        open={Boolean(selectedCell)}
        onClose={() => {
          setSelectedCell(null);
          setDetail(null);
          setDetailError(null);
        }}
        title={selectedCell ? `${selectedCell.nombre} · ${selectedCell.fecha}` : 'Detalle del día'}
        subtitle="Detalle consultivo de la jornada o excepción registrada."
        maxWidthClassName="max-w-4xl"
      >
        {isPending ? (
          <p className="text-sm text-slate-500">Cargando detalle...</p>
        ) : detailError ? (
          <p className="text-sm text-rose-700">{detailError}</p>
        ) : detail ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DetailCard label="Código" value={detail.codigo || 'Pendiente'} />
            <DetailCard label="Descripción" value={detail.descripcion} />
            <DetailCard label="Supervisor" value={detail.supervisor ?? 'Sin supervisor'} />
            <DetailCard label="PDV" value={detail.pdv ?? 'Sin PDV'} />
            <DetailCard
              label="Cadena / sucursal"
              value={`${detail.cadena ?? 'Sin cadena'} · ${detail.sucursal ?? 'Sin sucursal'}`}
            />
            <DetailCard label="Horario esperado" value={detail.horarioEsperado ?? 'Sin horario'} />
            <DetailCard label="Check-in" value={detail.checkIn ?? 'Sin registro'} />
            <DetailCard label="Check-out" value={detail.checkOut ?? 'Sin registro'} />
            <DetailCard
              label="GPS / biometría"
              value={`${detail.gps ?? 'Sin GPS'} · ${detail.biometria ?? 'Sin biometría'}`}
            />
            <DetailCard
              label="Origen"
              value={`${detail.sourceType}${detail.sourceId ? ` · ${detail.sourceId}` : ''}`}
              className="md:col-span-2 xl:col-span-3"
            />
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 md:col-span-2 xl:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Evidencias
              </p>
              {detail.evidencias.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No hay evidencias visibles para este día.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  {detail.evidencias.map((item) => (
                    <a
                      key={`${item.kind}-${item.url}`}
                      href={buildEvidenceHref(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Selecciona una celda para revisar el detalle.</p>
        )}
      </ModalPanel>
    </div>
  );
}

function DetailCard({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-[24px] border border-slate-200 bg-white px-5 py-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm leading-6 text-slate-900">{value}</p>
    </div>
  );
}
