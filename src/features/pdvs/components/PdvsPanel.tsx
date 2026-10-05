'use client';

import {
  Fragment,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MexicoMap, type MexicoMapPoint } from '@/components/maps/MexicoMap';
import { PdvsOperationalMapTab } from './PdvsOperationalMapTab';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card';
import { ModalPanel } from '@/components/ui/modal-panel';
import { Select } from '@/components/ui/select';
import type { ActorActual } from '@/lib/auth/session';
import { useScopedWidgetData } from '@/lib/ui-change/client';
import { getUiChangeScopeKeysForActor } from '@/lib/ui-change/types';
import {
  actualizarGeocercaPdv,
  actualizarHorarioPdv,
  actualizarPdvBase,
  actualizarSupervisorPdv,
  crearPdv,
} from '../actions';
import { ESTADO_PDV_INICIAL, type PdvCreateDraft } from '../state';
import type {
  PdvCadenaOption,
  PdvCiudadOption,
  PdvDetalleItem,
  PdvHorarioItem,
  PdvListadoItem,
  PdvSupervisorOption,
  PdvTurnoCatalogOption,
  PdvsPanelData,
} from '../services/pdvService';

function formatDate(value: string | null) {
  if (!value) {
    return 'Sin registro';
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value));
}

function formatTime(value: string | null) {
  if (!value) {
    return 'Sin horario';
  }

  return value.slice(0, 5);
}

function getPdvTone(value: string) {
  return value === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700';
}

