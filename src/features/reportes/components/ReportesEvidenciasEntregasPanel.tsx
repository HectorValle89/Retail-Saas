'use client';

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';
import { ExportLastMilePptButton } from './ExportLastMilePptButton';
import { ExportUniformsPptButton } from './ExportUniformsPptButton';
import { GeneradorPresentaciones } from './GeneradorPresentaciones';
import { HistorialEvidenciasReadonly } from '@/features/evidencias/components/HistorialEvidenciasReadonly';
import { obtenerTodosPdvsAdmin, obtenerTodosSupervisoresAdmin } from '@/features/evidencias/actions';
import type { ActorActual } from '@/lib/auth/session';

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
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        {summary && <p className="mt-1 text-xs text-slate-400">{summary}</p>}
      </div>
      {exportAction}
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:border-slate-400 hover:bg-slate-50"
    >
      📊 {label}
    </Link>
  );
}

function getCurrentMonthString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

function formatMonthLabel(monthVal: string) {
  try {
    const [yearStr, monthStr] = monthVal.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return monthVal;
  }
}

function buildLastMileExcelHref(periodo: string, cuentaClienteId?: string | null) {
  const params = new URLSearchParams({ periodo });
  if (cuentaClienteId) {
    params.set('cuentaClienteId', cuentaClienteId);
  }
  return `/api/reportes/ultima-milla-xlsx?${params.toString()}`;
}

function buildUniformsExcelHref(periodo: string, cuentaClienteId?: string | null) {
  const params = new URLSearchParams({ periodo });
  if (cuentaClienteId) {
    params.set('cuentaClienteId', cuentaClienteId);
  }
  return `/api/reportes/uniformes-xlsx?${params.toString()}`;
}

interface ReportesEvidenciasEntregasPanelProps {
  actor: ActorActual;
}

type TabType = 'evidencias-campo' | 'dispersiones' | 'uniformes' | 'historial-bd';

