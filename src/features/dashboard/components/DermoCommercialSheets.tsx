'use client';

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { queueOfflineLoveIsdin, queueOfflineVenta } from '@/lib/offline/syncQueue';
import { registrarRegistroExtemporaneo } from '@/features/solicitudes/extemporaneoActions';
import { ESTADO_SOLICITUD_INICIAL } from '@/features/solicitudes/state';
import type { DashboardDermoconsejoData } from '../services/dashboardService';

type VentaCartItem = {
  id: string;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  productoNombreCorto: string;
  unidades: number;
};

type LoveCartItem = {
  id: string;
  afiliadoNombre: string;
  afiliadoContacto: string | null;
  ticketFolio: string | null;
};

function getPreviousDateValue() {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA').format(value);
}

function parsePositiveUnits(value: string) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-900">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white' : 'rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600'}
    >
      {children}
    </button>
  );
}

function ProductPicker({
  products,
  search,
  selectedProductId,
  onSearchChange,
  onSelectProduct,
}: {
  products: DashboardDermoconsejoData['catalogoProductos'];
  search: string;
  selectedProductId: string;
  onSearchChange: (value: string) => void;
  onSelectProduct: (productId: string) => void;
}) {
  const filteredProducts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    return products
      .filter((item) => [item.nombre, item.nombreCorto, item.sku].some((value) => value.toLowerCase().includes(normalized)))
      .slice(0, 8);
  }, [products, search]);

  return (
    <div className="space-y-3">
      <Field label="Buscar producto">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="SKU, nombre o nombre corto"
          className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
        />
      </Field>
      <div className="grid gap-2">
        {filteredProducts.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">
            {search.trim() ? 'No hay productos que coincidan con esa busqueda.' : 'Escribe para buscar productos.'}
          </p>
        ) : (
          filteredProducts.map((product) => {
            const active = product.id === selectedProductId;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelectProduct(product.id)}
                className={active ? 'rounded-[18px] border border-emerald-300 bg-emerald-50 px-4 py-3 text-left shadow-sm' : 'rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-left'}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{product.nombreCorto}</p>
                    <p className="mt-1 text-xs text-slate-500">{product.nombre}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{product.sku}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function DermoVentasCartSheet({ data, onSuccess, onError }: { data: DashboardDermoconsejoData; onSuccess: (message: string, savedCount: number) => void; onError: (message: string) => void }) {
  const offline = useOfflineSync();
  const [catalogoProductos, setCatalogoProductos] = useState(data.catalogoProductos);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const catalogFetchAttempted = useRef(false);
  const [catalogRetryNonce, setCatalogRetryNonce] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(data.catalogoProductos[0]?.id ?? '');
  const [units, setUnits] = useState('1');
  const [cart, setCart] = useState<VentaCartItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  useEffect(() => {
    setCatalogoProductos(data.catalogoProductos);
  }, [data.catalogoProductos]);

  useEffect(() => {
    if (selectedProductId || catalogoProductos.length === 0) {
      return;
    }

    setSelectedProductId(catalogoProductos[0]?.id ?? '');
  }, [catalogoProductos, selectedProductId]);

  useEffect(() => {
    if (catalogoProductos.length > 0 || isCatalogLoading) {
      return;
    }

    if (catalogFetchAttempted.current) {
      return;
    }

    catalogFetchAttempted.current = true;
    setIsCatalogLoading(true);
    void (async () => {
      try {
        const response = await fetch('/api/catalogo/productos', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const payload = (await response.json()) as {
          data?: DashboardDermoconsejoData['catalogoProductos'];
          message?: string;
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.message ?? 'No fue posible cargar el catalogo de productos.');
        }

        setCatalogoProductos(payload.data);
        if (!selectedProductId && payload.data[0]?.id) {
          setSelectedProductId(payload.data[0].id);
        }
      } catch (error) {
        setLocalMessage(error instanceof Error ? error.message : 'No fue posible cargar el catalogo de productos.');
      } finally {
        setIsCatalogLoading(false);
      }
    })();
  }, [catalogoProductos.length, isCatalogLoading, selectedProductId, catalogRetryNonce]);

  const selectedProduct = catalogoProductos.find((item) => item.id === selectedProductId) ?? null;
  const canOperate = Boolean(data.context.cuentaClienteId && data.context.pdvId && data.context.attendanceId && data.reportWindow.canReportToday);
  const parsedUnits = parsePositiveUnits(units);
  const canSave = canOperate && cart.length > 0;

  const handleAdd = () => {
    if (!selectedProduct || !parsedUnits) {
      setLocalMessage('Selecciona un producto valido y una cantidad mayor a cero.');
      return;
    }

    setCart((current) => [...current, { id: crypto.randomUUID(), productoId: selectedProduct.id, productoSku: selectedProduct.sku, productoNombre: selectedProduct.nombre, productoNombreCorto: selectedProduct.nombreCorto, unidades: parsedUnits }]);
    setUnits('1');
    setLocalMessage(`${selectedProduct.nombreCorto} agregado al carrito.`);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canOperate || !data.context.cuentaClienteId || !data.context.pdvId || !data.context.attendanceId) {
      onError(data.reportWindow.helper);
      return;
    }

    if (cart.length === 0) {
      onError('Agrega al menos un producto al carrito antes de guardar.');
      return;
    }

    setIsSaving(true);
    setLocalMessage(null);

    try {
      for (const item of cart) {
        await queueOfflineVenta({
          id: crypto.randomUUID(),
          cuenta_cliente_id: data.context.cuentaClienteId,
          asistencia_id: data.context.attendanceId,
          empleado_id: data.context.empleadoId,
          pdv_id: data.context.pdvId,
          producto_id: item.productoId,
          producto_sku: item.productoSku,
          producto_nombre: item.productoNombre,
          producto_nombre_corto: item.productoNombreCorto,
          fecha_utc: new Date().toISOString(),
          total_unidades: item.unidades,
          total_monto: 0,
          confirmada: true,
          validada_por_empleado_id: data.context.empleadoId,
          validada_en: new Date().toISOString(),
          observaciones: null,
          origen: 'OFFLINE_SYNC',
          metadata: {
            captura_local: true,
            origen_panel: 'dashboard_sales_cart',
            jornada_contexto_id: data.context.attendanceId,
            fecha_operativa: data.context.fechaOperacion,
            metodo_ingreso: offline.isOnline ? 'ONLINE' : 'OFFLINE_SYNC',
            ventana_timezone: data.reportWindow.timezone,
            ventana_estado: data.reportWindow.stateName,
          },
        });
      }

      if (offline.isOnline) {
        await offline.syncNow();
      }

      const message = offline.isOnline ? `${cart.length} registro(s) de venta guardados.` : `${cart.length} registro(s) de venta guardados en local.`;
      setCart([]);
      setSearch('');
      setUnits('1');
      onSuccess(message, cart.length);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No fue posible guardar las ventas.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {catalogoProductos.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          {isCatalogLoading ? (
            'Cargando catalogo de productos...'
          ) : (
            <div className="space-y-3">
              <p>Catalogo de productos no disponible.</p>
              <button
                type="button"
                onClick={() => {
                  catalogFetchAttempted.current = false;
                  setLocalMessage(null);
                  setCatalogRetryNonce((current) => current + 1);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      ) : (
        <ProductPicker products={catalogoProductos} search={search} selectedProductId={selectedProductId} onSearchChange={setSearch} onSelectProduct={setSelectedProductId} />
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Piezas">
          <input value={units} onChange={(event) => setUnits(event.target.value)} inputMode="numeric" className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100" />
        </Field>
        <button type="button" onClick={handleAdd} disabled={!selectedProduct || !parsedUnits} className="inline-flex min-h-11 items-center justify-center rounded-[16px] bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Agregar al carrito</button>
      </div>      <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-950">Carrito de ventas</p>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{cart.length} item(s)</span>
        </div>
        {cart.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Busca productos, elige piezas y agregalos antes de guardar.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {cart.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-[16px] border border-slate-100 bg-slate-50 px-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.productoNombreCorto}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.productoSku} · {item.unidades} pieza(s)</p>
                </div>
                <button type="button" onClick={() => setCart((current) => current.filter((cartItem) => cartItem.id !== item.id))} className="text-xs font-semibold text-rose-600">Quitar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {localMessage && <p className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{localMessage}</p>}

      {!canOperate && <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{data.reportWindow.helper}</p>}

      <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        <button type="submit" disabled={!canSave || isSaving} className="inline-flex min-h-12 w-full items-center justify-center rounded-[18px] bg-emerald-500 px-4 py-3 text-base font-semibold text-white shadow-[0_14px_28px_rgba(16,185,129,0.24)] disabled:opacity-40">{isSaving ? 'Guardando...' : 'Guardar ventas'}</button>
      </div>
    </form>
  );
}

export function DermoLoveCartSheet({ data, onSuccess, onError }: { data: DashboardDermoconsejoData; onSuccess: (message: string, savedCount: number) => void; onError: (message: string) => void }) {
  const offline = useOfflineSync();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [ticket, setTicket] = useState('');
  const [cart, setCart] = useState<LoveCartItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const canOperate = Boolean(data.context.cuentaClienteId && data.context.pdvId && data.context.attendanceId && data.reportWindow.canReportToday && data.loveQr?.estado === 'ACTIVO');
  const canSave = canOperate && cart.length > 0;

  const handleAdd = () => {
    if (!name.trim()) {
      setLocalMessage('Captura el nombre del cliente antes de agregarlo.');
      return;
    }

    setCart((current) => [...current, { id: crypto.randomUUID(), afiliadoNombre: name.trim(), afiliadoContacto: contact.trim() || null, ticketFolio: ticket.trim() || null }]);
    setName('');
    setContact('');
    setTicket('');
    setLocalMessage('Afiliacion agregada al carrito.');
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canOperate || !data.context.cuentaClienteId || !data.context.pdvId || !data.context.attendanceId) {
      onError(data.loveQr?.estado !== 'ACTIVO' ? 'No tienes un QR oficial activo asignado para registrar LOVE ISDIN.' : data.reportWindow.helper);
      return;
    }

    if (cart.length === 0) {
      onError('Agrega al menos una afiliacion al carrito antes de guardar.');
      return;
    }

    setIsSaving(true);
    setLocalMessage(null);

    try {
      for (const item of cart) {
        await queueOfflineLoveIsdin({
          id: crypto.randomUUID(),
          cuenta_cliente_id: data.context.cuentaClienteId,
          asistencia_id: data.context.attendanceId,
          empleado_id: data.context.empleadoId,
          pdv_id: data.context.pdvId,
          afiliado_nombre: item.afiliadoNombre,
          afiliado_contacto: item.afiliadoContacto ?? undefined,
          ticket_folio: item.ticketFolio ?? undefined,
          fecha_utc: new Date().toISOString(),
          origen: 'OFFLINE_SYNC',
          metadata: {
            capturado_desde: 'dashboard_love_cart',
            fecha_operativa: data.context.fechaOperacion,
            metodo_ingreso: offline.isOnline ? 'ONLINE' : 'OFFLINE_SYNC',
            ventana_timezone: data.reportWindow.timezone,
            ventana_estado: data.reportWindow.stateName ?? undefined,
          },
        });
      }

      if (offline.isOnline) {
        await offline.syncNow();
      }

      const message = offline.isOnline ? `${cart.length} afiliacion(es) LOVE ISDIN guardadas.` : `${cart.length} afiliacion(es) LOVE ISDIN guardadas en local.`;
      setCart([]);
      onSuccess(message, cart.length);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No fue posible guardar LOVE ISDIN.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-5 text-center shadow-[0_16px_40px_rgba(244,114,182,0.14)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">LOVE ISDIN</p>
        <div className="mt-4 flex justify-center">
          {data.loveQr?.imageUrl ? <img src={data.loveQr.imageUrl} alt="QR personal LOVE ISDIN" className="h-36 w-36 rounded-[24px] border border-rose-200 bg-white p-3" /> : <div className="flex h-36 w-36 items-center justify-center rounded-[24px] border border-rose-200 bg-white px-4 text-center text-sm text-rose-400">QR oficial no asignado</div>}
        </div>
        <p className="mt-3 text-sm font-medium text-rose-700">Acumula varias afiliaciones y guardalas al final.</p>
      </div>

      <div className="grid gap-4">
        <Field label="Nombre del cliente"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" className="mt-2 w-full rounded-[16px] border border-rose-200 bg-rose-50/40 px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100" /></Field>
        <Field label="Correo o contacto"><input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="cliente@correo.com" className="mt-2 w-full rounded-[16px] border border-rose-200 bg-rose-50/40 px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100" /></Field>
        <Field label="Ticket o folio opcional"><input value={ticket} onChange={(event) => setTicket(event.target.value)} placeholder="Folio de apoyo" className="mt-2 w-full rounded-[16px] border border-rose-200 bg-rose-50/40 px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100" /></Field>
      </div>

      <button type="button" onClick={handleAdd} disabled={!name.trim()} className="inline-flex min-h-11 w-full items-center justify-center rounded-[16px] bg-rose-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Agregar al carrito</button>      <div className="rounded-[20px] border border-rose-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-950">Carrito LOVE ISDIN</p>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">{cart.length} item(s)</span>
        </div>
        {cart.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Agrega una o varias afiliaciones y guardalas juntas.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {cart.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-[16px] border border-rose-100 bg-rose-50/40 px-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.afiliadoNombre}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.afiliadoContacto ?? 'Sin contacto'}{item.ticketFolio ? ` · ${item.ticketFolio}` : ''}</p>
                </div>
                <button type="button" onClick={() => setCart((current) => current.filter((cartItem) => cartItem.id !== item.id))} className="text-xs font-semibold text-rose-600">Quitar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {localMessage && <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{localMessage}</p>}
      {!canOperate && <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{data.loveQr?.estado !== 'ACTIVO' ? 'No tienes un QR oficial activo asignado para registrar LOVE ISDIN.' : data.reportWindow.helper}</p>}

      <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        <button type="submit" disabled={!canSave || isSaving} className="inline-flex min-h-12 w-full items-center justify-center rounded-[18px] bg-rose-500 px-4 py-3 text-base font-semibold text-white shadow-[0_14px_28px_rgba(244,114,182,0.28)] disabled:opacity-40">{isSaving ? 'Guardando...' : 'Guardar afiliaciones'}</button>
      </div>
    </form>
  );
}

export function DermoRegistroExtemporaneoSheet({ data, onClose, onSuccess }: { data: DashboardDermoconsejoData; onClose: () => void; onSuccess: (message: string) => void }) {
  const [state, formAction] = useActionState(registrarRegistroExtemporaneo, ESTADO_SOLICITUD_INICIAL);
  const [activeTab, setActiveTab] = useState<'VENTA' | 'LOVE_ISDIN'>('VENTA');
  const [fechaOperativa, setFechaOperativa] = useState(getPreviousDateValue());
  const [motivo, setMotivo] = useState('');
  const [catalogoProductos, setCatalogoProductos] = useState(data.catalogoProductos);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const catalogFetchAttempted = useRef(false);
  const [catalogRetryNonce, setCatalogRetryNonce] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(data.catalogoProductos[0]?.id ?? '');
  const [units, setUnits] = useState('1');
  const [ventasCart, setVentasCart] = useState<VentaCartItem[]>([]);
  const [loveName, setLoveName] = useState('');
  const [loveContact, setLoveContact] = useState('');
  const [loveTicket, setLoveTicket] = useState('');
  const [loveCart, setLoveCart] = useState<LoveCartItem[]>([]);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  useEffect(() => {
    setCatalogoProductos(data.catalogoProductos);
  }, [data.catalogoProductos]);

  useEffect(() => {
    if (activeTab !== 'VENTA') {
      return;
    }

    if (catalogoProductos.length > 0 || isCatalogLoading) {
      return;
    }

    if (catalogFetchAttempted.current) {
      return;
    }

    catalogFetchAttempted.current = true;
    setIsCatalogLoading(true);
    void (async () => {
      try {
        const response = await fetch('/api/catalogo/productos', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const payload = (await response.json()) as {
          data?: DashboardDermoconsejoData['catalogoProductos'];
          message?: string;
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.message ?? 'No fue posible cargar el catalogo de productos.');
        }

        setCatalogoProductos(payload.data);
        if (!selectedProductId && payload.data[0]?.id) {
          setSelectedProductId(payload.data[0].id);
        }
      } catch (error) {
        setLocalMessage(error instanceof Error ? error.message : 'No fue posible cargar el catalogo de productos.');
      } finally {
        setIsCatalogLoading(false);
      }
    })();
  }, [activeTab, catalogoProductos.length, catalogRetryNonce, isCatalogLoading, selectedProductId]);

  useEffect(() => {
    if (selectedProductId || catalogoProductos.length === 0) {
      return;
    }

    setSelectedProductId(catalogoProductos[0]?.id ?? '');
  }, [catalogoProductos, selectedProductId]);

  const selectedProduct = catalogoProductos.find((item) => item.id === selectedProductId) ?? null;
  const parsedUnits = parsePositiveUnits(units);
  const canSubmit = Boolean(data.context.cuentaClienteId && motivo.trim() && (activeTab === 'VENTA' ? ventasCart.length > 0 : loveCart.length > 0));

  useEffect(() => {
    if (!state.ok || !state.message) {
      return;
    }

    setFechaOperativa(getPreviousDateValue());
    setMotivo('');
    setSearch('');
    setUnits('1');
    setVentasCart([]);
    setLoveName('');
    setLoveContact('');
    setLoveTicket('');
    setLoveCart([]);
    setLocalMessage(null);
    onSuccess(state.message);
    onClose();
  }, [onClose, onSuccess, state.message, state.ok]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="cuenta_cliente_id" value={data.context.cuentaClienteId ?? ''} />
      <input type="hidden" name="empleado_id" value={data.context.empleadoId} />
      <input type="hidden" name="tipo_registro" value={activeTab} />
      <input type="hidden" name="fecha_operativa" value={fechaOperativa} />
      <input type="hidden" name="motivo" value={motivo} />
      <input type="hidden" name="venta_items_json" value={JSON.stringify(ventasCart)} />
      <input type="hidden" name="love_items_json" value={JSON.stringify(loveCart)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha a regularizar"><input type="date" value={fechaOperativa} onChange={(event) => setFechaOperativa(event.target.value)} max={getPreviousDateValue()} className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100" required /></Field>
        <Field label="Justificacion obligatoria"><textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} rows={3} placeholder="Explica por que no pudiste registrar dentro de la ventana estandar." className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100" required /></Field>
      </div>

      <Field label="Evidencia opcional"><input name="evidencia" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-[14px] file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" /></Field>
      <div className="flex flex-wrap gap-2"><TabButton active={activeTab === 'VENTA'} onClick={() => setActiveTab('VENTA')}>Ventas</TabButton><TabButton active={activeTab === 'LOVE_ISDIN'} onClick={() => setActiveTab('LOVE_ISDIN')}>LOVE ISDIN</TabButton></div>

      {activeTab === 'VENTA' ? (
        <div className="space-y-4 rounded-[22px] border border-amber-200 bg-amber-50/40 p-4">
          {catalogoProductos.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-amber-200 bg-white/70 px-4 py-6 text-center text-sm text-amber-900">
              {isCatalogLoading ? (
                'Cargando catalogo de productos...'
              ) : (
                <div className="space-y-3">
                  <p>Catalogo de productos no disponible.</p>
                  <button
                    type="button"
                    onClick={() => {
                      catalogFetchAttempted.current = false;
                      setCatalogRetryNonce((current) => current + 1);
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100"
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <ProductPicker products={catalogoProductos} search={search} selectedProductId={selectedProductId} onSearchChange={setSearch} onSelectProduct={setSelectedProductId} />
          )}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Piezas"><input value={units} onChange={(event) => setUnits(event.target.value)} inputMode="numeric" className="mt-2 w-full rounded-[14px] border border-border bg-white px-4 py-3 text-base text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100" /></Field>
            <button type="button" onClick={() => {
              if (!selectedProduct || !parsedUnits) {
                setLocalMessage('Selecciona un producto valido y una cantidad mayor a cero.');
                return;
              }
              setVentasCart((current) => [...current, { id: crypto.randomUUID(), productoId: selectedProduct.id, productoSku: selectedProduct.sku, productoNombre: selectedProduct.nombre, productoNombreCorto: selectedProduct.nombreCorto, unidades: parsedUnits }]);
              setUnits('1');
              setLocalMessage(`${selectedProduct.nombreCorto} agregado al carrito extemporaneo.`);
            }} className="inline-flex min-h-11 items-center justify-center rounded-[16px] bg-amber-500 px-4 py-3 text-sm font-semibold text-white">Agregar venta</button>
          </div>
          <div className="space-y-2">
            {ventasCart.length === 0 ? <p className="rounded-[16px] border border-dashed border-amber-300 bg-white px-4 py-4 text-sm text-slate-500">Todavia no hay productos en este registro extemporaneo.</p> : ventasCart.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-[16px] border border-amber-100 bg-white px-3 py-3"><div><p className="text-sm font-semibold text-slate-900">{item.productoNombreCorto}</p><p className="mt-1 text-xs text-slate-500">{item.productoSku} · {item.unidades} pieza(s)</p></div><button type="button" onClick={() => setVentasCart((current) => current.filter((cartItem) => cartItem.id !== item.id))} className="text-xs font-semibold text-rose-600">Quitar</button></div>)}
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-[22px] border border-rose-200 bg-rose-50/40 p-4">
          <Field label="Nombre del cliente"><input value={loveName} onChange={(event) => setLoveName(event.target.value)} className="mt-2 w-full rounded-[14px] border border-border bg-white px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100" placeholder="Nombre completo" /></Field>
          <Field label="Correo o contacto"><input value={loveContact} onChange={(event) => setLoveContact(event.target.value)} className="mt-2 w-full rounded-[14px] border border-border bg-white px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100" placeholder="cliente@correo.com" /></Field>
          <Field label="Folio o ticket opcional"><input value={loveTicket} onChange={(event) => setLoveTicket(event.target.value)} className="mt-2 w-full rounded-[14px] border border-border bg-white px-4 py-3 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100" placeholder="Folio de apoyo" /></Field>
          <button type="button" onClick={() => {
            if (!loveName.trim()) {
              setLocalMessage('Captura el nombre del cliente antes de agregarlo.');
              return;
            }
            setLoveCart((current) => [...current, { id: crypto.randomUUID(), afiliadoNombre: loveName.trim(), afiliadoContacto: loveContact.trim() || null, ticketFolio: loveTicket.trim() || null }]);
            setLoveName('');
            setLoveContact('');
            setLoveTicket('');
            setLocalMessage('Afiliacion agregada al carrito extemporaneo.');
          }} className="inline-flex min-h-11 w-full items-center justify-center rounded-[16px] bg-rose-500 px-4 py-3 text-sm font-semibold text-white">Agregar afiliacion</button>
          <div className="space-y-2">
            {loveCart.length === 0 ? <p className="rounded-[16px] border border-dashed border-rose-300 bg-white px-4 py-4 text-sm text-slate-500">Todavia no hay afiliaciones en este registro extemporaneo.</p> : loveCart.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-[16px] border border-rose-100 bg-white px-3 py-3"><div><p className="text-sm font-semibold text-slate-900">{item.afiliadoNombre}</p><p className="mt-1 text-xs text-slate-500">{item.afiliadoContacto ?? 'Sin contacto'}{item.ticketFolio ? ` · ${item.ticketFolio}` : ''}</p></div><button type="button" onClick={() => setLoveCart((current) => current.filter((cartItem) => cartItem.id !== item.id))} className="text-xs font-semibold text-rose-600">Quitar</button></div>)}
          </div>
        </div>
      )}

      {localMessage && <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{localMessage}</p>}
      {!data.context.cuentaClienteId && <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Falta una cuenta operativa valida para solicitar el registro extemporaneo.</p>}
      {state.message && !state.ok && <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{state.message}</p>}
      <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Tu supervisor revisara este buffer antes de consolidarlo hacia Ventas o LOVE ISDIN.</div>
      <div className="sticky bottom-0 bg-white pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2"><button type="submit" disabled={!canSubmit} className="inline-flex min-h-12 w-full items-center justify-center rounded-[18px] bg-amber-500 px-4 py-3 text-base font-semibold text-white shadow-[0_14px_28px_rgba(245,158,11,0.24)] disabled:opacity-40">Guardar {activeTab === 'VENTA' ? 'ventas extemporaneas' : 'LOVE ISDIN extemporaneo'}</button></div>
    </form>
  );
}