function getGeofenceTone(pdv: PdvListadoItem) {
  if (!pdv.geocercaCompleta) {
    return 'bg-rose-100 text-rose-700';
  }

  if (pdv.alertarGeocercaFueraDeRango) {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-emerald-100 text-emerald-700';
}

function getHorarioTone(mode: PdvListadoItem['horarioMode']) {
  if (mode === 'CADENA') {
    return 'bg-sky-100 text-sky-700';
  }

  if (mode === 'PERSONALIZADO') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (mode === 'GLOBAL') {
    return 'bg-violet-100 text-violet-700';
  }

  if (mode === 'BASE_PDV') {
    return 'bg-slate-100 text-slate-700';
  }

  return 'bg-rose-100 text-rose-700';
}

function getHorarioLabel(mode: PdvListadoItem['horarioMode']) {
  switch (mode) {
    case 'CADENA':
      return 'Heredado cadena';
    case 'PERSONALIZADO':
      return 'Personalizado';
    case 'BASE_PDV':
      return 'Base PDV';
    case 'GLOBAL':
      return 'Fallback global';
    default:
      return 'Sin horario';
  }
}

function getPublicationTone(value: PdvListadoItem['publicacionMensualEstado']) {
  if (value === 'ASIGNADO') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (value === 'PARCIAL') {
    return 'bg-amber-100 text-amber-700';
  }

  if (value === 'SIN_ASIGNACION') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-slate-200 text-slate-700';
}

function formatMonthLabel(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return 'Sin mes';
  }

  const [year, month] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, 1));

  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function PdvsPanel({
  actor,
  data: initialData,
  canEdit,
  actorPuesto,
}: {
  actor: ActorActual;
  data: PdvsPanelData;
  canEdit: boolean;
  actorPuesto: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  const scopeKeys = useMemo(() => getUiChangeScopeKeysForActor(actor), [actor]);
  const queryString = searchParams.toString();
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const response = await fetch(
        queryString ? `/api/pdvs/panel?${queryString}` : '/api/pdvs/panel',
        {
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        }
      );
      const payload = (await response.json()) as { data?: PdvsPanelData; message?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? 'No fue posible refrescar el panel de PDVs.');
      }

      return payload.data;
    },
    [queryString]
  );
  const { data } = useScopedWidgetData({
    initialData,
    module: 'pdvs',
    surfaces: ['panel', 'tabla', 'shell', 'all'],
    scopeKeys,
    roleTargets: [actor.puesto],
    fetcher,
    debounceMs: 650,
  });

  const [monthFilter, setMonthFilter] = useState(data.month);
  const [search, setSearch] = useState(data.filters.search);
  const [cadenaFilter, setCadenaFilter] = useState(data.filters.cadenaId || 'ALL');
  const [ciudadFilter, setCiudadFilter] = useState(data.filters.ciudadId || 'ALL');
  const [estadoFilter, setEstadoFilter] = useState(data.filters.estado || 'ALL');
  const [zonaFilter, setZonaFilter] = useState(data.filters.zona || 'ALL');
  const [supervisorFilter, setSupervisorFilter] = useState(data.filters.supervisorId || 'ALL');
  const [estatusFilter, setEstatusFilter] = useState(data.filters.estatus || 'ALL');
  const [publicacionFilter, setPublicacionFilter] = useState(
    data.filters.publicacionEstado || 'ALL'
  );
  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(null);
  const [detailPdvId, setDetailPdvId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'catalogo' | 'mapa'>(
    tabFromUrl === 'mapa' ? 'mapa' : 'catalogo'
  );
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [toast, setToast] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (tabFromUrl === 'mapa' || tabFromUrl === 'catalogo') {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const handleTabChange = (newTab: 'catalogo' | 'mapa') => {
    setActiveTab(newTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', newTab);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleMonthChangeFromMap = (newMonth: string) => {
    if (!newMonth || newMonth === monthFilter) return;
    setMonthFilter(newMonth);
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth);
    params.set('tab', 'mapa');
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };
  const selectedPdv = data.pdvs.find((pdv) => pdv.id === detailPdvId) ?? null;
  const [detailData, setDetailData] = useState<PdvDetalleItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    setMonthFilter(data.month);
    setSearch(data.filters.search);
    setCadenaFilter(data.filters.cadenaId || 'ALL');
    setCiudadFilter(data.filters.ciudadId || 'ALL');
    setEstadoFilter(data.filters.estado || 'ALL');
    setZonaFilter(data.filters.zona || 'ALL');
    setSupervisorFilter(data.filters.supervisorId || 'ALL');
    setEstatusFilter(data.filters.estatus || 'ALL');
    setPublicacionFilter(data.filters.publicacionEstado || 'ALL');
    setSelectedPdvId(null);
    setCurrentPage(1);
  }, [data.filters, data.month, data.pdvs]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!detailPdvId) {
      setDetailData(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);

    const detailParams = monthFilter ? `?month=${encodeURIComponent(monthFilter)}` : '';

    void fetch(`/api/pdvs/${detailPdvId}/detail${detailParams}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: PdvDetalleItem | null;
          message?: string;
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.message ?? 'No fue posible cargar el detalle del PDV.');
        }

        return payload.data;
      })
      .then((detail) => {
        setDetailData(detail);
        setDetailLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setDetailData(null);
        setDetailError(
          error instanceof Error ? error.message : 'No fue posible cargar el detalle del PDV.'
        );
        setDetailLoading(false);
      });

    return () => controller.abort();
  }, [detailPdvId, monthFilter]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (monthFilter) {
      params.set('month', monthFilter);
    }
    const normalizedSearch = search.trim();
    if (normalizedSearch) {
      params.set('search', normalizedSearch);
    }
    if (cadenaFilter !== 'ALL') {
      params.set('cadena', cadenaFilter);
    }
    if (ciudadFilter !== 'ALL') {
      params.set('ciudad', ciudadFilter);
    }
    if (estadoFilter !== 'ALL') {
      params.set('estado', estadoFilter);
    }
    if (zonaFilter !== 'ALL') {
      params.set('zona', zonaFilter);
    }
    if (supervisorFilter !== 'ALL') {
      params.set('supervisor', supervisorFilter);
    }
    if (estatusFilter !== 'ALL') {
      params.set('estatus', estatusFilter);
    }
    if (publicacionFilter !== 'ALL') {
      params.set('publicacion', publicacionFilter);
    }
    if (activeTab === 'mapa') {
      params.set('tab', 'mapa');
    }

    startTransition(() => {
      router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
    });
  };

  const clearFilters = () => {
    setMonthFilter(data.month);
    setSearch('');
    setCadenaFilter('ALL');
    setCiudadFilter('ALL');
    setEstadoFilter('ALL');
    setZonaFilter('ALL');
    setSupervisorFilter('ALL');
    setEstatusFilter('ALL');
    setPublicacionFilter('ALL');
    setCurrentPage(1);
    startTransition(() => {
      const clearParams = new URLSearchParams();
      if (activeTab === 'mapa') {
        clearParams.set('tab', 'mapa');
      }
      router.push(clearParams.size > 0 ? `${pathname}?${clearParams.toString()}` : pathname);
    });
  };

  const pdvsFiltrados = data.pdvs;
  const totalItems = pdvsFiltrados.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedPdvs = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return pdvsFiltrados.slice(startIndex, startIndex + pageSize);
  }, [pdvsFiltrados, safePage, pageSize]);

  const buildExportUrl = useCallback(
    (format: 'xlsx' | 'csv' = 'xlsx') => {
      const params = new URLSearchParams();
      if (monthFilter) params.set('month', monthFilter);
      if (format) params.set('format', format);
      if (search.trim()) params.set('search', search.trim());
      if (cadenaFilter && cadenaFilter !== 'ALL') params.set('cadenaId', cadenaFilter);
      if (ciudadFilter && ciudadFilter !== 'ALL') params.set('ciudadId', ciudadFilter);
      if (estadoFilter && estadoFilter !== 'ALL') params.set('estado', estadoFilter);
      if (zonaFilter && zonaFilter !== 'ALL') params.set('zona', zonaFilter);
      if (supervisorFilter && supervisorFilter !== 'ALL')
        params.set('supervisorId', supervisorFilter);
      if (estatusFilter && estatusFilter !== 'ALL') params.set('estatus', estatusFilter);
      if (publicacionFilter && publicacionFilter !== 'ALL')
        params.set('publicacion', publicacionFilter);
      return `/api/pdvs/export?${params.toString()}`;
    },
    [
      monthFilter,
      search,
      cadenaFilter,
      ciudadFilter,
      estadoFilter,
      zonaFilter,
      supervisorFilter,
      estatusFilter,
      publicacionFilter,
    ]
  );

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura parcial</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!canEdit && (
        <Card className="border-slate-200 bg-slate-50 text-slate-700">
          <p className="font-medium">Vista solo lectura</p>
          <p className="mt-2 text-sm">
            Tu puesto actual es <span className="font-semibold">{actorPuesto}</span>. Solo
            ADMINISTRADOR puede crear o editar PDVs; el resto consulta ubicacion, geocerca, horario
            y supervisor vigente.
          </p>
        </Card>
      )}

      {/* Navegación por pestañas ejecutivas */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange('catalogo')}
          className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
            activeTab === 'catalogo'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span>📋</span>
          <span>Catálogo de Tiendas</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'catalogo' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {totalItems}
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('mapa')}
          className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
            activeTab === 'mapa'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span>🗺️</span>
          <span>Mapa Operacional de Supervisión</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'mapa' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {data.resumen.conGeocerca}
          </span>
        </button>
      </div>

      {activeTab === 'catalogo' && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Asignados" value={String(data.publicacionMensual.asignados)} />
            <MetricCard label="Parciales" value={String(data.publicacionMensual.parciales)} />
            <MetricCard label="Sin asignacion" value={String(data.publicacionMensual.sinAsignacion)} />
            <MetricCard label="Inactivos" value={String(data.publicacionMensual.inactivos)} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Asignado</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">Parcial</span>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">Sin asignacion</span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Inactivo</span>
            <span className="ml-1 text-slate-400">Mes: {formatMonthLabel(data.month)}</span>
            <span className="ml-auto text-slate-400">
              Base estructural: {data.resumen.total} PDVs · {data.resumen.activos} activos ·{' '}
              {data.resumen.conGeocerca} con geocerca · {data.resumen.conSupervisor} con supervisor ·{' '}
              {data.resumen.conHorario} con horario
            </span>
          </div>

          <Card className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950 sm:text-lg">Gestión de PDVs</h2>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                  Supervisores disponibles: <strong className="text-slate-900">{data.supervisores.length}</strong> · Turnos de cadena: <strong className="text-slate-900">{data.turnosCadena.length}</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href={buildExportUrl('xlsx')}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-900 shadow-xs transition hover:bg-emerald-100"
                  title={`Descargar Excel con cobertura y supervisores de ${formatMonthLabel(monthFilter)}`}
                >
                  <span>📊</span>
                  <span>Descargar Excel ({formatMonthLabel(monthFilter)})</span>
                </a>
                <a
                  href={buildExportUrl('csv')}
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs transition hover:bg-slate-50"
                  title="Descargar versión CSV"
                >
                  <span>CSV</span>
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(true)}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800"
                  >
                    + Alta de PDV
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* Filtros compactos del Catálogo */}
          <Card className="p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Catálogo y filtros</h2>
                <p className="text-xs text-slate-500">
                  Busca por nombre, clave, mes, estado mensual, zona o supervisor.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                Mostrando <strong className="font-semibold text-slate-900">{totalItems}</strong> PDVs del mes <strong className="font-semibold text-slate-900">{formatMonthLabel(monthFilter)}</strong>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="xl:col-span-2">
                <Input
                  label="Buscar"
                  placeholder="Nombre, clave, ciudad o supervisor"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <div>
                <Input
                  label="Mes"
                  type="month"
                  value={monthFilter}
                  onChange={(event) => {
                    setMonthFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <div>
                <Select
                  label="Cadena"
                  value={cadenaFilter}
                  onChange={(event) => {
                    setCadenaFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'Todas' },
                    ...data.cadenas.map((item) => ({ value: item.id, label: item.nombre })),
                  ]}
                />
              </div>
              <div>
                <Select
                  label="Ciudad"
                  value={ciudadFilter}
                  onChange={(event) => {
                    setCiudadFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'Todas' },
                    ...data.ciudades.map((item) => ({ value: item.id, label: item.nombre })),
                  ]}
                />
              </div>
              <div>
                <Select
                  label="Estado"
                  value={estadoFilter}
                  onChange={(event) => {
                    setEstadoFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'Todos' },
                    { value: 'SIN_ESTADO', label: 'Sin estado' },
                    ...data.estados.map((item) => ({ value: item, label: item })),
                  ]}
                />
              </div>
              <div>
                <Select
                  label="Zona"
                  value={zonaFilter}
                  onChange={(event) => {
                    setZonaFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'Todas' },
                    { value: 'SIN_ZONA', label: 'Sin zona' },
                    ...data.zonas.map((item) => ({ value: item, label: item })),
                  ]}
                />
              </div>
              <div className="xl:col-span-2">
                <Select
                  label="Supervisor"
                  value={supervisorFilter}
                  onChange={(event) => {
                    setSupervisorFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'Todos' },
                    {
                      value: 'SIN_SUPERVISOR',
                      label: 'Sin supervisor',
                    },
                    ...data.supervisores.map((item) => ({
                      value: item.id,
                      label: item.zona
                        ? `${item.nombreCompleto} · ${item.zona}`
                        : item.nombreCompleto,
                    })),
                  ]}
                />
              </div>
              <div>
                <Select
                  label="Estatus"
                  value={estatusFilter}
                  onChange={(event) => {
                    setEstatusFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'Todos' },
                    { value: 'ACTIVO', label: 'ACTIVO' },
                    { value: 'INACTIVO', label: 'INACTIVO' },
                  ]}
                />
              </div>
              <div className="xl:col-span-2">
                <Select
                  label="Publicacion"
                  value={publicacionFilter}
                  onChange={(event) => {
                    setPublicacionFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'Todas' },
                    { value: 'ASIGNADO', label: 'Asignados' },
                    { value: 'PARCIAL', label: 'Parciales' },
                    { value: 'SIN_ASIGNACION', label: 'Sin asignacion' },
                    { value: 'INACTIVO', label: 'Inactivos' },
                  ]}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-1">
                <div className="flex h-full flex-col justify-end gap-2 sm:flex-row sm:items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage(1);
                      applyFilters();
                    }}
                    disabled={isNavigating}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isNavigating ? 'Buscando...' : 'Aplicar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage(1);
                      clearFilters();
                    }}
                    disabled={isNavigating}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Tabla Paginada de PDVs */}
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">PDV</th>
                    <th className="px-6 py-3 font-medium">Publicacion</th>
                    <th className="px-6 py-3 font-medium">Cadena / ciudad</th>
                    <th className="px-6 py-3 font-medium">Geocerca</th>
                    <th className="px-6 py-3 font-medium">Horario</th>
                    <th className="px-6 py-3 font-medium">Supervisor</th>
                    <th className="px-6 py-3 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPdvs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                        No hay PDVs que coincidan con los filtros activos.
                      </td>
                    </tr>
                  ) : (
                    paginatedPdvs.map((pdv) => (
                      <PdvRow
                        key={pdv.id}
                        data={data}
                        pdv={pdv}
                        canEdit={canEdit}
                        expanded={false}
                        onToggle={() => {
                          setSelectedPdvId(pdv.id);
                          setDetailPdvId(pdv.id);
                        }}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Barra de Paginación */}
            {totalItems > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span>
                    Mostrando{' '}
                    <strong className="font-semibold text-slate-900">
                      {(safePage - 1) * pageSize + 1}
                    </strong>{' '}
                    -{' '}
                    <strong className="font-semibold text-slate-900">
                      {Math.min(safePage * pageSize, totalItems)}
                    </strong>{' '}
                    de <strong className="font-semibold text-slate-900">{totalItems}</strong> tiendas
                  </span>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <span>Por página:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-hidden"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    &lt; Anterior
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        if (totalPages <= 7) return true;
                        if (page === 1 || page === totalPages) return true;
                        return Math.abs(page - safePage) <= 1;
                      })
                      .map((page, idx, arr) => {
                        const prev = arr[idx - 1];
                        const hasGap = prev && page - prev > 1;
                        return (
                          <Fragment key={page}>
                            {hasGap && <span className="px-1 text-xs text-slate-400">...</span>}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(page)}
                              className={`h-8 min-w-[32px] rounded-xl px-2 text-xs font-semibold transition ${
                                safePage === page
                                  ? 'bg-slate-900 text-white shadow-xs'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {page}
                            </button>
                          </Fragment>
                        );
                      })}
                  </div>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente &gt;
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {activeTab === 'mapa' && (
        <PdvsOperationalMapTab
          pdvs={pdvsFiltrados}
          supervisores={data.supervisores}
          selectedPdvId={selectedPdvId}
          onSelectPdv={(pdvId) => {
            setSelectedPdvId(pdvId ? pdvId : null);
          }}
          onOpenDetail={(pdvId) => {
            setSelectedPdvId(pdvId);
            setDetailPdvId(pdvId);
          }}
          canEdit={canEdit}
          month={monthFilter}
          onMonthChange={handleMonthChangeFromMap}
          isNavigatingMonth={isNavigating}
        />
      )}

      {selectedPdv ? (
        <PdvDetailModal
          key={selectedPdv.id}
          open
          onClose={() => setDetailPdvId(null)}
          pdv={selectedPdv}
          detail={detailData}
          detailLoading={detailLoading}
          detailError={detailError}
          data={data}
          canEdit={canEdit}
        />
      ) : null}

      {canEdit ? (
        <ModalPanel
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Alta de PDV"
          subtitle="Crea un punto de venta operativo con cadena, geocerca, supervisor y horario."
          maxWidthClassName="max-w-6xl"
        >
          <CrearPdvForm
            data={data}
            onCreated={({ nombre, claveBtl }) => {
              setCreateModalOpen(false);
              setToast({
                tone: 'success',
                message: `PDV creado: ${nombre}${claveBtl ? ` · ${claveBtl}` : ''}`,
              });
            }}
          />
        </ModalPanel>
      ) : null}

      {toast ? <CenteredFeedbackNotice tone={toast.tone} message={toast.message} /> : null}
    </div>
  );
}

