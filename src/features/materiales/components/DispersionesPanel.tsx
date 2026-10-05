'use client';

import { useState, useMemo } from 'react';
import { Card, Select } from '@/components/ui';

// ─── Types ───────────────────────────────────────────

type EstadoDispersionUI = 'PLANEADA' | 'EN_TRANSITO' | 'ENTREGADA' | 'CANCELADA';

interface DispersionRow {
  id: string;
  pdvNombre: string;
  pdvClaveBtl: string | null;
  cadena: string | null;
  supervisorNombre: string | null;
  mesOperacion: string;
  estado: EstadoDispersionUI;
  enviadoEn: string | null;
  entregadoEn: string | null;
  createdAt: string;
  itemCount: number;
  tipoDispersion?: string | null;
  detalles: Array<{
    id: string;
    materialNombre: string;
    cantidadPlaneada: number;
    cantidadEnviada: number;
    cantidadRecibida: number;
    requiereReporteEntrega: boolean;
  }>;
}

export interface DispersionesPanelData {
  dispersiones: DispersionRow[];
  meses: string[];
  resumen: {
    planeadas: number;
    en_transito: number;
    entregadas: number;
    canceladas: number;
  };
}

// ─── Main Component ──────────────────────────────────

export function DispersionesPanel({ data }: { data: DispersionesPanelData }) {
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroMes, setFiltroMes] = useState(data.meses[0] ?? '');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [expandido, setExpandido] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    let result = data.dispersiones;
    if (filtroEstado) {
      result = result.filter((d) => d.estado === filtroEstado);
    }
    if (filtroMes) {
      result = result.filter((d) => d.mesOperacion === filtroMes);
    }
    if (filtroTipo) {
      result = result.filter((d) => (d.tipoDispersion ?? 'MENSUAL') === filtroTipo);
    }
    return result;
  }, [data.dispersiones, filtroEstado, filtroMes, filtroTipo]);

  return (
    <div className="space-y-6">
      {/* Resumen por estado */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <EstadoCard
          label="Planeadas"
          value={data.resumen.planeadas}
          icon="📋"
          tone="sky"
          active={filtroEstado === 'PLANEADA'}
          onClick={() => setFiltroEstado(filtroEstado === 'PLANEADA' ? '' : 'PLANEADA')}
        />
        <EstadoCard
          label="En tránsito"
          value={data.resumen.en_transito}
          icon="🚚"
          tone="amber"
          active={filtroEstado === 'EN_TRANSITO'}
          onClick={() => setFiltroEstado(filtroEstado === 'EN_TRANSITO' ? '' : 'EN_TRANSITO')}
        />
        <EstadoCard
          label="Entregadas"
          value={data.resumen.entregadas}
          icon="✅"
          tone="emerald"
          active={filtroEstado === 'ENTREGADA'}
          onClick={() => setFiltroEstado(filtroEstado === 'ENTREGADA' ? '' : 'ENTREGADA')}
        />
        <EstadoCard
          label="Canceladas"
          value={data.resumen.canceladas}
          icon="❌"
          tone="slate"
          active={filtroEstado === 'CANCELADA'}
          onClick={() => setFiltroEstado(filtroEstado === 'CANCELADA' ? '' : 'CANCELADA')}
        />
      </div>

      {/* Filtros */}
      <Card className="grid gap-4 md:grid-cols-3">
        <Select
          label="Mes de operación"
          options={[
            { value: '', label: 'Todos los meses' },
            ...data.meses.map((m) => ({ value: m, label: formatMonth(m) })),
          ]}
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
        />
        <Select
          label="Estado"
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'PLANEADA', label: '📋 Planeada' },
            { value: 'EN_TRANSITO', label: '🚚 En tránsito' },
            { value: 'ENTREGADA', label: '✅ Entregada' },
            { value: 'CANCELADA', label: '❌ Cancelada' },
          ]}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        />
        <Select
          label="Tipo de dispersión"
          options={[
            { value: '', label: 'Todos los tipos' },
            { value: 'MENSUAL', label: 'Mensual (Ordinaria)' },
            { value: 'ADICIONAL', label: 'Por campaña' },
            { value: 'EXCLUSIVA_CANJES', label: 'Exclusiva Canjes' },
            { value: 'EXCLUSIVA_TESTERS', label: 'Exclusiva Testers' },
            { value: 'EXCLUSIVA_REGALOS', label: 'Exclusiva Regalos' },
            { value: 'ENTREGA_RESGUARDO', label: 'Entrega de paquete en resguardo' },
          ]}
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        />
      </Card>

      {/* Lista de dispersiones */}
      <Card className="space-y-4 p-0">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
            Dispersiones
          </p>
          <p className="mt-1 text-sm text-slate-500">{filtradas.length} dispersiones</p>
        </div>

        {filtradas.length === 0 ? (
          <div className="px-6 py-10 text-center text-slate-500">
            No hay dispersiones con los filtros seleccionados.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtradas.slice(0, 50).map((disp) => (
              <DispersionItem
                key={disp.id}
                disp={disp}
                expandido={expandido === disp.id}
                onToggle={() => setExpandido(expandido === disp.id ? null : disp.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────

function DispersionItem({
  disp,
  expandido,
  onToggle,
}: {
  disp: DispersionRow;
  expandido: boolean;
  onToggle: () => void;
}) {
  const estadoConfig = ESTADO_CONFIG[disp.estado];

  return (
    <div className="px-5 py-4">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-950">{disp.pdvNombre}</p>
            <p className="mt-1 text-sm text-slate-600">
              {disp.pdvClaveBtl ?? 'Sin clave'} · {disp.cadena ?? 'Sin cadena'} ·{' '}
              {disp.supervisorNombre ?? 'Sin supervisor'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {formatMonth(disp.mesOperacion)} · {disp.itemCount} productos · Creada{' '}
              {formatDateTime(disp.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                disp.tipoDispersion === 'ADICIONAL'
                  ? 'bg-purple-100 text-purple-750'
                  : disp.tipoDispersion === 'EXCLUSIVA_CANJES'
                    ? 'bg-pink-100 text-pink-700'
                    : disp.tipoDispersion === 'EXCLUSIVA_TESTERS'
                      ? 'bg-teal-100 text-teal-750'
                      : disp.tipoDispersion === 'EXCLUSIVA_REGALOS'
                        ? 'bg-rose-100 text-rose-700'
                        : disp.tipoDispersion === 'OTRA'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-blue-100 text-blue-700'
              }`}
            >
              📦 {formatTipoDispersionLabel(disp.tipoDispersion)}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${estadoConfig.className}`}
            >
              {estadoConfig.icon} {estadoConfig.label}
            </span>
            <span className="text-sm text-slate-400">{expandido ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Timeline de estados */}
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <TimelineStep label="Creada" date={disp.createdAt} done />
          <TimelineLine done={disp.estado !== 'PLANEADA' && disp.estado !== 'CANCELADA'} />
          <TimelineStep label="Enviada" date={disp.enviadoEn} done={!!disp.enviadoEn} />
          <TimelineLine done={disp.estado === 'ENTREGADA'} />
          <TimelineStep label="Entregada" date={disp.entregadoEn} done={!!disp.entregadoEn} />
        </div>
      </button>

      {/* Detalle expandido */}
      {expandido && disp.detalles.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2.5">Producto</th>
                <th className="px-4 py-2.5 text-right">Planeado</th>
                <th className="px-4 py-2.5 text-right">Enviado</th>
                <th className="px-4 py-2.5 text-right">Recibido</th>
                <th className="px-4 py-2.5 text-center">Reporte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {disp.detalles.map((det) => (
                <tr key={det.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-900">{det.materialNombre}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{det.cantidadPlaneada}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{det.cantidadEnviada}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{det.cantidadRecibida}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        det.requiereReporteEntrega
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {det.requiereReporteEntrega ? 'Sí' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EstadoCard({
  label,
  value,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: string;
  tone: 'sky' | 'amber' | 'emerald' | 'slate';
  active: boolean;
  onClick: () => void;
}) {
  const baseClass =
    tone === 'sky'
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[18px] border p-4 text-left transition-all duration-200 ${baseClass} ${
        active ? 'ring-2 ring-offset-2 ring-sky-400 scale-[1.02]' : 'hover:scale-[1.01]'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
        {icon} {label}
      </p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </button>
  );
}

function TimelineStep({
  label,
  date,
  done,
}: {
  label: string;
  date: string | null;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <span className={done ? 'text-slate-700 font-medium' : 'text-slate-400'}>{label}</span>
    </div>
  );
}

function TimelineLine({ done }: { done: boolean }) {
  return <span className={`h-px flex-1 min-w-4 ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />;
}

// ─── Config & Helpers ────────────────────────────────

const ESTADO_CONFIG: Record<
  EstadoDispersionUI,
  { label: string; icon: string; className: string }
> = {
  PLANEADA: { label: 'Planeada', icon: '📋', className: 'bg-sky-100 text-sky-700' },
  EN_TRANSITO: { label: 'En tránsito', icon: '🚚', className: 'bg-amber-100 text-amber-800' },
  ENTREGADA: { label: 'Entregada', icon: '✅', className: 'bg-emerald-100 text-emerald-700' },
  CANCELADA: { label: 'Cancelada', icon: '❌', className: 'bg-slate-100 text-slate-500' },
};

function formatMonth(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function formatTipoDispersionLabel(value?: string | null) {
  const map: Record<string, string> = {
    MENSUAL: 'Mensual (Ordinaria)',
    ADICIONAL: 'Por campaña',
    EXCLUSIVA_CANJES: 'Exclusiva Canjes',
    EXCLUSIVA_TESTERS: 'Exclusiva Testers',
    EXCLUSIVA_REGALOS: 'Exclusiva Regalos',
    ENTREGA_RESGUARDO: 'Entrega de paquete en resguardo',
  };
  return map[value ?? ''] ?? value ?? 'Mensual (Ordinaria)';
}