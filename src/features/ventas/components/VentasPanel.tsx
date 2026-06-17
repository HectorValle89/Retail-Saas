'use client';

import Link from 'next/link';
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

export function VentasPanel({
  actor,
  data: initialData,
}: {
  actor: ActorActual;
  data: VentasPanelData;
}) {
  const offline = useOfflineSync();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const scopeKeys = useMemo(() => getUiChangeScopeKeysForActor(actor), [actor]);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const params = new URLSearchParams();
      params.set('page', searchParams.get('page') ?? String(initialData.paginacion.page));
      params.set(
        'pageSize',
        searchParams.get('pageSize') ?? String(initialData.paginacion.pageSize)
      );
      const month = searchParams.get('month');
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
    [initialData.paginacion.page, initialData.paginacion.pageSize, searchParams]
  );

  const { data } = useScopedWidgetData({
    initialData,
    module: 'ventas',
    surfaces: ['panel', 'tabla', 'metricas', 'inbox', 'all'],
    scopeKeys,
    roleTargets: [actor.puesto],
    fetcher,
    debounceMs: 650,
  });

  const todayOperationDate = getLocalDateValue();
  const esAdmin = actor.puesto === 'ADMINISTRADOR';
  const esSupervisor = actor.puesto === 'SUPERVISOR';
  const esVisualizador = ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'VENTAS'].includes(actor.puesto);
  const esVisualizadorReporte = ['ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR'].includes(actor.puesto);

  const [activeTab, setActiveTab] = useState<'detalle' | 'dermo' | 'sucursal'>('detalle');
  const [searchTerm, setSearchTerm] = useState('');

  const activeMonth = searchParams.get('month') || todayOperationDate.slice(0, 7);

  const [rango, setRango] = useState<'hoy' | 'semana' | 'mes'>('mes');
  const [selectedPdvId, setSelectedPdvId] = useState<string>('');
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string>('');
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');
  const [selectedZona, setSelectedZona] = useState<string>('');
  const [selectedCadena, setSelectedCadena] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const filteredDataset = useMemo(() => {
    let list = data.dataset || [];

    if (actor.puesto === 'SUPERVISOR') {
      list = list.filter((item) => item.supervisorId === actor.empleadoId);
    }

    if (rango === 'hoy') {
      list = list.filter((item) => item.fechaOperacion === todayOperationDate);
    } else if (rango === 'semana') {
      const todayWeek = getWeekStartIso(todayOperationDate);
      list = list.filter((item) => item.weekBucket === todayWeek);
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
    rango,
    selectedPdvId,
    selectedEmpleadoId,
    selectedSupervisorId,
    selectedZona,
    selectedCadena,
    todayOperationDate,
    actor,
  ]);

  const filteredKpi = useMemo(() => {
    let total = filteredDataset.length;
    let confirmadas = 0;
    let pendientesConfirmacion = 0;
    let unidades = 0;
    let monto = 0;

    filteredDataset.forEach((item) => {
      if (item.confirmada) {
        confirmadas++;
      } else {
        pendientesConfirmacion++;
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
      existing.total++;
      if (item.confirmada) {
        existing.confirmadas++;
      } else {
        existing.pendientes++;
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
      existing.total++;
      if (item.confirmada) {
        existing.confirmadas++;
      } else {
        existing.pendientes++;
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
      existing.total++;
      if (item.confirmada) {
        existing.confirmadas++;
      } else {
        existing.pendientes++;
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
          total: 0,
        };
        groupedMap.set(key, row);
      }

      const parts = (item.fechaOperacion || '').split('-');
      const day = parseInt(parts[2] || '1', 10);
      let sem: 1 | 2 | 3 | 4 = 4;
      if (day <= 7) sem = 1;
      else if (day <= 14) sem = 2;
      else if (day <= 21) sem = 3;

      const units = item.totalUnidades || 0;
      if (sem === 1) row.sem1 += units;
      else if (sem === 2) row.sem2 += units;
      else if (sem === 3) row.sem3 += units;
      else row.sem4 += units;

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
          total: 0,
        };
        groupedMap.set(empleadoId, row);
      }

      const parts = (item.fechaOperacion || '').split('-');
      const day = parseInt(parts[2] || '1', 10);
      let sem: 1 | 2 | 3 | 4 = 4;
      if (day <= 7) sem = 1;
      else if (day <= 14) sem = 2;
      else if (day <= 21) sem = 3;

      const units = item.totalUnidades || 0;
      if (sem === 1) row.sem1 += units;
      else if (sem === 2) row.sem2 += units;
      else if (sem === 3) row.sem3 += units;
      else row.sem4 += units;

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
          total: 0,
        };
        groupedMap.set(pdvId, row);
      }

      const parts = (item.fechaOperacion || '').split('-');
      const day = parseInt(parts[2] || '1', 10);
      let sem: 1 | 2 | 3 | 4 = 4;
      if (day <= 7) sem = 1;
      else if (day <= 14) sem = 2;
      else if (day <= 21) sem = 3;

      const units = item.totalUnidades || 0;
      if (sem === 1) row.sem1 += units;
      else if (sem === 2) row.sem2 += units;
      else if (sem === 3) row.sem3 += units;
      else row.sem4 += units;

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

  const { detalleTotalSem1, detalleTotalSem2, detalleTotalSem3, detalleTotalSem4, detalleTotalGrand } = useMemo(() => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, tot = 0;
    filteredPorDcSemanal.forEach((row) => {
      s1 += row.sem1;
      s2 += row.sem2;
      s3 += row.sem3;
      s4 += row.sem4;
      tot += row.total;
    });
    return {
      detalleTotalSem1: s1 || '-',
      detalleTotalSem2: s2 || '-',
      detalleTotalSem3: s3 || '-',
      detalleTotalSem4: s4 || '-',
      detalleTotalGrand: tot,
    };
  }, [filteredPorDcSemanal]);

  const { dcTotalSem1, dcTotalSem2, dcTotalSem3, dcTotalSem4, dcTotalGrand } = useMemo(() => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, tot = 0;
    filteredPorDcConsolidado.forEach((row) => {
      s1 += row.sem1;
      s2 += row.sem2;
      s3 += row.sem3;
      s4 += row.sem4;
      tot += row.total;
    });
    return {
      dcTotalSem1: s1 || '-',
      dcTotalSem2: s2 || '-',
      dcTotalSem3: s3 || '-',
      dcTotalSem4: s4 || '-',
      dcTotalGrand: tot,
    };
  }, [filteredPorDcConsolidado]);

  const { pdvTotalSem1, pdvTotalSem2, pdvTotalSem3, pdvTotalSem4, pdvTotalGrand } = useMemo(() => {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, tot = 0;
    filteredPorPdvConsolidado.forEach((row) => {
      s1 += row.sem1;
      s2 += row.sem2;
      s3 += row.sem3;
      s4 += row.sem4;
      tot += row.total;
    });
    return {
      pdvTotalSem1: s1 || '-',
      pdvTotalSem2: s2 || '-',
      pdvTotalSem3: s3 || '-',
      pdvTotalSem4: s4 || '-',
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
    if (rango === 'hoy') {
      list = list.filter((v) => {
        const dateStr = v.fechaUtc.slice(0, 10);
        return dateStr === todayOperationDate;
      });
    } else if (rango === 'semana') {
      const todayWeek = getWeekStartIso(todayOperationDate);
      list = list.filter((v) => {
        const dateStr = v.fechaUtc.slice(0, 10);
        return getWeekStartIso(dateStr) === todayWeek;
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
    rango,
    todayOperationDate,
    actor,
  ]);

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
        <Card className="bg-white p-5 border border-slate-200/80 shadow-sm rounded-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>📊</span> Filtros del Tablero Comercial
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Filtra por mes, rangos y jerarquías para analizar el rendimiento comercial.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 mr-1">Rango:</span>
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
                {(['hoy', 'semana', 'mes'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRango(r)}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                      rango === r
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {r === 'hoy' ? 'Hoy' : r === 'semana' ? 'Semana' : 'Mes'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`grid gap-4 sm:grid-cols-2 md:grid-cols-3 ${esVisualizadorReporte ? 'lg:grid-cols-4' : 'lg:grid-cols-6'}`}>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mes</label>
              <input
                type="month"
                value={activeMonth}
                onChange={(e) => {
                  const params = new URLSearchParams(searchParams.toString());
                  if (e.target.value) {
                    params.set('month', e.target.value);
                  } else {
                    params.delete('month');
                  }
                  params.set('page', '1');
                  router.push(`${pathname}?${params.toString()}`);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              />
            </div>

            {actor.puesto !== 'SUPERVISOR' && !esVisualizadorReporte && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supervisor</label>
                <select
                  value={selectedSupervisorId}
                  onChange={(e) => setSelectedSupervisorId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dermoconsejera</label>
              <select
                value={selectedEmpleadoId}
                onChange={(e) => setSelectedEmpleadoId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              >
                <option value="">Todas</option>
                {filteredEmpleadosDropdown?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cadena</label>
              <select
                value={selectedCadena}
                onChange={(e) => setSelectedCadena(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              >
                <option value="">Todas</option>
                {uniqueCadenas.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {!esVisualizadorReporte && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Zona</label>
                <select
                  value={selectedZona}
                  onChange={(e) => setSelectedZona(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                >
                  <option value="">Todas</option>
                  {uniqueZonas.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Punto de Venta</label>
              <select
                value={selectedPdvId}
                onChange={(e) => setSelectedPdvId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              >
                <option value="">Todos</option>
                {filteredPdvsDropdown?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Dataset mensual cargado: <strong>{data.dataset?.length || 0}</strong> registros.</span>
              {filteredDataset.length !== data.dataset?.length && (
                <span>Filtrados: <strong>{filteredDataset.length}</strong>.</span>
              )}
            </div>
            <div className="flex gap-2">
              {(selectedPdvId || selectedEmpleadoId || selectedSupervisorId || selectedZona || selectedCadena || rango !== 'mes') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedPdvId('');
                    setSelectedEmpleadoId('');
                    setSelectedSupervisorId('');
                    setSelectedZona('');
                    setSelectedCadena('');
                    setRango('mes');
                  }}
                  className="text-xs rounded-xl"
                >
                  Limpiar filtros
                </Button>
              )}
              {!esVisualizadorReporte && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExport}
                  isLoading={isExporting}
                  className="bg-[#FF7FA5] hover:bg-[#ff6694] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition"
                >
                  <span>📥</span> Exportar Reporte (Excel)
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

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

      {esVisualizador && !esVisualizadorReporte && (
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

      {esVisualizador && (
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>📅</span> Reporte de Ventas Semanal
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Visualiza las unidades vendidas acumuladas semana a semana en el mes seleccionado.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              {/* Buscador local */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 Buscar por Dermo o Sucursal..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs text-slate-700 shadow-sm focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] w-full sm:w-64"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Selector de pestañas */}
          <div className="flex border-b border-slate-100 bg-slate-50/30 px-6 pt-2 overflow-x-auto gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('detalle')}
              className={`pb-3 pt-2 px-3 text-xs font-bold border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
                activeTab === 'detalle'
                  ? 'border-[#FF7FA5] text-[#FF7FA5]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>📋</span> Detalle Dermo + Sucursal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dermo')}
              className={`pb-3 pt-2 px-3 text-xs font-bold border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
                activeTab === 'dermo'
                  ? 'border-[#FF7FA5] text-[#FF7FA5]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>👩‍💼</span> Consolidado por Dermo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sucursal')}
              className={`pb-3 pt-2 px-3 text-xs font-bold border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
                activeTab === 'sucursal'
                  ? 'border-[#FF7FA5] text-[#FF7FA5]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>🏪</span> Consolidado por Sucursal
            </button>
          </div>

          {/* Contenido de Tablas */}
          <div className="p-6">
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm max-h-[600px] overflow-y-auto">
              {activeTab === 'detalle' && (
                <table className="min-w-full border-collapse border border-slate-300 text-xs">
                  <thead className="sticky top-0 z-10 text-slate-900 font-bold text-left shadow-sm">
                    <tr>
                      <th className="border border-slate-300 px-4 py-3 bg-[#AEAAAA] uppercase tracking-wider">SUCURSAL</th>
                      <th className="border border-slate-300 px-4 py-3 bg-[#AEAAAA] uppercase tracking-wider">NOMBRE DC</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 1</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 2</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 3</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 4</th>
                      <th className="border border-slate-300 px-4 py-3 text-right bg-[#F8CBAD] w-44 uppercase tracking-wider">VENTA POR SUCURSAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPorDcSemanal.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-slate-400 bg-white">
                          No se encontraron registros de ventas que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      filteredPorDcSemanal.map((row, idx) => (
                        <tr key={idx} className="border-t border-slate-200 align-middle bg-white hover:bg-slate-50 transition-colors">
                          <td className="border border-slate-200 px-4 py-2.5 font-semibold text-slate-800">
                            {row.sucursal}
                            <div className="text-[10px] font-normal text-slate-400 mt-0.5">{row.btlCve} • {row.cadena}</div>
                          </td>
                          <td className="border border-slate-200 px-4 py-2.5 text-slate-700 font-medium">{row.nombreDc}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem1 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem2 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem3 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem4 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-right font-bold text-slate-950 bg-[#F8CBAD]/15">{row.total}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredPorDcSemanal.length > 0 && (
                    <tfoot className="sticky bottom-0 z-10 bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                      <tr>
                        <td className="border border-slate-300 px-4 py-3 bg-slate-100 font-extrabold" colSpan={2}>TOTAL GENERAL</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{detalleTotalSem1}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{detalleTotalSem2}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{detalleTotalSem3}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{detalleTotalSem4}</td>
                        <td className="border border-slate-300 px-4 py-3 text-right bg-[#F8CBAD] font-extrabold text-sm">{detalleTotalGrand}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {activeTab === 'dermo' && (
                <table className="min-w-full border-collapse border border-slate-300 text-xs">
                  <thead className="sticky top-0 z-10 text-slate-900 font-bold text-left shadow-sm">
                    <tr>
                      <th className="border border-slate-300 px-4 py-3 bg-[#AEAAAA] uppercase tracking-wider">NOMBRE DC</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 1</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 2</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 3</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 4</th>
                      <th className="border border-slate-300 px-4 py-3 text-right bg-[#F8CBAD] w-44 uppercase tracking-wider">TOTAL UNIDADES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPorDcConsolidado.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-slate-400 bg-white">
                          No se encontraron registros de ventas que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      filteredPorDcConsolidado.map((row, idx) => (
                        <tr key={idx} className="border-t border-slate-200 align-middle bg-white hover:bg-slate-50 transition-colors">
                          <td className="border border-slate-200 px-4 py-2.5 text-slate-800 font-semibold">{row.nombreDc}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem1 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem2 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem3 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem4 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-right font-bold text-slate-955 bg-[#F8CBAD]/15">{row.total}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredPorDcConsolidado.length > 0 && (
                    <tfoot className="sticky bottom-0 z-10 bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                      <tr>
                        <td className="border border-slate-300 px-4 py-3 bg-slate-100 font-extrabold">TOTAL GENERAL</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{dcTotalSem1}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{dcTotalSem2}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{dcTotalSem3}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{dcTotalSem4}</td>
                        <td className="border border-slate-300 px-4 py-3 text-right bg-[#F8CBAD] font-extrabold text-sm">{dcTotalGrand}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {activeTab === 'sucursal' && (
                <table className="min-w-full border-collapse border border-slate-300 text-xs">
                  <thead className="sticky top-0 z-10 text-slate-900 font-bold text-left shadow-sm">
                    <tr>
                      <th className="border border-slate-300 px-4 py-3 bg-[#AEAAAA] uppercase tracking-wider">SUCURSAL</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 1</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 2</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 3</th>
                      <th className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] w-20 uppercase tracking-wider">SEM 4</th>
                      <th className="border border-slate-300 px-4 py-3 text-right bg-[#F8CBAD] w-44 uppercase tracking-wider">TOTAL UNIDADES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPorPdvConsolidado.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-slate-400 bg-white">
                          No se encontraron registros de ventas que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      filteredPorPdvConsolidado.map((row, idx) => (
                        <tr key={idx} className="border-t border-slate-200 align-middle bg-white hover:bg-slate-50 transition-colors">
                          <td className="border border-slate-200 px-4 py-2.5 text-slate-800 font-semibold">
                            {row.sucursal}
                            <div className="text-[10px] font-normal text-slate-400 mt-0.5">{row.btlCve} • {row.cadena}</div>
                          </td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem1 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem2 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem3 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium">{row.sem4 || '-'}</td>
                          <td className="border border-slate-200 px-4 py-2.5 text-right font-bold text-slate-950 bg-[#F8CBAD]/15">{row.total}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredPorPdvConsolidado.length > 0 && (
                    <tfoot className="sticky bottom-0 z-10 bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                      <tr>
                        <td className="border border-slate-300 px-4 py-3 bg-slate-100 font-extrabold">TOTAL GENERAL</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{pdvTotalSem1}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{pdvTotalSem2}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{pdvTotalSem3}</td>
                        <td className="border border-slate-300 px-4 py-3 text-center bg-[#FCE4D6] font-extrabold">{pdvTotalSem4}</td>
                        <td className="border border-slate-300 px-4 py-3 text-right bg-[#F8CBAD] font-extrabold text-sm">{pdvTotalGrand}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        </Card>
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