function CenteredFeedbackNotice({
  tone,
  message,
}: {
  tone: 'success' | 'error' | 'info';
  message: string;
}) {
  const toneClasses =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-sky-200 bg-sky-50 text-sky-900';

  return (
    <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div
        className={`${toneClasses} pointer-events-auto w-full max-w-md rounded-[24px] border px-5 py-4 text-center shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur`}
        role="status"
        aria-live="polite"
      >
        <p className="text-base font-semibold sm:text-lg">{message}</p>
      </div>
    </div>
  );
}
function PdvRow({
  pdv,
  data,
  canEdit,
  expanded,
  onToggle,
}: {
  pdv: PdvListadoItem;
  data: PdvsPanelData;
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="px-6 py-4">
          <div className="font-medium text-slate-900">{pdv.nombre}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
            {pdv.claveBtl}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill label={pdv.estatus} className={getPdvTone(pdv.estatus)} />
            {pdv.formato && (
              <StatusPill label={pdv.formato} className="bg-slate-100 text-slate-700" />
            )}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill
            label={pdv.publicacionMensualEtiqueta}
            className={getPublicationTone(pdv.publicacionMensualEstado)}
          />
          <div className="mt-2 text-xs text-slate-500">
            {pdv.publicacionMensualEstado === 'INACTIVO'
              ? 'Inactivo en la publicación mensual.'
              : `${pdv.publicacionMensualCoberturaPct}% del mes publicado`}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {pdv.publicacionMensualDiasAsignados}/
            {pdv.publicacionMensualDiasAsignados + pdv.publicacionMensualDiasFaltantes} dias
            publicados
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <div className="font-medium text-slate-900">{pdv.cadena ?? 'Sin cadena'}</div>
          <div className="mt-1 text-xs text-slate-500">{pdv.ciudad ?? 'Sin ciudad'}</div>
          <div className="mt-1 text-xs text-slate-500">estado: {pdv.estado ?? 'Sin estado'}</div>
          <div className="mt-1 text-xs text-slate-500">zona: {pdv.zona ?? 'Sin zona'}</div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill
            label={pdv.geocercaCompleta ? `${pdv.radioMetros} m` : 'Sin geocerca'}
            className={getGeofenceTone(pdv)}
          />
          <div className="mt-2 text-xs text-slate-500">
            {pdv.latitud !== null && pdv.longitud !== null
              ? `${pdv.latitud.toFixed(5)}, ${pdv.longitud.toFixed(5)}`
              : 'Sin coordenadas'}
          </div>
          {pdv.alertarGeocercaFueraDeRango && (
            <div className="mt-1 text-xs text-amber-700">
              Radio fuera del rango operativo 50-300 m
            </div>
          )}
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill
            label={getHorarioLabel(pdv.horarioMode)}
            className={getHorarioTone(pdv.horarioMode)}
          />
          <div className="mt-2 text-xs text-slate-500">
            {pdv.horarioEntrada || pdv.horarioSalida
              ? `${formatTime(pdv.horarioEntrada)} - ${formatTime(pdv.horarioSalida)}`
              : 'Sin horario efectivo'}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <div className="font-medium text-slate-900">{pdv.supervisorActual ?? 'Pendiente'}</div>
          <div className="mt-1 text-xs text-slate-500">
            vigente desde: {formatDate(pdv.supervisorVigenteDesde)}
          </div>
        </td>
        <td className="px-6 py-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onToggle}
          >
            {expanded ? 'Ocultar detalle' : 'Ver detalle'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/70">
          <td colSpan={7} className="px-6 py-5">
            <div className="grid gap-4 xl:grid-cols-2">
              <DetailCard
                title="Ficha PDV"
                description="Cadena, ciudad, zona, direccion, formato y estatus operativo."
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <InfoRow label="Clave BTL" value={pdv.claveBtl} />
                  <InfoRow label="Cadena" value={pdv.cadena ?? 'Sin cadena'} />
                  <InfoRow label="Ciudad" value={pdv.ciudad ?? 'Sin ciudad'} />
                  <InfoRow label="Zona" value={pdv.zona ?? 'Sin zona'} />
                  <InfoRow label="Direccion" value={pdv.direccion ?? 'Sin direccion'} />
                  <InfoRow label="Formato" value={pdv.formato ?? 'Sin formato'} />
                </div>
                {canEdit && (
                  <div className="mt-4">
                    <EditarPdvBaseForm data={data} pdv={pdv} />
                  </div>
                )}
              </DetailCard>

              <DetailCard
                title="Geocerca"
                description="Coordenadas, radio y tolerancia de check-in del punto de venta."
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <InfoRow
                    label="Latitud"
                    value={pdv.latitud !== null ? pdv.latitud.toFixed(7) : 'Sin dato'}
                  />
                  <InfoRow
                    label="Longitud"
                    value={pdv.longitud !== null ? pdv.longitud.toFixed(7) : 'Sin dato'}
                  />
                  <InfoRow
                    label="Radio"
                    value={pdv.radioMetros !== null ? `${pdv.radioMetros} m` : 'Sin dato'}
                  />
                  <InfoRow
                    label="Justificacion"
                    value={pdv.permiteCheckinConJustificacion ? 'Permitida' : 'No permitida'}
                  />
                </div>
                {canEdit && (
                  <div className="mt-4">
                    <GeocercaForm data={data} pdv={pdv} />
                  </div>
                )}
              </DetailCard>

              <DetailCard
                title="Horario"
                description="Horario efectivo del PDV, con herencia desde cadena o reglas personalizadas."
              >
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{getHorarioLabel(pdv.horarioMode)}</p>
                  <p className="mt-1">
                    {pdv.horarioEntrada || pdv.horarioSalida
                      ? `${formatTime(pdv.horarioEntrada)} - ${formatTime(pdv.horarioSalida)}`
                      : 'Sin horario efectivo en la ficha base.'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    El historial completo de horarios se carga solo al abrir el modal de detalle.
                  </p>
                </div>
                {canEdit && (
                  <div className="mt-4">
                    <HorarioForm data={data} pdv={pdv} />
                  </div>
                )}
              </DetailCard>

              <DetailCard title="Supervisor" description="Supervisor vigente del punto de venta.">
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <InfoRow label="Supervisor actual" value={pdv.supervisorActual ?? 'Pendiente'} />
                  <InfoRow label="Vigente desde" value={formatDate(pdv.supervisorVigenteDesde)} />
                </div>
                {canEdit && (
                  <div className="mt-4">
                    <SupervisorForm data={data} pdv={pdv} />
                  </div>
                )}
              </DetailCard>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PdvDetailModal({
  open,
  onClose,
  pdv,
  detail,
  detailLoading,
  detailError,
  data,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  pdv: PdvListadoItem;
  detail: PdvDetalleItem | null;
  detailLoading: boolean;
  detailError: string | null;
  data: PdvsPanelData;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<'general' | 'geocerca' | 'horario'>('general');
  const detailPdv = detail ?? null;

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={pdv.nombre}
      subtitle={pdv.claveBtl}
      maxWidthClassName="max-w-6xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 border-b border-border/70 pb-4">
          <DetailTabButton active={tab === 'general'} onClick={() => setTab('general')}>
            General
          </DetailTabButton>
          <DetailTabButton active={tab === 'geocerca'} onClick={() => setTab('geocerca')}>
            Geocerca
          </DetailTabButton>
          <DetailTabButton active={tab === 'horario'} onClick={() => setTab('horario')}>
            Horario
          </DetailTabButton>
        </div>

        {tab === 'general' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Ficha PDV" description="Identidad base del punto de venta.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Clave BTL" value={pdv.claveBtl} />
                <InfoRow label="Cadena" value={pdv.cadena ?? 'Sin cadena'} />
                <InfoRow label="Ciudad" value={pdv.ciudad ?? 'Sin ciudad'} />
                <InfoRow label="Zona" value={pdv.zona ?? 'Sin zona'} />
                <InfoRow label="Direccion" value={pdv.direccion ?? 'Sin direccion'} />
                <InfoRow label="Formato" value={pdv.formato ?? 'Sin formato'} />
              </div>
              {canEdit ? (
                <div className="mt-4">
                  <EditarPdvBaseForm data={data} pdv={pdv} />
                </div>
              ) : null}
            </DetailCard>

            <DetailCard title="Supervisor" description="Supervisor vigente del punto de venta.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Supervisor actual" value={pdv.supervisorActual ?? 'Pendiente'} />
                <InfoRow label="Vigente desde" value={formatDate(pdv.supervisorVigenteDesde)} />
              </div>
              {canEdit ? (
                <div className="mt-4">
                  <SupervisorForm data={data} pdv={pdv} />
                </div>
              ) : null}
            </DetailCard>
          </div>
        ) : null}

        {tab === 'geocerca' ? (
          <div className="grid gap-4 xl:grid-cols-1">
            <DetailCard title="Geocerca" description="Coordenadas, radio y justificacion.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow
                  label="Latitud"
                  value={pdv.latitud !== null ? pdv.latitud.toFixed(7) : 'Sin dato'}
                />
                <InfoRow
                  label="Longitud"
                  value={pdv.longitud !== null ? pdv.longitud.toFixed(7) : 'Sin dato'}
                />
                <InfoRow
                  label="Radio"
                  value={pdv.radioMetros !== null ? `${pdv.radioMetros} m` : 'Sin dato'}
                />
                <InfoRow
                  label="Justificacion"
                  value={pdv.permiteCheckinConJustificacion ? 'Permitida' : 'No permitida'}
                />
              </div>
              {canEdit ? (
                <div className="mt-4">
                  <GeocercaForm data={data} pdv={pdv} />
                </div>
              ) : null}
            </DetailCard>
          </div>
        ) : null}

        {tab === 'horario' ? (
          <div className="grid gap-4 xl:grid-cols-1">
            <DetailCard title="Horario" description="Horario efectivo y herencia.">
              {detailLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  Cargando detalle de horario...
                </div>
              ) : detailError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {detailError}
                </div>
              ) : detailPdv ? (
                <>
                  <HorarioSummary horarios={detailPdv.horarios} />
                  {canEdit ? (
                    <div className="mt-4">
                      <HorarioForm data={data} pdv={pdv} detail={detailPdv} />
                    </div>
                  ) : null}
                </>
              ) : null}
            </DetailCard>
          </div>
        ) : null}
      </div>
    </ModalPanel>
  );
}
function DetailTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[var(--module-soft-bg)] text-[var(--module-text)] shadow-[inset_0_0_0_1px_var(--module-border)]'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function buildInitialCreatePdvDraft(
  data: PdvsPanelData,
  draft?: PdvCreateDraft | null
): PdvCreateDraft {
  return {
    clave_btl: draft?.clave_btl ?? '',
    nombre: draft?.nombre ?? '',
    cadena_id: draft?.cadena_id ?? '',
    ciudad_id: draft?.ciudad_id ?? '',
    zona: draft?.zona ?? '',
    direccion: draft?.direccion ?? '',
    formato: draft?.formato ?? '',
    id_cadena: draft?.id_cadena ?? '',
    estatus: draft?.estatus ?? 'ACTIVO',
    coordenadas: draft?.coordenadas ?? '',
    radio_tolerancia_metros: draft?.radio_tolerancia_metros ?? String(data.geocercaDefaultMetros),
    permite_checkin_con_justificacion:
      draft?.permite_checkin_con_justificacion ?? data.permiteCheckinConJustificacionDefault,
    supervisor_empleado_id: draft?.supervisor_empleado_id ?? '',
    horario_mode:
      draft?.horario_mode ?? (data.turnosCadena.length > 0 ? 'CADENA' : 'PERSONALIZADO'),
    turno_nomenclatura: draft?.turno_nomenclatura ?? '',
    hora_entrada: draft?.hora_entrada ?? '',
    hora_salida: draft?.hora_salida ?? '',
    horario_observaciones: draft?.horario_observaciones ?? '',
  };
}