export function ReportesEvidenciasEntregasPanel({ actor }: ReportesEvidenciasEntregasPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('evidencias-campo');

  // Pending filter values (selected in master bar dropdowns)
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => getCurrentMonthString());
  const [selectedPdvId, setSelectedPdvId] = useState<string>('');
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');

  // Applied filter values (updated when clicking "🔍 Aplicar Filtros")
  const [appliedPeriod, setAppliedPeriod] = useState<string>(() => getCurrentMonthString());
  const [appliedPdvId, setAppliedPdvId] = useState<string>('');
  const [appliedSupervisorId, setAppliedSupervisorId] = useState<string>('');

  const [pdvs, setPdvs] = useState<Array<{ id: string; nombre: string; claveBtl: string; cadena: string }>>([]);
  const [supervisores, setSupervisores] = useState<Array<{ id: string; nombreCompleto: string }>>([]);

  // Load dropdown data for master filter bar
  useEffect(() => {
    void (async () => {
      try {
        const [pdvList, supList] = await Promise.all([
          obtenerTodosPdvsAdmin(),
          obtenerTodosSupervisoresAdmin(),
        ]);
        setPdvs(pdvList);
        setSupervisores(supList);
      } catch (err) {
        console.error('Error al cargar catálogos de filtro maestro:', err);
      }
    })();
  }, []);

  // Execute filter application across all tabs
  const handleApplyFilters = () => {
    setAppliedPeriod(selectedPeriod);
    setAppliedPdvId(selectedPdvId);
    setAppliedSupervisorId(selectedSupervisorId);
  };

  // Month options list (last 12 months + next month)
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = -6; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      opts.push(`${year}-${month}`);
    }
    const current = getCurrentMonthString();
    if (!opts.includes(current)) opts.push(current);
    return Array.from(new Set(opts)).sort((a, b) => b.localeCompare(a));
  }, []);

  return (
    <div className="space-y-6">
      {/* 1. MASTER HEADER & UNIFIED FILTER BAR WITH APLICAR FILTROS BUTTON */}
      <Card className="border-sky-200 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 border border-sky-300 text-sky-800 text-xl font-bold shadow-xs">
                📸
              </span>
              <div>
                <h1 className="text-2xl font-black text-slate-950 tracking-tight">
                  Módulo de Entregas y Evidencias
                </h1>
                <p className="text-xs text-slate-500">
                  Consola unificada para consultar, filtrar y descargar reportes fotográficos (PPTX) y balances en Excel (XLSX).
                </p>
              </div>
            </div>
          </div>

          {/* SINGLE MASTER FILTER BAR WITH "APLICAR FILTROS" */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
            {/* Mes */}
            <div className="flex items-center gap-2">
              <label htmlFor="master-period" className="text-xs font-bold text-slate-700">
                Mes:
              </label>
              <select
                id="master-period"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>

            {/* PDV */}
            <div className="flex items-center gap-2">
              <label htmlFor="master-pdv" className="text-xs font-bold text-slate-700">
                PDV:
              </label>
              <select
                id="master-pdv"
                value={selectedPdvId}
                onChange={(e) => setSelectedPdvId(e.target.value)}
                className="max-w-[180px] truncate rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none"
              >
                <option value="">Todos los PDVs</option>
                {pdvs.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.cadena}] {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Supervisor */}
            <div className="flex items-center gap-2">
              <label htmlFor="master-sup" className="text-xs font-bold text-slate-700">
                Supervisor:
              </label>
              <select
                id="master-sup"
                value={selectedSupervisorId}
                onChange={(e) => setSelectedSupervisorId(e.target.value)}
                className="max-w-[180px] truncate rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none"
              >
                <option value="">Todos los supervisores</option>
                {supervisores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombreCompleto}
                  </option>
                ))}
              </select>
            </div>

            {/* APLICAR FILTROS BUTTON */}
            <Button
              onClick={handleApplyFilters}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0"
            >
              🔍 Aplicar Filtros
            </Button>
          </div>
        </div>
      </Card>

      {/* 2. ORGANIC TABS NAVIGATION BAR */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('evidencias-campo')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition shadow-2xs whitespace-nowrap ${
            activeTab === 'evidencias-campo'
              ? 'bg-sky-700 text-white shadow-md ring-2 ring-sky-700/20'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>📸</span> Evidencias de Campo (Displays, POP, Vanity)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dispersiones')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition shadow-2xs whitespace-nowrap ${
            activeTab === 'dispersiones'
              ? 'bg-sky-700 text-white shadow-md ring-2 ring-sky-700/20'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>📦</span> Dispersiones de Última Milla (Materiales)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('uniformes')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition shadow-2xs whitespace-nowrap ${
            activeTab === 'uniformes'
              ? 'bg-sky-700 text-white shadow-md ring-2 ring-sky-700/20'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>👕</span> Entrega de Uniformes
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('historial-bd')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition shadow-2xs whitespace-nowrap ${
            activeTab === 'historial-bd'
              ? 'bg-sky-700 text-white shadow-md ring-2 ring-sky-700/20'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>📋</span> Historial de Evidencias en BD
        </button>
      </div>

      {/* 3. ORGANIC TAB CONTENT RENDERERS */}

      {/* PESTAÑA 1: EVIDENCIAS DE CAMPO */}
      {activeTab === 'evidencias-campo' && (
        <div className="space-y-4">
          <GeneradorPresentaciones
            periodo={appliedPeriod}
            pdvId={appliedPdvId}
            supervisorId={appliedSupervisorId}
            hideFilterBar={true}
          />
        </div>
      )}

      {/* PESTAÑA 2: DISPERSIONES DE ÚLTIMA MILLA */}
      {activeTab === 'dispersiones' && (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm rounded-2xl">
          <SectionHeader
            title="📦 Reporte de Dispersiones y Última Milla (Materiales)"
            description="Exportación consolidada de la recepción y entregas de materiales en tienda. Incluye formato Excel con balance de piezas y PowerPoint fotográfico."
            summary={`Periodo: ${formatMonthLabel(appliedPeriod)}. Diapositiva por cada recepción completada con acuse firmado y fotografías.`}
            exportAction={
              <div className="flex items-center gap-2">
                <ExportLastMilePptButton
                  periodo={appliedPeriod}
                  cuentaClienteId={actor.cuentaClienteId}
                />
                <ExportLink
                  href={buildLastMileExcelHref(appliedPeriod, actor.cuentaClienteId)}
                  label="Excel Incidencias / Balances"
                />
              </div>
            }
          />
          <div className="px-6 py-5 text-xs text-slate-600 border-t border-slate-100 bg-slate-50/50 space-y-2">
            <p className="font-bold text-slate-800 text-sm">Contenido de la exportación de dispersiones:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 leading-relaxed">
              <li>Excel con detalle por renglón: SKU, cantidades enviadas/teóricas, recibidas y diferencias.</li>
              <li>PowerPoint con fotografías del acuse firmado en formato vertical y fotografía del receptor.</li>
              <li>Filtro activo aplicado automáticamente para el mes de {formatMonthLabel(appliedPeriod)}.</li>
            </ul>
          </div>
        </Card>
      )}

      {/* PESTAÑA 3: ENTREGA DE UNIFORMES */}
      {activeTab === 'uniformes' && (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm rounded-2xl">
          <SectionHeader
            title="👕 Reporte de Entrega de Uniformes"
            description="Exportación de reportes fotográficos y acuses firmados de entregas de prendas a Dermoconsejeras."
            summary={`Periodo: ${formatMonthLabel(appliedPeriod)}. Presentación PowerPoint con acuses e imágenes de entrega y Excel consolidado.`}
            exportAction={
              <div className="flex items-center gap-2">
                <ExportUniformsPptButton
                  periodo={appliedPeriod}
                  cuentaClienteId={actor.cuentaClienteId}
                />
                <ExportLink
                  href={buildUniformsExcelHref(appliedPeriod, actor.cuentaClienteId)}
                  label="Excel Acuses Uniformes"
                />
              </div>
            }
          />
          <div className="px-6 py-5 text-xs text-slate-600 border-t border-slate-100 bg-slate-50/50 space-y-2">
            <p className="font-bold text-slate-800 text-sm">Contenido de la exportación de uniformes:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 leading-relaxed">
              <li>Excel con detalle de prendas entregadas por Dermoconsejera, fecha y supervisor.</li>
              <li>PowerPoint con diapositiva por entrega con foto del acuse firmado y foto del receptor.</li>
              <li>Filtro activo aplicado automáticamente para el mes de {formatMonthLabel(appliedPeriod)}.</li>
            </ul>
          </div>
        </Card>
      )}

      {/* PESTAÑA 4: HISTORIAL DE EVIDENCIAS EN BD (READ-ONLY) */}
      {activeTab === 'historial-bd' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <HistorialEvidenciasReadonly
            periodo={appliedPeriod}
            pdvId={appliedPdvId}
            supervisorId={appliedSupervisorId}
          />
        </div>
      )}
    </div>
  );
}
