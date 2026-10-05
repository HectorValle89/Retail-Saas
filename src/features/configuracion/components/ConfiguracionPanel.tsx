'use client';

import { useActionState, useCallback, useDeferredValue, useMemo, useState } from 'react';
import type { ActorActual } from '@/lib/auth/session';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card';
import { PremiumLineIcon, type PremiumIconName } from '@/components/ui/premium-icons';
import { Select } from '@/components/ui/select';
import { resolveMexicoStateFromCity } from '@/lib/geo/mexicoCityState';
import { useScopedWidgetData } from '@/lib/ui-change/client';
import { getUiChangeScopeKeysForActor } from '@/lib/ui-change/types';
import {
  eliminarTurnoCatalogo,
  guardarCadena,
  guardarCiudad,
  guardarMisionDia,
  guardarOcrConfiguracion,
  guardarPdfCompressionConfiguracion,
  guardarParametroConfiguracion,
  guardarProducto,
  guardarTurnoCatalogo,
  importarCatalogoProductos,
} from '../actions';
import {
  OCR_PROVIDER_OPTIONS,
  PDF_COMPRESSION_PROVIDER_OPTIONS,
  type TurnoCatalogoItem,
} from '../configuracionCatalog';
import { ESTADO_CONFIGURACION_ADMIN_INICIAL } from '../state';
import type {
  CadenaCatalogoItem,
  CiudadCatalogoItem,
  ConfiguracionPanelData,
  MisionCatalogoItem,
  OcrConfiguracionItem,
  ParametroEditableItem,
  PdfCompressionConfiguracionItem,
  ProductoCatalogoItem,
} from '../services/configuracionService';

type ConfiguracionTabId =
  | 'productos'
  | 'cadenas_ciudades'
  | 'horarios'
  | 'misiones'
  | 'parametros'
  | 'integraciones';

interface TabDefinition {
  id: ConfiguracionTabId;
  label: string;
  iconName: PremiumIconName;
  count?: number | string;
  description: string;
}

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50];

function formatBooleanLabel(value: boolean) {
  return value ? 'ACTIVO' : 'INACTIVO';
}

function getStatusTone(active: boolean) {
  return active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700';
}