function CrearPdvForm({
  data,
  onCreated,
}: {
  data: PdvsPanelData;
  onCreated: (payload: { nombre: string; claveBtl: string }) => void;
}) {
  const [state, formAction] = useActionState(crearPdv, ESTADO_PDV_INICIAL);
  const [formValues, setFormValues] = useState<PdvCreateDraft>(() =>
    buildInitialCreatePdvDraft(data, ESTADO_PDV_INICIAL.fields)
  );
  const [mode, setMode] = useState<'CADENA' | 'PERSONALIZADO'>(formValues.horario_mode);

  useEffect(() => {
    if (!state.ok && state.fields) {
      setFormValues(buildInitialCreatePdvDraft(data, state.fields));
      setMode(state.fields.horario_mode);
    }
  }, [data, state]);

  useEffect(() => {
    if (state.ok) {
      onCreated({
        nombre: formValues.nombre.trim() || 'Nuevo PDV',
        claveBtl: formValues.clave_btl.trim(),
      });
    }
  }, [formValues.clave_btl, formValues.nombre, onCreated, state.ok]);

  function updateField<K extends keyof PdvCreateDraft>(key: K, value: PdvCreateDraft[K]) {
    setFormValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input
          label="Clave BTL"
          name="clave_btl"
          value={formValues.clave_btl}
          onChange={(event) => updateField('clave_btl', event.target.value)}
          required
        />
        <Input
          label="Nombre PDV"
          name="nombre"
          value={formValues.nombre}
          onChange={(event) => updateField('nombre', event.target.value)}
          required
        />
        <Select
          label="Cadena"
          name="cadena_id"
          value={formValues.cadena_id}
          onChange={(event) => updateField('cadena_id', event.target.value)}
          options={buildCadenaOptions(data.cadenas)}
        />
        <Select
          label="Ciudad"
          name="ciudad_id"
          value={formValues.ciudad_id}
          onChange={(event) => updateField('ciudad_id', event.target.value)}
          options={buildCiudadOptions(data.ciudades)}
        />
        <Input
          label="Zona"
          name="zona"
          value={formValues.zona}
          onChange={(event) => updateField('zona', event.target.value)}
          placeholder="Opcional; si se omite, se hereda de la ciudad"
        />
        <Input
          label="Direccion"
          name="direccion"
          value={formValues.direccion}
          onChange={(event) => updateField('direccion', event.target.value)}
          placeholder="Opcional"
        />
        <Input
          label="Formato"
          name="formato"
          value={formValues.formato}
          onChange={(event) => updateField('formato', event.target.value)}
          placeholder="Opcional"
        />
        <Input
          label="ID PDV cadena"
          name="id_cadena"
          value={formValues.id_cadena}
          onChange={(event) => updateField('id_cadena', event.target.value)}
          placeholder="Opcional"
        />
        <Select
          label="Estatus"
          name="estatus"
          value={formValues.estatus}
          onChange={(event) =>
            updateField('estatus', event.target.value === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO')
          }
          options={[
            { value: 'ACTIVO', label: 'ACTIVO' },
            { value: 'INACTIVO', label: 'INACTIVO' },
          ]}
        />
        <Input
          label="Coordenadas"
          name="coordenadas"
          value={formValues.coordenadas}
          onChange={(event) => updateField('coordenadas', event.target.value)}
          placeholder="19.432608, -99.133209"
          hint="Captura latitud y longitud juntas, separadas por coma."
          required
        />
        <Input
          label="Radio geocerca (m)"
          name="radio_tolerancia_metros"
          type="number"
          min="1"
          max="1000"
          value={formValues.radio_tolerancia_metros}
          onChange={(event) => updateField('radio_tolerancia_metros', event.target.value)}
          required
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="permite_checkin_con_justificacion"
          checked={formValues.permite_checkin_con_justificacion}
          onChange={(event) =>
            updateField('permite_checkin_con_justificacion', event.target.checked)
          }
          className="h-4 w-4 rounded border-slate-300"
        />
        Permitir check-in con justificacion fuera de geocerca
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Supervisor"
          name="supervisor_empleado_id"
          value={formValues.supervisor_empleado_id}
          onChange={(event) => updateField('supervisor_empleado_id', event.target.value)}
          options={buildSupervisorOptions(data.supervisoresCatalogo)}
        />
        <Select
          label="Modo horario"
          name="horario_mode"
          value={mode}
          onChange={(event) => {
            const nextMode = event.target.value as 'CADENA' | 'PERSONALIZADO';
            setMode(nextMode);
            updateField('horario_mode', nextMode);
          }}
          options={[
            { value: 'CADENA', label: 'Heredado cadena' },
            { value: 'PERSONALIZADO', label: 'Personalizado' },
          ]}
        />
      </div>

      {mode === 'CADENA' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Select
            label="Turno catalogo cadena"
            name="turno_nomenclatura"
            value={formValues.turno_nomenclatura}
            onChange={(event) => updateField('turno_nomenclatura', event.target.value)}
            options={[
              {
                value: '',
                label:
                  data.turnosCadena.length > 0 ? 'Selecciona un turno' : 'Sin catalogo disponible',
              },
              ...data.turnosCadena.map((item) => ({ value: item.nomenclatura, label: item.label })),
            ]}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 md:col-span-2">
            La herencia usa el catalogo operativo de cadena cargado en configuracion. Al aplicar
            este modo se desactivan reglas personalizadas activas del PDV.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Codigo turno"
            name="turno_nomenclatura"
            value={formValues.turno_nomenclatura}
            onChange={(event) => updateField('turno_nomenclatura', event.target.value)}
            placeholder="Opcional"
          />
          <Input
            label="Hora entrada"
            name="hora_entrada"
            type="time"
            value={formValues.hora_entrada}
            onChange={(event) => updateField('hora_entrada', event.target.value)}
            required
          />
          <Input
            label="Hora salida"
            name="hora_salida"
            type="time"
            value={formValues.hora_salida}
            onChange={(event) => updateField('hora_salida', event.target.value)}
            required
          />
          <Input
            label="Observaciones"
            name="horario_observaciones"
            value={formValues.horario_observaciones}
            onChange={(event) => updateField('horario_observaciones', event.target.value)}
            placeholder="Opcional"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton idleLabel="Crear PDV" pendingLabel="Creando..." variant="primary" />
        <p className="text-sm text-slate-500">
          Se valida clave BTL unica, coordenadas no duplicadas, supervisor activo y horario
          efectivo.
        </p>
      </div>
      {!state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}

function EditarPdvBaseForm({ data, pdv }: { data: PdvsPanelData; pdv: PdvListadoItem }) {
  const [state, formAction] = useActionState(actualizarPdvBase, ESTADO_PDV_INICIAL);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="pdv_id" value={pdv.id} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Clave BTL" name="clave_btl" defaultValue={pdv.claveBtl} required />
        <Input label="Nombre PDV" name="nombre" defaultValue={pdv.nombre} required />
        <Select
          label="Cadena"
          name="cadena_id"
          defaultValue={pdv.cadenaId ?? ''}
          options={buildCadenaOptions(data.cadenas)}
        />
        <Select
          label="Ciudad"
          name="ciudad_id"
          defaultValue={pdv.ciudadId ?? ''}
          options={buildCiudadOptions(data.ciudades)}
        />
        <Input label="Zona" name="zona" defaultValue={pdv.zona ?? ''} />
        <Input label="Direccion" name="direccion" defaultValue={pdv.direccion ?? ''} />
        <Input label="Formato" name="formato" defaultValue={pdv.formato ?? ''} />
        <Input label="ID PDV cadena" name="id_cadena" defaultValue={pdv.idCadena ?? ''} />
        <Select
          label="Estatus"
          name="estatus"
          defaultValue={pdv.estatus}
          options={[
            { value: 'ACTIVO', label: 'ACTIVO' },
            { value: 'INACTIVO', label: 'INACTIVO' },
          ]}
        />
      </div>
      <SubmitButton idleLabel="Guardar ficha" pendingLabel="Guardando..." variant="secondary" />
      <FormMessage state={state} />
    </form>
  );
}

function GeocercaForm({ data, pdv }: { data: PdvsPanelData; pdv: PdvListadoItem }) {
  const [state, formAction] = useActionState(actualizarGeocercaPdv, ESTADO_PDV_INICIAL);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="pdv_id" value={pdv.id} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input
          label="Coordenadas"
          name="coordenadas"
          defaultValue={
            pdv.latitud !== null && pdv.longitud !== null
              ? `${pdv.latitud.toFixed(7)}, ${pdv.longitud.toFixed(7)}`
              : ''
          }
          placeholder="19.432608, -99.133209"
          hint="Usa el formato latitud, longitud."
          required
        />
        <Input
          label="Radio geocerca (m)"
          name="radio_tolerancia_metros"
          type="number"
          min="1"
          max="1000"
          defaultValue={pdv.radioMetros ?? data.geocercaDefaultMetros}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="permite_checkin_con_justificacion"
          defaultChecked={
            pdv.geocercaCompleta
              ? pdv.permiteCheckinConJustificacion
              : data.permiteCheckinConJustificacionDefault
          }
          className="h-4 w-4 rounded border-slate-300"
        />
        Permitir check-in con justificacion
      </label>
      <SubmitButton
        idleLabel="Actualizar geocerca"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      <FormMessage state={state} />
    </form>
  );
}
function HorarioForm({
  data,
  pdv,
  detail,
}: {
  data: PdvsPanelData;
  pdv: PdvListadoItem;
  detail?: PdvDetalleItem | null;
}) {
  const [state, formAction] = useActionState(actualizarHorarioPdv, ESTADO_PDV_INICIAL);
  const [mode, setMode] = useState<'CADENA' | 'PERSONALIZADO'>(
    pdv.horarioMode === 'CADENA' ? 'CADENA' : 'PERSONALIZADO'
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="pdv_id" value={pdv.id} />
      <Select
        label="Modo horario"
        name="horario_mode"
        value={mode}
        onChange={(event) => setMode(event.target.value as 'CADENA' | 'PERSONALIZADO')}
        options={[
          { value: 'CADENA', label: 'Heredado cadena' },
          { value: 'PERSONALIZADO', label: 'Personalizado' },
        ]}
      />
      <ScheduleFields mode={mode} turnosCadena={data.turnosCadena} pdv={detail ?? pdv} />
      <SubmitButton
        idleLabel="Actualizar horario"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      <FormMessage state={state} />
    </form>
  );
}

function SupervisorForm({ data, pdv }: { data: PdvsPanelData; pdv: PdvListadoItem }) {
  const [state, formAction] = useActionState(actualizarSupervisorPdv, ESTADO_PDV_INICIAL);

  const defaultEffectiveDate = () => {
    const now = new Date();
    if (now.getDate() >= 20) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const y = nextMonth.getFullYear();
      const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
      const d = String(nextMonth.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="pdv_id" value={pdv.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Cambiar de supervisor"
          name="supervisor_empleado_id"
          defaultValue={pdv.supervisorActualId ?? ''}
          options={buildSupervisorOptions(data.supervisoresCatalogo)}
        />
        <Input
          label="Aplica a partir de"
          name="fecha_efectiva"
          type="date"
          defaultValue={defaultEffectiveDate()}
          required
        />
      </div>
      <SubmitButton
        idleLabel="Actualizar supervisor"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      <FormMessage state={state} />
    </form>
  );
}

function ScheduleFields({
  mode,
  turnosCadena,
  pdv,
}: {
  mode: 'CADENA' | 'PERSONALIZADO';
  turnosCadena: PdvTurnoCatalogOption[];
  pdv?: PdvListadoItem | PdvDetalleItem;
}) {
  const horarioEntries =
    pdv && 'horarios' in pdv && Array.isArray(pdv.horarios) ? pdv.horarios : [];
  const horarioDetalle = horarioEntries[0] ?? null;

  if (mode === 'CADENA') {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Select
          label="Turno catalogo cadena"
          name="turno_nomenclatura"
          defaultValue={horarioDetalle?.code ?? ''}
          options={[
            {
              value: '',
              label: turnosCadena.length > 0 ? 'Selecciona un turno' : 'Sin catalogo disponible',
            },
            ...turnosCadena.map((item) => ({ value: item.nomenclatura, label: item.label })),
          ]}
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 md:col-span-2">
          La herencia usa el catalogo operativo de cadena cargado en configuracion. Al aplicar este
          modo se desactivan reglas personalizadas activas del PDV.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Input
        label="Codigo turno"
        name="turno_nomenclatura"
        defaultValue={horarioDetalle?.code ?? ''}
        placeholder="Opcional"
      />
      <Input
        label="Hora entrada"
        name="hora_entrada"
        type="time"
        defaultValue={horarioDetalle?.horaEntrada ?? pdv?.horarioEntrada ?? ''}
        required
      />
      <Input
        label="Hora salida"
        name="hora_salida"
        type="time"
        defaultValue={horarioDetalle?.horaSalida ?? pdv?.horarioSalida ?? ''}
        required
      />
      <Input
        label="Observaciones"
        name="horario_observaciones"
        defaultValue={horarioDetalle?.observations ?? ''}
        placeholder="Opcional"
      />
    </div>
  );
}


function HorarioSummary({ horarios }: { horarios?: PdvHorarioItem[] | null }) {
  const horarioEntries = Array.isArray(horarios) ? horarios : [];

  if (horarioEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        El PDV no tiene horario efectivo configurado.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {horarioEntries.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
        >
          <div className="flex flex-wrap gap-2">
            <StatusPill label={item.source} className={getHorarioTone(item.source)} />
            {item.code && <StatusPill label={item.code} className="bg-slate-100 text-slate-700" />}
          </div>
          <p className="mt-3 font-medium text-slate-900">{item.dayLabel}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatTime(item.horaEntrada)} - {formatTime(item.horaSalida)}
          </p>
          {item.observations && <p className="mt-2 text-xs text-slate-500">{item.observations}</p>}
        </div>
      ))}
    </div>
  );
}
function buildCadenaOptions(cadenas: PdvCadenaOption[]) {
  return [
    { value: '', label: 'Selecciona una cadena' },
    ...cadenas.map((item) => ({ value: item.id, label: item.nombre })),
  ];
}

function buildCiudadOptions(ciudades: PdvCiudadOption[]) {
  return [
    { value: '', label: 'Selecciona una ciudad' },
    ...ciudades.map((item) => ({
      value: item.id,
      label: [item.nombre, item.estado ?? 'Sin estado', item.zona].filter(Boolean).join(' · '),
    })),
  ];
}

function buildSupervisorOptions(supervisores: PdvSupervisorOption[]) {
  return [
    { value: '', label: 'Selecciona un supervisor' },
    ...supervisores.map((item) => ({
      value: item.id,
      label: item.zona ? `${item.nombreCompleto} · ${item.zona}` : item.nombreCompleto,
    })),
  ];
}

function FormMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
  );
}

function DetailCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
}: {
  idleLabel: string;
  pendingLabel: string;
  variant: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  const className =
    variant === 'primary'
      ? 'bg-slate-950 text-white hover:bg-slate-800'
      : 'bg-sky-600 text-white hover:bg-sky-500';

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />;
}

function StatusPill({ label, className }: { label: ReactNode; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
