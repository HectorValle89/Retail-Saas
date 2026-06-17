'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import type { LevantamientoUniformeRow } from '../services/mecanicasReportService';
import { SUPERVISORES_OFICIALES } from '@/features/captura-publica/services/mecanicasConstants';

export function MecanicasReportSection() {
  const [registros, setRegistros] = useState<LevantamientoUniformeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscador local
  const [search, setSearch] = useState('');

  const fetchRegistros = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/reportes/mecanicas-propuestas', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const resData = await response.json();
      if (resData.ok) {
        setRegistros(resData.data ?? []);
      } else {
        setError(resData.error ?? 'Error al cargar los registros de uniformes.');
      }
    } catch (err) {
      setError('Error de conexión al cargar reportes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRegistros();
  }, []);

  // 1. Control de Participación
  const participacion = useMemo(() => {
    const respondieronNombres = registros.map((r) => r.supervisor_nombre.toUpperCase());
    const respondieronCount = registros.length;

    // Calcular quiénes faltan
    const pendientes = SUPERVISORES_OFICIALES.filter(
      (sup) => !respondieronNombres.includes(sup.toUpperCase())
    ).sort((a, b) => a.localeCompare(b, 'es'));

    return {
      respondieronCount,
      totalOficiales: SUPERVISORES_OFICIALES.length,
      pendientes,
    };
  }, [registros]);

  // 2. Consolidado para Proveedor
  const consolidado = useMemo(() => {
    const keys: Record<string, number> = {};

    for (const reg of registros) {
      for (const item of reg.prendas) {
        const key = `${item.prenda}|${item.genero}|${item.talla}`;
        keys[key] = (keys[key] ?? 0) + item.cantidad;
      }
    }

    const tallaOrden: Record<string, number> = { CH: 1, M: 2, G: 3, XL: 4, '2XL': 5, '3XL': 6 };

    return Object.entries(keys)
      .map(([keyStr, total]) => {
        const [prenda, genero, talla] = keyStr.split('|');
        return { prenda, genero, talla, total };
      })
      .sort((a, b) => {
        // Ordenar primero por Prenda
        const compPrenda = a.prenda.localeCompare(b.prenda, 'es');
        if (compPrenda !== 0) return compPrenda;

        // Luego por Género
        const compGenero = a.genero.localeCompare(b.genero, 'es');
        if (compGenero !== 0) return compGenero;

        // Luego por Talla jerárquica
        const valA = tallaOrden[a.talla] ?? 99;
        const valB = tallaOrden[b.talla] ?? 99;
        return valA - valB;
      });
  }, [registros]);

  // Total de piezas consolidadas
  const totalPiezasConsolidadas = useMemo(() => {
    return consolidado.reduce((acc, curr) => acc + curr.total, 0);
  }, [consolidado]);

  // 3. Filtrar registros para el Desglose Detallado (incluyendo Ciudad y Destinatario)
  const registrosFiltrados = useMemo(() => {
    if (!search.trim()) return registros;
    const cleanSearch = search.toLowerCase();

    return registros.filter((reg) => {
      const matchNombre = reg.supervisor_nombre.toLowerCase().includes(cleanSearch);
      const matchCiudad = reg.ciudad_envio.toLowerCase().includes(cleanSearch);
      const matchRecibe = reg.recibe_nombre.toLowerCase().includes(cleanSearch);
      const matchPrendas = reg.prendas.some(
        (p) =>
          p.prenda.toLowerCase().includes(cleanSearch) ||
          p.talla.toLowerCase().includes(cleanSearch) ||
          p.genero.toLowerCase().includes(cleanSearch)
      );
      return matchNombre || matchCiudad || matchRecibe || matchPrendas;
    });
  }, [registros, search]);

  // Exportar Desglose detallado a CSV
  const handleExportCSV = () => {
    if (registros.length === 0) return;

    const headers = [
      'Fecha Registro',
      'Supervisor',
      'Ciudad de Envío',
      'Quién Recibe',
      'Dirección de Envío',
      'Prenda',
      'Género',
      'Talla',
      'Cantidad',
    ];

    const rows: string[][] = [];
    for (const reg of registros) {
      const fecha = new Date(reg.fecha_creacion).toLocaleDateString('es-MX');
      for (const item of reg.prendas) {
        rows.push([
          fecha,
          reg.supervisor_nombre,
          reg.ciudad_envio,
          reg.recibe_nombre,
          reg.direccion_envio || '',
          item.prenda,
          item.genero,
          item.talla,
          String(item.cantidad),
        ]);
      }
    }

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute(
      'download',
      `levantamiento_uniformes_supervisores_${new Date().toLocaleDateString('en-CA')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50 text-red-950 rounded-2xl shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-red-600">Error de Carga</p>
        <p className="mt-2 text-sm font-medium">{error}</p>
        <button
          onClick={() => void fetchRegistros()}
          className="mt-4 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-full transition-all"
        >
          🔄 Reintentar cargar
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs Principales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5 border border-slate-100 rounded-3xl bg-white shadow-sm flex flex-col justify-between">
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
            Control de Participación
          </p>
          <p className="text-3xl font-black text-slate-900 mt-2">
            {participacion.respondieronCount} <span className="text-lg text-slate-400">/ {participacion.totalOficiales}</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1 font-medium">
            Supervisores oficiales que ya confirmaron tallas
          </p>
        </Card>

        <Card className="p-5 border border-slate-100 rounded-3xl bg-white shadow-sm flex flex-col justify-between">
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
            Total Piezas Pedidas
          </p>
          <p className="text-3xl font-black text-indigo-700 mt-2">
            {totalPiezasConsolidadas} <span className="text-xs text-indigo-400 font-bold uppercase">Piezas</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1 font-medium">
            Acumulado total para proveeduría de uniformes
          </p>
        </Card>

        <Card className="p-5 border border-slate-100 rounded-3xl bg-white shadow-sm flex flex-col justify-between">
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
            Pendientes de Confirmar
          </p>
          <p className="text-3xl font-black text-rose-600 mt-2">
            {participacion.pendientes.length}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 font-medium">
            Supervisores faltantes por enviar formulario
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Panel Izquierdo: Control de Participación / Pendientes */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="p-5 border border-slate-100 rounded-[28px] bg-white shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              🚨 Control de Participación
            </h3>

            {participacion.pendientes.length === 0 ? (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                <span className="text-xl">✅</span>
                <p className="mt-1.5 text-xs font-bold text-emerald-950">¡100% Completado!</p>
                <p className="text-[10px] text-emerald-700">Todos los supervisores respondieron.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Faltan por contestar ({participacion.pendientes.length}):
                </p>
                <div className="max-h-[300px] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                  {participacion.pendientes.map((nom, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {nom}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Panel Derecho: Pedido Consolidado (Para Proveedor) */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5 border border-slate-100 rounded-[28px] bg-white shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  📦 Pedido Consolidado (Para Proveedor)
                </h3>
                <p className="text-[10px] text-slate-400">
                  Lista unificada por Prenda, Género y Talla para enviar directamente al fabricante.
                </p>
              </div>
              {registros.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full transition-all border border-emerald-100 self-start sm:self-auto"
                >
                  📊 Descargar Desglose CSV
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  Cargando consolidado...
                </div>
              ) : consolidado.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  Aún no hay datos de uniformes registrados.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3">Prenda</th>
                      <th className="px-4 py-3">Género</th>
                      <th className="px-4 py-3 text-center">Talla</th>
                      <th className="px-4 py-3 text-right">Total Piezas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                    {consolidado.map((item, index) => (
                      <tr key={index} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-slate-900">{item.prenda}</td>
                        <td className="px-4 py-3">{item.genero}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md font-bold">
                            {item.talla}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-indigo-700 font-extrabold text-sm">
                          {item.total} pzs
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-indigo-50/30 font-extrabold border-t-2 border-indigo-100 text-indigo-950">
                      <td colSpan={3} className="px-4 py-3 text-sm">
                        TOTAL DE UNIFORMES CONSOLIDADOS
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-indigo-700">
                        {totalPiezasConsolidadas} pzs
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Desglose Detallado por Supervisor */}
      <Card className="p-5 border border-slate-100 rounded-[28px] bg-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              👤 Desglose Detallado por Supervisor
            </h3>
            <p className="text-[10px] text-slate-400">
              Verifica el detalle individual de prendas, tallas, ciudad de destino y destinatario.
            </p>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar supervisor, ciudad o destinatario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-100 transition-all font-semibold"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400 italic">
            Cargando desglose...
          </div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 italic">
            No se encontraron registros de supervisores que coincidan con la búsqueda.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {registrosFiltrados.map((reg) => (
              <Card
                key={reg.id}
                className="p-4 border border-slate-100 bg-slate-50/50 hover:bg-slate-50 rounded-2xl flex flex-col justify-between gap-3 transition-all"
              >
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 truncate leading-snug">
                    {reg.supervisor_nombre}
                  </h4>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[10px] text-slate-600 font-bold">
                      📍 Destino: <span className="text-slate-800 font-extrabold">{reg.ciudad_envio}</span>
                    </p>
                    <p className="text-[10px] text-slate-600 font-bold">
                      👤 Recibe: <span className="text-slate-800 font-extrabold">{reg.recibe_nombre}</span>
                    </p>
                    <p className="text-[10px] text-slate-600 font-bold">
                      🏠 Dirección: <span className="text-slate-800 font-extrabold line-clamp-2" title={reg.direccion_envio}>{reg.direccion_envio || 'N/A'}</span>
                    </p>
                  </div>
                  <p className="text-[9px] text-slate-450 mt-2">
                    Registrado el {new Date(reg.fecha_creacion).toLocaleString('es-MX')}
                  </p>
                </div>
                <div className="space-y-1 border-t border-slate-100 pt-2 flex-1">
                  {reg.prendas.map((item, idx) => (
                    <p key={idx} className="text-xs font-bold text-slate-700">
                      👕 {item.cantidad}x {item.prenda} - {item.genero} - Talla{' '}
                      <span className="text-indigo-600">{item.talla}</span>
                    </p>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
