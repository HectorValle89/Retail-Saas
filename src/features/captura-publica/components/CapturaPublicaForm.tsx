'use client';

import { useActionState, useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { CapturaPublicaData, CapturaPublicaTipo } from '../services/capturaPublicaService';
import { sortAndFormatDermoconsejeras } from './utils';
import {
  registrarCapturaPublica,
  obtenerStockMaterialesPdv,
  type CapturaPublicaActionState,
} from '../services/capturaPublicaActions';

interface CapturaPublicaFormProps {
  slug: string;
  data: CapturaPublicaData;
  defaultDate: string;
}

const INITIAL_STATE: CapturaPublicaActionState = {
  ok: false,
  message: '',
};

const ACTION_LABELS: Record<CapturaPublicaTipo, string> = {
  VENTA: 'Venta',
  CANJE: 'Canje',
  DESABASTO: 'Desabasto',
  LOVE_ISDIN: 'Love ISDIN',
};

interface BatchItem {
  id: string;
  producto_id?: string;
  material_catalogo_id?: string;
  cantidad?: number;
  cantidad_con_ticket?: number;
  cantidad_sin_ticket?: number;
  cantidad_fuera_jornada?: number;
  cantidad_love_exitoso?: number;
  cantidad_love_fallido?: number;
  monto?: number;
  folio_ticket?: string;
  subtipo_registro?: string;
  foto_evidencia_url?: string;
  foto_evidencia_urls?: string[];
  foto_evidencia_files?: File[];
  observaciones?: string;
}

const SUBTIPOS_CANJE = [
  { value: 'CANJE_CON_TICKET', label: 'Con Ticket' },
  { value: 'CANJE_SIN_TICKET', label: 'Sin Ticket' },
  { value: 'CANJE_FUERA_JORNADA', label: 'Fuera de mi Jornada' },
];

const SUBTIPOS_LOVE = [
  { value: 'LOVE_EXITOSO', label: '✅ Registro Exitoso' },
  { value: 'LOVE_FALLIDO', label: '❌ Intentos Fallidos' },
];

function withPlaceholder(options: Array<{ id: string; nombre: string }>, placeholder: string) {
  return [
    { value: '', label: placeholder },
    ...options.map((option) => ({
      value: option.id,
      label: option.nombre,
    })),
  ];
}

interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; nombre: string; categoria?: string }>;
  placeholder: string;
  required?: boolean;
  accentColor: 'emerald' | 'indigo' | 'amber';
  itemId: string;
  optionStock?: { [id: string]: number };
}

