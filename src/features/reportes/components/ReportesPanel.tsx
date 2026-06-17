'use client';

import { useCallback, useMemo, useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card';
import type { ActorActual } from '@/lib/auth/session';
import { useScopedWidgetData } from '@/lib/ui-change/client';
import { getUiChangeScopeKeysForActor } from '@/lib/ui-change/types';
import type { AsistenciaReporteItem, ReportesPanelData } from '../services/reporteService';
import type { ExportFormat, ExportSectionKey } from '../services/reporteExport';
import { ExportLastMilePptButton } from './ExportLastMilePptButton';
import { MecanicasReportSection } from './MecanicasReportSection';
import { CapturaPublicaReportSection } from './CapturaPublicaReportSection';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFriendlyPeriod(period: string) {
  if (!period) return '';
  const parts = period.split('-');
  const yearNum = Number(parts[0]);
  const monthNum = Number(parts[1]);
  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  if (yearNum && monthNum && monthNum >= 1 && monthNum <= 12) {
    return `${monthNames[monthNum - 1]} ${yearNum}`;
  }
  return period;
}

function buildPageHref(periodo: string, pageSize: number, page: number, tipoDispersion?: string) {
  const params = new URLSearchParams({ periodo, pageSize: String(pageSize), page: String(page) });
  if (tipoDispersion) {
    params.set('tipoDispersion', tipoDispersion);
  }
  return `/reportes?${params.toString()}`;
}

function buildExportHref(section: ExportSectionKey, periodo: string, format: ExportFormat) {
  const params = new URLSearchParams({ section, periodo, format });
  return `/api/reportes/export?${params.toString()}`;
}

function buildLastMileExcelHref(periodo: string, cuentaClienteId?: string | null, tipoDispersion?: string) {
  const params = new URLSearchParams({ periodo });
  if (cuentaClienteId) {
    params.set('cuentaClienteId', cuentaClienteId);
  }
  if (tipoDispersion) {
    params.set('tipoDispersion', tipoDispersion);
  }

  return `/api/reportes/ultima-milla-xlsx?${params.toString()}`;
}

export function ReportesPanel({
  actor,
  data: initialData,
}: {
  actor: ActorActual;
  data: ReportesPanelData;
}) {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const scopeKeys = useMemo(() => getUiChangeScopeKeysForActor(actor), [actor]);
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const target = queryString ? `/api/reportes/panel?${queryString}` : '/api/reportes/panel';
      const response = await fetch(target, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      const payload = (await response.json()) as { data?: ReportesPanelData; message?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? 'No fue posible refrescar el panel de reportes.');
      }

      return payload.data;
    },
    [queryString]
  );

  const { data } = useScopedWidgetData({
    initialData,
    module: 'reportes',
    surfaces: ['panel'],
    scopeKeys,
    roleTargets: [actor.puesto],
    fetcher,
    debounceMs: 650,
  });

  const [localPeriodo, setLocalPeriodo] = useState(data.filtros.periodo);
  const [localTipoDispersion, setLocalTipoDispersion] = useState(data.filtros.tipoDispersion || 'MENSUAL');
  const [showMecanicas, setShowMecanicas] = useState(false);

  useEffect(() => {
    if (data.filtros.periodo) {
      setLocalPeriodo(data.filtros.periodo);
    }
  }, [data.filtros.periodo]);

  useEffect(() => {
    if (data.filtros.tipoDispersion) {
      setLocalTipoDispersion(data.filtros.tipoDispersion);
    }
  }, [data.filtros.tipoDispersion]);

  const periodOptions = useMemo(() => {
    const options = [];
    const baseDate = new Date();
    const currentYear = baseDate.getFullYear();
    const monthNames = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];

    for (let m = 0; m < 12; m++) {
      const val = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
      options.push({
        value: val,
        label: `${monthNames[m]} ${currentYear}`,
      });
    }

    if (data.filtros.periodo && !options.some((opt) => opt.value === data.filtros.periodo)) {
      const parts = data.filtros.periodo.split('-');
      const yearNum = Number(parts[0]);
      const monthNum = Number(parts[1]);
      if (yearNum && monthNum && monthNum >= 1 && monthNum <= 12) {
        options.push({
          value: data.filtros.periodo,
          label: `${monthNames[monthNum - 1]} ${yearNum}`,
        });
      }
    }

    return options.sort((a, b) => a.value.localeCompare(b.value));
  }, [data.filtros.periodo]);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-slate-50">
        <form
          action="/reportes"
          method="get"
          className="grid gap-4 p-6 md:grid-cols-[1fr_200px_200px_auto] md:items-end"
        >
          <div>
            <label htmlFor="periodo" className="mb-1.5 block text-sm font-medium text-slate-900">
              Periodo obligatorio
            </label>
            <input
              id="periodo"
              name="periodo"
              type="month"
              required
              defaultValue={data.filtros.periodo}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"
            />
            <p className="mt-2 text-xs text-slate-500">
              El modulo exige periodo minimo para no disparar consultas pesadas fuera de contexto
              operativo.
            </p>
          </div>
          <div>
            <label htmlFor="tipoDispersion" className="mb-1.5 block text-sm font-medium text-slate-900">
              Tipo de dispersión
            </label>
            <select
              id="tipoDispersion"
              name="tipoDispersion"
              defaultValue={data.filtros.tipoDispersion || 'MENSUAL'}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:outline-none focus:border-slate-400"
            >
              <option value="MENSUAL">Mensual</option>
              <option value="ADICIONAL">Campaña Adicional</option>
              <option value="EXCLUSIVA_CANJES">Exclusiva Canjes</option>
              <option value="EXCLUSIVA_TESTERS">Exclusiva Testers</option>
              <option value="EXCLUSIVA_REGALOS">Exclusiva Regalos</option>
              <option value="OTRA">Otra</option>
            </select>
          </div>
          <div>
            <label htmlFor="pageSize" className="mb-1.5 block text-sm font-medium text-slate-900">
              Filas por reporte
            </label>
            <select
              id="pageSize"
              name="pageSize"
              defaultValue={String(data.filtros.pageSize)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"
            >
              {[10, 25, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <input type="hidden" name="page" value="1" />
            <Button type="submit">Aplicar filtros</Button>
          </div>
        </form>
      </Card>

      <PaginationCard data={data} />

      {data.cargaDiferida && data.mensajeCargaDiferida && (
        <Card className="border-sky-200 bg-sky-50 text-sky-900">
          <p className="font-medium">Carga diferida</p>
          <p className="mt-2 text-sm">{data.mensajeCargaDiferida}</p>
        </Card>
      )}

      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <MetricCard label="Jornadas validas" value={String(data.resumen.jornadasValidas)} />
        <MetricCard label="Jornadas pendientes" value={String(data.resumen.jornadasPendientes)} />
        <MetricCard label="Ventas confirmadas" value={String(data.resumen.ventasConfirmadas)} />
        <MetricCard label="Monto confirmado" value={formatCurrency(data.resumen.montoConfirmado)} />
        <MetricCard label="Cuotas cumplidas" value={String(data.resumen.cuotasCumplidas)} />
        <MetricCard
          label="Gastos reembolsados"
          value={formatCurrency(data.resumen.gastosReembolsados)}
        />
        <MetricCard label="Neto nomina" value={formatCurrency(data.resumen.netoNominaEstimado)} />
      </div>

      <Card className="overflow-hidden p-0">
        <SectionHeader
          title="Consolidado por cliente"
          description="Vista ejecutiva para asistencia, ventas, cumplimiento de cuotas y neto estimado de nomina por cartera."
          summary={`Mostrando ${data.clientes.length} de ${data.paginacion.totalClientes}`}
          exportAction={<ExportActions section="clientes" periodo={data.filtros.periodo} />}
        />
        <SimpleTable
          headers={['Cliente', 'Jornadas', 'Ventas', 'Cuotas', 'Neto']}
          emptyMessage="Sin datos consolidados visibles todavia."
          columnCount={5}
          rows={data.clientes.map((item) => ({
            key: item.identificador ?? item.cuentaCliente,
            cells: [
              <div key="cliente" className="text-slate-600">
                <div className="font-medium text-slate-900">{item.cuentaCliente}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {item.identificador ?? 'sin identificador'}
                </div>
              </div>,
              <div key="jornadas" className="text-slate-600">
                <div>{item.jornadasValidas} validas</div>
                <div className="mt-1 text-xs text-amber-700">
                  {item.jornadasPendientes} pendientes
                </div>
              </div>,
              <div key="ventas" className="text-slate-600">
                <div>{item.ventasConfirmadas} confirmadas</div>
                <div className="mt-1 text-xs text-slate-400">
                  {formatCurrency(item.montoConfirmado)}
                </div>
              </div>,
              <span key="cuotas" className="text-slate-600">
                {item.cuotasCumplidas}
              </span>,
              <span key="neto" className="font-medium text-slate-900">
                {formatCurrency(item.netoNominaEstimado)}
              </span>,
            ],
          }))}
        />
      </Card>

      <Card className="overflow-hidden border-slate-200 bg-white">
        <SectionHeader
          title="Calendario operativo mensual"
          description="Exportacion matricial para cliente con sucursal de referencia, supervisor, observaciones operativas y un dia por columna usando la asignacion diaria materializada."
          summary={`Periodo ${data.filtros.periodo}. Sirve para mes corriente o posterior sin recalcular fuera del mes visible.`}
          exportAction={
            <ExportActions
              section="calendario_operativo"
              periodo={data.filtros.periodo}
              formats={['csv', 'xlsx']}
            />
          }
        />
        <div className="px-6 py-5 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Incluye:</p>
          <p className="mt-2">
            Cadena, PDV de referencia, sucursal, nombre DC, identificador, rol, supervisor,
            coordinador, ciudad, horario, dias, descanso, observaciones y la matriz diaria del mes
            con codigos como <span className="font-medium">1</span>,{' '}
            <span className="font-medium">DES</span>, <span className="font-medium">INC</span>,{' '}
            <span className="font-medium">VAC</span>, <span className="font-medium">FOR</span>,{' '}
            <span className="font-medium">JUS</span> y <span className="font-medium">FAL</span>.
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden border-slate-200 bg-white">
        <SectionHeader
          title="Evidencias de Última Milla"
          description="Exportación de reportes fotográficos y detalle completo de dispersiones en presentación o Excel."
          summary={`Periodo ${formatFriendlyPeriod(localPeriodo)}. El PPT genera una diapositiva por entrega y el Excel incluye dispersiones, cantidades, entregas y evidencias.`}
          exportAction={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label htmlFor="last-mile-month" className="text-xs font-medium text-slate-500">
                  Mes:
                </label>
                <select
                  id="last-mile-month"
                  value={localPeriodo}
                  onChange={(e) => setLocalPeriodo(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 focus:outline-none"
                >
                  {periodOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="last-mile-type" className="text-xs font-medium text-slate-500">
                  Tipo:
                </label>
                <select
                  id="last-mile-type"
                  value={localTipoDispersion}
                  onChange={(e) => setLocalTipoDispersion(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 focus:outline-none"
                >
                  <option value="MENSUAL">Mensual</option>
                  <option value="ADICIONAL">Campaña Adicional</option>
                  <option value="EXCLUSIVA_CANJES">Exclusiva Canjes</option>
                  <option value="EXCLUSIVA_TESTERS">Exclusiva Testers</option>
                  <option value="EXCLUSIVA_REGALOS">Exclusiva Regalos</option>
                  <option value="OTRA">Otra</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <ExportLastMilePptButton
                  periodo={localPeriodo}
                  cuentaClienteId={actor.cuentaClienteId}
                  tipoDispersion={localTipoDispersion}
                />
                <ExportLink
                  href={buildLastMileExcelHref(localPeriodo, actor.cuentaClienteId, localTipoDispersion)}
                  label="Excel"
                />
              </div>
            </div>
          }
        />
        <div className="px-6 py-5 text-sm text-slate-600">
          <p className="font-medium text-slate-900">El reporte incluye:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Diapositiva por cada recepción completada en el periodo.</li>
            <li>
              Excel con renglón por dispersión y material, cantidades teóricas, reales y
              diferencias.
            </li>
            <li>Fotografía de acuse de recibido (formato vertical).</li>
            <li>Fotografía con la colaboradora (formato vertical).</li>
            <li>
              Información del Punto de Venta (PDV) y de la Dermoconsejera que firmó la recepción.
            </li>
          </ul>
        </div>
      </Card>

      <ReportSection
        title="Entregas de materiales realizadas"
        description="Estado operativo de ultima milla por PDV, receptor y cantidades sincronizadas."
        summary={`Mostrando ${data.materialesUltimaMilla.length} de ${data.paginacion.totalMaterialesUltimaMilla}`}
        headers={['Fecha', 'PDV', 'Receptor', 'Estado', 'Cantidades']}
        emptyMessage="Sin entregas de materiales sincronizadas para el periodo."
        columnCount={5}
        rows={data.materialesUltimaMilla.map((item) => ({
          key: `${item.capturadoEn}-${item.pdv}-${item.receptor}`,
          cells: [
            <span key="fecha" className="text-slate-600">
              {formatDate(item.capturadoEn)}
            </span>,
            <span key="pdv" className="text-slate-600">
              {item.pdv}
            </span>,
            <span key="receptor" className="text-slate-600">
              {item.receptor}
            </span>,
            <span key="estado" className="font-medium text-emerald-700">
              {item.estado}
            </span>,
            <div key="cantidades" className="text-slate-600">
              <div>
                {item.totalRecibido}/{item.totalTeorico} piezas
              </div>
              <div
                className={`mt-1 text-xs ${item.diferencia === 0 ? 'text-emerald-700' : 'text-amber-700'}`}
              >
                {item.diferencia === 0 ? '100% entregado' : `Diferencia ${item.diferencia}`}
              </div>
            </div>,
          ],
        }))}
      />

      <ReportSection
        title="Reporte de asistencias"
        description="Consolidado por empleado, PDV y periodo con desglose de validadas, retardos, justificadas y faltas."
        summary={`Mostrando ${data.asistencias.length} de ${data.paginacion.totalAsistencias}`}
        exportSection="asistencias"
        periodo={data.filtros.periodo}
        headers={['Periodo', 'Empleado', 'Cliente', 'PDV', 'Totales']}
        emptyMessage="Sin asistencias visibles todavia."
        columnCount={5}
        rows={data.asistencias.map((item) => ({
          key: `${item.periodo}-${item.empleadoId ?? item.idNomina ?? item.empleado}-${item.pdv}`,
          cells: [
            <span key="periodo" className="text-slate-600">
              {item.periodo}
            </span>,
            <div key="empleado" className="text-slate-600">
              <div className="font-medium text-slate-900">{item.empleado}</div>
              <div className="mt-1 text-xs text-slate-400">
                {item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}
              </div>
            </div>,
            <span key="cliente" className="text-slate-600">
              {item.cuentaCliente ?? 'Sin cliente'}
            </span>,
            <span key="pdv" className="text-slate-600">
              {item.pdv}
            </span>,
            <AttendanceTotals key="totales" item={item} />,
          ],
        }))}
      />
      <ReportSection
        title="Reporte de ventas"
        description="Consolidado por producto, PDV, DC y periodo para exportacion operativa inmediata."
        summary={`Mostrando ${data.ventas.length} de ${data.paginacion.totalVentas}`}
        exportSection="ventas"
        periodo={data.filtros.periodo}
        headers={['Periodo', 'DC', 'Cliente', 'PDV / Producto', 'Cierres']}
        emptyMessage="Sin ventas confirmadas visibles todavia."
        columnCount={5}
        rows={data.ventas.map((item) => ({
          key: `${item.periodo}-${item.empleadoId ?? item.idNomina ?? item.dc}-${item.pdv}-${item.producto}`,
          cells: [
            <span key="periodo" className="text-slate-600">
              {item.periodo}
            </span>,
            <div key="dc" className="text-slate-600">
              <div className="font-medium text-slate-900">{item.dc}</div>
              <div className="mt-1 text-xs text-slate-400">
                {item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}
              </div>
            </div>,
            <span key="cliente" className="text-slate-600">
              {item.cuentaCliente ?? 'Sin cliente'}
            </span>,
            <div key="producto" className="text-slate-600">
              <div>{item.pdv}</div>
              <div className="mt-1 text-xs text-slate-400">{item.producto}</div>
            </div>,
            <div key="cierres" className="text-slate-600">
              <div>{item.ventasConfirmadas} confirmadas</div>
              <div className="mt-1 text-xs text-slate-400">{item.unidadesConfirmadas} uds</div>
              <div className="mt-1 text-xs font-medium text-emerald-700">
                {formatCurrency(item.montoConfirmado)}
              </div>
            </div>,
          ],
        }))}
      />
      <ReportSection
        title="Reporte de cumplimiento de campanas"
        description="Seguimiento por campana y PDV dentro del periodo filtrado."
        summary={`Mostrando ${data.campanas.length} de ${data.paginacion.totalCampanas}`}
        exportSection="campanas"
        periodo={data.filtros.periodo}
        headers={['Periodo', 'Campana', 'PDV', 'DC', 'Pendientes', 'Avance']}
        emptyMessage="Sin campanas visibles en el periodo seleccionado."
        columnCount={6}
        rows={data.campanas.map((item) => ({
          key: `${item.periodo}-${item.campana}-${item.pdv}`,
          cells: [
            <span key="periodo" className="text-slate-600">
              {item.periodo}
            </span>,
            <span key="campana" className="font-medium text-slate-900">
              {item.campana}
            </span>,
            <span key="pdv" className="text-slate-600">
              {item.pdv}
            </span>,
            <div key="dc" className="text-slate-600">
              <div>{item.dc ?? 'Sin DC visible'}</div>
              <div className="mt-1 text-xs text-slate-400">{item.estatus}</div>
            </div>,
            <span key="pendientes" className="text-slate-600">
              {item.tareasPendientes} tareas / {item.evidenciasPendientes} evidencias
            </span>,
            <span key="avance" className="font-medium text-slate-900">
              {item.avancePorcentaje.toFixed(2)}%
            </span>,
          ],
        }))}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <SectionHeader
            title="Ranking comercial"
            description="Top de colaboradoras por monto confirmado y unidades cerradas."
            summary={`Mostrando ${data.rankingVentas.length} de ${data.paginacion.totalRankingVentas}`}
            exportAction={<ExportActions section="ranking_ventas" periodo={data.filtros.periodo} />}
          />
          <SimpleTable
            headers={['Colaborador', 'Cliente', 'Volumen', 'Monto']}
            emptyMessage="Sin ventas confirmadas visibles todavia."
            columnCount={4}
            rows={data.rankingVentas.map((item) => ({
              key: `${item.empleadoId ?? item.idNomina ?? item.empleado}-${item.cuentaCliente ?? 'sin-cuenta'}`,
              cells: [
                <div key="colaborador" className="text-slate-600">
                  <div className="font-medium text-slate-900">{item.empleado}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}
                  </div>
                </div>,
                <span key="cliente" className="text-slate-600">
                  {item.cuentaCliente ?? 'Sin cliente'}
                </span>,
                <div key="volumen" className="text-slate-600">
                  <div>{item.ventasConfirmadas} cierres</div>
                  <div className="mt-1 text-xs text-slate-400">{item.unidadesConfirmadas} uds</div>
                </div>,
                <span key="monto" className="font-medium text-emerald-700">
                  {formatCurrency(item.montoConfirmado)}
                </span>,
              ],
            }))}
          />
        </Card>
        <Card className="overflow-hidden p-0">
          <SectionHeader
            title="Ranking de cumplimiento"
            description="Seguimiento de cuota, bono estimado y disciplina operativa por colaboradora."
            summary={`Mostrando ${data.rankingCuotas.length} de ${data.paginacion.totalRankingCuotas}`}
            exportAction={<ExportActions section="ranking_cuotas" periodo={data.filtros.periodo} />}
          />
          <SimpleTable
            headers={['Colaborador', 'Cliente', 'Cuota', 'Disciplina']}
            emptyMessage="Sin cuotas visibles todavia."
            columnCount={4}
            rows={data.rankingCuotas.map((item) => ({
              key: `${item.empleadoId ?? item.idNomina ?? item.empleado}-${item.cuentaCliente ?? 'sin-cuenta'}`,
              cells: [
                <div key="colaborador" className="text-slate-600">
                  <div className="font-medium text-slate-900">{item.empleado}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}
                  </div>
                </div>,
                <span key="cliente" className="text-slate-600">
                  {item.cuentaCliente ?? 'Sin cliente'}
                </span>,
                <div key="cuota" className="text-slate-600">
                  <div className="font-medium text-slate-900">{item.cumplimiento.toFixed(2)}%</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {item.cuotaEstado} / bono {formatCurrency(item.bonoEstimado)}
                  </div>
                </div>,
                <div key="jornadas" className="text-slate-600">
                  <div>{item.jornadasValidas} validas</div>
                  <div className="mt-1 text-xs text-amber-700">
                    {item.jornadasPendientes} pendientes
                  </div>
                  <div className="mt-1 text-xs text-sky-700">{item.retardos} retardos</div>
                  <div className="mt-1 text-xs text-violet-700">
                    {item.ausenciasJustificadas} justificadas
                  </div>
                  <div className="mt-1 text-xs text-rose-700">{item.faltas} faltas</div>
                </div>,
              ],
            }))}
          />
        </Card>
      </div>

      <ReportSection
        title="Reporte de gastos"
        description="Consolidado por periodo, zona y tipo para seguimiento de gasto operativo y reembolsos."
        summary={`Mostrando ${data.gastos.length} de ${data.paginacion.totalGastos}`}
        exportSection="gastos"
        periodo={data.filtros.periodo}
        headers={['Periodo', 'Zona', 'Tipo', 'Registros', 'Solicitado', 'Aprobado', 'Reembolsado']}
        emptyMessage="Sin gastos operativos visibles todavia."
        columnCount={7}
        rows={data.gastos.map((item) => ({
          key: `${item.periodo}-${item.zona}-${item.tipo}`,
          cells: [
            <span key="periodo" className="text-slate-600">
              {item.periodo}
            </span>,
            <span key="zona" className="text-slate-600">
              {item.zona}
            </span>,
            <span key="tipo" className="text-slate-600">
              {item.tipo}
            </span>,
            <span key="registros" className="text-slate-600">
              {item.registros}
            </span>,
            <span key="solicitado" className="text-slate-600">
              {formatCurrency(item.montoSolicitado)}
            </span>,
            <span key="aprobado" className="text-slate-600">
              {formatCurrency(item.montoAprobado)}
            </span>,
            <span key="reembolsado" className="font-medium text-emerald-700">
              {formatCurrency(item.montoReembolsado)}
            </span>,
          ],
        }))}
      />
      <ReportSection
        title="Reporte LOVE ISDIN semanal"
        description="Afiliaciones semanales por DC y PDV con meta, cumplimiento y contexto operativo."
        summary={`Mostrando ${data.love.length} de ${data.paginacion.totalLove}`}
        exportSection="love"
        periodo={data.filtros.periodo}
        headers={[
          'Semana',
          'DC',
          'Supervisor',
          'Zona',
          'Cadena',
          'PDV',
          'Afiliaciones',
          'Meta',
          'Pendiente',
          'Cumplimiento',
          'Validas',
          'Pendientes',
          'Duplicadas',
        ]}
        emptyMessage="Sin afiliaciones LOVE visibles todavia."
        columnCount={13}
        rows={data.love.map((item) => ({
          key: `${item.semanaInicio}-${item.dc}-${item.pdv}`,
          cells: [
            <span key="periodo" className="text-slate-600">
              {item.periodo}
            </span>,
            <span key="dc" className="text-slate-600">
              {item.dc}
            </span>,
            <span key="supervisor" className="text-slate-600">
              {item.supervisor}
            </span>,
            <span key="zona" className="text-slate-600">
              {item.zona}
            </span>,
            <span key="cadena" className="text-slate-600">
              {item.cadena}
            </span>,
            <span key="pdv" className="text-slate-600">
              {item.pdv}
            </span>,
            <span key="afiliaciones" className="text-slate-600">
              {item.afiliaciones}
            </span>,
            <span key="meta" className="text-sky-700">
              {item.objetivoSemanal}
            </span>,
            <span key="pendiente" className="text-amber-700">
              {item.restanteObjetivo}
            </span>,
            <span key="cumplimiento" className="text-slate-600">
              {item.cumplimientoPct.toFixed(2)}%
            </span>,
            <span key="validas" className="text-emerald-700">
              {item.validas}
            </span>,
            <span key="pendientes" className="text-amber-700">
              {item.pendientes}
            </span>,
            <span key="duplicadas" className="text-rose-700">
              {item.duplicadas}
            </span>,
          ],
        }))}
      />

      {showMecanicas ? (
        <Card className="p-6 overflow-hidden border-slate-200 bg-white transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Levantamiento de Uniformes de Supervisores</h2>
              <p className="text-sm text-slate-500">
                Confirmaciones de prendas, géneros y tallas enviadas por el equipo de 19 supervisores oficiales.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMecanicas(false)}
              className="w-full sm:w-auto min-h-10 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-full"
            >
              🙈 Ocultar reporte
            </Button>
          </div>
          <MecanicasReportSection />
        </Card>
      ) : (
        <Card className="p-6 border-slate-200 bg-white flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center transition-all duration-300 hover:border-slate-300">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Levantamiento de Uniformes de Supervisores</h2>
            <p className="text-sm text-slate-500 mt-1">
              Visualiza la participación, el consolidado de proveeduría y el desglose de uniformes en tiempo real.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowMecanicas(true)}
            className="w-full sm:w-auto min-h-11 px-6 text-xs font-bold bg-slate-950 hover:bg-slate-900 text-white rounded-full transition-all"
          >
            🔍 Cargar reporte bajo demanda
          </Button>
        </Card>
      )}

      <Card className="p-6 overflow-hidden border-slate-200 bg-white">
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">📊</span>
            <h2 className="text-lg font-semibold text-slate-950">Reporte de Capturas de Campo</h2>
          </div>
          <p className="text-sm text-slate-500">
            Registros de ventas, canjes (con ticket, sin ticket, fuera de jornada), desabasto y Love
            ISDIN enviados desde el portal de campo por las dermoconsejeras.
          </p>
        </div>
        <CapturaPublicaReportSection />
      </Card>

      <ReportSection
        title="Reporte de nomina"
        description="Resumen por empleado y periodo sobre percepciones, deducciones, neto y disciplina operativa resuelta."
        summary={`Mostrando ${data.nomina.length} de ${data.paginacion.totalNomina}`}
        exportSection="nomina"
        periodo={data.filtros.periodo}
        headers={[
          'Periodo',
          'Empleado',
          'Cliente',
          'Percepciones',
          'Deducciones',
          'Neto',
          'Disciplina',
          'Movimientos',
        ]}
        emptyMessage="Sin datos de nomina visibles todavia."
        columnCount={8}
        rows={data.nomina.map((item) => ({
          key: `${item.periodo}-${item.empleadoId ?? item.idNomina ?? item.empleado}-${item.cuentaCliente ?? 'sin-cuenta'}`,
          cells: [
            <span key="periodo" className="text-slate-600">
              {item.periodo}
            </span>,
            <div key="empleado" className="text-slate-600">
              <div className="font-medium text-slate-900">{item.empleado}</div>
              <div className="mt-1 text-xs text-slate-400">
                {item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}
              </div>
            </div>,
            <span key="cliente" className="text-slate-600">
              {item.cuentaCliente ?? 'Sin cliente'}
            </span>,
            <span key="percepciones" className="text-emerald-700">
              {formatCurrency(item.percepciones)}
            </span>,
            <span key="deducciones" className="text-rose-700">
              {formatCurrency(item.deducciones)}
            </span>,
            <span key="neto" className="font-medium text-slate-900">
              {formatCurrency(item.neto)}
            </span>,
            <div key="disciplina" className="text-slate-600">
              <div>{item.jornadasValidas} validas</div>
              <div className="mt-1 text-xs text-amber-700">
                {item.jornadasPendientes} pendientes
              </div>
              <div className="mt-1 text-xs text-sky-700">{item.retardos} retardos</div>
              <div className="mt-1 text-xs text-violet-700">
                {item.ausenciasJustificadas} justificadas
              </div>
              <div className="mt-1 text-xs text-rose-700">{item.faltas} faltas</div>
            </div>,
            <span key="movimientos" className="text-slate-600">
              {item.movimientos}
            </span>,
          ],
        }))}
      />
      <ReportSection
        title="Bitacora reciente"
        description="Eventos recientes de auditoria para seguimiento administrativo y trazabilidad del flujo operativo."
        summary={`Mostrando ${data.bitacora.length} de ${data.paginacion.totalBitacora}`}
        exportSection="bitacora"
        periodo={data.filtros.periodo}
        headers={['Fecha', 'Tabla', 'Accion', 'Actor', 'Resumen']}
        emptyMessage="Sin eventos de bitacora visibles todavia."
        columnCount={5}
        rows={data.bitacora.map((item) => ({
          key: String(item.id),
          cells: [
            <span key="fecha" className="text-slate-600">
              {formatDate(item.fecha)}
            </span>,
            <div key="tabla" className="text-slate-600">
              <div className="font-medium text-slate-900">{item.tabla}</div>
              <div className="mt-1 text-xs text-slate-400">{item.registroId ?? 'sin registro'}</div>
            </div>,
            <span key="accion" className="text-slate-600">
              {item.accion}
            </span>,
            <div key="actor" className="text-slate-600">
              <div>{item.usuario ?? 'sistema'}</div>
              <div className="mt-1 text-xs text-slate-400">
                {item.cuentaCliente ?? 'sin cliente'}
              </div>
            </div>,
            <span key="resumen" className="text-slate-600">
              {item.resumen}
            </span>,
          ],
        }))}
      />

      <PaginationCard data={data} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />;
}

function AttendanceTotals({ item }: { item: AsistenciaReporteItem }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <InlineStat label="Total" value={String(item.totalJornadas)} tone="slate" />
      <InlineStat label="Validas" value={String(item.jornadasValidas)} tone="emerald" />
      <InlineStat label="Cerradas" value={String(item.jornadasCerradas)} tone="sky" />
      <InlineStat label="Pendientes" value={String(item.jornadasPendientes)} tone="amber" />
      <InlineStat label="Retardos" value={String(item.retardos)} tone="violet" />
      <InlineStat label="Faltas" value={String(item.faltas)} tone="rose" />
    </div>
  );
}

function InlineStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'emerald' | 'sky' | 'amber' | 'violet' | 'rose';
}) {
  const toneClasses: Record<'slate' | 'emerald' | 'sky' | 'amber' | 'violet' | 'rose', string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClasses[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      {label}
    </Link>
  );
}

