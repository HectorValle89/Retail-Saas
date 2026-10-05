'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ActorActual } from '@/lib/auth/session';
import type {
  ClienteDashboardData,
  ClienteDashboardAlertItem,
} from '@/features/dashboard/services/clienteDashboardService';
import { CaretLeft, CaretRight, CalendarBlank, Check, Copy } from '@phosphor-icons/react';

interface FormulariosEnviadosPorDcViewProps {
  actor: ActorActual;
}

function getTodayIsoString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatFechaEspanol(isoDate: string): string {
  try {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function addDaysToIso(isoDate: string, days: number): string {
  try {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return isoDate;
  }
}

export function FormulariosEnviadosPorDcView({ actor }: FormulariosEnviadosPorDcViewProps) {
  const todayIso = useMemo(() => getTodayIsoString(), []);
  const [fecha, setFecha] = useState<string>(todayIso);
  const [data, setData] = useState<ClienteDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'pendientes' | 'cumplidas' | 'todos'>('pendientes');
  const [copiado, setCopiado] = useState<boolean>(false);

  const fetchDia = useCallback(async (targetFecha: string) => {
    setLoading(true);
    setError(null);
    try {
      const periodo = targetFecha.slice(0, 7);
      const res = await fetch(
        `/api/dashboard/cliente-panel?fecha=${encodeURIComponent(targetFecha)}&periodo=${encodeURIComponent(periodo)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        throw new Error('No fue posible cargar el estatus de reportes');
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDia(fecha);
  }, [fecha, fetchDia]);

  const handlePrevDay = () => {
    setFecha((prev) => addDaysToIso(prev, -1));
  };

  const handleNextDay = () => {
    setFecha((prev) => addDaysToIso(prev, 1));
  };

  const handleIrHoy = () => {
    setFecha(todayIso);
  };

  const pendientesList = useMemo(() => data?.alertas ?? [], [data?.alertas]);
  const cumplidasList = useMemo(() => data?.cumplidas ?? [], [data?.cumplidas]);
  const totalProgramadas = pendientesList.length + cumplidasList.length;
  const totalCumplidas = cumplidasList.length;
  const porcentaje = totalProgramadas > 0 ? Math.round((totalCumplidas / totalProgramadas) * 100) : 0;

  const listToDisplay = useMemo(() => {
    if (activeFilter === 'pendientes') {
      return pendientesList.map((p) => ({
        ...p,
        statusType: (p.tipo === 'incompleto' ? 'incompleto' : 'vacio') as 'incompleto' | 'vacio',
      }));
    }
    if (activeFilter === 'cumplidas') {
      return cumplidasList.map((c) => ({
        ...c,
        statusType: 'cumplido' as const,
      }));
    }
    return [
      ...pendientesList.map((p) => ({
        ...p,
        statusType: (p.tipo === 'incompleto' ? 'incompleto' : 'vacio') as 'incompleto' | 'vacio',
      })),
      ...cumplidasList.map((c) => ({
        ...c,
        statusType: 'cumplido' as const,
      })),
    ].sort((a, b) => a.empleadoNombre.localeCompare(b.empleadoNombre, 'es'));
  }, [activeFilter, pendientesList, cumplidasList]);

  const handleCopiarWhatsApp = () => {
    const diaFormatted = fecha ? fecha.split('-').reverse().join('/') : 'Hoy';
    let texto = `*📊 FORMULARIOS ENVIADOS POR DC (${diaFormatted})*\n`;
    texto += `👤 *Supervisor:* ${actor.nombreCompleto}\n`;
    texto += `📈 *Avance:* ${totalCumplidas} de ${totalProgramadas} dermos (${porcentaje}%)\n`;

    if (cumplidasList.length > 0) {
      texto += `\n✅ *REPORTES ENVIADOS (${cumplidasList.length}):*\n`;
      cumplidasList.forEach((c) => {
        const btl = c.pdvClaveBtl ? ` (${c.pdvClaveBtl})` : '';
        const ventasText = c.ventasOLove ? ` - ${c.ventasOLove} ventas/love` : '';
        texto += `• *${c.empleadoNombre}* - ${c.pdvNombre}${btl}${ventasText}\n`;
      });
    }

    if (pendientesList.length === 0) {
      texto += `\n✨ *¡100% de reportes completados! Todo el equipo al día.*`;
    } else {
      const vacios = pendientesList.filter((p) => p.tipo === 'vacio' || !p.tipo);
      const incompletos = pendientesList.filter((p) => p.tipo === 'incompleto');

      if (vacios.length > 0) {
        texto += `\n🚫 *SIN REPORTES HOY (${vacios.length}):*\n`;
        vacios.forEach((p) => {
          const btl = p.pdvClaveBtl ? ` (${p.pdvClaveBtl})` : '';
          texto += `• *${p.empleadoNombre}* - ${p.pdvNombre}${btl}\n`;
        });
      }

      if (incompletos.length > 0) {
        texto += `\n⚠️ *FALTA VENTAS O LOVE ISDIN (${incompletos.length}):*\n`;
        incompletos.forEach((p) => {
          const btl = p.pdvClaveBtl ? ` (${p.pdvClaveBtl})` : '';
          texto += `• *${p.empleadoNombre}* - ${p.pdvNombre}${btl}\n`;
        });
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      });
    }
  };

  return (
    <div className="space-y-4 pb-8 max-w-3xl mx-auto">
      {/* ──── Barra de Navegación de Fecha (Atrás / Adelante / Picker) ──── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start">
          <button
            type="button"
            onClick={handlePrevDay}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 hover:border-slate-300 active:scale-95"
            aria-label="Día anterior"
            title="Día anterior"
          >
            <CaretLeft className="h-4 w-4" weight="bold" />
          </button>

          <div className="relative flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/60 font-semibold text-xs sm:text-sm text-slate-800 cursor-pointer hover:bg-slate-100/80 transition">
            <CalendarBlank className="h-4 w-4 text-sky-600 shrink-0" weight="bold" />
            <span className="capitalize">{formatFechaEspanol(fecha)}</span>
            {fecha === todayIso && (
              <span className="ml-1 rounded-md bg-sky-100 px-1.5 py-0.2 text-[10px] font-extrabold text-sky-800">
                Hoy
              </span>
            )}
            <input
              type="date"
              value={fecha}
              onChange={(e) => {
                if (e.target.value) setFecha(e.target.value);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              aria-label="Seleccionar fecha"
            />
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 hover:border-slate-300 active:scale-95"
            aria-label="Día siguiente"
            title="Día siguiente"
          >
            <CaretRight className="h-4 w-4" weight="bold" />
          </button>
        </div>

        {fecha !== todayIso && (
          <button
            type="button"
            onClick={handleIrHoy}
            className="text-xs font-bold text-sky-700 hover:text-sky-800 underline underline-offset-2 shrink-0 py-1"
          >
            Regresar a Hoy
          </button>
        )}
      </div>

      {/* ──── Resumen de Avance y Progreso del Día ──── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-base sm:text-lg font-black text-slate-900 leading-tight">
                {actor.nombreCompleto}
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
                Mi Equipo
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {totalCumplidas} de {totalProgramadas} dermos han reportado en esta fecha
            </p>
          </div>

          {/* Botón WhatsApp */}
          <button
            type="button"
            onClick={handleCopiarWhatsApp}
            disabled={totalProgramadas === 0}
            className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 px-3.5 text-xs font-bold transition-all select-none active:scale-95 shadow-2xs shrink-0 ${
              copiado
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-600/30'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
            title="Copiar resumen para WhatsApp"
          >
            {copiado ? (
              <>
                <Check className="h-4 w-4" weight="bold" />
                <span>¡Copiado con éxito! ✓</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-emerald-600" weight="bold" />
                <span>Copiar WhatsApp</span>
              </>
            )}
          </button>
        </div>

        {/* Barra de progreso */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600">Progreso de envíos</span>
            <span className={porcentaje === 100 ? 'text-emerald-600' : 'text-slate-700'}>
              {porcentaje}% completado
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                porcentaje === 100
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-sky-500 to-indigo-600'
              }`}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>

        {/* Sub-tabs de filtrado (Pendientes, Al día, Todos) */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/60 select-none">
          <button
            type="button"
            onClick={() => setActiveFilter('pendientes')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
              activeFilter === 'pendientes'
                ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Pendientes</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                pendientesList.length > 0
                  ? 'bg-amber-100 text-amber-800 font-extrabold'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {pendientesList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('cumplidas')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
              activeFilter === 'cumplidas'
                ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Al día</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-extrabold">
              {totalCumplidas}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('todos')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
              activeFilter === 'todos'
                ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Todos</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-extrabold">
              {totalProgramadas}
            </span>
          </button>
        </div>
      </div>

      {/* ──── Lista de Dermoconsejeras ──── */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-xs font-medium animate-pulse">
          Consultando estatus del equipo para {formatFechaEspanol(fecha)}...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-xs text-red-700">
          {error}
        </div>
      ) : listToDisplay.length > 0 ? (
        <div className="space-y-2">
          {listToDisplay.map((item) => {
            const isCumplido = item.statusType === 'cumplido';
            const isIncompleto = item.statusType === 'incompleto';

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border text-left transition-all bg-white shadow-2xs ${
                  isCumplido
                    ? 'border-emerald-200/80 hover:border-emerald-300'
                    : isIncompleto
                      ? 'border-amber-200/80 hover:border-amber-300'
                      : 'border-red-200/70 hover:border-red-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {item.empleadoNombre}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-tight uppercase select-none ${
                      isCumplido
                        ? 'bg-emerald-100 text-emerald-800'
                        : isIncompleto
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {isCumplido
                      ? `✓ Enviado (${item.ventasOLove ?? 0} ventas/love)`
                      : isIncompleto
                        ? '⚠️ Falta Ventas/Love'
                        : '🚫 Sin reportes'}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="truncate">
                    {item.pdvNombre} {item.pdvClaveBtl ? `(${item.pdvClaveBtl})` : ''}
                  </span>
                  {item.totalCapturas !== undefined && item.totalCapturas > 0 && (
                    <span className="shrink-0 font-medium text-slate-400">
                      {item.totalCapturas} reg.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200 p-6">
          <span className="text-3xl mb-2">
            {activeFilter === 'pendientes' ? '🎉' : '📋'}
          </span>
          <p className="text-sm font-bold text-slate-800">
            {activeFilter === 'pendientes'
              ? '¡Todo el equipo está al día!'
              : totalProgramadas === 0
                ? 'No hay dermoconsejeras programadas para esta fecha.'
                : 'No hay registros en esta categoría.'}
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {activeFilter === 'pendientes'
              ? 'No hay reportes pendientes de envío para esta fecha.'
              : 'Verifica las demás pestañas o cambia de fecha en los controles superiores.'}
          </p>
        </div>
      )}
    </div>
  );
}
