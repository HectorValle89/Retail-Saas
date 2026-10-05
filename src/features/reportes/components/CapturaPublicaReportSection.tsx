'use client';

import { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import type {
  CapturaPublicaReporteData,
  CapturaPublicaReporteItem,
} from '../services/capturaPublicaReporteService';
import { generateCanjesPpt, generateLoveIsdinPpt } from '../services/pptExportService';

const TIPO_OPCIONES = [
  { value: 'TODOS', label: '🔍 Todos', color: 'bg-slate-100 text-slate-700', icon: '📋' },
  { value: 'VENTA', label: '🛍️ Ventas', color: 'bg-emerald-100 text-emerald-700', icon: '🛍️' },
  { value: 'CANJE', label: '🎁 Canjes', color: 'bg-indigo-100 text-indigo-700', icon: '🎁' },
  { value: 'DESABASTO', label: '🚫 Desabasto', color: 'bg-amber-100 text-amber-700', icon: '🚫' },
  { value: 'LOVE_ISDIN', label: '❤️ Love ISDIN', color: 'bg-pink-100 text-pink-700', icon: '❤️' },
];

const TIPO_NOMBRE: Record<string, string> = {
  TODOS: 'Todos',
  VENTA: 'Ventas',
  CANJE: 'Canjes',
  DESABASTO: 'Desabasto',
  LOVE_ISDIN: 'Love ISDIN',
};

const SUBTIPO_LABELS: Record<string, string> = {
  CANJE_CON_TICKET: 'Con Ticket',
  CANJE_SIN_TICKET: 'Sin Ticket',
  CANJE_FUERA_JORNADA: 'Fuera de Jornada',
  LOVE_EXITOSO: 'Registro Exitoso',
  LOVE_FALLIDO: 'Intento Fallido',
  SIN_VENTAS: 'Hoy no tuve ventas',
  SIN_REGISTROS: 'Hoy no hice registros',
};

const ESTATUS_COLORS: Record<string, string> = {
  RECIBIDO: 'bg-sky-50 text-sky-700 border-sky-200',
  VALIDADO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECHAZADO: 'bg-rose-50 text-rose-700 border-rose-200',
  CONSOLIDADO: 'bg-violet-50 text-violet-700 border-violet-200',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value + 'T12:00:00'));
}

// ─── Construcción de filas según tipo ───────────────────────────────────────