function ExportActions({
  section,
  periodo,
  formats = ['pdf', 'csv', 'xlsx'],
}: {
  section: ExportSectionKey;
  periodo: string;
  formats?: ExportFormat[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {formats.map((format) => (
        <ExportLink
          key={format}
          href={buildExportHref(section, periodo, format)}
          label={format.toUpperCase()}
        />
      ))}
    </div>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled)
    return (
      <span className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-400">
        {children}
      </span>
    );
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

type TableRow = { key: string; cells: ReactNode[] };

function ReportSection({
  title,
  description,
  summary,
  exportSection,
  periodo,
  headers,
  rows,
  emptyMessage,
  columnCount,
}: {
  title: string;
  description: string;
  summary?: string;
  exportSection?: ExportSectionKey;
  periodo?: string;
  headers: string[];
  rows: TableRow[];
  emptyMessage: string;
  columnCount: number;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader
        title={title}
        description={description}
        summary={summary}
        exportAction={
          exportSection && periodo ? (
            <ExportActions section={exportSection} periodo={periodo} />
          ) : undefined
        }
      />
      <SimpleTable
        headers={headers}
        rows={rows}
        emptyMessage={emptyMessage}
        columnCount={columnCount}
      />
    </Card>
  );
}

function SimpleTable({
  headers,
  rows,
  emptyMessage,
  columnCount,
}: {
  headers: string[];
  rows: TableRow[];
  emptyMessage: string;
  columnCount: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-6 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-6 py-8 text-center text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100 align-top">
                {row.cells.map((cell, index) => (
                  <td key={`${row.key}-${index}`} className="px-6 py-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaginationCard({ data }: { data: ReportesPanelData }) {
  const canPrev = data.paginacion.page > 1;
  const canNext = data.paginacion.page < data.paginacion.totalPages;

  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">Paginacion global de reportes</p>
          <p className="mt-1 text-xs text-slate-500">
            Pagina {data.paginacion.page} de {data.paginacion.totalPages} |{' '}
            {data.paginacion.pageSize} filas maximas por reporte | periodo {data.filtros.periodo}
          </p>
        </div>
        <div className="flex gap-3">
          <PaginationLink
            href={buildPageHref(
              data.filtros.periodo,
              data.filtros.pageSize,
              Math.max(1, data.paginacion.page - 1),
              data.filtros.tipoDispersion
            )}
            disabled={!canPrev}
          >
            Anterior
          </PaginationLink>
          <PaginationLink
            href={buildPageHref(
              data.filtros.periodo,
              data.filtros.pageSize,
              Math.min(data.paginacion.totalPages, data.paginacion.page + 1),
              data.filtros.tipoDispersion
            )}
            disabled={!canNext}
          >
            Siguiente
          </PaginationLink>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({
  title,
  description,
  summary,
  exportAction,
}: {
  title: string;
  description: string;
  summary?: string;
  exportAction?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        {summary && <p className="mt-1 text-xs text-slate-400">{summary}</p>}
      </div>
      {exportAction}
    </div>
  );
}
