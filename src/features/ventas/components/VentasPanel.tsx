'use client';

import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { OfflineStatusCard } from '@/components/pwa/OfflineStatusCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import type { ActorActual } from '@/lib/auth/session';
import { queueOfflineVenta } from '@/lib/offline/syncQueue';
import { useScopedWidgetData } from '@/lib/ui-change/client';
import { getUiChangeScopeKeysForActor } from '@/lib/ui-change/types';
import type { VentasPanelData } from '../services/ventaService';
import { ExtemporaneoQueueSection } from '@/features/solicitudes/components/ExtemporaneoQueueSection';
import { exportarVentasToExcel } from '../lib/ventaExport';
import type { LoveIsdinPanelData } from '@/features/love-isdin/services/loveIsdinService';
import { exportarLoveIsdinKpisToExcel } from '@/features/love-isdin/lib/loveIsdinExport';
import { VentasVerticalDrillDown } from './VentasVerticalDrillDown';
import { TablaSemanalReporte } from './TablaSemanalReporte';
import { ModalTablaSemanalFullscreen } from './ModalTablaSemanalFullscreen';
import { AppGlyph } from '@/components/ui/AppGlyph';

function getLocalDateValue() {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function getLocalTimeValue() {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function getWeekStartIso(dayIso: string) {
  const [year, month, day] = dayIso.split('-').map((v) => parseInt(v, 10));
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function buildPageHref(data: VentasPanelData, page: number, month?: string | null) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(data.paginacion.pageSize));
  if (month) {
    params.set('month', month);
  }
  return `/ventas?${params.toString()}`;
}

export function getCalendarWeekMondayBased(dateStr: string): 1 | 2 | 3 | 4 | 5 {
  if (!dateStr) return 1;
  const parts = dateStr.split('-');
  if (parts.length < 3) return 1;
  const year = parseInt(parts[0], 10);
  const monthIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const dayOfWeek1st = (firstDay.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6

  const weekNum = Math.floor((day - 1 + dayOfWeek1st) / 7) + 1;
  return Math.min(Math.max(weekNum, 1), 5) as 1 | 2 | 3 | 4 | 5;
}

export function getSucursalCorta(nombre: string): string {
  if (!nombre) return 'PDV sin nombre';
  let clean = nombre.trim();

  // Si contiene un prefijo tipo "BTL-... - " o "BTL-... • ", extraer solo el nombre de la sucursal
  clean = clean.replace(/^[A-Z0-9_-]*BTL-[A-Z0-9_-]+\s*[-•:]\s*/i, '').trim();

  return clean
    .replace(/^Farmacias\s+San\s+Pablo\s+/i, 'SP ')
    .replace(/^San\s+Pablo\s+/i, 'SP ')
    .replace(/^S\s+Pablo\s+/i, 'SP ')
    .replace(/^Farmacias\s+del\s+Ahorro\s+/i, 'FA ')
    .replace(/^F\s+Ahorro\s+/i, 'FA ')
    .replace(/^Farmacias\s+Benavides\s+/i, 'Benavides ')
    .replace(/^Chedraui\s+Selecto\s+/i, 'Ched. ')
    .replace(/^Chedraui\s+/i, 'Ched. ')
    .replace(/^City\s+Market\s+/i, 'City Mkt ')
    .replace(/^Fresko\s+/i, 'Fresko ')
    .replace(/^La\s+Comer\s+/i, 'Comer ')
    .replace(/^Palacio\s+de\s+Hierro\s+/i, 'Palacio ')
    .trim();
}

export function formatNombreDcCorto(nombre: string): string {
  if (!nombre) return 'Sin dermo';
  const rawTokens = nombre.trim().split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return 'Sin dermo';
  const tokens = rawTokens.map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

  if (tokens.length === 1) return tokens[0];
  if (tokens.length === 2) return `${tokens[0]} ${tokens[1]}`;

  const compoundFirstNames = new Set(['Ana', 'Ma', 'Ma.', 'Maria', 'María', 'Jose', 'José', 'Juan', 'Luis']);
  if (compoundFirstNames.has(tokens[0]) && tokens.length >= 3) {
    return `${tokens[0]} ${tokens[1]} ${tokens[2].charAt(0)}.`;
  }

  return `${tokens[0]} ${tokens[1]}${tokens.length > 2 ? ` ${tokens[2].charAt(0)}.` : ''}`;
}

export function VentasPanel({
  actor,
  data: initialData,
  showBackButton,
}: {
  actor: ActorActual;
  data: VentasPanelData;
  showBackButton?: boolean;
}) {
  const offline = useOfflineSync();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const scopeKeys = useMemo(() => getUiChangeScopeKeysForActor(actor), [actor]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set('page', searchParams.get('page') ?? String(initialData.paginacion.page));
      params.set('pageSize', searchParams.get('pageSize') ?? String(initialData.paginacion.pageSize));
      const month = searchParams.get('month');
      if (month) {
        params.set('month', month);
      }
      params.set('refresh', 'true');

      const response = await fetch(`/api/ventas/panel?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error('No fue posible actualizar las ventas.');
      }

      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 600);
    }
  };

  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const params = new URLSearchParams();
      params.set('page', searchParams.get('page') ?? String(initialData.paginacion.page));
      params.set(
        'pageSize',
        searchParams.get('pageSize') ?? String(initialData.paginacion.pageSize)
      );
      const defaultMonth = getLocalDateValue().slice(0, 7);
      const month = searchParams.get('month') || (fechaInicio ? fechaInicio.slice(0, 7) : defaultMonth);
      if (month) {
        params.set('month', month);
      }

      const response = await fetch(`/api/ventas/panel?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      const payload = (await response.json()) as { data?: VentasPanelData; message?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? 'No fue posible refrescar el panel de ventas.');
      }

      return payload.data;
    },
    [initialData.paginacion.page, initialData.paginacion.pageSize, searchParams, fechaInicio]
  );

  const { data: scopedData } = useScopedWidgetData({
    initialData,
    module: 'ventas',
    surfaces: ['panel', 'tabla', 'metricas', 'inbox', 'all'],
    scopeKeys,
    roleTargets: [actor.puesto],
    fetcher,
    debounceMs: 650,
  });

  const [panelData, setPanelData] = useState<VentasPanelData>(scopedData || initialData);

  useEffect(() => {
    if (scopedData) {
      setPanelData(scopedData);
    }
  }, [scopedData]);

  const data = panelData;

  const todayOperationDate = getLocalDateValue();
  const esAdmin = actor.puesto === 'ADMINISTRADOR';
  const esSupervisor = actor.puesto === 'SUPERVISOR';
  const esVisualizador = ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'VENTAS'].includes(actor.puesto);
  const esVisualizadorReporte = ['ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR'].includes(actor.puesto);

  const [activeTab, setActiveTab] = useState<'detalle' | 'dermo' | 'sucursal'>('detalle');
  const [viewMode, setViewMode] = useState<'vertical' | 'tablas'>('vertical');
  const [searchTerm, setSearchTerm] = useState('');

  const activeMonth = searchParams.get('month') || (fechaInicio ? fechaInicio.slice(0, 7) : todayOperationDate.slice(0, 7));

  const monthLimits = useMemo(() => {
    const [yearStr, monthStr] = activeMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start: `${activeMonth}-01`,
      end: `${activeMonth}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [activeMonth]);

  const [rango, setRango] = useState<'hoy' | 'semana' | 'mes' | 'personalizado'>('mes');
  const [selectedPdvId, setSelectedPdvId] = useState<string>('');
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string>('');
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');
  const [selectedZona, setSelectedZona] = useState<string>('');
  const [selectedCadena, setSelectedCadena] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isFiltrosOpen, setIsFiltrosOpen] = useState(false);
  const [isLoveFiltrosOpen, setIsLoveFiltrosOpen] = useState(false);
  const [isFullscreenTable, setIsFullscreenTable] = useState(false);
  const [isLoveFullscreenTable, setIsLoveFullscreenTable] = useState(false);

  const [activeYearStr, activeMonthStr] = (activeMonth || '').split('-');
  const monthNum = parseInt(activeMonthStr, 10);
  const MESES_NOMBRES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const mesActualNombre = (monthNum && MESES_NOMBRES[monthNum - 1]) ? MESES_NOMBRES[monthNum - 1] : activeMonth;

  useEffect(() => {
    if (rango === 'mes') {
      setFechaInicio(monthLimits.start);
      setFechaFin(monthLimits.end);
    } else if (rango === 'hoy') {
      setFechaInicio(todayOperationDate);
      setFechaFin(todayOperationDate);
    } else if (rango === 'semana') {
      const weekStart = getWeekStartIso(todayOperationDate);
      const startDate = new Date(`${weekStart}T12:00:00Z`);
      const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
      const weekEnd = endDate.toISOString().slice(0, 10);
      setFechaInicio(weekStart);
      setFechaFin(weekEnd);
    }
  }, [rango, monthLimits, todayOperationDate]);

  const filteredDataset = useMemo(() => {
    let list = data.dataset || [];

    if (actor.puesto === 'SUPERVISOR') {
      list = list.filter((item) => item.supervisorId === actor.empleadoId);
    }

    if (fechaInicio || fechaFin) {
      list = list.filter((item) => {
        if (!item.fechaOperacion) return true; // Mantener marcadores de posición
        if (fechaInicio && item.fechaOperacion < fechaInicio) return false;
        if (fechaFin && item.fechaOperacion > fechaFin) return false;
        return true;
      });
    }

    if (selectedPdvId) {
      list = list.filter((item) => item.pdvId === selectedPdvId);
    }
    if (selectedEmpleadoId) {
      list = list.filter((item) => item.empleadoId === selectedEmpleadoId);
    }
    if (selectedSupervisorId) {
      list = list.filter((item) => item.supervisorId === selectedSupervisorId);
    }
    if (selectedZona) {
      list = list.filter((item) => item.zona === selectedZona);
    }
    if (selectedCadena) {
      list = list.filter((item) => item.cadena === selectedCadena);
    }

    return list;
  }, [
    data.dataset,
    fechaInicio,
    fechaFin,
    selectedPdvId,
    selectedEmpleadoId,
    selectedSupervisorId,
    selectedZona,
    selectedCadena,
    actor,
  ]);

  const filteredKpi = useMemo(() => {
    let total = 0;
    let confirmadas = 0;
    let pendientesConfirmacion = 0;
    let unidades = 0;
    let monto = 0;

    filteredDataset.forEach((item) => {
      total += item.total;
      if (item.confirmada) {
        confirmadas += item.total;
      } else {
        pendientesConfirmacion += item.total;
      }
      unidades += item.totalUnidades;
      monto += item.totalMonto;
    });

    return {
      total,
      confirmadas,
      pendientesConfirmacion,
      unidades,
      monto,
    };
  }, [filteredDataset]);

  const uniqueZonas = useMemo(() => {
    const set = new Set<string>();
    const baseList = actor.puesto === 'SUPERVISOR'
      ? (data.dataset || []).filter((item) => item.supervisorId === actor.empleadoId)
      : (data.dataset || []);
    baseList.forEach((item) => {
      if (item.zona) set.add(item.zona);
    });
    return Array.from(set).sort();
  }, [data.dataset, actor]);

  const uniqueCadenas = useMemo(() => {
    const set = new Set<string>();
    const baseList = actor.puesto === 'SUPERVISOR'
      ? (data.dataset || []).filter((item) => item.supervisorId === actor.empleadoId)
      : (data.dataset || []);
    baseList.forEach((item) => {
      if (item.cadena) set.add(item.cadena);
    });
    return Array.from(set).sort();
  }, [data.dataset, actor]);

  const filteredPdvsDropdown = useMemo(() => {
    if (actor.puesto !== 'SUPERVISOR') return data.pdvs || [];
    const set = new Set<string>();
    (data.dataset || []).forEach((item) => {
      if (item.supervisorId === actor.empleadoId) {
        set.add(item.pdvId);
      }
    });
    return (data.pdvs || []).filter((p) => set.has(p.id));
  }, [data.pdvs, data.dataset, actor]);

  const filteredEmpleadosDropdown = useMemo(() => {
    if (actor.puesto !== 'SUPERVISOR') return data.empleados || [];
    const set = new Set<string>();
    (data.dataset || []).forEach((item) => {
      if (item.supervisorId === actor.empleadoId) {
        set.add(item.empleadoId);
      }
    });
    return (data.empleados || []).filter((e) => set.has(e.id));
  }, [data.empleados, data.dataset, actor]);

  const buildAggregate = useCallback((
    datasetList: typeof data.dataset,
    keyExtractor: (item: typeof data.dataset[0]) => { id: string; label: string; helper: string | null }
  ) => {
    const map = new Map<string, {
      id: string;
      label: string;
      helper: string | null;
      total: number;
      confirmadas: number;
      pendientes: number;
      unidades: number;
    }>();

    datasetList.forEach((item) => {
      const info = keyExtractor(item);
      let existing = map.get(info.id);
      if (!existing) {
        existing = {
          id: info.id,
          label: info.label,
          helper: info.helper,
          total: 0,
          confirmadas: 0,
          pendientes: 0,
          unidades: 0,
        };
        map.set(info.id, existing);
      }
      existing.total += item.total;
      if (item.confirmada) {
        existing.confirmadas += item.total;
      } else {
        existing.pendientes += item.total;
      }
      existing.unidades += item.totalUnidades;
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, []);

  const porPdv = useMemo(() => {
    return buildAggregate(filteredDataset, (item) => ({
      id: item.pdvId,
      label: item.pdvLabel,
      helper: item.zona,
    }));
  }, [filteredDataset, buildAggregate]);

  const porDc = useMemo(() => {
    return buildAggregate(filteredDataset, (item) => ({
      id: item.empleadoId,
      label: item.empleadoLabel,
      helper: item.zona,
    }));
  }, [filteredDataset, buildAggregate]);

  const porSupervisor = useMemo(() => {
    return buildAggregate(filteredDataset, (item) => ({
      id: item.supervisorId || 'sin-sup',
      label: item.supervisorLabel,
      helper: item.zona,
    }));
  }, [filteredDataset, buildAggregate]);

  const porCadena = useMemo(() => {
    return buildAggregate(filteredDataset, (item) => ({
      id: item.cadena,
      label: item.cadena,
      helper: null,
    }));
  }, [filteredDataset, buildAggregate]);

  const diaria = useMemo(() => {
    const map = new Map<string, {
      bucket: string;
      total: number;
      confirmadas: number;
      pendientes: number;
      unidades: number;
    }>();

    filteredDataset.forEach((item) => {
      const day = item.fechaOperacion;
      if (!day) return; // Skip placeholder rows
      let existing = map.get(day);
      if (!existing) {
        existing = {
          bucket: day,
          total: 0,
          confirmadas: 0,
          pendientes: 0,
          unidades: 0,
        };
        map.set(day, existing);
      }
      existing.total += item.total;
      if (item.confirmada) {
        existing.confirmadas += item.total;
      } else {
        existing.pendientes += item.total;
      }
      existing.unidades += item.totalUnidades;
    });

    return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [filteredDataset]);

  const semanal = useMemo(() => {
    const map = new Map<string, {
      bucket: string;
      total: number;
      confirmadas: number;
      pendientes: number;
      unidades: number;
    }>();

    filteredDataset.forEach((item) => {
      const week = item.weekBucket;
      if (!item.fechaOperacion) return; // Skip placeholder rows
      let existing = map.get(week);
      if (!existing) {
        existing = {
          bucket: week,
          total: 0,
          confirmadas: 0,
          pendientes: 0,
          unidades: 0,
        };
        map.set(week, existing);
      }
      existing.total += item.total;
      if (item.confirmada) {
        existing.confirmadas += item.total;
      } else {
        existing.pendientes += item.total;
      }
      existing.unidades += item.totalUnidades;
    });

    return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [filteredDataset]);

  const porDcSemanal = useMemo(() => {
    const groupedMap = new Map<string, {
      empleadoId: string;
      nombreDc: string;
      pdvId: string;
      sucursal: string;
      cadena: string;
      btlCve: string;
      supervisor: string;
      sem1: number;
      sem2: number;
      sem3: number;
      sem4: number;
      sem5: number;
      total: number;
    }>();

    filteredDataset.forEach((item) => {
      const btlCve = item.pdvClaveBtl || 'SIN BTL';
      const cadena = item.cadena || 'Sin cadena';
      const pdvId = item.pdvId || '';
      const sucursal = item.pdvNombre || 'PDV sin nombre';
      const nombreDc = item.empleadoLabel || 'Sin dermoconsejera';
      const supervisor = item.supervisorLabel || 'Sin supervisor';
      const empleadoId = item.empleadoId;

      const key = `${empleadoId}||${pdvId}`;

      let row = groupedMap.get(key);
      if (!row) {
        row = {
          empleadoId,
          nombreDc,
          pdvId,
          sucursal,
          cadena,
          btlCve,
          supervisor,
          sem1: 0,
          sem2: 0,
          sem3: 0,
          sem4: 0,
          sem5: 0,
          total: 0,
        };
        groupedMap.set(key, row);
      }

      const sem = getCalendarWeekMondayBased(item.fechaOperacion || '');

      const units = item.totalUnidades || 0;
      if (sem === 1) row.sem1 += units;
      else if (sem === 2) row.sem2 += units;
      else if (sem === 3) row.sem3 += units;
      else if (sem === 4) row.sem4 += units;
      else row.sem5 += units;

      row.total += units;
    });

    return Array.from(groupedMap.values()).sort((a, b) => {
      const compDc = a.nombreDc.localeCompare(b.nombreDc, 'es-MX');
      if (compDc !== 0) return compDc;
      return a.sucursal.localeCompare(b.sucursal, 'es-MX');
    });
  }, [filteredDataset]);

  const porDcConsolidado = useMemo(() => {
    const groupedMap = new Map<string, {
      empleadoId: string;
      nombreDc: string;
      supervisor: string;
      sem1: number;
      sem2: number;
      sem3: number;
      sem4: number;
      sem5: number;
      total: number;
    }>();

    filteredDataset.forEach((item) => {
      const nombreDc = item.empleadoLabel || 'Sin dermoconsejera';
      const supervisor = item.supervisorLabel || 'Sin supervisor';
      const empleadoId = item.empleadoId;

      let row = groupedMap.get(empleadoId);
      if (!row) {
        row = {
          empleadoId,
          nombreDc,
          supervisor,
          sem1: 0,
          sem2: 0,
          sem3: 0,
          sem4: 0,
          sem5: 0,
          total: 0,
        };
        groupedMap.set(empleadoId, row);
      }

      const sem = getCalendarWeekMondayBased(item.fechaOperacion || '');

      const units = item.totalUnidades || 0;
      if (sem === 1) row.sem1 += units;
      else if (sem === 2) row.sem2 += units;
      else if (sem === 3) row.sem3 += units;
      else if (sem === 4) row.sem4 += units;
      else row.sem5 += units;

      row.total += units;
    });

    return Array.from(groupedMap.values()).sort((a, b) =>
      a.nombreDc.localeCompare(b.nombreDc, 'es-MX')
    );
  }, [filteredDataset]);

  const porPdvConsolidado = useMemo(() => {
    const groupedMap = new Map<string, {
      pdvId: string;
      sucursal: string;
      cadena: string;
      btlCve: string;
      sem1: number;
      sem2: number;
      sem3: number;
      sem4: number;
      sem5: number;
      total: number;
    }>();

    filteredDataset.forEach((item) => {
      const btlCve = item.pdvClaveBtl || 'SIN BTL';
      const cadena = item.cadena || 'Sin cadena';
      const pdvId = item.pdvId || '';
      const sucursal = item.pdvNombre || 'PDV sin nombre';

      let row = groupedMap.get(pdvId);
      if (!row) {
        row = {
          pdvId,
          sucursal,
          cadena,
          btlCve,
          sem1: 0,
          sem2: 0,
          sem3: 0,
          sem4: 0,
          sem5: 0,
          total: 0,
        };
        groupedMap.set(pdvId, row);
      }

      const sem = getCalendarWeekMondayBased(item.fechaOperacion || '');

      const units = item.totalUnidades || 0;
      if (sem === 1) row.sem1 += units;
      else if (sem === 2) row.sem2 += units;
      else if (sem === 3) row.sem3 += units;
      else if (sem === 4) row.sem4 += units;
      else row.sem5 += units;

      row.total += units;
    });

    return Array.from(groupedMap.values()).sort((a, b) =>
      a.sucursal.localeCompare(b.sucursal, 'es-MX')
    );
  }, [filteredDataset]);

  const filteredPorDcSemanal = useMemo(() => {
    if (!searchTerm.trim()) return porDcSemanal;
    const term = searchTerm.toLowerCase();
    return porDcSemanal.filter(
      (r) =>
        r.nombreDc.toLowerCase().includes(term) ||
        r.sucursal.toLowerCase().includes(term) ||
        r.btlCve.toLowerCase().includes(term)
    );
  }, [porDcSemanal, searchTerm]);

  const filteredPorDcConsolidado = useMemo(() => {
    if (!searchTerm.trim()) return porDcConsolidado;
    const term = searchTerm.toLowerCase();
    return porDcConsolidado.filter(
      (r) =>
        r.nombreDc.toLowerCase().includes(term)
    );
  }, [porDcConsolidado, searchTerm]);

  const filteredPorPdvConsolidado = useMemo(() => {
    if (!searchTerm.trim()) return porPdvConsolidado;
    const term = searchTerm.toLowerCase();
    return porPdvConsolidado.filter(
      (r) =>
        r.sucursal.toLowerCase().includes(term) ||
        r.btlCve.toLowerCase().includes(term)
    );
  }, [porPdvConsolidado, searchTerm]);

  const { detalleTotalSem1, detalleTotalSem2, detalleTotalSem3, detalleTotalSem4, detalleTotalSem5, detalleTotalGrand } = useMemo(() => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, tot = 0;
    filteredPorDcSemanal.forEach((row) => {
      s1 += row.sem1;
      s2 += row.sem2;
      s3 += row.sem3;
      s4 += row.sem4;
      s5 += row.sem5;
      tot += row.total;
    });
    return {
      detalleTotalSem1: s1 || '-',
      detalleTotalSem2: s2 || '-',
      detalleTotalSem3: s3 || '-',
      detalleTotalSem4: s4 || '-',
      detalleTotalSem5: s5 || '-',
      detalleTotalGrand: tot,
    };
  }, [filteredPorDcSemanal]);

  const { dcTotalSem1, dcTotalSem2, dcTotalSem3, dcTotalSem4, dcTotalSem5, dcTotalGrand } = useMemo(() => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, tot = 0;
    filteredPorDcConsolidado.forEach((row) => {
      s1 += row.sem1;
      s2 += row.sem2;
      s3 += row.sem3;
      s4 += row.sem4;
      s5 += row.sem5;
      tot += row.total;
    });
    return {
      dcTotalSem1: s1 || '-',
      dcTotalSem2: s2 || '-',
      dcTotalSem3: s3 || '-',
      dcTotalSem4: s4 || '-',
      dcTotalSem5: s5 || '-',
      dcTotalGrand: tot,
    };
  }, [filteredPorDcConsolidado]);

  const { pdvTotalSem1, pdvTotalSem2, pdvTotalSem3, pdvTotalSem4, pdvTotalSem5, pdvTotalGrand } = useMemo(() => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, tot = 0;
    filteredPorPdvConsolidado.forEach((row) => {
      s1 += row.sem1;
      s2 += row.sem2;
      s3 += row.sem3;
      s4 += row.sem4;
      s5 += row.sem5;
      tot += row.total;
    });
    return {
      pdvTotalSem1: s1 || '-',
      pdvTotalSem2: s2 || '-',
      pdvTotalSem3: s3 || '-',
      pdvTotalSem4: s4 || '-',
      pdvTotalSem5: s5 || '-',
      pdvTotalGrand: tot,
    };
  }, [filteredPorPdvConsolidado]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const pdvOpt = data.pdvs.find((p) => p.id === selectedPdvId);
      const empOpt = data.empleados.find((e) => e.id === selectedEmpleadoId);
      const supOpt = data.supervisores.find((s) => s.id === selectedSupervisorId);

      await exportarVentasToExcel({
        range: rango,
        selectedMonth: activeMonth,
        filters: {
          pdvLabel: pdvOpt?.label,
          empleadoLabel: empOpt?.label,
          supervisorLabel: supOpt?.label,
          zona: selectedZona || undefined,
          cadena: selectedCadena || undefined,
        },
        kpiSummary: {
          total: filteredKpi.total,
          confirmadas: filteredKpi.confirmadas,
          pendientes: filteredKpi.pendientesConfirmacion,
          unidades: filteredKpi.unidades,
        },
        porPdv,
        porDc,
        porSupervisor,
        porCadena,
        diaria,
        semanal,
        dataset: filteredDataset,
      });
    } catch (err) {
      console.error('Error al exportar reporte:', err);
      alert('Ocurrió un error al generar el reporte de Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  const jornadasDisponibles = data.jornadasContexto.filter(
    (jornada) => jornada.estatus !== 'RECHAZADA' && jornada.fechaOperacion === todayOperationDate
  );

  const [jornadaId, setJornadaId] = useState(jornadasDisponibles[0]?.id ?? '');
  const [productoId, setProductoId] = useState(data.catalogoProductos[0]?.id ?? '');
  const [fechaVenta, setFechaVenta] = useState('');
  const [horaVenta, setHoraVenta] = useState('');
  const [totalUnidades, setTotalUnidades] = useState('1');
  const [confirmada, setConfirmada] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  const canPrev = data.paginacion.page > 1;
  const canNext = data.paginacion.page < data.paginacion.totalPages;

  const selectedJornada = jornadasDisponibles.find((item) => item.id === jornadaId) ?? null;
  const selectedProducto = data.catalogoProductos.find((item) => item.id === productoId) ?? null;

  useEffect(() => {
    setFechaVenta((current) => current || getLocalDateValue());
    setHoraVenta((current) => current || getLocalTimeValue());
  }, []);

  const handleQueueDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedJornada) {
      setFeedback({
        tone: 'error',
        message: 'Selecciona una jornada reciente para ligar la venta.',
      });
      return;
    }

    const units = Number(totalUnidades);
    if (!selectedProducto) {
      setFeedback({
        tone: 'error',
        message: 'Selecciona una producto del catalogo activo antes de guardar la venta.',
      });
      return;
    }

    if (!Number.isFinite(units) || units <= 0) {
      setFeedback({ tone: 'error', message: 'Las unidades deben ser mayores a cero.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await queueOfflineVenta({
        id: crypto.randomUUID(),
        cuenta_cliente_id: selectedJornada.cuentaClienteId,
        asistencia_id: selectedJornada.id,
        empleado_id: selectedJornada.empleadoId,
        pdv_id: selectedJornada.pdvId,
        producto_id: selectedProducto.id,
        producto_sku: selectedProducto.sku,
        producto_nombre: selectedProducto.nombre,
        producto_nombre_corto: selectedProducto.nombreCorto,
        fecha_utc: new Date(`${fechaVenta}T${horaVenta}:00`).toISOString(),
        total_unidades: units,
        total_monto: 0,
        confirmada,
        validada_por_empleado_id: confirmada ? selectedJornada.empleadoId : null,
        validada_en: confirmada ? new Date().toISOString() : null,
        observaciones: null,
        origen: 'OFFLINE_SYNC',
        metadata: {
          captura_local: true,
          origen_panel: 'ventas',
          jornada_contexto_id: selectedJornada.id,
          fecha_operativa: selectedJornada.fechaOperacion,
          metodo_ingreso: offline.isOnline ? 'APP_ONLINE' : 'APP_OFFLINE',
        },
      });

      if (offline.isOnline) {
        await offline.syncNow();
      }

      setFeedback({
        tone: 'success',
        message: offline.isOnline
          ? `${selectedProducto.nombreCorto} guardado. Puedes registrar otra venta.`
          : `${selectedProducto.nombreCorto} guardado en local. Puedes registrar otra venta.`,
      });
      setConfirmada(false);
      setTotalUnidades('1');
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'No fue posible guardar la venta offline.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const ventasFiltradas = useMemo(() => {
    let list = data.ventas;

    const currentSupervisorId = actor.puesto === 'SUPERVISOR' ? actor.empleadoId : selectedSupervisorId;

    if (selectedPdvId) {
      list = list.filter((v) => v.pdvId === selectedPdvId);
    }
    if (selectedEmpleadoId) {
      list = list.filter((v) => v.empleadoId === selectedEmpleadoId);
    }
    if (currentSupervisorId) {
      const empIdsWithSupervisor = new Set(
        (data.dataset || [])
          .filter((item) => item.supervisorId === currentSupervisorId)
          .map((item) => item.empleadoId)
      );
      list = list.filter((v) => empIdsWithSupervisor.has(v.empleadoId));
    }
    if (selectedZona) {
      const pdvIdsInZona = new Set(
        (data.dataset || [])
          .filter((item) => item.zona === selectedZona)
          .map((item) => item.pdvId)
      );
      list = list.filter((v) => pdvIdsInZona.has(v.pdvId));
    }
    if (selectedCadena) {
      const pdvIdsInCadena = new Set(
        (data.dataset || [])
          .filter((item) => item.cadena === selectedCadena)
          .map((item) => item.pdvId)
      );
      list = list.filter((v) => pdvIdsInCadena.has(v.pdvId));
    }
    if (fechaInicio || fechaFin) {
      list = list.filter((v) => {
        const dateStr = v.fechaUtc.slice(0, 10);
        if (fechaInicio && dateStr < fechaInicio) return false;
        if (fechaFin && dateStr > fechaFin) return false;
        return true;
      });
    }

    return list;
  }, [
    data.ventas,
    data.dataset,
    selectedPdvId,
    selectedEmpleadoId,
    selectedSupervisorId,
    selectedZona,
    selectedCadena,
    fechaInicio,
    fechaFin,
    actor,
  ]);

  const [mainTab, setMainTab] = useState<'ventas' | 'love-isdin'>('ventas');
  const [lovePanelData, setLovePanelData] = useState<LoveIsdinPanelData | null>(null);
  const [isLoveLoading, setIsLoveLoading] = useState<boolean>(false);
  const [loveSearchTerm, setLoveSearchTerm] = useState<string>('');
  const [loveActiveTab, setLoveActiveTab] = useState<'detalle' | 'dermo' | 'sucursal'>('detalle');
  const [isLoveExporting, setIsLoveExporting] = useState<boolean>(false);

  const fetchLoveData = useCallback(
    async (monthStr?: string) => {
      setIsLoveLoading(true);
      try {
        const targetMonth = monthStr || (fechaInicio ? fechaInicio.slice(0, 7) : activeMonth);
        const res = await fetch(`/api/love-isdin/panel?month=${targetMonth}&pageSize=500&refresh=true`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (res.ok) {
          const payload = (await res.json()) as { data?: LoveIsdinPanelData };
          if (payload.data) {
            setLovePanelData(payload.data);
          }
        }
      } catch (err) {
        console.error('Error fetching LOVE ISDIN panel:', err);
      } finally {
        setIsLoveLoading(false);
      }
    },
    [fechaInicio, activeMonth]
  );

  useEffect(() => {
    if (mainTab === 'love-isdin' && !lovePanelData) {
      fetchLoveData();
    }
  }, [mainTab, lovePanelData, fetchLoveData]);

  const filteredLoveDataset = useMemo(() => {
    if (!lovePanelData?.kpiDataset) return [];
    let list = lovePanelData.kpiDataset;

    if (selectedSupervisorId) {
      list = list.filter((item) => item.supervisorId === selectedSupervisorId);
    }
    if (selectedCadena) {
      list = list.filter((item) => item.cadena === selectedCadena);
    }
    if (fechaInicio) {
      list = list.filter((item) => item.fechaOperacion >= fechaInicio);
    }
    if (fechaFin) {
      list = list.filter((item) => item.fechaOperacion <= fechaFin);
    }

    return list;
  }, [lovePanelData?.kpiDataset, selectedSupervisorId, selectedCadena, fechaInicio, fechaFin]);

  const lovePorDcSemanal = useMemo(() => {
    const groupedMap = new Map<string, {
      empleadoId: string;
      nombreDc: string;
      pdvId: string;
      sucursal: string;
      cadena: string;
      btlCve: string;
      supervisor: string;
      sem1: number;
      sem2: number;
      sem3: number;
      sem4: number;
      sem5: number;
      total: number;
    }>();

    filteredLoveDataset.forEach((item) => {
      let btlCve = item.pdvClaveBtl || '';
      let sucursal = item.pdvNombre || '';

      if (!sucursal && item.pdvLabel) {
        if (item.pdvLabel.includes(' • ')) {
          const parts = item.pdvLabel.split(' • ');
          btlCve = btlCve || parts[0]?.trim() || '';
          sucursal = parts.slice(1).join(' • ').trim() || parts[0]?.trim();
        } else if (item.pdvLabel.includes(' - ')) {
          const parts = item.pdvLabel.split(' - ');
          btlCve = btlCve || parts[0]?.trim() || '';
          sucursal = parts.slice(1).join(' - ').trim() || parts[0]?.trim();
        } else {
          sucursal = item.pdvLabel;
        }
      }
      if (!sucursal) sucursal = 'PDV sin nombre';
      if (!btlCve) btlCve = 'SIN BTL';
      sucursal = sucursal.replace(/^[A-Z0-9_-]*BTL-[A-Z0-9_-]+\s*[-•:]\s*/i, '').trim() || sucursal;

      const cadena = item.cadena || 'Sin cadena';
      const pdvId = item.pdvId || '';
      const nombreDc = item.empleadoLabel || 'Sin dermoconsejera';
      const supervisor = item.supervisorLabel || 'Sin supervisor';
      const empleadoId = item.empleadoId;

      const key = `${empleadoId}||${pdvId}`;

      let row = groupedMap.get(key);
      if (!row) {
        row = {
          empleadoId,
          nombreDc,
          pdvId,
          sucursal,
          cadena,
          btlCve,
          supervisor,
          sem1: 0,
          sem2: 0,
          sem3: 0,
          sem4: 0,
          sem5: 0,
          total: 0,
        };
        groupedMap.set(key, row);
      }

      const sem = getCalendarWeekMondayBased(item.fechaOperacion || '');
      const count = item.total || item.validas || 0;

      if (sem === 1) row.sem1 += count;
      else if (sem === 2) row.sem2 += count;
      else if (sem === 3) row.sem3 += count;
      else if (sem === 4) row.sem4 += count;
      else row.sem5 += count;

      row.total += count;
    });

    return Array.from(groupedMap.values()).sort((a, b) => {
      const compDc = a.nombreDc.localeCompare(b.nombreDc, 'es-MX');
      if (compDc !== 0) return compDc;
      return a.sucursal.localeCompare(b.sucursal, 'es-MX');
    });
  }, [filteredLoveDataset]);

  const filteredLovePorDcSemanal = useMemo(() => {
    if (!loveSearchTerm.trim()) return lovePorDcSemanal;
    const term = loveSearchTerm.toLowerCase();
    return lovePorDcSemanal.filter(
      (row) =>
        row.nombreDc.toLowerCase().includes(term) ||
        row.sucursal.toLowerCase().includes(term) ||
        row.btlCve.toLowerCase().includes(term) ||
        row.cadena.toLowerCase().includes(term)
    );
  }, [lovePorDcSemanal, loveSearchTerm]);

  const lovePorDcConsolidado = useMemo(() => {
    const groupedMap = new Map<string, {
      empleadoId: string;
      nombreDc: string;
      supervisor: string;
      sem1: number;
      sem2: number;
      sem3: number;
      sem4: number;
      sem5: number;
      total: number;
    }>();

    filteredLoveDataset.forEach((item) => {
      const nombreDc = item.empleadoLabel || 'Sin dermoconsejera';
      const supervisor = item.supervisorLabel || 'Sin supervisor';
      const empleadoId = item.empleadoId;

      let row = groupedMap.get(empleadoId);
      if (!row) {
        row = {
          empleadoId,
          nombreDc,
          supervisor,
          sem1: 0,
          sem2: 0,
          sem3: 0,
          sem4: 0,
          sem5: 0,
          total: 0,
        };
        groupedMap.set(empleadoId, row);
      }

      const sem = getCalendarWeekMondayBased(item.fechaOperacion || '');
      const count = item.total || item.validas || 0;

      if (sem === 1) row.sem1 += count;
      else if (sem === 2) row.sem2 += count;
      else if (sem === 3) row.sem3 += count;
      else if (sem === 4) row.sem4 += count;
      else row.sem5 += count;

      row.total += count;
    });

    return Array.from(groupedMap.values()).sort((a, b) =>
      a.nombreDc.localeCompare(b.nombreDc, 'es-MX')
    );
  }, [filteredLoveDataset]);

  const filteredLovePorDcConsolidado = useMemo(() => {
    if (!loveSearchTerm.trim()) return lovePorDcConsolidado;
    const term = loveSearchTerm.toLowerCase();
    return lovePorDcConsolidado.filter(
      (row) =>
        row.nombreDc.toLowerCase().includes(term) ||
        row.supervisor.toLowerCase().includes(term)
    );
  }, [lovePorDcConsolidado, loveSearchTerm]);

  const lovePorPdvConsolidado = useMemo(() => {
    const groupedMap = new Map<string, {
      pdvId: string;
      sucursal: string;
      cadena: string;
      btlCve: string;
      sem1: number;
      sem2: number;
      sem3: number;
      sem4: number;
      sem5: number;
      total: number;
    }>();

    filteredLoveDataset.forEach((item) => {
      let btlCve = item.pdvClaveBtl || '';
      let sucursal = item.pdvNombre || '';

      if (!sucursal && item.pdvLabel) {
        if (item.pdvLabel.includes(' • ')) {
          const parts = item.pdvLabel.split(' • ');
          btlCve = btlCve || parts[0]?.trim() || '';
          sucursal = parts.slice(1).join(' • ').trim() || parts[0]?.trim();
        } else if (item.pdvLabel.includes(' - ')) {
          const parts = item.pdvLabel.split(' - ');
          btlCve = btlCve || parts[0]?.trim() || '';
          sucursal = parts.slice(1).join(' - ').trim() || parts[0]?.trim();
        } else {
          sucursal = item.pdvLabel;
        }
      }
      if (!sucursal) sucursal = 'PDV sin nombre';
      if (!btlCve) btlCve = 'SIN BTL';
      sucursal = sucursal.replace(/^[A-Z0-9_-]*BTL-[A-Z0-9_-]+\s*[-•:]\s*/i, '').trim() || sucursal;

      const cadena = item.cadena || 'Sin cadena';
      const pdvId = item.pdvId || '';

      let row = groupedMap.get(pdvId);
      if (!row) {
        row = {
          pdvId,
          sucursal,
          cadena,
          btlCve,
          sem1: 0,
          sem2: 0,
          sem3: 0,
          sem4: 0,
          sem5: 0,
          total: 0,
        };
        groupedMap.set(pdvId, row);
      }

      const sem = getCalendarWeekMondayBased(item.fechaOperacion || '');
      const count = item.total || item.validas || 0;

      if (sem === 1) row.sem1 += count;
      else if (sem === 2) row.sem2 += count;
      else if (sem === 3) row.sem3 += count;
      else if (sem === 4) row.sem4 += count;
      else row.sem5 += count;

      row.total += count;
    });

    return Array.from(groupedMap.values()).sort((a, b) => {
      const compCad = a.cadena.localeCompare(b.cadena, 'es-MX');
      if (compCad !== 0) return compCad;
      return a.sucursal.localeCompare(b.sucursal, 'es-MX');
    });
  }, [filteredLoveDataset]);

  const filteredLovePorPdvConsolidado = useMemo(() => {
    if (!loveSearchTerm.trim()) return lovePorPdvConsolidado;
    const term = loveSearchTerm.toLowerCase();
    return lovePorPdvConsolidado.filter(
      (row) =>
        row.sucursal.toLowerCase().includes(term) ||
        row.btlCve.toLowerCase().includes(term) ||
        row.cadena.toLowerCase().includes(term)
    );
  }, [lovePorPdvConsolidado, loveSearchTerm]);

  const loveDetalleTotalSem1 = useMemo(() => filteredLovePorDcSemanal.reduce((a, b) => a + b.sem1, 0), [filteredLovePorDcSemanal]);
  const loveDetalleTotalSem2 = useMemo(() => filteredLovePorDcSemanal.reduce((a, b) => a + b.sem2, 0), [filteredLovePorDcSemanal]);
  const loveDetalleTotalSem3 = useMemo(() => filteredLovePorDcSemanal.reduce((a, b) => a + b.sem3, 0), [filteredLovePorDcSemanal]);
  const loveDetalleTotalSem4 = useMemo(() => filteredLovePorDcSemanal.reduce((a, b) => a + b.sem4, 0), [filteredLovePorDcSemanal]);
  const loveDetalleTotalSem5 = useMemo(() => filteredLovePorDcSemanal.reduce((a, b) => a + b.sem5, 0), [filteredLovePorDcSemanal]);
  const loveDetalleTotalGrand = useMemo(() => filteredLovePorDcSemanal.reduce((a, b) => a + b.total, 0), [filteredLovePorDcSemanal]);

  const loveDcTotalSem1 = useMemo(() => filteredLovePorDcConsolidado.reduce((a, b) => a + b.sem1, 0), [filteredLovePorDcConsolidado]);
  const loveDcTotalSem2 = useMemo(() => filteredLovePorDcConsolidado.reduce((a, b) => a + b.sem2, 0), [filteredLovePorDcConsolidado]);
  const loveDcTotalSem3 = useMemo(() => filteredLovePorDcConsolidado.reduce((a, b) => a + b.sem3, 0), [filteredLovePorDcConsolidado]);
  const loveDcTotalSem4 = useMemo(() => filteredLovePorDcConsolidado.reduce((a, b) => a + b.sem4, 0), [filteredLovePorDcConsolidado]);
  const loveDcTotalSem5 = useMemo(() => filteredLovePorDcConsolidado.reduce((a, b) => a + b.sem5, 0), [filteredLovePorDcConsolidado]);
  const loveDcTotalGrand = useMemo(() => filteredLovePorDcConsolidado.reduce((a, b) => a + b.total, 0), [filteredLovePorDcConsolidado]);

  const lovePdvTotalSem1 = useMemo(() => filteredLovePorPdvConsolidado.reduce((a, b) => a + b.sem1, 0), [filteredLovePorPdvConsolidado]);
  const lovePdvTotalSem2 = useMemo(() => filteredLovePorPdvConsolidado.reduce((a, b) => a + b.sem2, 0), [filteredLovePorPdvConsolidado]);
  const lovePdvTotalSem3 = useMemo(() => filteredLovePorPdvConsolidado.reduce((a, b) => a + b.sem3, 0), [filteredLovePorPdvConsolidado]);
  const lovePdvTotalSem4 = useMemo(() => filteredLovePorPdvConsolidado.reduce((a, b) => a + b.sem4, 0), [filteredLovePorPdvConsolidado]);
  const lovePdvTotalSem5 = useMemo(() => filteredLovePorPdvConsolidado.reduce((a, b) => a + b.sem5, 0), [filteredLovePorPdvConsolidado]);
  const lovePdvTotalGrand = useMemo(() => filteredLovePorPdvConsolidado.reduce((a, b) => a + b.total, 0), [filteredLovePorPdvConsolidado]);

  const handleLoveExport = async () => {
    if (!lovePanelData) return;
    setIsLoveExporting(true);
    try {
      await exportarLoveIsdinKpisToExcel({
        range: 'mes',
        filters: {
          cadena: selectedCadena || undefined,
          supervisorLabel: selectedSupervisorId
            ? data.supervisores?.find((s) => s.id === selectedSupervisorId)?.label
            : undefined,
        },
        kpiSummary: {
          total: lovePanelData.resumen?.total || 0,
          objetivo: lovePanelData.afiliacionesKpi?.objetivoMes || 0,
          validas: lovePanelData.resumen?.validas || 0,
          pendientes: lovePanelData.resumen?.pendientes || 0,
          rechazadas: lovePanelData.resumen?.rechazadas || 0,
          duplicadas: 0,
          cumplimientoPct: lovePanelData.afiliacionesKpi?.cumplimientoMesPct || 0,
          restante: Math.max(0, (lovePanelData.afiliacionesKpi?.objetivoMes || 0) - (lovePanelData.resumen?.validas || 0)),
        },
        kpiDataset: filteredLoveDataset,
        porPdv: lovePanelData.porPdv || [],
        porDc: lovePanelData.porDc || [],
        porSupervisor: lovePanelData.porSupervisor || [],
        porCadena: lovePanelData.porCadena || [],
        diaria: lovePanelData.timelineDiaria || [],
        semanal: lovePanelData.timelineSemanal || [],
      });
    } catch (err) {
      console.error('Error exporting LOVE ISDIN:', err);
    } finally {
      setIsLoveExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="bg-amber-50 text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!esVisualizadorReporte && (
        <OfflineStatusCard
          offline={offline}
          title="Operacion offline de ventas"
          description="La PWA ya puede persistir capturas comerciales locales y reintentarlas when vuelva la red."
        />
      )}

      {esVisualizador && (
        <div className="space-y-4">
          {/* ======================================================== */}
          {/* UN SOLO CUADRITO: Header Unificado y Filtros Optimizados */}
          {/* ======================================================== */}
          <Card className="bg-white p-3 sm:p-4 border border-slate-200/90 shadow-xs rounded-2xl">
            {/* Fila 1: Botón Volver + Switcher Ventas / LOVE ISDIN */}
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              {showBackButton && (
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-700 px-3 py-1.5 text-xs font-bold shadow-2xs transition active:scale-[0.98]"
                  aria-label="Regresar al dashboard principal"
                >
                  <ArrowLeft className="h-4 w-4 text-slate-600" weight="bold" />
                  <span className="hidden sm:inline">Regresar al dashboard</span>
                  <span className="sm:hidden">Volver</span>
                </Link>
              )}

              <div className="inline-flex rounded-xl bg-slate-100/90 p-1 border border-slate-200/80 shadow-inner ml-auto sm:ml-0">
                <button
                  type="button"
                  onClick={() => setMainTab('ventas')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                    mainTab === 'ventas'
                      ? 'bg-white text-[#FF7FA5] shadow-xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AppGlyph name="ventas" size="sm" />
                  <span>Ventas</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMainTab('love-isdin');
                    if (!lovePanelData) {
                      fetchLoveData();
                    }
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                    mainTab === 'love-isdin'
                      ? 'bg-white text-[#FF7FA5] shadow-xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AppGlyph name="love" size="sm" />
                  <span>LOVE ISDIN</span>
                </button>
              </div>
            </div>

            {/* Separador fino */}
            <div className="border-t border-slate-100 my-2.5" />

            {/* Fila 2: Resumen de Filtros Activos + Botón Modificar / Ocultar */}
            {mainTab === 'ventas' ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    Filtros: <strong className="text-[#FF7FA5]">{mesActualNombre} {activeYearStr}</strong>
                  </span>
                  {selectedCadena && (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      🏢 {selectedCadena}
                    </span>
                  )}
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                    <span>{data.dataset?.length || 0} reg. cargados</span>
                    {filteredDataset.length !== (data.dataset?.length || 0) && (
                      <span className="text-slate-600 font-semibold">• {filteredDataset.length} visibles</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {(selectedPdvId || selectedEmpleadoId || selectedSupervisorId || selectedZona || selectedCadena || rango !== 'mes') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPdvId('');
                        setSelectedEmpleadoId('');
                        setSelectedSupervisorId('');
                        setSelectedZona('');
                        setSelectedCadena('');
                        setRango('mes');
                      }}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-700 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50/70 transition"
                    >
                      Limpiar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsFiltrosOpen(!isFiltrosOpen)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition"
                  >
                    <span>{isFiltrosOpen ? '▲ Ocultar' : '⚙️ Modificar'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    Filtros LOVE: <strong className="text-[#FF7FA5]">{mesActualNombre} {activeYearStr}</strong>
                  </span>
                  {selectedCadena && (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      🏢 {selectedCadena}
                    </span>
                  )}
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                    <span>{lovePanelData?.kpiDataset?.length || 0} reg. cargados</span>
                    {filteredLoveDataset.length !== (lovePanelData?.kpiDataset?.length || 0) && (
                      <span className="text-slate-600 font-semibold">• {filteredLoveDataset.length} visibles</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {(selectedPdvId || selectedEmpleadoId || selectedSupervisorId || selectedZona || selectedCadena || fechaInicio || fechaFin) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPdvId('');
                        setSelectedEmpleadoId('');
                        setSelectedSupervisorId('');
                        setSelectedZona('');
                        setSelectedCadena('');
                        setFechaInicio('');
                        setFechaFin('');
                      }}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-700 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50/70 transition"
                    >
                      Limpiar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsLoveFiltrosOpen(!isLoveFiltrosOpen)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition"
                  >
                    <span>{isLoveFiltrosOpen ? '▲ Ocultar' : '⚙️ Modificar'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Desplegable de filtros Ventas */}
            {mainTab === 'ventas' && isFiltrosOpen && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Inicio</label>
                    <input
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => {
                        setFechaInicio(e.target.value);
                        setRango('personalizado');
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Fin</label>
                    <input
                      type="date"
                      value={fechaFin}
                      onChange={(e) => {
                        setFechaFin(e.target.value);
                        setRango('personalizado');
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
                    />
                  </div>

                  {actor.puesto !== 'SUPERVISOR' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Supervisor</label>
                      <select
                        value={selectedSupervisorId}
                        onChange={(e) => setSelectedSupervisorId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
                      >
                        <option value="">Todos</option>
                        {data.supervisores?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cadena</label>
                    <select
                      value={selectedCadena}
                      onChange={(e) => setSelectedCadena(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
                    >
                      <option value="">Todas</option>
                      {uniqueCadenas.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1 justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        setIsRefreshing(true);
                        try {
                          const targetMonth = fechaInicio ? fechaInicio.slice(0, 7) : activeMonth;
                          const params = new URLSearchParams(searchParams.toString());
                          params.set('month', targetMonth);
                          params.set('refresh', 'true');
                          params.set('page', '1');

                          router.push(`${pathname}?${params.toString()}`);

                          const response = await fetch(`/api/ventas/panel?${params.toString()}`, {
                            cache: 'no-store',
                            credentials: 'same-origin',
                          });
                          if (response.ok) {
                            const payload = (await response.json()) as { data?: VentasPanelData };
                            if (payload.data) {
                              setPanelData(payload.data);
                            }
                            router.refresh();
                          }
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setTimeout(() => {
                            setIsRefreshing(false);
                          }, 600);
                        }
                      }}
                      disabled={isRefreshing}
                      className="w-full bg-[#FF7FA5] hover:bg-[#ff6694] text-white font-bold rounded-xl px-4 py-2 text-xs flex items-center justify-center gap-1.5 shadow-xs transition h-[36px] disabled:opacity-50"
                    >
                      <span>🔍</span> {isRefreshing ? 'Actualizando...' : 'Aplicar filtro'}
                    </button>
                  </div>
                </div>

                {!esVisualizadorReporte && (
                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleExport}
                      isLoading={isExporting}
                      className="bg-[#FF7FA5] hover:bg-[#ff6694] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition"
                    >
                      <span>📥</span> Exportar Reporte (Excel)
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Desplegable de filtros LOVE ISDIN */}
            {mainTab === 'love-isdin' && isLoveFiltrosOpen && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Inicio</label>
                    <input
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Fin</label>
                    <input
                      type="date"
                      value={fechaFin}
                      onChange={(e) => setFechaFin(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
                    />
                  </div>

                  {actor.puesto !== 'SUPERVISOR' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Supervisor</label>
                      <select
                        value={selectedSupervisorId}
                        onChange={(e) => setSelectedSupervisorId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
                      >
                        <option value="">Todos</option>
                        {data.supervisores?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cadena</label>
                    <select
                      value={selectedCadena}
                      onChange={(e) => setSelectedCadena(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
                    >
                      <option value="">Todas</option>
                      {uniqueCadenas.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => fetchLoveData()}
                      disabled={isLoveLoading}
                      className="w-full bg-[#FF7FA5] hover:bg-[#ff6694] text-white font-bold rounded-xl px-4 py-2 text-xs flex items-center justify-center gap-1.5 shadow-xs transition h-[36px] disabled:opacity-50"
                    >
                      <span>🔍</span> {isLoveLoading ? 'Actualizando...' : 'Aplicar filtro'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleLoveExport}
                    isLoading={isLoveExporting}
                    className="bg-[#FF7FA5] hover:bg-[#ff6694] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition"
                  >
                    <span>📥</span> Exportar Reporte (Excel)
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {mainTab === 'ventas' ? (
            <>

              {!esVisualizadorReporte && (
                <div className="grid gap-4 md:grid-cols-5">
                  <MetricCard label="Ventas totales" value={String(esVisualizador ? filteredKpi.total : data.resumen.total)} />
                  <MetricCard label="Confirmadas" value={String(esVisualizador ? filteredKpi.confirmadas : data.resumen.confirmadas)} />
                  <MetricCard
                    label="Pendientes confirmar"
                    value={String(esVisualizador ? filteredKpi.pendientesConfirmacion : data.resumen.pendientesConfirmacion)}
                  />
                  <MetricCard label="Unidades" value={String(esVisualizador ? filteredKpi.unidades : data.resumen.unidades)} />
                  <MetricCard
                    label="Monto total"
                    value={new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(esVisualizador ? filteredKpi.monto : data.resumen.monto)}
                  />
                </div>
              )}

              {!esVisualizadorReporte && (
                <section className="grid gap-6 xl:grid-cols-2">
                  <VentasAggregateCard
                    title="Alcance por PDV (Top 8)"
                    description="Ventas acumuladas y unidades totales por Punto de Venta."
                    items={porPdv}
                    emptyLabel="Sin ventas acumuladas para este corte."
                  />
                  <VentasAggregateCard
                    title="Alcance por Dermoconsejera (Top 8)"
                    description="Ventas acumuladas y unidades totales por Dermoconsejera."
                    items={porDc}
                    emptyLabel="Sin ventas acumuladas para este corte."
                  />
                  <VentasAggregateCard
                    title="Alcance por Supervisor"
                    description="Consolidado del resultado operativo por equipo de supervisión."
                    items={porSupervisor}
                    emptyLabel="Sin ventas acumuladas para este corte."
                    showAll={true}
                    gridCols={2}
                    className="xl:col-span-2"
                  />
                  <VentasAggregateCard
                    title="Alcance por Cadena"
                    description="Visibilidad de volumen comercial y transacciones por cadena de tiendas."
                    items={porCadena}
                    emptyLabel="Sin ventas acumuladas para este corte."
                    className="xl:col-span-2"
                  />
                </section>
              )}

              <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden p-0">
                <div className="border-b border-slate-100 bg-slate-50/50 px-3.5 py-3 sm:px-6 sm:py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5 sm:gap-2">
                      <span>📅</span> Reporte de Ventas por Dermo y Sucursal
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 hidden sm:block">
                      Visualiza el acumulado mensual, calendario minimalista de piezas y el detalle por día.
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3 items-center">
                    {/* Switcher de vista: Vertical Minimalista vs Tablas */}
                    <div className="inline-flex rounded-xl bg-slate-200/70 p-1 border border-slate-200 shadow-inner">
                      <button
                        type="button"
                        onClick={() => setViewMode('vertical')}
                        className={`rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                          viewMode === 'vertical'
                            ? 'bg-white text-[#FF7FA5] shadow-xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>📱</span> <span>Vertical</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('tablas')}
                        className={`rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                          viewMode === 'tablas'
                            ? 'bg-white text-[#FF7FA5] shadow-xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>📋</span> <span>Tablas</span>
                      </button>
                    </div>

                    {esVisualizadorReporte && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleExport}
                        isLoading={isExporting}
                        className="bg-[#FF7FA5] hover:bg-[#ff6694] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition px-3 py-1.5 min-h-[34px]"
                      >
                        <span>📥</span> <span className="hidden sm:inline">Exportar </span>Excel
                      </Button>
                    )}
                    {/* Buscador local */}
                    <div className="relative flex-1 sm:flex-initial">
                      <input
                        type="text"
                        placeholder="🔍 Buscar Dermo o Sucursal..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)] w-full sm:w-56"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs"
                          type="button"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {viewMode === 'vertical' ? (
                  <div className="p-2 sm:p-6 bg-slate-50/40 w-full min-w-0 max-w-full overflow-hidden">
                    <VentasVerticalDrillDown
                      dataset={filteredDataset}
                      capturasDetalle={data.capturasDetalle}
                      activeMonth={activeMonth}
                      searchTerm={searchTerm}
                      onClearSearch={() => setSearchTerm('')}
                      actorPuesto={actor.puesto}
                    />
                  </div>
                ) : (
                  <>

                {/* Selector de pestañas y botón Pantalla Completa (Botones Pequeños Fuera de la Tabla) */}
                <div className="p-2.5 sm:px-6 sm:py-3 bg-slate-50/80 border-b border-slate-200/90 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5">
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap overflow-x-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setActiveTab('detalle')}
                      className={`px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1 shrink-0 ${
                        activeTab === 'detalle'
                          ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>📋</span>
                      <span>Dermo + Tienda</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('dermo')}
                      className={`px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1 shrink-0 ${
                        activeTab === 'dermo'
                          ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>👩‍💼</span>
                      <span>Por Dermo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('sucursal')}
                      className={`px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1 shrink-0 ${
                        activeTab === 'sucursal'
                          ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>🏪</span>
                      <span>Por Tienda</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFullscreenTable(true)}
                    className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all shrink-0 ml-auto"
                    title="Abrir tabla de ventas en pantalla completa para celular o escritorio"
                  >
                    <span>⛶</span>
                    <span className="hidden sm:inline">Ver Pantalla Completa</span>
                    <span className="sm:hidden">Pantalla Completa</span>
                  </button>
                </div>

                {/* Contenido de Tablas */}
                <div className="p-2 sm:p-6">
                  <TablaSemanalReporte
                    tipo="ventas"
                    activeTab={activeTab}
                    dataDetalle={filteredPorDcSemanal}
                    dataDermo={filteredPorDcConsolidado}
                    dataSucursal={filteredPorPdvConsolidado}
                    totalsDetalle={{
                      sem1: detalleTotalSem1,
                      sem2: detalleTotalSem2,
                      sem3: detalleTotalSem3,
                      sem4: detalleTotalSem4,
                      sem5: detalleTotalSem5,
                      grand: detalleTotalGrand,
                    }}
                    totalsDermo={{
                      sem1: dcTotalSem1,
                      sem2: dcTotalSem2,
                      sem3: dcTotalSem3,
                      sem4: dcTotalSem4,
                      sem5: dcTotalSem5,
                      grand: dcTotalGrand,
                    }}
                    totalsSucursal={{
                      sem1: pdvTotalSem1,
                      sem2: pdvTotalSem2,
                      sem3: pdvTotalSem3,
                      sem4: pdvTotalSem4,
                      sem5: pdvTotalSem5,
                      grand: pdvTotalGrand,
                    }}
                    onOpenFullscreen={() => setIsFullscreenTable(true)}
                  />
                </div>
                  </>
                )}
              </Card>

              <ModalTablaSemanalFullscreen
                isOpen={isFullscreenTable}
                onClose={() => setIsFullscreenTable(false)}
                titulo={`Detalle Semanal de Ventas — ${mesActualNombre} ${activeYearStr}`}
                tipo="ventas"
                activeTab={activeTab}
                onTabChange={setActiveTab}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                dataDetalle={filteredPorDcSemanal}
                dataDermo={filteredPorDcConsolidado}
                dataSucursal={filteredPorPdvConsolidado}
                totalsDetalle={{
                  sem1: detalleTotalSem1,
                  sem2: detalleTotalSem2,
                  sem3: detalleTotalSem3,
                  sem4: detalleTotalSem4,
                  sem5: detalleTotalSem5,
                  grand: detalleTotalGrand,
                }}
                totalsDermo={{
                  sem1: dcTotalSem1,
                  sem2: dcTotalSem2,
                  sem3: dcTotalSem3,
                  sem4: dcTotalSem4,
                  sem5: dcTotalSem5,
                  grand: dcTotalGrand,
                }}
                totalsSucursal={{
                  sem1: pdvTotalSem1,
                  sem2: pdvTotalSem2,
                  sem3: pdvTotalSem3,
                  sem4: pdvTotalSem4,
                  sem5: pdvTotalSem5,
                  grand: pdvTotalGrand,
                }}
                totalRegistros={filteredDataset.length}
              />
            </>
          ) : (
            <>
              <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden p-0">
                <div className="border-b border-slate-100 bg-slate-50/50 px-3.5 py-3 sm:px-6 sm:py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5 sm:gap-2">
                      <span>📅</span> Reporte de Registros LOVE ISDIN Semanal
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 hidden sm:block">
                      Visualiza las afiliaciones acumuladas semana a semana en el mes seleccionado.
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3 items-center">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleLoveExport}
                      isLoading={isLoveExporting}
                      className="bg-[#FF7FA5] hover:bg-[#ff6694] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition px-3 py-1.5 min-h-[34px]"
                    >
                      <span>📥</span> <span className="hidden sm:inline">Exportar </span>Excel
                    </Button>
                    <div className="relative flex-1 sm:flex-initial">
                      <input
                        type="text"
                        placeholder="🔍 Buscar Dermo o Sucursal..."
                        value={loveSearchTerm}
                        onChange={(e) => setLoveSearchTerm(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-700 shadow-xs focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)] w-full sm:w-56"
                      />
                      {loveSearchTerm && (
                        <button
                          onClick={() => setLoveSearchTerm('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs"
                          type="button"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Selector de pestañas LOVE ISDIN y Botón Pantalla Completa (Botones Pequeños Fuera de la Tabla) */}
                <div className="p-2.5 sm:px-6 sm:py-3 bg-slate-50/80 border-b border-slate-200/90 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5">
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap overflow-x-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setLoveActiveTab('detalle')}
                      className={`px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1 shrink-0 ${
                        loveActiveTab === 'detalle'
                          ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>📋</span>
                      <span>Dermo + Tienda</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoveActiveTab('dermo')}
                      className={`px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1 shrink-0 ${
                        loveActiveTab === 'dermo'
                          ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>👩‍💼</span>
                      <span>Por Dermo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoveActiveTab('sucursal')}
                      className={`px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1 shrink-0 ${
                        loveActiveTab === 'sucursal'
                          ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>🏪</span>
                      <span>Por Tienda</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsLoveFullscreenTable(true)}
                    className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all shrink-0 ml-auto"
                    title="Abrir tabla LOVE ISDIN en pantalla completa para celular o escritorio"
                  >
                    <span>⛶</span>
                    <span className="hidden sm:inline">Ver Pantalla Completa</span>
                    <span className="sm:hidden">Pantalla Completa</span>
                  </button>
                </div>

                <div className="p-2 sm:p-6">
                  {isLoveLoading ? (
                    <div className="py-12 text-center text-slate-500 text-xs font-medium animate-pulse">
                      Cargando datos de LOVE ISDIN...
                    </div>
                  ) : (
                    <TablaSemanalReporte
                      tipo="love"
                      activeTab={loveActiveTab}
                      dataDetalle={filteredLovePorDcSemanal}
                      dataDermo={filteredLovePorDcConsolidado}
                      dataSucursal={filteredLovePorPdvConsolidado}
                      totalsDetalle={{
                        sem1: loveDetalleTotalSem1,
                        sem2: loveDetalleTotalSem2,
                        sem3: loveDetalleTotalSem3,
                        sem4: loveDetalleTotalSem4,
                        sem5: loveDetalleTotalSem5,
                        grand: loveDetalleTotalGrand,
                      }}
                      totalsDermo={{
                        sem1: loveDcTotalSem1,
                        sem2: loveDcTotalSem2,
                        sem3: loveDcTotalSem3,
                        sem4: loveDcTotalSem4,
                        sem5: loveDcTotalSem5,
                        grand: loveDcTotalGrand,
                      }}
                      totalsSucursal={{
                        sem1: lovePdvTotalSem1,
                        sem2: lovePdvTotalSem2,
                        sem3: lovePdvTotalSem3,
                        sem4: lovePdvTotalSem4,
                        sem5: lovePdvTotalSem5,
                        grand: lovePdvTotalGrand,
                      }}
                      onOpenFullscreen={() => setIsLoveFullscreenTable(true)}
                    />
                  )}
                </div>
              </Card>

              <ModalTablaSemanalFullscreen
                isOpen={isLoveFullscreenTable}
                onClose={() => setIsLoveFullscreenTable(false)}
                titulo={`Reporte LOVE ISDIN Semanal — ${mesActualNombre} ${activeYearStr}`}
                tipo="love"
                activeTab={loveActiveTab}
                onTabChange={setLoveActiveTab}
                searchTerm={loveSearchTerm}
                onSearchChange={setLoveSearchTerm}
                dataDetalle={filteredLovePorDcSemanal}
                dataDermo={filteredLovePorDcConsolidado}
                dataSucursal={filteredLovePorPdvConsolidado}
                totalsDetalle={{
                  sem1: loveDetalleTotalSem1,
                  sem2: loveDetalleTotalSem2,
                  sem3: loveDetalleTotalSem3,
                  sem4: loveDetalleTotalSem4,
                  sem5: loveDetalleTotalSem5,
                  grand: loveDetalleTotalGrand,
                }}
                totalsDermo={{
                  sem1: loveDcTotalSem1,
                  sem2: loveDcTotalSem2,
                  sem3: loveDcTotalSem3,
                  sem4: loveDcTotalSem4,
                  sem5: loveDcTotalSem5,
                  grand: loveDcTotalGrand,
                }}
                totalsSucursal={{
                  sem1: lovePdvTotalSem1,
                  sem2: lovePdvTotalSem2,
                  sem3: lovePdvTotalSem3,
                  sem4: lovePdvTotalSem4,
                  sem5: lovePdvTotalSem5,
                  grand: lovePdvTotalGrand,
                }}
                totalRegistros={filteredLoveDataset.length}
              />
            </>
          )}
        </div>
      )}

      {!esVisualizador && (
        <Card className="bg-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
                Captura local
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">Nuevo borrador de venta</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                La venta se liga al check-in valido del dia. Puedes capturarla incluso despues del
                check-out, siempre que sigas dentro de la ventana digital local del mismo dia.
              </p>
            </div>
            <div className="surface-soft px-4 py-3 text-sm text-slate-600">
              Jornadas disponibles:{' '}
              <span className="font-semibold text-slate-950">{jornadasDisponibles.length}</span>
            </div>
          </div>

          {jornadasDisponibles.length === 0 ? (
            <p className="mt-6 text-sm text-amber-700">
              Aun no hay un check-in valido del dia para tomar como contexto de venta.
            </p>
          ) : (
            <form
              className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={handleQueueDraft}
            >
              <label className="block text-sm text-slate-600 xl:col-span-2">
                Jornada base
                <select
                  className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                  value={jornadaId}
                  onChange={(event) => setJornadaId(event.target.value)}
                >
                  {jornadasDisponibles.map((jornada) => (
                    <option key={jornada.id} value={jornada.id}>
                      {jornada.empleado} - {jornada.pdvClaveBtl} - {jornada.fechaOperacion}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-600">
                Fecha venta
                <input
                  className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                  type="date"
                  value={fechaVenta}
                  onChange={(event) => setFechaVenta(event.target.value)}
                />
              </label>

              <label className="block text-sm text-slate-600">
                Hora venta
                <input
                  className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                  type="time"
                  value={horaVenta}
                  onChange={(event) => setHoraVenta(event.target.value)}
                />
              </label>

              <label className="block text-sm text-slate-600 xl:col-span-2">
                Producto
                <select
                  className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                  value={productoId}
                  onChange={(event) => setProductoId(event.target.value)}
                >
                  <option value="">Selecciona un producto</option>
                  {data.catalogoProductos.map((producto) => (
                    <option key={producto.id} value={producto.id}>
                      {producto.nombreCorto}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-600 xl:col-span-2">
                Nombre corto
                <input
                  className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                  value={selectedProducto?.nombreCorto ?? ''}
                  readOnly
                  placeholder="Se llena desde el catalogo"
                />
              </label>

              <label className="block text-sm text-slate-600">
                Unidades
                <input
                  className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                  type="number"
                  min="1"
                  value={totalUnidades}
                  onChange={(event) => setTotalUnidades(event.target.value)}
                />
              </label>

              <label className="flex items-center gap-3 rounded-[16px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-700 xl:col-span-4">
                <input
                  type="checkbox"
                  checked={confirmada}
                  onChange={(event) => setConfirmada(event.target.checked)}
                />
                Marcar como confirmada al sincronizar
              </label>

              <div className="xl:col-span-4 flex flex-wrap items-center gap-3">
                <Button type="submit" isLoading={isSaving} disabled={!offline.isSupported}>
                  Guardar y capturar otra
                </Button>
                {feedback && (
                  <p
                    className={`text-sm ${
                      feedback.tone === 'success' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {feedback.message}
                  </p>
                )}
              </div>
            </form>
          )}
        </Card>
      )}

      {!esVisualizadorReporte && (
        <Card className="bg-white">
          <p className="text-sm text-slate-500">Cobertura funcional</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Registro diario ligado a asistencia y a catalogo maestro de productos ISDIN.
          </p>
        </Card>
      )}

      {!esVisualizadorReporte && (
        <>
          <ExtemporaneoQueueSection
            title="Ventas tardias"
            description="Registros comerciales fuera de ventana pendientes de aprobacion o ya consolidados en ventas."
            emptyMessage="Todavia no hay ventas tardias visibles para esta cuenta."
            resumen={data.resumenExtemporaneo}
            registros={data.registrosExtemporaneos}
          />

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border/60 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-950">Ventas recientes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Base comercial diaria ligada a jornada y lista para alimentar cuotas, reportes y nomina.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle text-left text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Fecha</th>
                    <th className="px-6 py-3 font-medium">Cuenta cliente</th>
                    <th className="px-6 py-3 font-medium">Producto</th>
                    <th className="px-6 py-3 font-medium">Volumen</th>
                    <th className="px-6 py-3 font-medium">Confirmacion</th>
                    <th className="px-6 py-3 font-medium">Jornada</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        Sin ventas visibles todavia.
                      </td>
                    </tr>
                  ) : (
                    ventasFiltradas.map((venta) => (
                      <tr key={venta.id} className="border-t border-border/40 align-top">
                        <td className="px-6 py-4 text-slate-600">{venta.fechaUtc}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {venta.cuentaCliente ?? 'Sin cliente'}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          <div className="font-medium text-slate-900">{venta.producto}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {venta.productoCorto ?? 'Sin nombre corto'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          <div>{venta.totalUnidades} unidades</div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusPill
                            active={venta.confirmada}
                            label={venta.confirmada ? 'CONFIRMADA' : 'PENDIENTE'}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <StatusPill
                            active={venta.jornadaAbierta || venta.jornadaEstatus === 'CERRADA'}
                            label={venta.jornadaEstatus ?? 'SIN JORNADA'}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="bg-white">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Paginacion incremental</p>
                <p className="mt-1 text-xs text-slate-500">
                  Pagina {data.paginacion.page} de {data.paginacion.totalPages} | maximo{' '}
                  {data.paginacion.pageSize} registros por pagina | total {data.paginacion.totalItems}
                </p>
              </div>
              <div className="flex gap-3">
                <PaginationLink
                  href={buildPageHref(data, Math.max(1, data.paginacion.page - 1), searchParams.get('month'))}
                  disabled={!canPrev}
                >
                  Anterior
                </PaginationLink>
                <PaginationLink
                  href={buildPageHref(
                    data,
                    Math.min(data.paginacion.totalPages, data.paginacion.page + 1),
                    searchParams.get('month')
                  )}
                  disabled={!canNext}
                >
                  Siguiente
                </PaginationLink>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />;
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {label}
    </span>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center rounded-[14px] border border-border bg-white px-4 py-2 text-sm text-slate-400">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-[14px] border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
    >
      {children}
    </Link>
  );
}

function VentasAggregateCard({
  title,
  description,
  items,
  emptyLabel,
  showAll = false,
  gridCols = 1,
  className,
}: {
  title: string;
  description: string;
  items: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    confirmadas: number;
    pendientes: number;
    unidades: number;
  }>;
  emptyLabel: string;
  showAll?: boolean;
  gridCols?: 1 | 2;
  className?: string;
}) {
  const visibleItems = useMemo(() => {
    return [...items].sort((left, right) => right.total - left.total);
  }, [items]);

  const finalItems = showAll ? visibleItems : visibleItems.slice(0, 8);

  const maxTotal = useMemo(() => {
    return finalItems.reduce((curr, item) => Math.max(curr, item.total), 1);
  }, [finalItems]);

  return (
    <Card className={className}>
      <div className="px-6 py-5 border-b border-border/60">
        <h3 className="text-lg font-bold text-slate-950 tracking-tight">{title}</h3>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <div className="p-6">
        {finalItems.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">{emptyLabel}</p>
        ) : (
          <div className={gridCols === 2 ? "grid gap-6 md:grid-cols-2" : "space-y-4"}>
            {finalItems.map((item) => {
              const widthPct = (item.total / maxTotal) * 100;
              return (
                <div key={item.id} className="grid gap-3 sm:grid-cols-[1fr_130px] sm:items-center">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate" title={item.label}>
                          {item.label}
                        </p>
                        {item.helper && <p className="text-xs text-slate-500 truncate" title={item.helper}>{item.helper}</p>}
                      </div>
                      <span className="text-sm font-bold text-slate-900 shrink-0">
                        {item.total} vtas / {item.unidades} uds
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--module-primary)] to-pink-400"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500 sm:border-l border-slate-100 sm:pl-3">
                    <p>Confirmadas: <strong className="text-slate-800">{item.confirmadas}</strong></p>
                    <p>Pendientes: <strong className="text-slate-800">{item.pendientes}</strong></p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