function buildRows(items: CapturaPublicaReporteItem[], tipo: string) {
  const filtered = tipo === 'TODOS' ? items : items.filter((i) => i.tipoRegistro === tipo);

  switch (tipo) {
    case 'VENTA':
      return {
        headers: [
          'Fecha',
          'Dermoconsejera',
          'Clave Usuario',
          'Punto de Venta',
          'Clave PDV',
          'Producto',
          'Cantidad',
          'Estatus',
          'Observaciones',
          'Registrado',
        ],
        rows: filtered.map((i) => [
          i.fechaOperativa,
          i.dc,
          i.empleadoClave,
          i.pdv,
          i.pdvClave,
          i.producto ?? '',
          i.cantidad ?? '',
          i.estatusRegistro,
          i.observaciones ?? '',
          new Date(i.createdAt).toLocaleString('es-MX'),
        ]),
      };
    case 'CANJE':
      return {
        headers: [
          'Fecha',
          'Dermoconsejera',
          'Clave Usuario',
          'Punto de Venta',
          'Clave PDV',
          'Material de Canje',
          'Subtipo',

          'Cantidad',
          'Estatus',
          'Link Evidencia',
          'Observaciones',
          'Registrado',
        ],
        rows: filtered.map((i) => [
          i.fechaOperativa,
          i.dc,
          i.empleadoClave,
          i.pdv,
          i.pdvClave,
          i.material ?? '',
          i.subtipoRegistro ? (SUBTIPO_LABELS[i.subtipoRegistro] ?? i.subtipoRegistro) : '',

          i.cantidad ?? '',
          i.estatusRegistro,
          i.fotoEvidenciaUrl ?? '',
          i.observaciones ?? '',
          new Date(i.createdAt).toLocaleString('es-MX'),
        ]),
      };
    case 'DESABASTO':
      return {
        headers: [
          'Fecha',
          'Dermoconsejera',
          'Clave Usuario',
          'Punto de Venta',
          'Clave PDV',
          'Producto Negado',
          'Estatus',
          'Observaciones',
          'Registrado',
        ],
        rows: filtered.map((i) => [
          i.fechaOperativa,
          i.dc,
          i.empleadoClave,
          i.pdv,
          i.pdvClave,
          i.producto ?? '',
          i.estatusRegistro,
          i.observaciones ?? '',
          new Date(i.createdAt).toLocaleString('es-MX'),
        ]),
      };
    case 'LOVE_ISDIN':
      return {
        headers: [
          'Fecha',
          'Dermoconsejera',
          'Clave Usuario',
          'Punto de Venta',
          'Clave PDV',
          'Tipo de Registro',
          'Cantidad',
          'Estatus',
          'Link Evidencia',
          'Observaciones',
          'Registrado',
        ],
        rows: filtered.map((i) => [
          i.fechaOperativa,
          i.dc,
          i.empleadoClave,
          i.pdv,
          i.pdvClave,
          i.subtipoRegistro ? (SUBTIPO_LABELS[i.subtipoRegistro] ?? i.subtipoRegistro) : '',
          i.cantidad ?? '',
          i.estatusRegistro,
          i.fotoEvidenciaUrl ?? '',
          i.observaciones ?? '',
          new Date(i.createdAt).toLocaleString('es-MX'),
        ]),
      };
    default: // TODOS
      return {
        headers: [
          'Fecha',
          'Tipo',
          'Subtipo',
          'Dermoconsejera',
          'Clave Usuario',
          'Punto de Venta',
          'Clave PDV',
          'Producto / Material',
          'Cantidad',

          'Estatus',
          'Link Evidencia',
          'Observaciones',
          'Registrado',
        ],
        rows: filtered.map((i) => [
          i.fechaOperativa,
          TIPO_NOMBRE[i.tipoRegistro] ?? i.tipoRegistro,
          i.subtipoRegistro ? (SUBTIPO_LABELS[i.subtipoRegistro] ?? i.subtipoRegistro) : '',
          i.dc,
          i.empleadoClave,
          i.pdv,
          i.pdvClave,
          i.producto ?? i.material ?? '',
          i.cantidad ?? '',

          i.estatusRegistro,
          i.fotoEvidenciaUrl ?? '',
          i.observaciones ?? '',
          new Date(i.createdAt).toLocaleString('es-MX'),
        ]),
      };
  }
}

