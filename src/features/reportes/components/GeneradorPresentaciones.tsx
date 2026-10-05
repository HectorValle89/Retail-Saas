'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  obtenerTodosPdvsAdmin,
  obtenerTodosSupervisoresAdmin,
} from '@/features/evidencias/actions';
import {
  generarPresentacionEvidencias,
  generarExcelIncidenciasPop,
  getTipoEvidenciaLabel,
} from '../services/presentacionPptService';
import type { TipoEvidencia } from '@/features/evidencias/types';
import type { SupervisorEvidenciaData } from '../services/presentacionService';

interface GeneradorPresentacionesProps {
  periodo?: string;
  pdvId?: string;
  supervisorId?: string;
  hideFilterBar?: boolean;
}

export function GeneradorPresentaciones({
  periodo,
  pdvId: externalPdvId,
  supervisorId: externalSupervisorId,
  hideFilterBar = false,
}: GeneradorPresentacionesProps = {}) {
  const [pdvs, setPdvs] = useState<
    Array<{ id: string; nombre: string; claveBtl: string; cadena: string }>
  >([]);
  const [supervisores, setSupervisores] = useState<Array<{ id: string; nombreCompleto: string }>>(
    []
  );

  // Default month selection (01 to 12)
  const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(currentMonthStr);

  // Custom date range fallback toggle
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [fechaInicio, setFechaInicio] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [fechaFin, setFechaFin] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });

  // Filter select options
  const [pdvId, setPdvId] = useState<string>('');
  const [supervisorId, setSupervisorId] = useState<string>('');

  // Sync external filter props from master bar
  useEffect(() => {
    if (externalPdvId !== undefined) {
      setPdvId(externalPdvId);
    }
  }, [externalPdvId]);

  useEffect(() => {
    if (externalSupervisorId !== undefined) {
      setSupervisorId(externalSupervisorId);
    }
  }, [externalSupervisorId]);

  useEffect(() => {
    if (periodo) {
      const parts = periodo.split('-');
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const monthIdx = parseInt(parts[1], 10) - 1;
        const start = new Date(year, monthIdx, 1).toISOString().slice(0, 10);
        const end = new Date(year, monthIdx + 1, 0).toISOString().slice(0, 10);
        setFechaInicio(start);
        setFechaFin(end);
        setMesSeleccionado(parts[1]);
      }
    }
  }, [periodo]);

  // Applied data state
  const [evidenciasConsultadas, setEvidenciasConsultadas] = useState<
    SupervisorEvidenciaData[] | null
  >(null);
  const [isSearching, setIsSearching] = useState(false);
  const [filtrosAplicadosLabel, setFiltrosAplicadosLabel] = useState<string>('');

  // Action feedback
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load PDVs and Supervisors
  useEffect(() => {
    void (async () => {
      const [pdvList, supList] = await Promise.all([
        obtenerTodosPdvsAdmin(),
        obtenerTodosSupervisoresAdmin(),
      ]);
      setPdvs(pdvList);
      setSupervisores(supList);
    })();
  }, []);

  // Update dates when quick month changes
  const handleMonthChange = (mesVal: string) => {
    setMesSeleccionado(mesVal);
    if (!mesVal) return;
    const year = new Date().getFullYear();
    const monthIdx = parseInt(mesVal, 10) - 1;
    const start = new Date(year, monthIdx, 1).toISOString().slice(0, 10);
    const end = new Date(year, monthIdx + 1, 0).toISOString().slice(0, 10);
    setFechaInicio(start);
    setFechaFin(end);
  };

  // Step 1: Execute query to fetch filtered evidence
  const ejecutarBusqueda = async () => {
    setIsSearching(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const params = new URLSearchParams();
      if (fechaInicio) params.set('fechaInicio', fechaInicio);
      if (fechaFin) params.set('fechaFin', fechaFin);
      if (pdvId) params.set('pdvId', pdvId);
      if (supervisorId) params.set('supervisorId', supervisorId);

      const res = await fetch(`/api/reportes/presentaciones-data?${params.toString()}`);
      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(
          payload.message || 'Fallo al recuperar registros de evidencias del supervisor.'
        );
      }

      const datos: SupervisorEvidenciaData[] = payload.data || [];
      setEvidenciasConsultadas(datos);

      const nombreMeses = [
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre',
      ];
      const mesNombre = nombreMeses[parseInt(mesSeleccionado, 10) - 1] || 'Período';
      setFiltrosAplicadosLabel(`${mesNombre} (${datos.length} evidencias registradas)`);
    } catch (err: any) {
      console.error('Error al aplicar filtros:', err);
      setErrorMsg(err.message || 'No fue posible consultar las evidencias.');
      setEvidenciasConsultadas([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Execute initial search on load
  useEffect(() => {
    void ejecutarBusqueda();
  }, []);

  // Step 2: Download filtered data by template type
  const triggerDownload = async (tipo: TipoEvidencia, isExcel = false) => {
    const loadingKey = `${tipo}_${isExcel ? 'xlsx' : 'pptx'}`;
    setLoadingMap((prev) => ({ ...prev, [loadingKey]: true }));
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const datosSubconjunto = (evidenciasConsultadas || []).filter(
        (item) => item.tipoEvidencia === tipo
      );

      if (datosSubconjunto.length === 0) {
        throw new Error(
          `No existen evidencias de tipo "${getTipoEvidenciaLabel(tipo)}" para los filtros aplicados.`
        );
      }

      if (isExcel) {
        await generarExcelIncidenciasPop(datosSubconjunto);
        setSuccessMsg(
          `Reporte Excel generado con éxito (${datosSubconjunto.filter((d) => d.metadata?.checklist?.llegado_buen_estado === false).length} incidencias).`
        );
      } else {
        await generarPresentacionEvidencias(tipo, datosSubconjunto);
        setSuccessMsg(
          `Presentación PowerPoint de "${getTipoEvidenciaLabel(tipo)}" generada con éxito.`
        );
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al generar la presentación.');
    } finally {
      setLoadingMap((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const templatesList: Array<{
    tipo: TipoEvidencia;
    color: string;
    icon: string;
    hasExcel?: boolean;
  }> = [
    { tipo: 'MATERIAL_POP', color: 'indigo', icon: '📦', hasExcel: true },
    { tipo: 'CAMPANA_ESTACIONAL', color: 'pink', icon: '🎗️' },
    { tipo: 'MALETA_VANITY', color: 'purple', icon: '💼' },
    { tipo: 'ADOPTADO_SAN_PABLO', color: 'blue', icon: '🏥' },
    { tipo: 'EVENTO_ESPECIAL', color: 'amber', icon: '✨' },
    { tipo: 'PRODUCTO_MES_LIVERPOOL', color: 'emerald', icon: '🎓' },
    { tipo: 'IMPLEMENTACION', color: 'sky', icon: '🛠️' },
  ];

  return (
    <div className="space-y-6">
      {/* Filter Panel (Only shown if hideFilterBar is false) */}
      {!hideFilterBar && (
        <Card className="p-5 border-slate-200 bg-white shadow-sm rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Filtros de Búsqueda
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setUseCustomDates(!useCustomDates)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline self-start sm:self-auto"
            >
              {useCustomDates
                ? 'Usar selección rápida de mes'
                : 'Personalizar rango de fechas (Día exacto)'}
            </button>
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 items-end">
            {/* Quick Month Selector */}
            {!useCustomDates ? (
              <div className="space-y-1 sm:col-span-1">
                <label className="text-xs font-bold text-slate-700">Mes de Operación</label>
                <select
                  value={mesSeleccionado}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="01">Enero</option>
                  <option value="02">Febrero</option>
                  <option value="03">Marzo</option>
                  <option value="04">Abril</option>
                  <option value="05">Mayo</option>
                  <option value="06">Junio</option>
                  <option value="07">Julio</option>
                  <option value="08">Agosto</option>
                  <option value="09">Septiembre</option>
                  <option value="10">Octubre</option>
                  <option value="11">Noviembre</option>
                  <option value="12">Diciembre</option>
                </select>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Fecha Inicio</label>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Fecha Fin</label>
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </>
            )}

            {/* PDV */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Punto de Venta (Opcional)</label>
              <select
                value={pdvId}
                onChange={(e) => setPdvId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Supervisor (Opcional)</label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Todos los supervisores</option>
                {supervisores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombreCompleto}
                  </option>
                ))}
              </select>
            </div>

            {/* Apply Filter Button */}
            <div className="w-full sm:w-auto">
              <Button
                onClick={() => void ejecutarBusqueda()}
                disabled={isSearching}
                isLoading={isSearching}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-sm transition flex items-center justify-center gap-2"
              >
                🔍 Aplicar Filtros
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Messages */}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm leading-5">
          ❌ {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm leading-5">
          🎉 {successMsg}
        </div>
      )}

      {/* Step 2 Header & Data Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
            2
          </span>
          <h3 className="text-base font-bold text-slate-900">Evidencias Listas para Descarga</h3>
        </div>
        {filtrosAplicadosLabel && (
          <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
            Filtro activo: {filtrosAplicadosLabel}
          </span>
        )}
      </div>

      {/* Grid of Templates with Evidence Counters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {templatesList.map((tpl) => {
          const pptKey = `${tpl.tipo}_pptx`;
          const xlsxKey = `${tpl.tipo}_xlsx`;
          const isPptLoading = loadingMap[pptKey] || false;
          const isXlsxLoading = loadingMap[xlsxKey] || false;

          // Count matching records for this category
          const countCat = (evidenciasConsultadas || []).filter(
            (item) => item.tipoEvidencia === tpl.tipo
          ).length;

          return (
            <Card
              key={tpl.tipo}
              className="p-5 border-slate-200 bg-white shadow-sm hover:shadow-md transition duration-200 rounded-2xl flex flex-col justify-between"
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  {tpl.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-bold text-slate-900">
                      {getTipoEvidenciaLabel(tpl.tipo)}
                    </h4>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        countCat > 0
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {countCat} {countCat === 1 ? 'evidencia' : 'evidencias'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-5">
                    Mapea automáticamente las fotos en diapositivas 16:9 con fondos, ID del PDV,
                    cadena, fecha y supervisor.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <Button
                  onClick={() => void triggerDownload(tpl.tipo, false)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-md transition flex items-center gap-2"
                  disabled={isPptLoading || isXlsxLoading || isSearching}
                  isLoading={isPptLoading}
                >
                  📥 Descargar PPTX ({countCat})
                </Button>

                {tpl.hasExcel && (
                  <Button
                    onClick={() => void triggerDownload(tpl.tipo, true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-md transition flex items-center gap-2"
                    disabled={isPptLoading || isXlsxLoading || isSearching}
                    isLoading={isXlsxLoading}
                  >
                    📊 Incidencias (XLSX)
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}