function getOcrTone(status: OcrConfiguracionItem['status']) {
  switch (status) {
    case 'LISTO':
      return 'bg-emerald-100 text-emerald-700';
    case 'FALTA_API_KEY':
      return 'bg-amber-100 text-amber-700';
    case 'NO_IMPLEMENTADO':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getPdfCompressionTone(status: PdfCompressionConfiguracionItem['status']) {
  switch (status) {
    case 'LISTO':
      return 'bg-emerald-100 text-emerald-700';
    case 'FALTA_BASE_URL':
      return 'bg-amber-100 text-amber-700';
    case 'INALCANZABLE':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function FieldTextarea({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const textId = `${name}-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="w-full">
      <label htmlFor={textId} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={textId}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function StateMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
  );
}

function SubmitActionButton({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'outline' | 'danger';
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant={variant} isLoading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemName = 'elementos',
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  itemName?: string;
}) {
  if (totalItems === 0) {
    return null;
  }

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200/80 pt-4 sm:flex-row">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>
          Mostrando <span className="font-semibold text-slate-800">{start}</span> a{' '}
          <span className="font-semibold text-slate-800">{end}</span> de{' '}
          <span className="font-semibold text-slate-800">{totalItems}</span> {itemName}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <span>Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="h-8 px-3 text-xs"
        >
          Anterior
        </Button>
        <span className="px-2 text-xs font-medium text-slate-600">
          Página <span className="font-semibold text-slate-900">{currentPage}</span> de{' '}
          <span className="font-semibold text-slate-900">{totalPages}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="h-8 px-3 text-xs"
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

export function ConfiguracionPanel({
  actor,
  data: initialData,
}: {
  actor: ActorActual;
  data: ConfiguracionPanelData;
}) {
  const scopeKeys = useMemo(() => getUiChangeScopeKeysForActor(actor), [actor]);

  const fetcher = useCallback(async (signal: AbortSignal) => {
    const response = await fetch('/api/configuracion/panel', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    const payload = (await response.json()) as { data?: ConfiguracionPanelData; message?: string };

    if (!response.ok || !payload.data) {
      throw new Error(payload.message ?? 'No fue posible refrescar el panel de configuracion.');
    }

    return payload.data;
  }, []);

  const { data } = useScopedWidgetData({
    initialData,
    module: 'configuracion',
    surfaces: ['panel', 'all'],
    scopeKeys,
    roleTargets: [actor.puesto],
    fetcher,
    debounceMs: 500,
  });

  const [activeTab, setActiveTab] = useState<ConfiguracionTabId>('productos');
  const [subTabCadenasCiudades, setSubTabCadenasCiudades] = useState<'cadenas' | 'ciudades'>('cadenas');

  const tabs: TabDefinition[] = useMemo(
    () => [
      {
        id: 'productos',
        label: 'Productos',
        iconName: 'materials',
        count: data.resumen.productosActivos,
        description: 'Catálogo de productos, importación XLSX y edición por SKU',
      },
      {
        id: 'cadenas_ciudades',
        label: 'Cadenas y Ciudades',
        iconName: 'stores',
        count: `${data.resumen.cadenasActivas} / ${data.resumen.ciudadesActivas}`,
        description: 'Cadenas comerciales y ciudades operativas multi-zona',
      },
      {
        id: 'horarios',
        label: 'Horarios y Turnos',
        iconName: 'clock',
        count: data.resumen.turnosCatalogo,
        description: 'Turnos y rangos horarios para modo CADENA en PDVs',
      },
      {
        id: 'misiones',
        label: 'Misiones del Día',
        iconName: 'target',
        count: data.resumen.misionesActivas,
        description: 'Catálogo antifraude para check-in y check-out en campo',
      },
      {
        id: 'parametros',
        label: 'Parámetros del Sistema',
        iconName: 'settings',
        count: data.resumen.parametrosConfigurados,
        description: 'Geocercas, biometría, retención documental y nómina',
      },
      {
        id: 'integraciones',
        label: 'Integraciones (OCR / PDF)',
        iconName: 'sync',
        count: data.ocr.available ? 'Listo' : 'Ajustes',
        description: 'Motor de OCR y pipeline de compresión PDF',
      },
    ],
    [data.resumen, data.ocr.available]
  );

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura parcial</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {/* Tarjetas de Métricas de Resumen: Al hacer clic, navegan directamente a la pestaña correspondiente */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <button
          type="button"
          onClick={() => setActiveTab('productos')}
          className="text-left transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none"
          title="Ver catálogo de productos"
        >
          <SharedMetricCard
            label="Productos activos"
            value={String(data.resumen.productosActivos)}
            className={activeTab === 'productos' ? 'ring-2 ring-sky-500 border-sky-300' : ''}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('cadenas_ciudades');
            setSubTabCadenasCiudades('cadenas');
          }}
          className="text-left transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none"
          title="Ver catálogo de cadenas"
        >
          <SharedMetricCard
            label="Cadenas activas"
            value={String(data.resumen.cadenasActivas)}
            className={
              activeTab === 'cadenas_ciudades' && subTabCadenasCiudades === 'cadenas'
                ? 'ring-2 ring-sky-500 border-sky-300'
                : ''
            }
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('cadenas_ciudades');
            setSubTabCadenasCiudades('ciudades');
          }}
          className="text-left transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none"
          title="Ver catálogo de ciudades"
        >
          <SharedMetricCard
            label="Ciudades activas"
            value={String(data.resumen.ciudadesActivas)}
            className={
              activeTab === 'cadenas_ciudades' && subTabCadenasCiudades === 'ciudades'
                ? 'ring-2 ring-sky-500 border-sky-300'
                : ''
            }
          />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('horarios')}
          className="text-left transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none"
          title="Ver catálogo de horarios"
        >
          <SharedMetricCard
            label="Turnos catalogo"
            value={String(data.resumen.turnosCatalogo)}
            className={activeTab === 'horarios' ? 'ring-2 ring-sky-500 border-sky-300' : ''}
          />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('misiones')}
          className="text-left transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none"
          title="Ver misiones del día"
        >
          <SharedMetricCard
            label="Misiones activas"
            value={String(data.resumen.misionesActivas)}
            className={activeTab === 'misiones' ? 'ring-2 ring-sky-500 border-sky-300' : ''}
          />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('parametros')}
          className="text-left transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none"
          title="Ver parámetros del sistema"
        >
          <SharedMetricCard
            label="Parametros guardados"
            value={String(data.resumen.parametrosConfigurados)}
            className={activeTab === 'parametros' ? 'ring-2 ring-sky-500 border-sky-300' : ''}
          />
        </button>
      </div>

      {/* Barra de Navegación de Pestañas (Tabs) */}
      <div className="border-b border-slate-200">
        <nav
          className="flex space-x-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200"
          aria-label="Pestañas de configuración"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`group inline-flex shrink-0 items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'border-sky-300 bg-sky-50/80 text-sky-900 shadow-sm'
                    : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <PremiumLineIcon
                  name={tab.iconName}
                  className={`h-4 w-4 transition-colors ${
                    isActive ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isActive
                        ? 'bg-sky-200/80 text-sky-900'
                        : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200/80'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Contenido de Cada Pestaña */}
      <div className="transition-opacity duration-200">
        {activeTab === 'productos' && <ProductosTabSection productos={data.productos} />}

        {activeTab === 'cadenas_ciudades' && (
          <CadenasCiudadesTabSection
            cadenas={data.cadenas}
            ciudades={data.ciudades}
            activeSubTab={subTabCadenasCiudades}
            onSubTabChange={setSubTabCadenasCiudades}
          />
        )}

        {activeTab === 'horarios' && <HorariosTabSection turnos={data.turnos} />}

        {activeTab === 'misiones' && <MisionesTabSection misiones={data.misiones} />}

        {activeTab === 'parametros' && (
          <ParametrosTabSection
            parametrosGlobales={data.parametrosGlobales}
            parametrosRetencion={data.parametrosRetencion}
            parametrosNomina={data.parametrosNomina}
          />
        )}

        {activeTab === 'integraciones' && (
          <IntegracionesTabSection ocr={data.ocr} pdfCompression={data.pdfCompression} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña 1: Catálogo de Productos (con paginación y búsqueda reactiva)
// ---------------------------------------------------------------------------
function ProductosTabSection({ productos }: { productos: ProductoCatalogoItem[] }) {
  const [productSearch, setProductSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const deferredProductSearch = useDeferredValue(productSearch.trim().toLowerCase());

  const filteredProducts = useMemo(() => {
    if (!deferredProductSearch) {
      return productos;
    }

    return productos.filter((item) =>
      [item.sku, item.nombre, item.nombreCorto, item.categoria]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(deferredProductSearch))
    );
  }, [productos, deferredProductSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedProducts = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return filteredProducts.slice(startIndex, startIndex + pageSize);
  }, [filteredProducts, safePage, pageSize]);

  const handleSearchChange = (value: string) => {
    setProductSearch(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-6">
        <SectionHeader
          title="Catálogo de productos"
          description="CRUD operativo para ventas, reportes y catálogo comercial visible en campo."
        />

        <ImportCatalogForm />

        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Filtro y búsqueda de productos
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Input
                label="Buscar en catálogo"
                value={productSearch}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="SKU, nombre, nombre corto o categoría..."
              />
            </div>
            {productSearch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSearchChange('')}
                className="self-end sm:self-auto h-[42px] mt-6 sm:mt-0"
              >
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Formulario de Alta */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Nuevo producto
          </p>
          <ProductoForm />
        </div>

        {/* Lista de Productos Paginada */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Productos registrados ({filteredProducts.length})
            </p>
            {productSearch && (
              <span className="text-xs text-slate-500">
                Filtrados por: &quot;{productSearch}&quot;
              </span>
            )}
          </div>

          {filteredProducts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No se encontraron productos que coincidan con la búsqueda.
            </p>
          ) : (
            <>
              {paginatedProducts.map((item) => (
                <ProductoForm key={item.id} item={item} />
              ))}

              <PaginationControls
                currentPage={safePage}
                totalPages={totalPages}
                totalItems={filteredProducts.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
                itemName="productos"
              />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña 2: Cadenas y Ciudades (con sub-pestañas y paginación)
// ---------------------------------------------------------------------------
function CadenasCiudadesTabSection({
  cadenas,
  ciudades,
  activeSubTab,
  onSubTabChange,
}: {
  cadenas: CadenaCatalogoItem[];
  ciudades: CiudadCatalogoItem[];
  activeSubTab: 'cadenas' | 'ciudades';
  onSubTabChange: (subTab: 'cadenas' | 'ciudades') => void;
}) {
  const [cadenaSearch, setCadenaSearch] = useState('');
  const [cadenaPage, setCadenaPage] = useState(1);
  const deferredCadenaSearch = useDeferredValue(cadenaSearch.trim().toLowerCase());

  const [ciudadSearch, setCiudadSearch] = useState('');
  const [ciudadPage, setCiudadPage] = useState(1);
  const deferredCiudadSearch = useDeferredValue(ciudadSearch.trim().toLowerCase());

  const filteredCadenas = useMemo(() => {
    if (!deferredCadenaSearch) return cadenas;
    return cadenas.filter((c) =>
      [c.codigo, c.nombre].some((v) => String(v).toLowerCase().includes(deferredCadenaSearch))
    );
  }, [cadenas, deferredCadenaSearch]);

  const filteredCiudades = useMemo(() => {
    if (!deferredCiudadSearch) return ciudades;
    return ciudades.filter((c) =>
      [c.nombre, c.zona, c.estado].some((v) =>
        String(v ?? '').toLowerCase().includes(deferredCiudadSearch)
      )
    );
  }, [ciudades, deferredCiudadSearch]);

  const totalCadenaPages = Math.max(1, Math.ceil(filteredCadenas.length / DEFAULT_PAGE_SIZE));
  const safeCadenaPage = Math.min(cadenaPage, totalCadenaPages);
  const paginatedCadenas = useMemo(() => {
    const start = (safeCadenaPage - 1) * DEFAULT_PAGE_SIZE;
    return filteredCadenas.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filteredCadenas, safeCadenaPage]);

  const totalCiudadPages = Math.max(1, Math.ceil(filteredCiudades.length / DEFAULT_PAGE_SIZE));
  const safeCiudadPage = Math.min(ciudadPage, totalCiudadPages);
  const paginatedCiudades = useMemo(() => {
    const start = (safeCiudadPage - 1) * DEFAULT_PAGE_SIZE;
    return filteredCiudades.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filteredCiudades, safeCiudadPage]);

  return (
    <Card className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader
          title="Cadenas y ciudades"
          description="Catálogos base para PDVs, rutas, clientes y asignaciones multi-zona."
        />

        {/* Sub-selector de pestaña */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => onSubTabChange('cadenas')}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === 'cadenas'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cadenas ({cadenas.length})
          </button>
          <button
            type="button"
            onClick={() => onSubTabChange('ciudades')}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === 'ciudades'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ciudades ({ciudades.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'cadenas' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
            <div className="w-full sm:max-w-md">
              <Input
                label="Buscar cadena"
                value={cadenaSearch}
                onChange={(e) => {
                  setCadenaSearch(e.target.value);
                  setCadenaPage(1);
                }}
                placeholder="Código o nombre de cadena..."
              />
            </div>
            {cadenaSearch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCadenaSearch('');
                  setCadenaPage(1);
                }}
                className="h-[42px] mt-6 sm:mt-0"
              >
                Limpiar
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Alta de nueva cadena
            </p>
            <CadenaForm />
          </div>

          <div className="space-y-3 pt-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Cadenas registradas ({filteredCadenas.length})
            </p>
            {filteredCadenas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No se encontraron cadenas con ese criterio.
              </p>
            ) : (
              <>
                {paginatedCadenas.map((item) => (
                  <CadenaForm key={item.id} item={item} />
                ))}

                <PaginationControls
                  currentPage={safeCadenaPage}
                  totalPages={totalCadenaPages}
                  totalItems={filteredCadenas.length}
                  pageSize={DEFAULT_PAGE_SIZE}
                  onPageChange={setCadenaPage}
                  itemName="cadenas"
                />
              </>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'ciudades' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
            <div className="w-full sm:max-w-md">
              <Input
                label="Buscar ciudad"
                value={ciudadSearch}
                onChange={(e) => {
                  setCiudadSearch(e.target.value);
                  setCiudadPage(1);
                }}
                placeholder="Nombre de ciudad, zona o estado..."
              />
            </div>
            {ciudadSearch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCiudadSearch('');
                  setCiudadPage(1);
                }}
                className="h-[42px] mt-6 sm:mt-0"
              >
                Limpiar
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Alta de nueva ciudad
            </p>
            <CiudadForm />
          </div>

          <div className="space-y-3 pt-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Ciudades registradas ({filteredCiudades.length})
            </p>
            {filteredCiudades.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No se encontraron ciudades con ese criterio.
              </p>
            ) : (
              <>
                {paginatedCiudades.map((item) => (
                  <CiudadForm key={item.id} item={item} />
                ))}

                <PaginationControls
                  currentPage={safeCiudadPage}
                  totalPages={totalCiudadPages}
                  totalItems={filteredCiudades.length}
                  pageSize={DEFAULT_PAGE_SIZE}
                  onPageChange={setCiudadPage}
                  itemName="ciudades"
                />
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pestaña 3: Catálogo de Horarios (Turnos)
// ---------------------------------------------------------------------------
function HorariosTabSection({ turnos }: { turnos: TurnoCatalogoItem[] }) {
  return (
    <Card className="space-y-5 p-6">
      <SectionHeader
        title="Catálogo de horarios"
        description="Turnos heredables por PDV y cadena. Este JSON gobierna el modo CADENA del módulo de PDVs."
      />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Alta de nuevo turno
        </p>
        <TurnoForm />
      </div>

      <div className="space-y-3 pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Turnos configurados ({turnos.length})
        </p>
        {turnos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            Aún no hay turnos guardados en el catálogo operativo.
          </p>
        ) : (
          turnos.map((item) => <TurnoForm key={item.nomenclatura} item={item} />)
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pestaña 4: Misiones del Día (con paginación y búsqueda reactiva)
// ---------------------------------------------------------------------------
function MisionesTabSection({ misiones }: { misiones: MisionCatalogoItem[] }) {
  const [missionSearch, setMissionSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const deferredMissionSearch = useDeferredValue(missionSearch.trim().toLowerCase());

  const filteredMissions = useMemo(() => {
    if (!deferredMissionSearch) {
      return misiones;
    }

    return misiones.filter((item) =>
      [item.codigo, item.instruccion]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(deferredMissionSearch))
    );
  }, [misiones, deferredMissionSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredMissions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedMissions = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return filteredMissions.slice(startIndex, startIndex + pageSize);
  }, [filteredMissions, safePage, pageSize]);

  const handleSearchChange = (value: string) => {
    setMissionSearch(value);
    setCurrentPage(1);
  };

  return (
    <Card className="space-y-5 p-6">
      <SectionHeader
        title="Misiones del día"
        description="Catálogo antifraude para check-in y check-out. Solo administración central puede modificarlo."
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Filtro y búsqueda de misiones
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              label="Buscar misión"
              value={missionSearch}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Código o instrucción..."
            />
          </div>
          {missionSearch && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSearchChange('')}
              className="self-end sm:self-auto h-[42px] mt-6 sm:mt-0"
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Alta de nueva misión
        </p>
        <MisionForm />
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Misiones registradas ({filteredMissions.length})
          </p>
          {missionSearch && (
            <span className="text-xs text-slate-500">
              Filtradas por: &quot;{missionSearch}&quot;
            </span>
          )}
        </div>

        {filteredMissions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No se encontraron misiones que coincidan con la búsqueda.
          </p>
        ) : (
          <>
            {paginatedMissions.map((item) => (
              <MisionForm key={item.id} item={item} />
            ))}

            <PaginationControls
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={filteredMissions.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              itemName="misiones"
            />
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pestaña 5: Parámetros del Sistema (Globales, Retención y Nómina)
// ---------------------------------------------------------------------------
function ParametrosTabSection({
  parametrosGlobales,
  parametrosRetencion,
  parametrosNomina,
}: {
  parametrosGlobales: ParametroEditableItem[];
  parametrosRetencion: ParametroEditableItem[];
  parametrosNomina: ParametroEditableItem[];
}) {
  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Parámetros globales"
          description="Ajustes de geocerca, biometría y tolerancias operativas de la plataforma."
        />
        <ParametroSection items={parametrosGlobales} />
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Parámetros de nómina"
          description="Base editable para periodos, bono comercial y deducciones por falta."
        />
        <ParametroSection items={parametrosNomina} />
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Retención de archivos"
          description="Mínimos operativos para storage de expediente, selfies y exportaciones."
        />
        <ParametroSection items={parametrosRetencion} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña 6: Integraciones Técnicas (OCR y Compresión PDF)
// ---------------------------------------------------------------------------
function IntegracionesTabSection({
  ocr,
  pdfCompression,
}: {
  ocr: OcrConfiguracionItem;
  pdfCompression: PdfCompressionConfiguracionItem;
}) {
  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <SectionHeader
          title="OCR e integraciones"
          description="Proveedor preferido y modelo runtime para el flujo documental de expedientes."
        />
        <OcrConfigForm item={ocr} />
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Compresión PDF"
          description="Proveedor runtime del pipeline PDF para expedientes, IMSS, solicitudes, gastos y adjuntos."
        />
        <PdfCompressionConfigForm item={pdfCompression} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formularios y Componentes Reutilizables de Edición (Preservando contratos)
// ---------------------------------------------------------------------------
function ImportCatalogForm() {
  const [state, formAction] = useActionState(
    importarCatalogoProductos,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Actualizar catálogo ISDIN</p>
          <p className="text-xs text-slate-600">
            Carga tu XLSX activo para crear o actualizar productos por SKU. Ventas usará este
            catálogo como fuente maestra.
          </p>
        </div>
        <StatusPill label="XLSX" tone="bg-emerald-100 text-emerald-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="w-full">
          <label
            htmlFor="catalogo-productos-file"
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground-tertiary"
          >
            Archivo catálogo
          </label>
          <input
            id="catalogo-productos-file"
            name="catalogo_productos_file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="w-full rounded-[12px] border border-border bg-white px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-800 hover:border-primary-200 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />
        </div>

        <SubmitActionButton label="Importar catálogo" pendingLabel="Importando..." />
      </div>

      <StateMessage state={state} />
    </form>
  );
}

function ProductoForm({ item }: { item?: ProductoCatalogoItem }) {
  const [state, formAction] = useActionState(guardarProducto, ESTADO_CONFIGURACION_ADMIN_INICIAL);

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <input type="hidden" name="producto_id" value={item?.id ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item ? `${item.nombreCorto} / ${item.sku}` : 'Alta de producto'}
          </p>
          <p className="text-xs text-slate-500">
            {item ? item.nombre : 'SKU, nombre comercial, categoría y estado de disponibilidad.'}
          </p>
        </div>
        {item && (
          <StatusPill label={formatBooleanLabel(item.activo)} tone={getStatusTone(item.activo)} />
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Input label="SKU" name="sku" defaultValue={item?.sku} placeholder="ISD-001" />
        <Input
          label="Nombre"
          name="nombre"
          defaultValue={item?.nombre}
          placeholder="Nombre largo"
        />
        <Input
          label="Nombre corto"
          name="nombre_corto"
          defaultValue={item?.nombreCorto}
          placeholder="Nombre corto"
        />
        <Input
          label="Categoría"
          name="categoria"
          defaultValue={item?.categoria}
          placeholder="Protector solar"
        />
        <Select
          label="Top 30"
          name="top_30"
          defaultValue={item ? String(item.top30) : 'false'}
          options={[
            { value: 'false', label: 'No' },
            { value: 'true', label: 'Sí' },
          ]}
        />
        <Select
          label="Activo"
          name="activo"
          defaultValue={item ? String(item.activo) : 'true'}
          options={[
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar producto' : 'Crear producto'}
          pendingLabel="Guardando producto..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  );
}

function CadenaForm({ item }: { item?: CadenaCatalogoItem }) {
  const [state, formAction] = useActionState(guardarCadena, ESTADO_CONFIGURACION_ADMIN_INICIAL);

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <input type="hidden" name="cadena_id" value={item?.id ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item ? item.nombre : 'Alta de cadena'}
          </p>
          <p className="text-xs text-slate-500">Código, nombre comercial y factor base de cuota.</p>
        </div>
        {item && (
          <StatusPill label={formatBooleanLabel(item.activa)} tone={getStatusTone(item.activa)} />
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Código" name="codigo" defaultValue={item?.codigo} placeholder="SAN_PABLO" />
        <Input label="Nombre" name="nombre" defaultValue={item?.nombre} placeholder="San Pablo" />
        <Input
          label="Factor cuota default"
          name="factor_cuota_default"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={item ? String(item.factorCuotaDefault) : '1'}
        />
        <Select
          label="Activa"
          name="activa"
          defaultValue={item ? String(item.activa) : 'true'}
          options={[
            { value: 'true', label: 'Activa' },
            { value: 'false', label: 'Inactiva' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar cadena' : 'Crear cadena'}
          pendingLabel="Guardando cadena..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  );
}

function CiudadForm({ item }: { item?: CiudadCatalogoItem }) {
  const [state, formAction] = useActionState(guardarCiudad, ESTADO_CONFIGURACION_ADMIN_INICIAL);
  const estadoDerivado = resolveMexicoStateFromCity(item?.nombre ?? null);

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <input type="hidden" name="ciudad_id" value={item?.id ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item ? item.nombre : 'Alta de ciudad'}
          </p>
          <p className="text-xs text-slate-500">
            Ciudad operativa, zona y estado derivado por catálogo nacional.
          </p>
        </div>
        {item && (
          <StatusPill label={formatBooleanLabel(item.activa)} tone={getStatusTone(item.activa)} />
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Ciudad" name="nombre" defaultValue={item?.nombre} placeholder="MONTERREY" />
        <Input label="Zona" name="zona" defaultValue={item?.zona} placeholder="NORTE" />
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Estado derivado
          </span>
          <span className="mt-1 block font-medium text-slate-950">
            {estadoDerivado ?? item?.estado ?? 'Sin derivar'}
          </span>
        </div>
        <Select
          label="Activa"
          name="activa"
          defaultValue={item ? String(item.activa) : 'true'}
          options={[
            { value: 'true', label: 'Activa' },
            { value: 'false', label: 'Inactiva' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar ciudad' : 'Crear ciudad'}
          pendingLabel="Guardando ciudad..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  );
}

function TurnoForm({ item }: { item?: TurnoCatalogoItem }) {
  const [state, formAction] = useActionState(
    guardarTurnoCatalogo,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  );

  return (
    <div
      className={`rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item ? item.nomenclatura : 'Alta de turno catálogo'}
          </p>
          <p className="text-xs text-slate-500">
            {item?.turno ?? 'Nomenclatura, descripción operativa y rango horario reusable.'}
          </p>
        </div>
        {item && <TurnoDeleteForm nomenclatura={item.nomenclatura} />}
      </div>
      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="turno_original" value={item?.nomenclatura ?? ''} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input
            label="Nomenclatura"
            name="nomenclatura"
            defaultValue={item?.nomenclatura}
            placeholder="SP_9_18"
          />
          <Input
            label="Turno"
            name="turno"
            defaultValue={item?.turno ?? ''}
            placeholder="Base semanal"
          />
          <Input
            label="Horario"
            name="horario"
            defaultValue={item?.horario ?? ''}
            placeholder="09:00 a 18:00"
          />
          <Input
            label="Hora entrada"
            name="hora_entrada"
            type="time"
            defaultValue={item?.horaEntrada?.slice(0, 5) ?? ''}
          />
          <Input
            label="Hora salida"
            name="hora_salida"
            type="time"
            defaultValue={item?.horaSalida?.slice(0, 5) ?? ''}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton
            label={item ? 'Actualizar turno' : 'Crear turno'}
            pendingLabel="Guardando turno..."
          />
          <StateMessage state={state} />
        </div>
      </form>
    </div>
  );
}

function TurnoDeleteForm({ nomenclatura }: { nomenclatura: string }) {
  const [state, formAction] = useActionState(
    eliminarTurnoCatalogo,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="nomenclatura" value={nomenclatura} />
      <SubmitActionButton label="Eliminar" pendingLabel="Eliminando..." variant="danger" />
      <StateMessage state={state} />
    </form>
  );
}

function MisionForm({ item }: { item?: MisionCatalogoItem }) {
  const [state, formAction] = useActionState(guardarMisionDia, ESTADO_CONFIGURACION_ADMIN_INICIAL);

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <input type="hidden" name="mision_id" value={item?.id ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item ? (item.codigo ?? item.instruccion) : 'Alta de misión'}
          </p>
          <p className="text-xs text-slate-500">
            Control de misiones diarias presentadas en jornada.
          </p>
        </div>
        {item && (
          <StatusPill label={formatBooleanLabel(item.activa)} tone={getStatusTone(item.activa)} />
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Input label="Código" name="codigo" defaultValue={item?.codigo ?? ''} placeholder="M0001" />
        <Input
          label="Orden"
          name="orden"
          type="number"
          defaultValue={item?.orden ? String(item.orden) : ''}
        />
        <Input
          label="Peso"
          name="peso"
          type="number"
          min="1"
          defaultValue={item ? String(item.peso) : '1'}
        />
      </div>
      <FieldTextarea
        label="Instrucción"
        name="instruccion"
        defaultValue={item?.instruccion}
        placeholder="Solicitar evidencia física antifraude."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Activa"
          name="activa"
          defaultValue={item ? String(item.activa) : 'true'}
          options={[
            { value: 'true', label: 'Activa' },
            { value: 'false', label: 'Inactiva' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar misión' : 'Crear misión'}
          pendingLabel="Guardando misión..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  );
}

function ParametroSection({ items }: { items: ParametroEditableItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ParametroConfigForm key={item.key} item={item} />
      ))}
    </div>
  );
}

function ParametroConfigForm({ item }: { item: ParametroEditableItem }) {
  const [state, formAction] = useActionState(
    guardarParametroConfiguracion,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="key" value={item.key} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{item.label}</p>
          <p className="mt-1 text-xs text-slate-500">{item.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusPill
            label={item.persisted ? 'CONFIGURADO' : 'DEFAULT'}
            tone={item.persisted ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-700'}
          />
          <StatusPill label={item.module.toUpperCase()} tone="bg-white text-slate-600" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        {item.kind === 'BOOLEAN' ? (
          <Select
            label="Valor"
            name="value"
            defaultValue={item.value}
            options={[
              { value: 'true', label: 'Sí' },
              { value: 'false', label: 'No' },
            ]}
          />
        ) : (
          <Input
            label="Valor"
            name="value"
            type={item.kind === 'NUMBER' ? 'number' : 'text'}
            defaultValue={item.value}
            min={item.min}
            max={item.max}
            step={item.step}
          />
        )}
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            Valor visible: <span className="font-semibold text-slate-900">{item.displayValue}</span>
          </div>
          <SubmitActionButton label="Guardar" pendingLabel="Guardando..." />
        </div>
      </div>
      <StateMessage state={state} />
    </form>
  );
}

function OcrConfigForm({ item }: { item: OcrConfiguracionItem }) {
  const [state, formAction] = useActionState(
    guardarOcrConfiguracion,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-950">Estado runtime</p>
            <StatusPill label={item.status} tone={getOcrTone(item.status)} />
          </div>
          <dl className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <dt>Fuente</dt>
              <dd className="font-medium text-slate-900">{item.source}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Proveedor efectivo</dt>
              <dd className="font-medium text-slate-900">{item.effectiveProvider ?? 'disabled'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Modelo efectivo</dt>
              <dd className="font-medium text-slate-900">{item.effectiveModel ?? 'n/a'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Proveedor entorno</dt>
              <dd className="font-medium text-slate-900">{item.envProvider ?? 'disabled'}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-950">Diagnóstico</p>
          <p className="mt-3 leading-6">{item.message}</p>
          <p className="mt-3 text-xs text-slate-500">
            Disponible para uso documental:{' '}
            <span className="font-semibold text-slate-900">{item.available ? 'sí' : 'no'}</span>
          </p>
        </div>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Proveedor preferido"
            name="provider"
            defaultValue={item.preferredProvider ?? item.envProvider ?? 'disabled'}
            options={OCR_PROVIDER_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <Input
            label="Modelo preferido"
            name="model"
            defaultValue={item.preferredModel ?? item.effectiveModel ?? 'gemini-2.5-flash-lite'}
            placeholder="gemini-2.5-flash-lite"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton label="Guardar OCR" pendingLabel="Guardando OCR..." />
          <StateMessage state={state} />
        </div>
      </form>
    </div>
  );
}

function PdfCompressionConfigForm({ item }: { item: PdfCompressionConfiguracionItem }) {
  const [state, formAction] = useActionState(
    guardarPdfCompressionConfiguracion,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-950">Estado runtime</p>
            <StatusPill label={item.status} tone={getPdfCompressionTone(item.status)} />
          </div>
          <dl className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <dt>Fuente</dt>
              <dd className="font-medium text-slate-900">{item.source}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Proveedor efectivo</dt>
              <dd className="font-medium text-slate-900">{item.effectiveProvider}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>URL base</dt>
              <dd className="truncate font-medium text-slate-900">
                {item.effectiveBaseUrl ?? 'n/a'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>API key env</dt>
              <dd className="font-medium text-slate-900">
                {item.apiKeyConfigured ? 'configurada' : 'no configurada'}
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-950">Diagnóstico</p>
          <p className="mt-3 leading-6">{item.message}</p>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt>Optimize level</dt>
              <dd className="font-semibold text-slate-900">{item.effectiveOptimizeLevel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Image quality</dt>
              <dd className="font-semibold text-slate-900">{item.effectiveImageQuality}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Image DPI</dt>
              <dd className="font-semibold text-slate-900">{item.effectiveImageDpi}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Fast web view</dt>
              <dd className="font-semibold text-slate-900">{item.effectiveFastWebView}</dd>
            </div>
          </dl>
        </div>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Proveedor preferido"
            name="provider"
            defaultValue={item.preferredProvider ?? item.envProvider ?? 'local'}
            options={PDF_COMPRESSION_PROVIDER_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <Input
            label="URL base Stirling"
            name="stirling_base_url"
            defaultValue={item.effectiveBaseUrl ?? 'http://127.0.0.1:8088'}
            placeholder="http://127.0.0.1:8088"
          />
          <Input
            label="Nivel de optimización"
            name="optimize_level"
            type="number"
            min="0"
            max="4"
            defaultValue={item.effectiveOptimizeLevel}
          />
          <Input
            label="Calidad de imagen"
            name="image_quality"
            type="number"
            min="10"
            max="100"
            defaultValue={item.effectiveImageQuality}
          />
          <Input
            label="DPI de imagen"
            name="image_dpi"
            type="number"
            min="72"
            max="600"
            defaultValue={item.effectiveImageDpi}
          />
          <Select
            label="Fast web view"
            name="fast_web_view"
            defaultValue={item.effectiveFastWebView}
            options={[
              { value: 'true', label: 'Sí' },
              { value: 'false', label: 'No' },
            ]}
          />
        </div>
        <p className="text-xs text-slate-500">
          El API key de Stirling se mantiene en variables de entorno. La configuración central
          gobierna proveedor, endpoint y tuning.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton
            label="Guardar compresión PDF"
            pendingLabel="Guardando compresión..."
          />
          <StateMessage state={state} />
        </div>
      </form>
    </div>
  );
}