function exportToXlsx(items: CapturaPublicaReporteItem[], periodo: string, tipo: string) {
  const { headers, rows } = buildRows(items, tipo);
  if (rows.length === 0) return;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Ancho de columnas automático
  const colWidths = headers.map((h, colIdx) => {
    const maxLen = Math.max(h.length, ...rows.map((r) => String(r[colIdx] ?? '').length));
    return { wch: Math.min(maxLen + 4, 60) };
  });
  ws['!cols'] = colWidths;

  const sheetName = TIPO_NOMBRE[tipo] ?? 'Registros';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fileName = `captura_campo_${tipo.toLowerCase()}_${periodo}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ─── Botones de descarga por tipo ───────────────────────────────────────────

const DOWNLOAD_BTNS = [
  {
    tipo: 'TODOS',
    label: 'Todo el periodo',
    icon: '📋',
    cls: 'border-slate-300 text-slate-700 hover:bg-slate-50',
  },
  {
    tipo: 'VENTA',
    label: 'Ventas',
    icon: '🛍️',
    cls: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
  },
  {
    tipo: 'CANJE',
    label: 'Canjes',
    icon: '🎁',
    cls: 'border-indigo-300 text-indigo-700 hover:bg-indigo-50',
  },
  {
    tipo: 'DESABASTO',
    label: 'Desabasto',
    icon: '🚫',
    cls: 'border-amber-300 text-amber-700 hover:bg-amber-50',
  },
  {
    tipo: 'LOVE_ISDIN',
    label: 'Love ISDIN',
    icon: '❤️',
    cls: 'border-pink-300 text-pink-700 hover:bg-pink-50',
  },
];

function KpiCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-xl">{icon}</span>
        <p className="text-2xl font-black">{value}</p>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function CapturaPublicaReportSection() {
  const [periodo, setPeriodo] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [tipoFiltro, setTipoFiltro] = useState('TODOS');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CapturaPublicaReporteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [exportingPpt, setExportingPpt] = useState(false);
  const [exportingLoveExitososPpt, setExportingLoveExitososPpt] = useState(false);
  const [exportingLoveFallidosPpt, setExportingLoveFallidosPpt] = useState(false);

  const pageSize = 50;

  const cargarDatos = useCallback(async (p: string, tipo: string, pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        periodo: p,
        tipo,
        pageSize: String(pageSize),
        page: String(pg),
      });
      const res = await fetch(`/api/reportes/captura-publica?${params.toString()}`, {
        credentials: 'same-origin',
      });
      const json = (await res.json()) as { data?: CapturaPublicaReporteData; message?: string };
      if (!res.ok || !json.data) throw new Error(json.message ?? 'Error al cargar el reporte.');
      setData(json.data);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBuscar = () => {
    setPage(1);
    cargarDatos(periodo, tipoFiltro, 1);
  };

  const handleTipoChange = (tipo: string) => {
    setTipoFiltro(tipo);
    setPage(1);
    if (searched) cargarDatos(periodo, tipo, 1);
  };

  const handlePage = (newPage: number) => {
    setPage(newPage);
    cargarDatos(periodo, tipoFiltro, newPage);
  };

  const handleDownload = async (tipo: string) => {
    setDownloadingType(tipo);
    try {
      const params = new URLSearchParams({
        periodo,
        tipo,
        pageSize: '-1',
        page: '1',
      });
      const res = await fetch(`/api/reportes/captura-publica?${params.toString()}`, {
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json.data) throw new Error(json.message ?? 'Error al descargar datos.');
      
      exportToXlsx(json.data.items, periodo, tipo);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al exportar Excel.');
    } finally {
      setDownloadingType(null);
    }
  };

  const handleDownloadCanjesPpt = async () => {
    setExportingPpt(true);
    try {
      await generateCanjesPpt({ periodo, subtipo: 'CANJE_CON_TICKET' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al exportar PPTX de canjes.');
    } finally {
      setExportingPpt(false);
    }
  };

  const handleDownloadLoveIsdinPpt = async (subtipo: 'LOVE_EXITOSO' | 'LOVE_FALLIDO') => {
    const isExitoso = subtipo === 'LOVE_EXITOSO';
    if (isExitoso) {
      setExportingLoveExitososPpt(true);
    } else {
      setExportingLoveFallidosPpt(true);
    }
    try {
      await generateLoveIsdinPpt(periodo, subtipo);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al exportar PPTX de Love ISDIN.');
    } finally {
      if (isExitoso) {
        setExportingLoveExitososPpt(false);
      } else {
        setExportingLoveFallidosPpt(false);
      }
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="space-y-5">
      {/* Filtros superiores */}
      <div className="flex flex-wrap items-end gap-3 p-5 bg-slate-50/70 rounded-2xl border border-slate-100">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
            Periodo
          </label>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-400 transition-all"
          />
        </div>
        <button
          onClick={handleBuscar}
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-all disabled:opacity-50 shadow-sm"
        >
          {loading ? '⏳ Cargando...' : '🔍 Buscar'}
        </button>
      </div>

      {/* Botones de descarga Excel por tipo */}
      {data && data.items.length > 0 && (
        <div className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              ⬇️ Descargar Excel por tipo (Total del mes)
            </p>
            <div className="flex flex-wrap gap-2">
              {DOWNLOAD_BTNS.map((btn) => {
                const count =
                  btn.tipo === 'TODOS'
                    ? data.resumen.totalRegistros
                    : btn.tipo === 'VENTA'
                      ? data.resumen.totalVentas
                      : btn.tipo === 'CANJE'
                        ? data.resumen.totalCanjes
                        : btn.tipo === 'DESABASTO'
                          ? data.resumen.totalDesabasto
                          : btn.tipo === 'LOVE_ISDIN'
                            ? data.resumen.totalLoveIsdin
                            : 0;

                if (count === 0 && btn.tipo !== 'TODOS') return null;
                const isDownloading = downloadingType === btn.tipo;

                return (
                  <button
                    key={btn.tipo}
                    onClick={() => handleDownload(btn.tipo)}
                    disabled={isDownloading || loading}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-white text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-[0.98] ${
                      isDownloading ? 'opacity-50 cursor-wait' : btn.cls
                    }`}
                  >
                    <span>{isDownloading ? '⏳' : btn.icon}</span>
                    <span>{isDownloading ? 'Descargando...' : btn.label}</span>
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-current/10 text-xs font-black">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {(data.resumen.totalCanjes > 0 || data.resumen.loveExitosos > 0 || data.resumen.loveFallidos > 0) && (
            <div className="space-y-2 pt-3 border-t border-emerald-100/50">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">
                📊 Reportes de Evidencia Fotográfica (PPTX)
              </p>
              <div className="flex flex-wrap gap-2">
                {data.resumen.totalCanjes > 0 && (
                  <button
                    onClick={handleDownloadCanjesPpt}
                    disabled={exportingPpt || loading}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-[0.98] ${
                      exportingPpt ? 'opacity-50 cursor-wait' : ''
                    }`}
                  >
                    <span>{exportingPpt ? '⏳' : '🎨'}</span>
                    <span>{exportingPpt ? 'Generando PPTX...' : 'Descargar PPTX de Canjes con Ticket'}</span>
                  </button>
                )}

                {data.resumen.loveExitosos > 0 && (
                  <button
                    onClick={() => handleDownloadLoveIsdinPpt('LOVE_EXITOSO')}
                    disabled={exportingLoveExitososPpt || loading}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-pink-200 bg-white text-pink-700 text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-[0.98] ${
                      exportingLoveExitososPpt ? 'opacity-50 cursor-wait' : ''
                    }`}
                  >
                    <span>{exportingLoveExitososPpt ? '⏳' : '❤️'}</span>
                    <span>{exportingLoveExitososPpt ? 'Generando PPTX...' : 'Descargar PPTX de Love ISDIN Exitosos'}</span>
                  </button>
                )}

                {data.resumen.loveFallidos > 0 && (
                  <button
                    onClick={() => handleDownloadLoveIsdinPpt('LOVE_FALLIDO')}
                    disabled={exportingLoveFallidosPpt || loading}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-white text-rose-700 text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-[0.98] ${
                      exportingLoveFallidosPpt ? 'opacity-50 cursor-wait' : ''
                    }`}
                  >
                    <span>{exportingLoveFallidosPpt ? '⏳' : '💔'}</span>
                    <span>{exportingLoveFallidosPpt ? 'Generando PPTX...' : 'Descargar PPTX de Love ISDIN Fallidos'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros rápidos de tipo */}
      {searched && (
        <div className="flex flex-wrap gap-2">
          {TIPO_OPCIONES.map((op) => (
            <button
              key={op.value}
              onClick={() => handleTipoChange(op.value)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-200 ${
                tipoFiltro === op.value
                  ? op.color + ' border-current shadow-sm ring-2 ring-current/20'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          ⚠️ {error}
        </div>
      )}

      {/* KPIs principales */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Total registros"
            value={data.resumen.totalRegistros}
            icon="📋"
            color="bg-slate-50 border-slate-200 text-slate-900"
          />
          <KpiCard
            label="Ventas"
            value={data.resumen.totalVentas}
            icon="🛍️"
            color="bg-emerald-50 border-emerald-200 text-emerald-900"
          />
          <KpiCard
            label="Canjes"
            value={data.resumen.totalCanjes}
            icon="🎁"
            color="bg-indigo-50 border-indigo-200 text-indigo-900"
          />
          <KpiCard
            label="Love ISDIN"
            value={data.resumen.totalLoveIsdin}
            icon="❤️"
            color="bg-pink-50 border-pink-200 text-pink-900"
          />
        </div>
      )}

      {/* Sub-KPIs */}
      {data && (data.resumen.totalCanjes > 0 || data.resumen.totalLoveIsdin > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Con Ticket"
            value={data.resumen.canjesConTicket}
            icon="🧾"
            color="bg-indigo-50 border-indigo-100 text-indigo-800"
          />
          <KpiCard
            label="Sin Ticket"
            value={data.resumen.canjesSinTicket}
            icon="📦"
            color="bg-slate-50 border-slate-200 text-slate-700"
          />
          <KpiCard
            label="Fuera Jornada"
            value={data.resumen.canjesFueraJornada}
            icon="🕐"
            color="bg-amber-50 border-amber-200 text-amber-800"
          />
          <KpiCard
            label="Desabasto"
            value={data.resumen.totalDesabasto}
            icon="🚫"
            color="bg-amber-50 border-amber-200 text-amber-900"
          />
          <KpiCard
            label="Love Exitosos"
            value={data.resumen.loveExitosos}
            icon="✅"
            color="bg-emerald-50 border-emerald-200 text-emerald-800"
          />
          <KpiCard
            label="Love Fallidos"
            value={data.resumen.loveFallidos}
            icon="❌"
            color="bg-rose-50 border-rose-200 text-rose-800"
          />
        </div>
      )}

      {/* Tabla */}
      {data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                {[
                  'Fecha',
                  'Tipo',
                  'Subtipo',
                  'DC',
                  'PDV',
                  'Artículo',
                  'Cant.',
                  'Estatus',
                  'Evidencia',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors align-top"
                >
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {formatDate(item.fechaOperativa)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                        item.tipoRegistro === 'VENTA'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : item.tipoRegistro === 'CANJE'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : item.tipoRegistro === 'DESABASTO'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-pink-50 text-pink-700 border-pink-200'
                      }`}
                    >
                      {item.tipoRegistro === 'LOVE_ISDIN' ? 'LOVE' : item.tipoRegistro}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {item.subtipoRegistro
                      ? (SUBTIPO_LABELS[item.subtipoRegistro] ?? item.subtipoRegistro)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium">{item.dc}</td>
                  <td className="px-4 py-3 text-slate-600">{item.pdv}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.producto ?? item.material ?? <span className="text-slate-300">—</span>}

                    {item.observaciones && (
                      <div className="text-xs text-slate-400 mt-0.5 italic">
                        {item.observaciones}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-slate-800">
                    {item.cantidad ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border ${ESTATUS_COLORS[item.estatusRegistro] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}
                    >
                      {item.estatusRegistro}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.fotoEvidenciaUrl ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {String(item.fotoEvidenciaUrl)
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((rawUrl, idx) => {
                            let proxy = rawUrl;
                            if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
                              if (rawUrl.startsWith('/api/')) {
                                proxy = rawUrl;
                              } else {
                                const slashIdx = rawUrl.indexOf('/');
                                if (slashIdx > 0) {
                                  const bucket = rawUrl.substring(0, slashIdx);
                                  const route = rawUrl.substring(slashIdx + 1);
                                  proxy = `/api/reportes/imagen-proxy?bucket=${encodeURIComponent(bucket)}&route=${encodeURIComponent(route)}`;
                                }
                              }
                            }
                            return (
                              <a
                                key={idx}
                                href={proxy}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200"
                                title={`Ver Foto ${idx + 1}`}
                              >
                                📸 Foto {idx + 1}
                              </a>
                            );
                          })}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : searched && !loading ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-6 py-10 text-center text-slate-400">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm font-medium">
            Sin registros de campo para el periodo y filtro seleccionados.
          </p>
        </div>
      ) : null}

      {/* Paginación */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} de{' '}
            {data.total} registros
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePage(page - 1)}
              disabled={page <= 1}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all"
            >
              ← Anterior
            </button>
            <button
              onClick={() => handlePage(page + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