function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  accentColor,
  itemId,
  optionStock,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Resolver el artículo seleccionado actualmente para mostrar su nombre
  const selectedOption = useMemo(() => options.find((opt) => opt.id === value), [options, value]);

  // Filtrar opciones en base a la búsqueda (nombre o categoría)
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.nombre.toLowerCase().includes(q) ||
        (opt.categoria && opt.categoria.toLowerCase().includes(q))
    );
  }, [options, searchQuery]);

  // Agrupar opciones filtradas por categoría
  const groupedOptions = useMemo(() => {
    const groups: Record<string, typeof filteredOptions> = {};
    filteredOptions.forEach((opt) => {
      const cat = opt.categoria || 'OTROS';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(opt);
    });
    return groups;
  }, [filteredOptions]);

  // Paleta de colores según tipo de registro
  const colorMap = {
    emerald: {
      ring: 'focus:ring-emerald-100',
      border: 'focus:border-emerald-500 border-slate-200',
      text: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
      badge: 'bg-emerald-100 text-emerald-800',
    },
    indigo: {
      ring: 'focus:ring-indigo-100',
      border: 'focus:border-indigo-500 border-slate-200',
      text: 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100',
      badge: 'bg-indigo-100 text-indigo-800',
    },
    amber: {
      ring: 'focus:ring-amber-100',
      border: 'focus:border-amber-500 border-slate-200',
      text: 'text-amber-700 bg-amber-50 hover:bg-amber-100',
      badge: 'bg-amber-100 text-amber-800',
    },
  };

  const activeColors = colorMap[accentColor];

  return (
    <div className="relative w-full">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>

      {/* Botón Principal (Gatillo) */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchQuery('');
        }}
        className="w-full text-left rounded-xl border border-slate-200 px-4 py-3 bg-white text-sm hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-opacity-50 transition-all duration-200 font-medium flex justify-between items-center shadow-sm select-none"
      >
        <span className={`text-left pr-2 text-xs md:text-sm leading-normal break-words ${selectedOption ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
          {selectedOption ? selectedOption.nombre : placeholder}
        </span>
        <span className="text-slate-400 text-xs">▼</span>
      </button>

      {/* Input oculto para que el envío nativo de formularios siga funcionando si aplica */}
      <input type="hidden" name={itemId} value={value} required={required} />

      {/* Contenedor Flotante del Desplegable con Búsqueda */}
      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in duration-200">
          {/* Cuadro de Búsqueda */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <input
              type="text"
              placeholder="Escribe para buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition-all duration-200"
              autoFocus
            />
          </div>

          {/* Listado Agrupado */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100/50">
            {Object.keys(groupedOptions).length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-400">
                Ningún producto coincide con la búsqueda
              </div>
            ) : (
              Object.entries(groupedOptions).map(([cat, items]) => (
                <div key={cat} className="py-2">
                  {/* Cabecera de Categoría */}
                  <div className="px-4 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-[0.16em] bg-slate-50/40 select-none">
                    {cat}
                  </div>

                  {/* Productos en esta Categoría */}
                  <div className="mt-1 space-y-0.5">
                    {items.map((opt) => {
                      const isSelected = opt.id === value;
                      const hasStockValidation = Boolean(optionStock);
                      const stock = hasStockValidation ? (optionStock?.[opt.id] ?? 0) : null;
                      const isOutOfStock = hasStockValidation && stock !== null && stock <= 0;

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={false}
                          onClick={() => {
                            onChange(opt.id);
                            setIsOpen(false);
                            setSearchQuery('');
                          }}
                          className={`w-full text-left px-4 py-2 text-xs transition-all duration-150 flex items-center justify-between font-medium ${
                            isSelected
                              ? 'bg-slate-100 text-slate-900 border-l-4 border-slate-700'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950 cursor-pointer'
                          }`}
                        >
                          <span className="text-xs text-slate-800 leading-normal pr-2 py-0.5 break-words text-left">{opt.nombre}</span>
                          <div className="flex items-center gap-2 shrink-0 select-none">
                            {hasStockValidation && stock !== null && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                  isOutOfStock
                                    ? 'bg-rose-100 text-rose-800 animate-pulse'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isOutOfStock ? 'Sin stock' : `Stock: ${stock}`}
                              </span>
                            )}
                            {isSelected && <span className="text-xs">✓</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Capa invisible para cerrar al hacer clic afuera (Backdrop) */}
      {isOpen && (
        <div className="fixed inset-0 z-20 cursor-default" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}

export function CapturaPublicaForm({ slug, data, defaultDate }: CapturaPublicaFormProps) {
  const [tipoRegistro, setTipoRegistro] = useState<CapturaPublicaTipo>(
    data.link?.accionesHabilitadas[0] ?? 'VENTA'
  );
  const [state, formAction, pending] = useActionState(
    registrarCapturaPublica.bind(null, slug),
    INITIAL_STATE
  );

  const [selectedPdvId, setSelectedPdvId] = useState('');
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState('');

  // Stock por PDV state
  const [stockMap, setStockMap] = useState<{ [materialId: string]: number }>({});
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  useEffect(() => {
    if (!selectedPdvId || !data.link?.cuentaClienteId) {
      setStockMap({});
      return;
    }

    let active = true;
    setIsLoadingStock(true);
    obtenerStockMaterialesPdv(selectedPdvId, data.link.cuentaClienteId)
      .then((res) => {
        if (active) {
          setStockMap(res || {});
          setIsLoadingStock(false);
        }
      })
      .catch((err) => {
        console.error('[CapturaPublicaForm] Error cargando stock:', err);
        if (active) {
          setIsLoadingStock(false);
        }
    });

    return () => {
      active = false;
    };
  }, [selectedPdvId, data.link?.cuentaClienteId]);

  // Batch state
  const [items, setItems] = useState<BatchItem[]>(() => {
    const primerTipo = data.link?.accionesHabilitadas[0] ?? 'VENTA';
    const esCanje = primerTipo === 'CANJE';
    const esLove = primerTipo === 'LOVE_ISDIN';
    return [
      {
        id: 'init-row',
        cantidad: esCanje || esLove ? undefined : 1,
        cantidad_con_ticket: esCanje ? 1 : undefined,
        cantidad_sin_ticket: esCanje ? 0 : undefined,
        cantidad_fuera_jornada: esCanje ? 0 : undefined,
        cantidad_love_exitoso: esLove ? 1 : undefined,
        cantidad_love_fallido: esLove ? 0 : undefined,
        subtipo_registro:
          esLove
            ? 'LOVE_EXITOSO'
            : esCanje
              ? 'CANJE_CON_TICKET'
              : undefined,
      },
    ];
  });

  const handleTipoRegistroChange = (value: string) => {
    const nextTipo = value as CapturaPublicaTipo;
    setTipoRegistro(nextTipo);
    const esCanje = nextTipo === 'CANJE';
    const esLove = nextTipo === 'LOVE_ISDIN';
    setItems([
      {
        id: `init-${Date.now()}`,
        cantidad: esCanje || esLove ? undefined : 1,
        cantidad_con_ticket: esCanje ? 1 : undefined,
        cantidad_sin_ticket: esCanje ? 0 : undefined,
        cantidad_fuera_jornada: esCanje ? 0 : undefined,
        cantidad_love_exitoso: esLove ? 1 : undefined,
        cantidad_love_fallido: esLove ? 0 : undefined,
        subtipo_registro:
          esLove
            ? 'LOVE_EXITOSO'
            : esCanje
              ? 'CANJE_CON_TICKET'
              : undefined,
      },
    ]);
  };

  const addRow = () => {
    const esCanje = tipoRegistro === 'CANJE';
    const esLove = tipoRegistro === 'LOVE_ISDIN';
    setItems((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        cantidad: esCanje || esLove ? undefined : 1,
        cantidad_con_ticket: esCanje ? 1 : undefined,
        cantidad_sin_ticket: esCanje ? 0 : undefined,
        cantidad_fuera_jornada: esCanje ? 0 : undefined,
        cantidad_love_exitoso: esLove ? 1 : undefined,
        cantidad_love_fallido: esLove ? 0 : undefined,
        subtipo_registro:
          esLove
            ? 'LOVE_EXITOSO'
            : esCanje
              ? 'CANJE_CON_TICKET'
              : undefined,
      },
    ]);
  };

  const removeRow = (id: string) => {
    const esCanje = tipoRegistro === 'CANJE';
    const esLove = tipoRegistro === 'LOVE_ISDIN';
    if (items.length === 1) {
      setItems([
        {
          id: `row-${Date.now()}`,
          cantidad: esCanje || esLove ? undefined : 1,
          cantidad_con_ticket: esCanje ? 1 : undefined,
          cantidad_sin_ticket: esCanje ? 0 : undefined,
          cantidad_fuera_jornada: esCanje ? 0 : undefined,
          cantidad_love_exitoso: esLove ? 1 : undefined,
          cantidad_love_fallido: esLove ? 0 : undefined,
          subtipo_registro:
            esLove
              ? 'LOVE_EXITOSO'
              : esCanje
                ? 'CANJE_CON_TICKET'
                : undefined,
        },
      ]);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateRowField = (id: string, field: keyof BatchItem, value: any) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const totals = useMemo(() => {
    let cantidadTotal = 0;
    for (const item of items) {
      if (tipoRegistro === 'CANJE') {
        cantidadTotal +=
          (item.cantidad_con_ticket ?? 0) +
          (item.cantidad_sin_ticket ?? 0) +
          (item.cantidad_fuera_jornada ?? 0);
      } else if (tipoRegistro === 'LOVE_ISDIN') {
        cantidadTotal +=
          (item.cantidad_love_exitoso ?? 0) +
          (item.cantidad_love_fallido ?? 0);
      } else {
        cantidadTotal += item.cantidad ?? 0;
      }
    }
    return { cantidadTotal };
  }, [items, tipoRegistro]);

  const isBatchIncomplete = useMemo(() => {
    return items.some((item) => {
      if (tipoRegistro === 'VENTA')
        return !item.producto_id || !item.cantidad || item.cantidad <= 0;
      if (tipoRegistro === 'CANJE') {
        const totalCanjes =
          (item.cantidad_con_ticket ?? 0) +
          (item.cantidad_sin_ticket ?? 0) +
          (item.cantidad_fuera_jornada ?? 0);
        return (
          !item.material_catalogo_id ||
          totalCanjes <= 0
        );
      }
      if (tipoRegistro === 'DESABASTO') return !item.producto_id;
      if (tipoRegistro === 'LOVE_ISDIN') {
        const totalLove = (item.cantidad_love_exitoso ?? 0) + (item.cantidad_love_fallido ?? 0);
        return totalLove <= 0;
      }
      return false;
    });
  }, [items, tipoRegistro]);

  const assignedEmpleadoIds = useMemo(() => {
    if (!selectedPdvId || !data.asignacionesHoy) return new Set<string>();
    return new Set(
      data.asignacionesHoy.filter((a) => a.pdvId === selectedPdvId).map((a) => a.empleadoId)
    );
  }, [selectedPdvId, data.asignacionesHoy]);

  const formattedPdvs = useMemo(() => {
    const assignedPdvIds = new Set(data.asignacionesHoy?.map((a) => a.pdvId) ?? []);
    return data.pdvs.map((pdv) => {
      const isAssigned = assignedPdvIds.has(pdv.id);
      return {
        id: pdv.id,
        nombre: isAssigned ? `📌 ${pdv.nombre} (Con asignación hoy)` : pdv.nombre,
        categoria: isAssigned ? 'ASIGNADOS HOY' : 'OTROS PUNTOS DE VENTA',
      };
    });
  }, [data.pdvs, data.asignacionesHoy]);

  const formattedEmpleados = useMemo(() => {
    return data.empleados.map((emp) => {
      const isAssigned = assignedEmpleadoIds.has(emp.id);
      return {
        id: emp.id,
        nombre: isAssigned ? `📌 ${emp.nombre} (Programada hoy)` : emp.nombre,
        categoria: isAssigned ? 'PROGRAMADAS HOY' : 'OTRAS DERMOCONSEJERAS',
      };
    });
  }, [data.empleados, assignedEmpleadoIds]);

  const handlePdvSelect = (pdvId: string) => {
    setSelectedPdvId(pdvId);

    if (pdvId && data.asignacionesHoy) {
      const todayAssigned = data.asignacionesHoy.filter((a) => a.pdvId === pdvId);
      if (todayAssigned.length === 1) {
        setSelectedEmpleadoId(todayAssigned[0].empleadoId);
        return;
      }
    }
    setSelectedEmpleadoId('');
  };

  // Sincronizador de archivos inmutables en el cliente usando DataTransfer API
  const syncInputFiles = (itemId: string, files: File[]) => {
    const input = document.getElementById(`foto_input__${itemId}`) as HTMLInputElement;
    if (!input) return;

    try {
      const dt = new DataTransfer();
      for (const file of files) {
        dt.items.add(file);
      }
      input.files = dt.files;
    } catch (err) {
      console.error('Error al sincronizar archivos del cliente:', err);
    }
  };

  if (!data.ok || !data.link) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card className="border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-md rounded-[20px]">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <p className="text-sm font-semibold">Link no disponible</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed">
            {data.message ?? 'No fue posible cargar este formulario.'}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 text-center sm:text-left relative">
        <div className="absolute -top-6 -left-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-600 sm:text-left">
          Portal de Campo
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold leading-tight text-slate-900 tracking-tight">
          {data.link.nombre}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 max-w-2xl">
          {data.link.descripcion ??
            `Registra de forma simplificada tus actividades de venta, canje, desabasto y Love ISDIN al final de tu jornada.`}
        </p>
      </header>

      <Card className="rounded-[28px] border border-slate-100 bg-white/90 p-5 shadow-xl sm:p-8 backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/5 rounded-full blur-3xl pointer-events-none" />

        <form action={formAction} className="space-y-6" encType="multipart/form-data">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" />
          <input
            type="hidden"
            name="items_json"
            value={JSON.stringify(
              items.flatMap((item) => {
                const {
                  foto_evidencia_url,
                  foto_evidencia_urls,
                  foto_evidencia_files,
                  cantidad_con_ticket,
                  cantidad_sin_ticket,
                  cantidad_fuera_jornada,
                  cantidad_love_exitoso,
                  cantidad_love_fallido,
                  ...rest
                } = item;
                if (tipoRegistro === 'VENTA') {
                  const { monto, folio_ticket, subtipo_registro, ...final } = rest;
                  return [final];
                }
                if (tipoRegistro === 'DESABASTO') {
                  const { monto, folio_ticket, cantidad, subtipo_registro, ...final } = rest;
                  return [final];
                }
                if (tipoRegistro === 'CANJE') {
                  const subItems = [];
                  if ((cantidad_con_ticket ?? 0) > 0) {
                    subItems.push({
                      ...rest,
                      subtipo_registro: 'CANJE_CON_TICKET',
                      cantidad: cantidad_con_ticket,
                      folio_ticket: item.folio_ticket,
                    });
                  }
                  if ((cantidad_sin_ticket ?? 0) > 0) {
                    subItems.push({
                      ...rest,
                      subtipo_registro: 'CANJE_SIN_TICKET',
                      cantidad: cantidad_sin_ticket,
                      folio_ticket: null,
                    });
                  }
                  if ((cantidad_fuera_jornada ?? 0) > 0) {
                    subItems.push({
                      ...rest,
                      subtipo_registro: 'CANJE_FUERA_JORNADA',
                      cantidad: cantidad_fuera_jornada,
                      folio_ticket: null,
                    });
                  }
                  return subItems;
                }
                if (tipoRegistro === 'LOVE_ISDIN') {
                  const subItems = [];
                  if ((cantidad_love_exitoso ?? 0) > 0) {
                    subItems.push({
                      ...rest,
                      subtipo_registro: 'LOVE_EXITOSO',
                      cantidad: cantidad_love_exitoso,
                      folio_ticket: null,
                    });
                  }
                  if ((cantidad_love_fallido ?? 0) > 0) {
                    subItems.push({
                      ...rest,
                      subtipo_registro: 'LOVE_FALLIDO',
                      cantidad: cantidad_love_fallido,
                      folio_ticket: null,
                    });
                  }
                  return subItems;
                }
                return [rest];
              })
            )}
          />

          {/* Bloque Metadatos del Día */}
          <div className="p-5 bg-slate-50/70 rounded-[24px] border border-slate-100 space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Datos generales del día
            </h3>

            {/* Rediseño Táctil: Tarjetas de Categoría Principal */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400 block">
                Selecciona la Actividad a Registrar
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {data.link.accionesHabilitadas.map((tipo) => {
                  const isSelected = tipoRegistro === tipo;
                  let themeClass = '';
                  let icon = '';
                  let desc = '';

                  switch (tipo) {
                    case 'VENTA':
                      themeClass = isSelected
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 ring-4 ring-emerald-100'
                        : 'border-slate-100 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/10';
                      icon = '🛍️';
                      desc = 'Registro de ventas';
                      break;
                    case 'DESABASTO':
                      themeClass = isSelected
                        ? 'border-amber-500 bg-amber-50/50 text-amber-950 ring-4 ring-amber-100'
                        : 'border-slate-100 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50/10';
                      icon = '🚫';
                      desc = 'Productos negados';
                      break;
                    case 'CANJE':
                      themeClass = isSelected
                        ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950 ring-4 ring-indigo-100'
                        : 'border-slate-100 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/10';
                      icon = '🎁';
                      desc = 'Canje de incentivos';
                      break;
                    case 'LOVE_ISDIN':
                      themeClass = isSelected
                        ? 'border-pink-500 bg-pink-50/50 text-pink-950 ring-4 ring-pink-100'
                        : 'border-slate-100 bg-white text-slate-700 hover:border-pink-200 hover:bg-pink-50/10';
                      icon = '❤️';
                      desc = 'Registro Love ISDIN';
                      break;
                  }

                  return (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => handleTipoRegistroChange(tipo)}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all duration-300 transform active:scale-95 cursor-pointer shadow-sm select-none ${themeClass}`}
                    >
                      <span className="text-3xl mb-2 filter drop-shadow-sm">{icon}</span>
                      <span className="text-sm font-bold tracking-tight">
                        {ACTION_LABELS[tipo]}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1 block leading-tight font-medium">
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>
              <input type="hidden" name="tipo_registro" value={tipoRegistro} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Fecha Operativa"
                name="fecha_operativa"
                type="date"
                defaultValue={defaultDate}
                required
              />
              <SearchableSelect
                label="Punto de venta"
                value={selectedPdvId}
                onChange={handlePdvSelect}
                options={formattedPdvs}
                placeholder="Buscar o elegir punto de venta..."
                required
                accentColor={
                  tipoRegistro === 'VENTA'
                    ? 'emerald'
                    : tipoRegistro === 'DESABASTO'
                      ? 'amber'
                      : tipoRegistro === 'CANJE'
                        ? 'indigo'
                        : 'emerald'
                }
                itemId="pdv_id"
              />
            </div>
            <div className="grid grid-cols-1">
              <SearchableSelect
                label="Dermoconsejera"
                value={selectedEmpleadoId}
                onChange={setSelectedEmpleadoId}
                options={formattedEmpleados}
                placeholder="Buscar o elegir dermoconsejera..."
                required
                accentColor={
                  tipoRegistro === 'VENTA'
                    ? 'emerald'
                    : tipoRegistro === 'DESABASTO'
                      ? 'amber'
                      : tipoRegistro === 'CANJE'
                        ? 'indigo'
                        : 'emerald'
                }
                itemId="empleado_id"
              />
            </div>
          </div>

          {/* Bloque de Capturas por Lote */}
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                Artículos a registrar
              </h3>
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80 rounded-full transition-all duration-200"
              >
                <span>➕</span> Agregar otro artículo
              </button>
            </div>

            {/* Listado de filas con diseño Premium Card por elemento */}
            <div className="space-y-5">
              {items.map((item, idx) => {
                const itemBorderColor =
                  tipoRegistro === 'VENTA'
                    ? 'hover:border-emerald-200 focus-within:border-emerald-300'
                    : tipoRegistro === 'DESABASTO'
                      ? 'hover:border-amber-200 focus-within:border-amber-300'
                      : tipoRegistro === 'CANJE'
                        ? 'hover:border-indigo-200 focus-within:border-indigo-300'
                        : 'hover:border-pink-200 focus-within:border-pink-300';

                return (
                  <div
                    key={item.id}
                    className={`p-5 bg-slate-50/40 rounded-3xl border border-slate-100 relative transition-all duration-300 flex flex-col gap-4 shadow-sm hover:shadow-md ${itemBorderColor}`}
                  >
                    {/* Encabezado de la tarjeta del artículo */}
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100/50">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Artículo #{idx + 1}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(item.id)}
                          className="text-xs font-bold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 px-3 py-1.5 rounded-full transition-all duration-200 flex items-center gap-1"
                        >
                          <span>🗑️</span> Quitar
                        </button>
                      )}
                    </div>

                    {/* Selector de Producto o Material con Búsqueda y Categorías */}
                    {tipoRegistro !== 'LOVE_ISDIN' && (
                      <div>
                        {tipoRegistro === 'CANJE' ? (
                          <SearchableSelect
                            label="Selecciona el Material de Canje"
                            value={item.material_catalogo_id || ''}
                            onChange={(val) => updateRowField(item.id, 'material_catalogo_id', val)}
                            options={data.materiales}
                            placeholder="Buscar o elegir material de canje..."
                            required
                            accentColor="indigo"
                            itemId={`material-${item.id}`}
                            optionStock={stockMap}
                          />
                        ) : (
                          <SearchableSelect
                            label="Selecciona el Producto"
                            value={item.producto_id || ''}
                            onChange={(val) => updateRowField(item.id, 'producto_id', val)}
                            options={data.productos}
                            placeholder="Buscar o elegir producto..."
                            required
                            accentColor={tipoRegistro === 'DESABASTO' ? 'amber' : 'emerald'}
                            itemId={`producto-${item.id}`}
                          />
                        )}
                      </div>
                    )}

                    {/* Cantidades Paralelas para Canje */}
                    {tipoRegistro === 'CANJE' && (
                      <div className="space-y-4 bg-slate-100/30 border border-slate-100 rounded-2xl p-4">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block border-b border-slate-200/50 pb-1.5">
                          🎁 Cantidades a Registrar por Tipo
                        </label>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          {/* Con Ticket */}
                          <div className="flex items-center justify-between sm:flex-col sm:items-center sm:justify-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                            <div className="text-left sm:text-center">
                              <p className="text-xs font-bold text-slate-800">Con Ticket</p>
                              <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Operación ordinaria</p>
                            </div>
                            <div className="flex items-center gap-2.5 mt-0 sm:mt-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_con_ticket',
                                    Math.max(0, (item.cantidad_con_ticket ?? 0) - 1)
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-600 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                −
                              </button>
                              <span className="w-7 text-center font-black text-slate-800 text-base select-none">
                                {item.cantidad_con_ticket ?? 0}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_con_ticket',
                                    (item.cantidad_con_ticket ?? 0) + 1
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-600 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Sin Ticket */}
                          <div className="flex items-center justify-between sm:flex-col sm:items-center sm:justify-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                            <div className="text-left sm:text-center">
                              <p className="text-xs font-bold text-slate-800">Sin Ticket</p>
                              <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Solo para entrega</p>
                            </div>
                            <div className="flex items-center gap-2.5 mt-0 sm:mt-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_sin_ticket',
                                    Math.max(0, (item.cantidad_sin_ticket ?? 0) - 1)
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-600 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                −
                              </button>
                              <span className="w-7 text-center font-black text-slate-800 text-base select-none">
                                {item.cantidad_sin_ticket ?? 0}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_sin_ticket',
                                    (item.cantidad_sin_ticket ?? 0) + 1
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-600 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Fuera de Jornada */}
                          <div className="flex items-center justify-between sm:flex-col sm:items-center sm:justify-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                            <div className="text-left sm:text-center">
                              <p className="text-xs font-bold text-slate-800">Fuera de Jornada</p>
                              <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Operación extraordinaria</p>
                            </div>
                            <div className="flex items-center gap-2.5 mt-0 sm:mt-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_fuera_jornada',
                                    Math.max(0, (item.cantidad_fuera_jornada ?? 0) - 1)
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-600 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                −
                              </button>
                              <span className="w-7 text-center font-black text-slate-800 text-base select-none">
                                {item.cantidad_fuera_jornada ?? 0}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_fuera_jornada',
                                    (item.cantidad_fuera_jornada ?? 0) + 1
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-600 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Indicador de suma total por tarjeta */}
                        <div className="flex justify-between items-center bg-indigo-50 border border-indigo-100/50 rounded-xl px-4 py-2 text-indigo-950 mt-2 select-none">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Suma total de este artículo</span>
                          <span className="text-sm font-black bg-indigo-600 text-white rounded-full px-3 py-0.5 shadow-sm">
                            {(item.cantidad_con_ticket ?? 0) +
                              (item.cantidad_sin_ticket ?? 0) +
                              (item.cantidad_fuera_jornada ?? 0)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Cantidades Paralelas para Love ISDIN */}
                    {tipoRegistro === 'LOVE_ISDIN' && (
                      <div className="space-y-4 bg-slate-100/30 border border-slate-100 rounded-2xl p-4">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block border-b border-slate-200/50 pb-1.5">
                          ❤️ Registros Love ISDIN por Tipo
                        </label>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {/* Registro Exitoso */}
                          <div className="flex items-center justify-between sm:flex-col sm:items-center sm:justify-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                            <div className="text-left sm:text-center">
                              <p className="text-xs font-bold text-slate-800">✅ Registro Exitoso</p>
                              <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Captura efectiva en Love ISDIN</p>
                            </div>
                            <div className="flex items-center gap-2.5 mt-0 sm:mt-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_love_exitoso',
                                    Math.max(0, (item.cantidad_love_exitoso ?? 0) - 1)
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-600 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                −
                              </button>
                              <span className="w-7 text-center font-black text-slate-800 text-base select-none">
                                {item.cantidad_love_exitoso ?? 0}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_love_exitoso',
                                    (item.cantidad_love_exitoso ?? 0) + 1
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-600 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Intentos Fallidos */}
                          <div className="flex items-center justify-between sm:flex-col sm:items-center sm:justify-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                            <div className="text-left sm:text-center">
                              <p className="text-xs font-bold text-slate-800">❌ Intentos Fallidos</p>
                              <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Invitaciones rechazadas o con error</p>
                            </div>
                            <div className="flex items-center gap-2.5 mt-0 sm:mt-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_love_fallido',
                                    Math.max(0, (item.cantidad_love_fallido ?? 0) - 1)
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-90 flex items-center justify-center font-bold text-slate-700 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                −
                              </button>
                              <span className="w-7 text-center font-black text-slate-800 text-base select-none">
                                {item.cantidad_love_fallido ?? 0}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  updateRowField(
                                    item.id,
                                    'cantidad_love_fallido',
                                    (item.cantidad_love_fallido ?? 0) + 1
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 active:scale-[0.85] flex items-center justify-center font-bold text-slate-700 text-lg transition-all duration-200 shadow-sm border border-slate-100 select-none"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}



                    {/* Stepper de Cantidad Circular
                        - No aplica en DESABASTO, CANJE ni en LOVE_ISDIN
                        - Para CANJE y LOVE_ISDIN se manejan sus propios steppers paralelos */}
                    {tipoRegistro !== 'DESABASTO' &&
                      tipoRegistro !== 'CANJE' &&
                      tipoRegistro !== 'LOVE_ISDIN' && (
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                            Cantidad
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                updateRowField(
                                  item.id,
                                  'cantidad',
                                  Math.max(1, (item.cantidad ?? 1) - 1)
                                );
                              }}
                              className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 flex items-center justify-center font-bold text-slate-700 text-xl transition-all duration-200 shadow-sm select-none"
                            >
                              −
                            </button>
                            <div className="w-12 text-center font-black text-slate-800 text-lg select-none">
                              {item.cantidad ?? 1}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                updateRowField(item.id, 'cantidad', (item.cantidad ?? 1) + 1);
                              }}
                              className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 flex items-center justify-center font-bold text-slate-700 text-xl transition-all duration-200 shadow-sm select-none"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Evidencias: LOVE_ISDIN siempre, CANJE opcional e independiente */}
                    {(tipoRegistro === 'LOVE_ISDIN' || tipoRegistro === 'CANJE') && (
                      <div className="bg-slate-100/50 border border-dashed border-slate-200 rounded-2xl p-4 transition-all duration-300">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          {tipoRegistro === 'LOVE_ISDIN'
                            ? '📸 Evidencias de Love ISDIN (Opcional - desde galería)'
                            : '📸 Evidencias del Canje (Opcional - desde galería)'}
                        </label>

                        {item.foto_evidencia_urls && item.foto_evidencia_urls.length > 0 ? (
                          <div className="space-y-4">
                            {/* Rejilla de miniaturas */}
                            <div className="flex flex-wrap gap-3">
                              {item.foto_evidencia_urls.map((url, imgIdx) => (
                                <div
                                  key={imgIdx}
                                  className="relative w-28 h-28 rounded-2xl overflow-hidden border border-slate-200 shadow-md"
                                >
                                  <img
                                    src={url}
                                    alt={`Evidencia ${imgIdx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextFiles =
                                        item.foto_evidencia_files?.filter((_, i) => i !== imgIdx) ??
                                        [];
                                      const nextUrls = nextFiles.map((file) =>
                                        URL.createObjectURL(file)
                                      );

                                      updateRowField(
                                        item.id,
                                        'foto_evidencia_files',
                                        nextFiles.length > 0 ? nextFiles : undefined
                                      );
                                      updateRowField(
                                        item.id,
                                        'foto_evidencia_urls',
                                        nextUrls.length > 0 ? nextUrls : undefined
                                      );

                                      syncInputFiles(item.id, nextFiles);
                                    }}
                                    className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1.5 shadow transition-all duration-200 transform hover:scale-105"
                                    title="Quitar esta foto"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}

                              {/* Botón para añadir más fotos */}
                              <label className="flex flex-col items-center justify-center w-28 h-28 bg-white border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] rounded-2xl cursor-pointer shadow-sm transition-all duration-200 select-none text-center">
                                <span className="text-2xl mb-1">➕</span>
                                <span className="text-[10px] font-bold text-slate-500 leading-tight">
                                  Añadir más
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => {
                                    const selectedFiles = e.target.files
                                      ? Array.from(e.target.files)
                                      : [];
                                    if (selectedFiles.length > 0) {
                                      const nextFiles = [
                                        ...(item.foto_evidencia_files ?? []),
                                        ...selectedFiles,
                                      ];
                                      const nextUrls = nextFiles.map((file) =>
                                        URL.createObjectURL(file)
                                      );

                                      updateRowField(item.id, 'foto_evidencia_files', nextFiles);
                                      updateRowField(item.id, 'foto_evidencia_urls', nextUrls);

                                      syncInputFiles(item.id, nextFiles);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </label>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                updateRowField(item.id, 'foto_evidencia_files', undefined);
                                updateRowField(item.id, 'foto_evidencia_urls', undefined);
                                const input = document.getElementById(
                                  `foto_input__${item.id}`
                                ) as HTMLInputElement;
                                if (input) input.value = '';
                              }}
                              className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 px-3.5 py-1.5 rounded-full transition-all duration-200"
                            >
                              🗑️ Quitar todas las fotos
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <label className="flex flex-col items-center justify-center px-5 py-3 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] rounded-xl cursor-pointer shadow-sm transition-all duration-200 text-center select-none">
                              <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                📸 Seleccionar Evidencias
                              </span>
                              <input
                                id={`foto_input__${item.id}`}
                                type="file"
                                accept="image/*"
                                multiple
                                name={`foto_evidencia__${item.id}`}
                                onChange={(e) => {
                                  const selectedFiles = e.target.files
                                    ? Array.from(e.target.files)
                                    : [];
                                  if (selectedFiles.length > 0) {
                                    const nextFiles = [
                                      ...(item.foto_evidencia_files ?? []),
                                      ...selectedFiles,
                                    ];
                                    const nextUrls = nextFiles.map((file) =>
                                      URL.createObjectURL(file)
                                    );

                                    updateRowField(item.id, 'foto_evidencia_files', nextFiles);
                                    updateRowField(item.id, 'foto_evidencia_urls', nextUrls);

                                    syncInputFiles(item.id, nextFiles);
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                            <span className="text-[10px] text-slate-400 leading-normal font-medium text-center sm:text-left">
                              Puedes tomar una foto al momento o elegir múltiples archivos
                              directamente desde tu galería.
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Campo de Observaciones Renglón */}
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                        Observaciones (Opcional)
                      </label>
                      <textarea
                        placeholder="Escribe comentarios o notas sobre este artículo..."
                        value={item.observaciones || ''}
                        onChange={(e) => updateRowField(item.id, 'observaciones', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-sm focus:outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all duration-200 font-medium min-h-[60px]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen del Lote */}
            <div className="rounded-[24px] bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 shadow-lg flex justify-between items-center mt-6 transition-all duration-300">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-bold">
                  Resumen de captura
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Artículos agregados en total:{' '}
                  <span className="text-white font-bold text-sm">{items.length}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">
                  Cantidad Total
                </p>
                <p className="text-white font-black text-xl mt-0.5">{totals.cantidadTotal}</p>
              </div>
            </div>
          </div>

          {/* Banner de mensajes de error/éxito */}
          {state.message ? (
            <div
              className={`rounded-[16px] px-4 py-3.5 text-sm font-semibold transition-all duration-200 border ${
                state.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm'
                  : 'border-rose-200 bg-rose-50 text-rose-800 shadow-sm'
              }`}
            >
              {state.message}
            </div>
          ) : null}

          {/* Botón de Enviar */}
          <Button
            type="submit"
            size="lg"
            className={`w-full rounded-[16px] py-4 text-sm font-bold uppercase tracking-[0.16em] transition-all duration-300 shadow-md ${
              isBatchIncomplete
                ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none'
                : tipoRegistro === 'LOVE_ISDIN'
                  ? 'bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white transform hover:scale-[1.01]'
                  : tipoRegistro === 'CANJE'
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white transform hover:scale-[1.01]'
                    : tipoRegistro === 'DESABASTO'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white transform hover:scale-[1.01]'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white transform hover:scale-[1.01]'
            }`}
            isLoading={pending}
            disabled={isBatchIncomplete}
          >
            {isBatchIncomplete
              ? 'Completa la lista para enviar'
              : `Enviar reporte de ${ACTION_LABELS[tipoRegistro].toLowerCase()}`}
          </Button>
        </form>
      </Card>
    </div>
  );
}
