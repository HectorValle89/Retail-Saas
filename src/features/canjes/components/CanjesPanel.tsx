'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  FilePpt,
  FileXls,
  Funnel,
  MagnifyingGlass,
  Receipt,
  Gift,
  Clock,
  Sparkle,
} from '@phosphor-icons/react';
import {
  obtenerDatosCanjes,
  type CanjesMetrics,
  type CanjeRecordItem,
} from '../services/canjesService';
import { generateCanjesPpt } from '@/features/reportes/services/pptExportService';
import { generarExcelCanjes } from '../services/canjesExportService';

function getInitialDates() {
  const now = new Date();
  const day = now.getDay();
  // Lunes de la semana actual
  const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diffToMonday));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    fechaInicio: monday.toISOString().slice(0, 10),
    fechaFin: sunday.toISOString().slice(0, 10),
  };
}

export function CanjesPanel() {
  const initialDates = getInitialDates();
  const [fechaInicio, setFechaInicio] = useState(initialDates.fechaInicio);
  const [fechaFin, setFechaFin] = useState(initialDates.fechaFin);
  const [subtipoFilter, setSubtipoFilter] = useState<string>('TODOS');
  const [cadenaFilter, setCadenaFilter] = useState<string>('TODAS');
  const [cadenasDisponibles, setCadenasDisponibles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const [metrics, setMetrics] = useState<CanjesMetrics>({
    conTicketCount: 0,
    conTicketPiezas: 0,
    sinTicketCount: 0,
    sinTicketPiezas: 0,
    fueraJornadaCount: 0,
    fueraJornadaPiezas: 0,
    totalCount: 0,
    totalPiezas: 0,
  });

  const [records, setRecords] = useState<CanjeRecordItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [isDownloadingPpt, setIsDownloadingPpt] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = (
    newFechaInicio = fechaInicio,
    newFechaFin = fechaFin,
    newPage = page,
    newSubtipo = subtipoFilter,
    newCadena = cadenaFilter
  ) => {
    setLoading(true);
    setErrorMsg(null);
    startTransition(async () => {
      const res = await obtenerDatosCanjes({
        fechaInicio: newFechaInicio,
        fechaFin: newFechaFin,
        subtipoFilter: newSubtipo,
        cadenaFilter: newCadena,
        searchQuery,
        page: newPage,
        pageSize: 50,
      });

      if (res.ok) {
        setMetrics(res.metrics);
        setRecords(res.records);
        setTotalRecords(res.totalRecords);
        if (res.cadenasDisponibles && res.cadenasDisponibles.length > 0) {
          setCadenasDisponibles(res.cadenasDisponibles);
        }
      } else {
        setErrorMsg(res.message ?? 'No se pudieron obtener los canjes.');
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData(fechaInicio, fechaFin, 1, subtipoFilter, cadenaFilter);
    // eslint-disable-next-deps
  }, [subtipoFilter, cadenaFilter]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData(fechaInicio, fechaFin, 1);
  };

  const handleQuickPreset = (preset: 'ESTA_SEMANA' | 'SEMANA_PASADA' | 'ESTE_MES') => {
    const now = new Date();
    let startStr = '';
    let endStr = '';

    if (preset === 'ESTA_SEMANA') {
      const d = getInitialDates();
      startStr = d.fechaInicio;
      endStr = d.fechaFin;
    } else if (preset === 'SEMANA_PASADA') {
      const d = getInitialDates();
      const st = new Date(d.fechaInicio);
      st.setDate(st.getDate() - 7);
      const en = new Date(d.fechaFin);
      en.setDate(en.getDate() - 7);
      startStr = st.toISOString().slice(0, 10);
      endStr = en.toISOString().slice(0, 10);
    } else if (preset === 'ESTE_MES') {
      const y = now.getFullYear();
      const m = now.getMonth();
      const st = new Date(Date.UTC(y, m, 1));
      const en = new Date(Date.UTC(y, m + 1, 0));
      startStr = st.toISOString().slice(0, 10);
      endStr = en.toISOString().slice(0, 10);
    }

    setFechaInicio(startStr);
    setFechaFin(endStr);
    setPage(1);
    loadData(startStr, endStr, 1);
  };

  const handleDownloadPpt = async () => {
    try {
      setIsDownloadingPpt(true);
      await generateCanjesPpt({
        fechaInicio,
        fechaFin,
        subtipo: subtipoFilter !== 'TODOS' ? subtipoFilter : undefined,
        cadena: cadenaFilter !== 'TODAS' ? cadenaFilter : undefined,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al generar el PowerPoint.');
    } finally {
      setIsDownloadingPpt(false);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      setIsDownloadingExcel(true);
      // Cargar todas las filas del rango para el Excel filtradas por cadena
      const fullData = await obtenerDatosCanjes({
        fechaInicio,
        fechaFin,
        subtipoFilter,
        cadenaFilter,
        searchQuery,
        page: 1,
        pageSize: 100000,
      });

      if (!fullData.ok) {
        throw new Error(fullData.message ?? 'Error cargando datos para Excel.');
      }

      await generarExcelCanjes(fullData.records, fechaInicio, fechaFin, cadenaFilter);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al generar el archivo Excel.');
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const getSubtipoBadge = (subtipo: string) => {
    switch (subtipo) {
      case 'CANJE_CON_TICKET':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            🎫 Con Ticket
          </span>
        );
      case 'CANJE_SIN_TICKET':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            📄 Sin Ticket
          </span>
        );
      case 'CANJE_FUERA_JORNADA':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">
            ⏰ Fuera Jornada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
            {subtipo}
          </span>
        );
    }
  };

  const resolvePhotoProxyUrl = (url: string) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/api/')) return url;
    const slashIdx = url.indexOf('/');
    if (slashIdx > 0) {
      const bucket = url.substring(0, slashIdx);
      const route = url.substring(slashIdx + 1);
      return `/api/reportes/imagen-proxy?bucket=${encodeURIComponent(bucket)}&route=${encodeURIComponent(route)}`;
    }
    return url;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gift className="h-7 w-7 text-indigo-600" weight="duotone" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Módulo de Canjes</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Consulta, filtra por semana personalizada y exporta evidencias en PowerPoint y Excel.
          </p>
        </div>
      </div>

      {/* Card de Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all">
        <form onSubmit={handleFilterSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {/* Fecha Inicio */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Fecha Inicio
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Fecha Fin */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Fecha Fin
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Cadena Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Cadena
              </label>
              <select
                value={cadenaFilter}
                onChange={(e) => setCadenaFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="TODAS">Todas las Cadenas</option>
                {cadenasDisponibles.map((cad) => (
                  <option key={cad} value={cad}>
                    {cad}
                  </option>
                ))}
              </select>
            </div>

            {/* Subtipo Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tipo de Canje
              </label>
              <select
                value={subtipoFilter}
                onChange={(e) => setSubtipoFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="TODOS">Todos los Canjes</option>
                <option value="CANJE_CON_TICKET">Con Ticket</option>
                <option value="CANJE_SIN_TICKET">Sin Ticket</option>
                <option value="CANJE_FUERA_JORNADA">Fuera de Jornada</option>
              </select>
            </div>

            {/* Buscador */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Buscar en rango
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Dermo, PDV, Ticket..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <MagnifyingGlass className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Fila de Botones de Presets y Acción */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-400 mr-1">Filtros rápidos:</span>
              <button
                type="button"
                onClick={() => handleQuickPreset('ESTA_SEMANA')}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                📅 Esta semana
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('SEMANA_PASADA')}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                ⏮️ Semana pasada
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('ESTE_MES')}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                🗓️ Este mes completo
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 transition-all"
            >
              <Funnel className="h-4 w-4" />
              {loading ? 'Consultando...' : 'Aplicar Filtros'}
            </button>
          </div>
        </form>
      </div>

      {/* Grid de 4 Tarjetas de Métricas (KPIs de la semana) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Con Ticket */}
        <div className="rounded-2xl border border-emerald-200 bg-linear-to-br from-emerald-50/50 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Canjes Con Ticket
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Receipt className="h-5 w-5" weight="duotone" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{metrics.conTicketCount}</span>
            <span className="text-xs font-medium text-slate-500">registros</span>
          </div>
          <p className="mt-1 text-xs font-medium text-emerald-600">
            📦 {metrics.conTicketPiezas} piezas entregadas
          </p>
        </div>

        {/* Card 2: Sin Ticket */}
        <div className="rounded-2xl border border-amber-200 bg-linear-to-br from-amber-50/50 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Canjes Sin Ticket
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Gift className="h-5 w-5" weight="duotone" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{metrics.sinTicketCount}</span>
            <span className="text-xs font-medium text-slate-500">registros</span>
          </div>
          <p className="mt-1 text-xs font-medium text-amber-600">
            📦 {metrics.sinTicketPiezas} piezas entregadas
          </p>
        </div>

        {/* Card 3: Fuera de Jornada */}
        <div className="rounded-2xl border border-purple-200 bg-linear-to-br from-purple-50/50 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">
              Fuera de Jornada
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
              <Clock className="h-5 w-5" weight="duotone" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {metrics.fueraJornadaCount}
            </span>
            <span className="text-xs font-medium text-slate-500">registros</span>
          </div>
          <p className="mt-1 text-xs font-medium text-purple-600">
            📦 {metrics.fueraJornadaPiezas} piezas entregadas
          </p>
        </div>

        {/* Card 4: Total Global */}
        <div className="rounded-2xl border border-indigo-200 bg-linear-to-br from-indigo-50/50 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Total Canjes
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Sparkle className="h-5 w-5" weight="duotone" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{metrics.totalCount}</span>
            <span className="text-xs font-medium text-slate-500">registros totales</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-indigo-600">
            📦 {metrics.totalPiezas} piezas totales en rango
          </p>
        </div>
      </div>

      {/* Toolbar de Exportación */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Exportar Canjes {cadenaFilter !== 'TODAS' ? `de ${cadenaFilter}` : 'del Rango'} (
            {fechaInicio} al {fechaFin})
          </h3>
          <p className="text-xs text-slate-500">
            Genera tus entregables en PowerPoint con evidencias fotográficas o descarga la bitácora
            completa en Excel{cadenaFilter !== 'TODAS' ? ` para ${cadenaFilter}` : ''}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPpt}
            disabled={isDownloadingPpt || loading || metrics.totalCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 transition-all"
          >
            <FilePpt className="h-4 w-4 text-orange-300" weight="bold" />
            {isDownloadingPpt ? 'Generando PPTX...' : 'Descargar PowerPoint (PPTX)'}
          </button>

          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={isDownloadingExcel || loading || metrics.totalCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/50 disabled:opacity-50 transition-all"
          >
            <FileXls className="h-4 w-4 text-emerald-200" weight="bold" />
            {isDownloadingExcel ? 'Generando Excel...' : 'Descargar Excel (XLSX)'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Tabla de Registros */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            Bitácora de Canjes {cadenaFilter !== 'TODAS' ? `· ${cadenaFilter}` : ''} ({totalRecords}{' '}
            registros encontrados)
          </h3>
          <span className="text-xs text-slate-500">Mostrando hasta 50 por página</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Cargando registros de canjes...
          </div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No se encontraron canjes registrados{' '}
            {cadenaFilter !== 'TODAS' ? `para ${cadenaFilter}` : ''} en el rango de fechas
            seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">Tipo</th>
                  <th className="px-6 py-3">Dermoconsejera</th>
                  <th className="px-6 py-3">Sucursal / PDV</th>
                  <th className="px-6 py-3">Material & Cantidad</th>

                  <th className="px-6 py-3">Evidencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((rec) => {
                  const proxyUrl = resolvePhotoProxyUrl(rec.fotoUrl ?? '');

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                        {rec.fechaOperativa}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getSubtipoBadge(rec.subtipoRegistro)}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">{rec.empleadoNombre}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{rec.pdvNombre}</div>
                        <div className="text-xs text-slate-400">
                          {rec.cadena} {rec.pdvClaveBtl ? `· ${rec.pdvClaveBtl}` : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{rec.materialNombre}</div>
                        <div className="text-xs font-semibold text-indigo-600">
                          {rec.cantidad} {rec.cantidad === 1 ? 'unidad' : 'unidades'}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {rec.fotos && rec.fotos.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {rec.fotos.map((fUrl, idx) => {
                              const proxy = resolvePhotoProxyUrl(fUrl);
                              if (!proxy) return null;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setSelectedPhoto(proxy)}
                                  className="group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-indigo-500 transition-all"
                                  title={`Ver Evidencia ${idx + 1}`}
                                >
                                  <img
                                    src={proxy}
                                    alt={`Foto evidencia ${idx + 1}`}
                                    className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                    onError={(e) => {
                                      const imgEl = e.target as HTMLImageElement;
                                      imgEl.style.display = 'none';
                                      if (imgEl.parentElement) {
                                        imgEl.parentElement.style.display = 'none';
                                      }
                                    }}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Sin foto</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Zoom de Fotografía */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl">
            <img
              src={selectedPhoto}
              alt="Evidencia ampliada"
              className="max-h-[85vh] max-w-full rounded-xl object-contain"
            />
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-bold text-white shadow-md hover:bg-slate-900"
            >
              ✕ Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}