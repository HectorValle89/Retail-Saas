'use client';

import { useActionState, useMemo, useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { CapturaPublicaData, CapturaPublicaTipo } from '../services/capturaPublicaService';
import {
  compressImageForUpload,
  isHeifLikeFile,
  convertHeifToJpeg,
} from '@/lib/storage/clientImageCompression';
import {
  obtenerDermoconsejerasDisponiblesCaptura,
  obtenerAsignacionesPublicadasCaptura,
  registrarCapturaPublica,
  obtenerStockMaterialesPdv,
  type CapturaPublicaActionState,
} from '../services/capturaPublicaActions';
import { validatePreparedEvidenceFile } from '../services/capturaPublicaEvidence';

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
  foto_exitoso_urls?: string[];
  foto_exitoso_files?: File[];
  foto_fallido_urls?: string[];
  foto_fallido_files?: File[];
  foto_con_ticket_urls?: string[];
  foto_con_ticket_files?: File[];
  observaciones?: string;
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
  disabled?: boolean;
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
  disabled = false,
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
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
          setSearchQuery('');
        }}
        className="w-full min-h-11 text-left rounded-xl border border-slate-200 px-4 py-3 bg-white text-sm hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-opacity-50 transition-all duration-200 font-medium flex justify-between items-center shadow-sm select-none disabled:cursor-wait disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span
          className={`text-left pr-2 text-xs md:text-sm leading-normal break-words ${selectedOption ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}
        >
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
                          <span className="text-xs text-slate-800 leading-normal pr-2 py-0.5 break-words text-left">
                            {opt.nombre}
                          </span>
                          <div className="flex items-center gap-2 shrink-0 select-none">
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
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [assignmentDate, setAssignmentDate] = useState(defaultDate);
  const [pdvsForDate, setPdvsForDate] = useState(data.pdvs);
  const [assignmentsForDate, setAssignmentsForDate] = useState(data.asignaciones ?? []);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const assignmentRequestRef = useRef(0);
  const [isManualAttribution, setIsManualAttribution] = useState(false);
  const [manualEmployeeOptions, setManualEmployeeOptions] = useState<
    Array<{ id: string; nombre: string }>
  >([]);
  const [isLoadingManualEmployees, setIsLoadingManualEmployees] = useState(false);
  const [manualEmployeeError, setManualEmployeeError] = useState<string | null>(null);
  const [noVentas, setNoVentas] = useState(false);
  const [noLoveIsdin, setNoLoveIsdin] = useState(false);
  const [esVacaciones, setEsVacaciones] = useState(false);
  const [esIncapacidad, setEsIncapacidad] = useState(false);
  const [esFalta, setEsFalta] = useState(false);
  const [showConfirmDateModal, setShowConfirmDateModal] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bypassConfirmRef = useRef(false);
  const pendingImageProcessingRef = useRef(0);
  const [pendingImageProcessingCount, setPendingImageProcessingCount] = useState(0);
  const [imageProcessingError, setImageProcessingError] = useState<string | null>(null);

  const syncAllFilesBeforeSubmit = () => {
    for (const item of items) {
      if (tipoRegistro === 'CANJE') {
        if (item.foto_con_ticket_files && item.foto_con_ticket_files.length > 0) {
          syncInputFiles(`foto_input__${item.id}-con_ticket`, item.foto_con_ticket_files);
        }
      } else if (tipoRegistro === 'LOVE_ISDIN') {
        if (item.foto_exitoso_files && item.foto_exitoso_files.length > 0) {
          syncInputFiles(`foto_input__${item.id}-exitoso`, item.foto_exitoso_files);
        }
        if (item.foto_fallido_files && item.foto_fallido_files.length > 0) {
          syncInputFiles(`foto_input__${item.id}-fallido`, item.foto_fallido_files);
        }
      }
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (pendingImageProcessingRef.current > 0) {
      event.preventDefault();
      setImageProcessingError(
        'Espera a que terminemos de preparar las evidencias antes de enviar el reporte.'
      );
      return;
    }

    syncAllFilesBeforeSubmit();

    if (bypassConfirmRef.current) {
      bypassConfirmRef.current = false;
      return;
    }

    const formData = new FormData(event.currentTarget);
    const selectedDate = formData.get('fecha_operativa') as string;

    // Get today's date in Mexico City local time (YYYY-MM-DD)
    const todayMexico = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    if (selectedDate && selectedDate !== todayMexico) {
      event.preventDefault();
      setShowConfirmDateModal(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleConfirmSubmit = () => {
    if (pendingImageProcessingRef.current > 0) {
      setShowConfirmDateModal(false);
      setImageProcessingError(
        'Espera a que terminemos de preparar las evidencias antes de enviar el reporte.'
      );
      return;
    }

    bypassConfirmRef.current = true;
    setShowConfirmDateModal(false);

    syncAllFilesBeforeSubmit();

    setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  };

  const findFirstIncompleteItemId = (): string | null => {
    if (esVacaciones || esIncapacidad || esFalta) return null;
    if (tipoRegistro === 'VENTA' && noVentas) return null;
    if (tipoRegistro === 'LOVE_ISDIN' && noLoveIsdin) return null;

    for (const item of items) {
      if (tipoRegistro === 'VENTA') {
        if (!item.producto_id || !item.cantidad || item.cantidad <= 0) {
          return item.id;
        }
      }
      if (tipoRegistro === 'CANJE') {
        const totalCanjes =
          (item.cantidad_con_ticket ?? 0) +
          (item.cantidad_sin_ticket ?? 0) +
          (item.cantidad_fuera_jornada ?? 0);
        if (!item.material_catalogo_id || totalCanjes <= 0) {
          return item.id;
        }
      }
      if (tipoRegistro === 'DESABASTO') {
        if (!item.producto_id) {
          return item.id;
        }
      }
      if (tipoRegistro === 'LOVE_ISDIN') {
        const totalLove = (item.cantidad_love_exitoso ?? 0) + (item.cantidad_love_fallido ?? 0);
        if (totalLove <= 0) {
          return item.id;
        }
      }
    }
    return null;
  };

  const handleIncompleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const incompleteId = findFirstIncompleteItemId();
    if (incompleteId) {
      const element = document.getElementById(incompleteId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-2', 'ring-amber-500', 'border-amber-300');
        setTimeout(() => {
          element.classList.remove('ring-2', 'ring-amber-500', 'border-amber-300');
        }, 1500);
      }
    }
  };

  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (state.ok) {
      setShowSuccess(true);
    }
  }, [state.ok, state.registroId]);

  const handleResetForm = () => {
    const esCanje = tipoRegistro === 'CANJE';
    const esLove = tipoRegistro === 'LOVE_ISDIN';

    setItems([
      {
        id: `init-${Date.now()}`,
        cantidad: esCanje || esLove ? undefined : 1,
        cantidad_con_ticket: esCanje ? 1 : undefined,
        cantidad_sin_ticket: esCanje ? 0 : undefined,
        cantidad_fuera_jornada: esCanje ? 0 : undefined,
        cantidad_love_exitoso: esLove ? 1 : undefined,
        cantidad_love_fallido: esLove ? 0 : undefined,
        subtipo_registro: esLove ? 'LOVE_EXITOSO' : esCanje ? 'CANJE_CON_TICKET' : undefined,
      },
    ]);

    setNoVentas(false);
    setEsVacaciones(false);
    setEsIncapacidad(false);
    setEsFalta(false);
    setNoLoveIsdin(false);

    const fileInputs = document.querySelectorAll(
      'input[type="file"]'
    ) as NodeListOf<HTMLInputElement>;
    fileInputs.forEach((input) => {
      input.value = '';
    });

    setShowSuccess(false);
  };

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
        subtipo_registro: esLove ? 'LOVE_EXITOSO' : esCanje ? 'CANJE_CON_TICKET' : undefined,
      },
    ];
  });

  const handleTipoRegistroChange = (value: string) => {
    const nextTipo = value as CapturaPublicaTipo;
    setTipoRegistro(nextTipo);
    setNoVentas(false);
    setEsVacaciones(false);
    setEsIncapacidad(false);
    setEsFalta(false);
    setNoLoveIsdin(false);
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
        subtipo_registro: esLove ? 'LOVE_EXITOSO' : esCanje ? 'CANJE_CON_TICKET' : undefined,
      },
    ]);
  };

  const addRow = () => {
    const esCanje = tipoRegistro === 'CANJE';
    const esLove = tipoRegistro === 'LOVE_ISDIN';
    const newId = `row-${Date.now()}`;
    setItems((prev) => [
      ...prev,
      {
        id: newId,
        cantidad: esCanje || esLove ? undefined : 1,
        cantidad_con_ticket: esCanje ? 1 : undefined,
        cantidad_sin_ticket: esCanje ? 0 : undefined,
        cantidad_fuera_jornada: esCanje ? 0 : undefined,
        cantidad_love_exitoso: esLove ? 1 : undefined,
        cantidad_love_fallido: esLove ? 0 : undefined,
        subtipo_registro: esLove ? 'LOVE_EXITOSO' : esCanje ? 'CANJE_CON_TICKET' : undefined,
      },
    ]);
    setTimeout(() => {
      const element = document.getElementById(newId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
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
          subtipo_registro: esLove ? 'LOVE_EXITOSO' : esCanje ? 'CANJE_CON_TICKET' : undefined,
        },
      ]);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateRowField = <K extends keyof BatchItem>(id: string, field: K, value: BatchItem[K]) => {
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
        cantidadTotal += (item.cantidad_love_exitoso ?? 0) + (item.cantidad_love_fallido ?? 0);
      } else {
        cantidadTotal += item.cantidad ?? 0;
      }
    }
    return { cantidadTotal };
  }, [items, tipoRegistro]);

  const isBatchIncomplete = useMemo(() => {
    if (esVacaciones || esIncapacidad || esFalta) return false;
    if (tipoRegistro === 'VENTA' && noVentas) return false;
    if (tipoRegistro === 'LOVE_ISDIN' && noLoveIsdin) return false;

    return items.some((item) => {
      if (tipoRegistro === 'VENTA')
        return !item.producto_id || !item.cantidad || item.cantidad <= 0;
      if (tipoRegistro === 'CANJE') {
        const totalCanjes =
          (item.cantidad_con_ticket ?? 0) +
          (item.cantidad_sin_ticket ?? 0) +
          (item.cantidad_fuera_jornada ?? 0);
        return !item.material_catalogo_id || totalCanjes <= 0;
      }
      if (tipoRegistro === 'DESABASTO') return !item.producto_id;
      if (tipoRegistro === 'LOVE_ISDIN') {
        const totalLove = (item.cantidad_love_exitoso ?? 0) + (item.cantidad_love_fallido ?? 0);
        return totalLove <= 0;
      }
      return false;
    });
  }, [items, tipoRegistro, noVentas, noLoveIsdin, esVacaciones, esIncapacidad, esFalta]);

  const formattedPdvs = useMemo(() => {
    const assignmentByPdv = new Map(
      assignmentsForDate.map((assignment) => [assignment.pdvId, assignment])
    );
    return pdvsForDate.map((pdv) => {
      const assignment = assignmentByPdv.get(pdv.id);
      const isAssigned = assignment?.estado === 'ASIGNADA';
      const isSelectable = assignment?.estado === 'SELECCIONABLE';
      const hasConflict = assignment?.estado === 'CONFLICTO';
      return {
        id: pdv.id,
        nombre: isAssigned
          ? `📌 ${pdv.nombre} (DC asignada en la fecha)`
          : isSelectable
            ? `📌 ${pdv.nombre} (${assignment.candidatos.length} DC disponibles)`
            : hasConflict
              ? `⚠️ ${pdv.nombre} (Asignación por revisar)`
              : pdv.nombre,
        categoria: isAssigned
          ? 'ASIGNADOS EN LA FECHA'
          : isSelectable
            ? 'VARIAS DC EN LA FECHA'
            : hasConflict
              ? 'REVISAR ASIGNACIÓN'
              : 'OTROS PUNTOS DE VENTA',
      };
    });
  }, [pdvsForDate, assignmentsForDate]);

  const selectedAssignment = useMemo(
    () => assignmentsForDate.find((assignment) => assignment.pdvId === selectedPdvId) ?? null,
    [assignmentsForDate, selectedPdvId]
  );
  const selectedEmployeeName = useMemo(() => {
    if (isManualAttribution) {
      return (
        manualEmployeeOptions.find((candidate) => candidate.id === selectedEmpleadoId)?.nombre ??
        null
      );
    }
    if (!selectedAssignment) return null;
    if (selectedAssignment.estado === 'ASIGNADA') return selectedAssignment.empleadoNombre;
    if (selectedAssignment.estado === 'SELECCIONABLE') {
      return (
        selectedAssignment.candidatos.find(
          (candidate) => candidate.empleadoId === selectedEmpleadoId
        )?.empleadoNombre ?? null
      );
    }
    return null;
  }, [isManualAttribution, manualEmployeeOptions, selectedAssignment, selectedEmpleadoId]);
  const selectableEmployeeOptions = useMemo(
    () =>
      selectedAssignment?.estado === 'SELECCIONABLE'
        ? selectedAssignment.candidatos.map((candidate) => ({
            id: candidate.empleadoId,
            nombre: candidate.empleadoNombre,
          }))
        : [],
    [selectedAssignment]
  );

  const handlePdvSelect = (pdvId: string) => {
    setSelectedPdvId(pdvId);
    setIsManualAttribution(false);
    setManualEmployeeError(null);
    const assignment = assignmentsForDate.find((item) => item.pdvId === pdvId);
    setSelectedEmpleadoId(
      assignment?.estado === 'ASIGNADA' && assignment.empleadoId ? assignment.empleadoId : ''
    );
  };

  const handleDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    setSelectedPdvId('');
    setSelectedEmpleadoId('');
    setAssignmentError(null);
    setIsManualAttribution(false);
    setManualEmployeeError(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      assignmentRequestRef.current += 1;
      setIsLoadingAssignments(false);
      setAssignmentsForDate([]);
      setPdvsForDate([]);
      return;
    }

    const requestId = ++assignmentRequestRef.current;
    if (nextDate === assignmentDate) {
      setIsLoadingAssignments(false);
      return;
    }

    setIsLoadingAssignments(true);
    setPdvsForDate([]);
    void obtenerAsignacionesPublicadasCaptura(slug, nextDate)
      .then((result) => {
        if (assignmentRequestRef.current !== requestId) return;

        setIsLoadingAssignments(false);
        if (!result.ok) {
          setAssignmentsForDate([]);
          setPdvsForDate([]);
          setAssignmentError(
            result.message ?? 'No fue posible consultar la asignación pública de la fecha.'
          );
          return;
        }

        setPdvsForDate(result.pdvs);
        setAssignmentsForDate(result.asignaciones);
        setAssignmentDate(nextDate);
      })
      .catch(() => {
        if (assignmentRequestRef.current !== requestId) return;
        setIsLoadingAssignments(false);
        setAssignmentsForDate([]);
        setPdvsForDate([]);
        setAssignmentError('No fue posible consultar la asignación pública de la fecha.');
      });
  };

  const enableManualAttribution = () => {
    if (!selectedPdvId) return;

    setIsManualAttribution(true);
    setSelectedEmpleadoId('');
    setManualEmployeeError(null);

    if (manualEmployeeOptions.length > 0 || isLoadingManualEmployees) return;

    setIsLoadingManualEmployees(true);
    void obtenerDermoconsejerasDisponiblesCaptura(slug)
      .then((result) => {
        setIsLoadingManualEmployees(false);
        if (!result.ok) {
          setManualEmployeeError(
            result.message ?? 'No fue posible consultar las dermoconsejeras disponibles.'
          );
          return;
        }
        setManualEmployeeOptions(result.empleados);
      })
      .catch(() => {
        setIsLoadingManualEmployees(false);
        setManualEmployeeError('No fue posible consultar las dermoconsejeras disponibles.');
      });
  };

  const cancelManualAttribution = () => {
    setIsManualAttribution(false);
    setManualEmployeeError(null);
    setSelectedEmpleadoId(
      selectedAssignment?.estado === 'ASIGNADA' && selectedAssignment.empleadoId
        ? selectedAssignment.empleadoId
        : ''
    );
  };

  const handleImageSelection = async (
    files: FileList | null,
    itemId: string,
    filesFieldName:
      | 'foto_evidencia_files'
      | 'foto_exitoso_files'
      | 'foto_fallido_files'
      | 'foto_con_ticket_files',
    urlsFieldName:
      | 'foto_evidencia_urls'
      | 'foto_exitoso_urls'
      | 'foto_fallido_urls'
      | 'foto_con_ticket_urls',
    inputElementId: string
  ) => {
    const selectedFiles = files ? Array.from(files) : [];
    if (selectedFiles.length === 0) return;

    const currentFiles = (items.find((it) => it.id === itemId)?.[filesFieldName] as File[]) ?? [];
    const input = document.getElementById(inputElementId) as HTMLInputElement | null;

    // El selector nativo contiene de inmediato la foto original. Se limpia antes del primer await
    // para impedir que un envio rapido mande el archivo pesado mientras sigue la compresion.
    if (input) input.value = '';

    pendingImageProcessingRef.current += 1;
    setPendingImageProcessingCount(pendingImageProcessingRef.current);
    setImageProcessingError(null);

    try {
      const processedFiles: File[] = [];
      for (const file of selectedFiles) {
        let processed = file;
        if (isHeifLikeFile(file)) {
          processed = await convertHeifToJpeg(file);
        }
        if (processed.type.startsWith('image/')) {
          processed = await compressImageForUpload(processed);
        }

        const evidenceError = validatePreparedEvidenceFile(processed);
        if (evidenceError) {
          throw new Error(evidenceError);
        }
        processedFiles.push(processed);
      }

      const nextFiles = [...currentFiles, ...processedFiles];
      const nextUrls = nextFiles.map((file) => URL.createObjectURL(file));

      updateRowField(itemId, filesFieldName, nextFiles);
      updateRowField(itemId, urlsFieldName, nextUrls);
      syncInputFiles(inputElementId, nextFiles);
    } catch (error) {
      syncInputFiles(inputElementId, currentFiles);
      setImageProcessingError(
        error instanceof Error
          ? error.message
          : 'No fue posible preparar la evidencia. Vuelve a seleccionarla.'
      );
    } finally {
      pendingImageProcessingRef.current = Math.max(0, pendingImageProcessingRef.current - 1);
      setPendingImageProcessingCount(pendingImageProcessingRef.current);
    }
  };

  // Sincronizador de archivos inmutables en el cliente usando DataTransfer API
  const syncInputFiles = (inputElementId: string, files: File[]) => {
    const input = document.getElementById(inputElementId) as HTMLInputElement;
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
      <header className="mb-8 relative">
        <div className="absolute -top-6 -left-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 mb-3 text-center sm:text-left">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-md">
            <Image
              src="/beteele-app-icon.png"
              alt="Beteele Logo"
              width={56}
              height={56}
              className="h-full w-full object-contain rounded-xl"
              priority
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-600">
              Portal de Campo
            </p>
            <h1 className="mt-1 text-3xl sm:text-4xl font-extrabold leading-tight text-slate-900 tracking-tight">
              {data.link?.nombre || 'BETEELE - ONE'}
            </h1>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 max-w-2xl text-center sm:text-left">
          {data.link?.descripcion ??
            `Reporte diario de ventas, canjes, desabasto y problemáticas en el punto de venta.`}
        </p>
      </header>

      <Card className="rounded-[28px] border border-slate-100 bg-white/90 p-5 shadow-xl sm:p-8 backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/5 rounded-full blur-3xl pointer-events-none" />

        {showSuccess ? (
          <div className="flex flex-col items-center text-center py-8 px-4 animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/40 rounded-full flex items-center justify-center mb-6 shadow-inner ring-8 ring-emerald-50">
              <span className="text-4xl text-emerald-600">✓</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              ¡Captura Recibida!
            </h2>

            <p className="mt-4 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3.5 max-w-md shadow-sm">
              {state.message || 'Tu reporte ha sido guardado exitosamente para revisión.'}
            </p>

            <div className="mt-8 border-t border-b border-slate-100 w-full max-w-md py-5 space-y-3.5 text-left text-xs sm:text-sm font-medium text-slate-600">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  Punto de Venta
                </span>
                <span className="text-slate-800 font-semibold max-w-[200px] text-right truncate">
                  {pdvsForDate.find((p) => p.id === selectedPdvId)?.nombre || 'PDV seleccionado'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  Dermoconsejera
                </span>
                <span className="text-slate-800 font-semibold max-w-[200px] text-right truncate">
                  {selectedEmployeeName || 'Dermoconsejera'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  Actividad
                </span>
                <span className="text-slate-800 font-semibold">{ACTION_LABELS[tipoRegistro]}</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleResetForm}
              className="mt-10 w-full max-w-xs bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-[16px] py-4 text-sm font-bold uppercase tracking-[0.16em] transition-all duration-300 shadow-md transform hover:scale-[1.01]"
            >
              Registrar otra captura
            </Button>
          </div>
        ) : (
          <form action={formAction} ref={formRef} onSubmit={handleSubmit} className="space-y-6">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" />
            <input
              type="hidden"
              name="items_json"
              value={JSON.stringify(
                (() => {
                  if (esVacaciones) {
                    return [
                      {
                        id: 'vacaciones-row',
                        subtipo_registro: 'VACACIONES',
                        producto_id: null,
                        cantidad: null,
                        folio_ticket: null,
                      },
                    ];
                  }
                  if (esIncapacidad) {
                    return [
                      {
                        id: 'incapacidad-row',
                        subtipo_registro: 'INCAPACIDAD',
                        producto_id: null,
                        cantidad: null,
                        folio_ticket: null,
                      },
                    ];
                  }
                  if (esFalta) {
                    return [
                      {
                        id: 'falta-row',
                        subtipo_registro: 'FALTA',
                        producto_id: null,
                        cantidad: null,
                        folio_ticket: null,
                      },
                    ];
                  }

                  if (tipoRegistro === 'VENTA') {
                    if (noVentas) {
                      return [
                        {
                          id: 'sin-ventas-row',
                          subtipo_registro: 'SIN_VENTAS',
                          producto_id: null,
                          cantidad: null,
                        },
                      ];
                    }
                  }
                  if (tipoRegistro === 'LOVE_ISDIN') {
                    if (noLoveIsdin) {
                      return [
                        {
                          id: 'sin-registros-row',
                          subtipo_registro: 'SIN_REGISTROS',
                          cantidad: null,
                          folio_ticket: null,
                        },
                      ];
                    }
                  }

                  return items.flatMap((item) => {
                    const {
                      foto_evidencia_url,
                      foto_evidencia_urls,
                      foto_evidencia_files,
                      foto_exitoso_files,
                      foto_exitoso_urls,
                      foto_fallido_files,
                      foto_fallido_urls,
                      foto_con_ticket_files,
                      foto_con_ticket_urls,
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
                          id: `${item.id}-con_ticket`,
                          subtipo_registro: 'CANJE_CON_TICKET',
                          cantidad: cantidad_con_ticket,
                          folio_ticket: item.folio_ticket,
                        });
                      }
                      if ((cantidad_sin_ticket ?? 0) > 0) {
                        subItems.push({
                          ...rest,
                          id: `${item.id}-sin_ticket`,
                          subtipo_registro: 'CANJE_SIN_TICKET',
                          cantidad: cantidad_sin_ticket,
                          folio_ticket: null,
                        });
                      }
                      if ((cantidad_fuera_jornada ?? 0) > 0) {
                        subItems.push({
                          ...rest,
                          id: `${item.id}-fuera_jornada`,
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
                          id: `${item.id}-exitoso`,
                          subtipo_registro: 'LOVE_EXITOSO',
                          cantidad: cantidad_love_exitoso,
                          folio_ticket: null,
                        });
                      }
                      if ((cantidad_love_fallido ?? 0) > 0) {
                        subItems.push({
                          ...rest,
                          id: `${item.id}-fallido`,
                          subtipo_registro: 'LOVE_FALLIDO',
                          cantidad: cantidad_love_fallido,
                          folio_ticket: null,
                        });
                      }
                      return subItems;
                    }
                    return [rest];
                  });
                })()
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
                  value={selectedDate}
                  onChange={(event) => handleDateChange(event.target.value)}
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
                  disabled={isLoadingAssignments}
                />
              </div>
              <div className="grid grid-cols-1">
                <div className="w-full">
                  {!isManualAttribution && selectedAssignment?.estado !== 'SELECCIONABLE' ? (
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Dermoconsejera <span className="text-rose-500">*</span>
                    </label>
                  ) : null}
                  {!isManualAttribution && selectedAssignment?.estado !== 'SELECCIONABLE' ? (
                    <input type="hidden" name="empleado_id" value={selectedEmpleadoId} />
                  ) : null}
                  <input
                    type="hidden"
                    name="atribucion_manual_dc"
                    value={isManualAttribution ? 'true' : 'false'}
                  />
                  {isManualAttribution ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        <p className="font-semibold">
                          {selectedAssignment?.estado === 'ASIGNADA'
                            ? `Asignación publicada: ${selectedAssignment.empleadoNombre}.`
                            : 'No hay una asignación pública disponible para este PDV en la fecha.'}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-amber-800">
                          Declara sólo a la DC que realizó la jornada. Esta excepción se audita y no
                          cambia la asignación oficial.
                        </p>
                      </div>
                      <SearchableSelect
                        label="Dermoconsejera que realizó la jornada"
                        value={selectedEmpleadoId}
                        onChange={setSelectedEmpleadoId}
                        options={manualEmployeeOptions}
                        placeholder={
                          isLoadingManualEmployees
                            ? 'Consultando dermoconsejeras activas...'
                            : 'Elige tu nombre para atribuir tus ventas...'
                        }
                        required
                        accentColor="amber"
                        itemId="empleado_id"
                        disabled={isLoadingManualEmployees}
                      />
                      {manualEmployeeError ? (
                        <p className="text-xs font-medium text-rose-700">{manualEmployeeError}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={cancelManualAttribution}
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto"
                      >
                        Usar la asignación publicada
                      </button>
                    </div>
                  ) : selectedAssignment?.estado === 'SELECCIONABLE' ? (
                    <div className="space-y-2">
                      <SearchableSelect
                        label="Dermoconsejera"
                        value={selectedEmpleadoId}
                        onChange={setSelectedEmpleadoId}
                        options={selectableEmployeeOptions}
                        placeholder="Elige tu nombre para aplicar tus ventas..."
                        required
                        accentColor="emerald"
                        itemId="empleado_id"
                        disabled={isLoadingAssignments}
                      />
                      <p className="text-[11px] font-medium text-emerald-700">
                        Este PDV tiene {selectableEmployeeOptions.length} DC publicadas. Elige tu
                        nombre para atribuir correctamente tus ventas.
                      </p>
                    </div>
                  ) : (
                    <div
                      className={`min-h-11 w-full rounded-xl border px-4 py-3 text-sm shadow-sm transition-colors ${
                        selectedEmployeeName
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                          : selectedAssignment?.estado === 'CONFLICTO' || assignmentError
                            ? 'border-rose-200 bg-rose-50 text-rose-900'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                      role="status"
                      aria-live="polite"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 shrink-0" aria-hidden="true">
                          {isLoadingAssignments
                            ? '⏳'
                            : selectedEmployeeName
                              ? '✓'
                              : selectedAssignment?.estado === 'CONFLICTO' || assignmentError
                                ? '⚠️'
                                : '👤'}
                        </span>
                        <div>
                          <p className="font-semibold leading-normal">
                            {isLoadingAssignments
                              ? 'Consultando asignación pública...'
                              : assignmentError
                                ? assignmentError
                                : selectedEmployeeName
                                  ? selectedEmployeeName
                                  : selectedAssignment?.estado === 'CONFLICTO'
                                    ? 'La asignación publicada no está disponible.'
                                    : selectedPdvId
                                      ? 'Este PDV no tiene una DC publicada para la fecha.'
                                      : 'Selecciona un punto de venta para mostrar la DC asignada.'}
                          </p>
                          {selectedEmployeeName ? (
                            <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                              Asignación pública vigente para {selectedDate}.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedPdvId && !isManualAttribution && !isLoadingAssignments ? (
                    <button
                      type="button"
                      onClick={enableManualAttribution}
                      className="mt-3 min-h-11 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:w-auto"
                    >
                      ¿La asignación no corresponde a la realidad? Registrar con mi nombre
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Bloque de Capturas por Lote */}
            <div className="space-y-4">
              <div className="space-y-3">
                {/* Sin ventas */}
                {tipoRegistro === 'VENTA' && (
                  <div
                    className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm select-none transition-all duration-300 ${noVentas ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50/30 border-slate-100'}`}
                  >
                    <div className="pr-4">
                      <p className="text-xs font-bold text-emerald-950">
                        🛍️ ¿No tuviste ventas hoy?
                      </p>
                      <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                        Activa esta casilla para reportar que no hubo movimiento de ventas en tu
                        jornada.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={noVentas}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNoVentas(checked);
                          if (checked) {
                            setEsVacaciones(false);
                            setEsIncapacidad(false);
                            setEsFalta(false);
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                )}

                {/* Sin registros Love ISDIN */}
                {tipoRegistro === 'LOVE_ISDIN' && (
                  <div
                    className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm select-none transition-all duration-300 ${noLoveIsdin ? 'bg-pink-50 border-pink-200' : 'bg-slate-50/30 border-slate-100'}`}
                  >
                    <div className="pr-4">
                      <p className="text-xs font-bold text-pink-950">
                        ❤️ ¿No registraste ningún Love ISDIN hoy?
                      </p>
                      <p className="text-[10px] text-pink-700 font-medium mt-0.5">
                        Activa esta casilla si no fue posible realizar registros de fidelización en
                        tu jornada.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={noLoveIsdin}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNoLoveIsdin(checked);
                          if (checked) {
                            setEsVacaciones(false);
                            setEsIncapacidad(false);
                            setEsFalta(false);
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                    </label>
                  </div>
                )}

                {/* Vacaciones */}
                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm select-none transition-all duration-300 ${esVacaciones ? 'bg-amber-50 border-amber-200' : 'bg-slate-50/30 border-slate-100'}`}
                >
                  <div className="pr-4">
                    <p className="text-xs font-bold text-amber-950">🌴 ¿Estás de vacaciones?</p>
                    <p className="text-[10px] text-amber-700 font-medium mt-0.5">
                      Activa esta casilla para reportar que tu jornada del día corresponde a periodo
                      vacacional.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={esVacaciones}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEsVacaciones(checked);
                        if (checked) {
                          setNoVentas(false);
                          setNoLoveIsdin(false);
                          setEsIncapacidad(false);
                          setEsFalta(false);
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Incapacidad */}
                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm select-none transition-all duration-300 ${esIncapacidad ? 'bg-rose-50 border-rose-200' : 'bg-slate-50/30 border-slate-100'}`}
                >
                  <div className="pr-4">
                    <p className="text-xs font-bold text-rose-950">🏥 ¿Estás de incapacidad?</p>
                    <p className="text-[10px] text-rose-700 font-medium mt-0.5">
                      Activa esta casilla para reportar que tu jornada del día corresponde a periodo
                      de incapacidad médica.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={esIncapacidad}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEsIncapacidad(checked);
                        if (checked) {
                          setNoVentas(false);
                          setNoLoveIsdin(false);
                          setEsVacaciones(false);
                          setEsFalta(false);
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                  </label>
                </div>

                {/* Falta */}
                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm select-none transition-all duration-300 ${esFalta ? 'bg-red-50 border-red-200' : 'bg-slate-50/30 border-slate-100'}`}
                >
                  <div className="pr-4">
                    <p className="text-xs font-bold text-red-950">❌ ¿Faltaste a tu jornada?</p>
                    <p className="text-[10px] text-red-700 font-medium mt-0.5">
                      Activa esta casilla para reportar inasistencia/falta en tu jornada del día.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={esFalta}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEsFalta(checked);
                        if (checked) {
                          setNoVentas(false);
                          setNoLoveIsdin(false);
                          setEsVacaciones(false);
                          setEsIncapacidad(false);
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>
              </div>

              {!esVacaciones &&
                !esIncapacidad &&
                !esFalta &&
                !(tipoRegistro === 'VENTA' && noVentas) &&
                !(tipoRegistro === 'LOVE_ISDIN' && noLoveIsdin) && (
                  <>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                        Artículos a registrar
                      </h3>
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
                            id={item.id}
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
                                    onChange={(val) =>
                                      updateRowField(item.id, 'material_catalogo_id', val)
                                    }
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
                                      <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">
                                        Operación ordinaria
                                      </p>
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
                                      <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">
                                        Solo para entrega
                                      </p>
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
                                      <p className="text-xs font-bold text-slate-800">
                                        Fuera de Jornada
                                      </p>
                                      <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">
                                        Operación extraordinaria
                                      </p>
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
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                                    Suma total de este artículo
                                  </span>
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
                                      <p className="text-xs font-bold text-slate-800">
                                        ✅ Registro Exitoso
                                      </p>
                                      <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">
                                        Captura efectiva en Love ISDIN
                                      </p>
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
                                      <p className="text-xs font-bold text-slate-800">
                                        ❌ Intentos Fallidos
                                      </p>
                                      <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">
                                        Invitaciones rechazadas o con error
                                      </p>
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
                                        updateRowField(
                                          item.id,
                                          'cantidad',
                                          (item.cantidad ?? 1) + 1
                                        );
                                      }}
                                      className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 flex items-center justify-center font-bold text-slate-700 text-xl transition-all duration-200 shadow-sm select-none"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              )}

                            {/* Evidencias para Canje (si cualquier cantidad de canje es > 0) */}
                            {tipoRegistro === 'CANJE' &&
                              ((item.cantidad_con_ticket ?? 0) > 0 ||
                                (item.cantidad_sin_ticket ?? 0) > 0 ||
                                (item.cantidad_fuera_jornada ?? 0) > 0) && (
                                <div className="bg-indigo-50/30 border border-dashed border-indigo-200 rounded-2xl p-4 transition-all duration-300">
                                  <label className="text-xs font-bold text-indigo-800 uppercase tracking-wider block mb-2">
                                    📸 Evidencias de Canje (Opcional - desde galería)
                                  </label>

                                  <input
                                    id={`foto_input__${item.id}-con_ticket`}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    name={`foto_evidencia__${item.id}-con_ticket`}
                                    onChange={(e) =>
                                      handleImageSelection(
                                        e.target.files,
                                        item.id,
                                        'foto_con_ticket_files',
                                        'foto_con_ticket_urls',
                                        `foto_input__${item.id}-con_ticket`
                                      )
                                    }
                                    className="hidden"
                                  />

                                  {item.foto_con_ticket_urls &&
                                  item.foto_con_ticket_urls.length > 0 ? (
                                    <div className="space-y-4">
                                      {/* Rejilla de miniaturas */}
                                      <div className="flex flex-wrap gap-3">
                                        {item.foto_con_ticket_urls.map((url, imgIdx) => (
                                          <div
                                            key={imgIdx}
                                            className="relative w-28 h-28 rounded-2xl overflow-hidden border border-slate-200 shadow-md"
                                          >
                                            <img
                                              src={url}
                                              alt={`Evidencia Canje Ticket ${imgIdx + 1}`}
                                              className="w-full h-full object-cover"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const nextFiles =
                                                  item.foto_con_ticket_files?.filter(
                                                    (_, i) => i !== imgIdx
                                                  ) ?? [];
                                                const nextUrls = nextFiles.map((file) =>
                                                  URL.createObjectURL(file)
                                                );

                                                updateRowField(
                                                  item.id,
                                                  'foto_con_ticket_files',
                                                  nextFiles.length > 0 ? nextFiles : undefined
                                                );
                                                updateRowField(
                                                  item.id,
                                                  'foto_con_ticket_urls',
                                                  nextUrls.length > 0 ? nextUrls : undefined
                                                );

                                                syncInputFiles(
                                                  `foto_input__${item.id}-con_ticket`,
                                                  nextFiles
                                                );
                                              }}
                                              className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1.5 shadow transition-all duration-200 transform hover:scale-105"
                                              title="Quitar esta foto"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ))}

                                        {/* Botón para añadir más fotos */}
                                        <label
                                          htmlFor={`foto_input__${item.id}-con_ticket-add`}
                                          className="flex flex-col items-center justify-center w-28 h-28 bg-white border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] rounded-2xl cursor-pointer shadow-sm transition-all duration-200 select-none text-center"
                                        >
                                          <span className="text-2xl mb-1">➕</span>
                                          <span className="text-[10px] font-bold text-slate-500 leading-tight">
                                            Añadir más
                                          </span>
                                          <input
                                            id={`foto_input__${item.id}-con_ticket-add`}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={(e) =>
                                              handleImageSelection(
                                                e.target.files,
                                                item.id,
                                                'foto_con_ticket_files',
                                                'foto_con_ticket_urls',
                                                `foto_input__${item.id}-con_ticket`
                                              )
                                            }
                                            className="hidden"
                                          />
                                        </label>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          updateRowField(
                                            item.id,
                                            'foto_con_ticket_files',
                                            undefined
                                          );
                                          updateRowField(
                                            item.id,
                                            'foto_con_ticket_urls',
                                            undefined
                                          );
                                          const input = document.getElementById(
                                            `foto_input__${item.id}-con_ticket`
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
                                      <label
                                        htmlFor={`foto_input__${item.id}-con_ticket`}
                                        className="flex flex-col items-center justify-center px-5 py-3 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] rounded-xl cursor-pointer shadow-sm transition-all duration-200 text-center select-none"
                                      >
                                        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                          📸 Seleccionar Evidencias con Ticket
                                        </span>
                                      </label>
                                      <span className="text-[10px] text-slate-400 leading-normal font-medium text-center sm:text-left">
                                        Puedes tomar fotos de tu galería para la evidencia de este
                                        canje con ticket.
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                            {/* Evidencias para Love ISDIN */}
                            {tipoRegistro === 'LOVE_ISDIN' && (
                              <div className="space-y-4">
                                {/* Evidencias de registros exitosos */}
                                {(item.cantidad_love_exitoso ?? 0) > 0 && (
                                  <div className="bg-emerald-50/30 border border-dashed border-emerald-200 rounded-2xl p-4 transition-all duration-300">
                                    <label className="text-xs font-bold text-emerald-800 uppercase tracking-wider block mb-2">
                                      📸 Evidencias de Registros Exitosos (Opcional)
                                    </label>

                                    <input
                                      id={`foto_input__${item.id}-exitoso`}
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      name={`foto_evidencia__${item.id}-exitoso`}
                                      onChange={(e) =>
                                        handleImageSelection(
                                          e.target.files,
                                          item.id,
                                          'foto_exitoso_files',
                                          'foto_exitoso_urls',
                                          `foto_input__${item.id}-exitoso`
                                        )
                                      }
                                      className="hidden"
                                    />

                                    {item.foto_exitoso_urls && item.foto_exitoso_urls.length > 0 ? (
                                      <div className="space-y-4">
                                        <div className="flex flex-wrap gap-3">
                                          {item.foto_exitoso_urls.map((url, imgIdx) => (
                                            <div
                                              key={imgIdx}
                                              className="relative w-28 h-28 rounded-2xl overflow-hidden border border-slate-200 shadow-md"
                                            >
                                              <img
                                                src={url}
                                                alt={`Evidencia Exitosa ${imgIdx + 1}`}
                                                className="w-full h-full object-cover"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const nextFiles =
                                                    item.foto_exitoso_files?.filter(
                                                      (_, i) => i !== imgIdx
                                                    ) ?? [];
                                                  const nextUrls = nextFiles.map((file) =>
                                                    URL.createObjectURL(file)
                                                  );

                                                  updateRowField(
                                                    item.id,
                                                    'foto_exitoso_files',
                                                    nextFiles.length > 0 ? nextFiles : undefined
                                                  );
                                                  updateRowField(
                                                    item.id,
                                                    'foto_exitoso_urls',
                                                    nextUrls.length > 0 ? nextUrls : undefined
                                                  );

                                                  syncInputFiles(
                                                    `foto_input__${item.id}-exitoso`,
                                                    nextFiles
                                                  );
                                                }}
                                                className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1.5 shadow transition-all duration-200 transform hover:scale-105"
                                                title="Quitar esta foto"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ))}

                                          <label
                                            htmlFor={`foto_input__${item.id}-exitoso-add`}
                                            className="flex flex-col items-center justify-center w-28 h-28 bg-white border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] rounded-2xl cursor-pointer shadow-sm transition-all duration-200 select-none text-center"
                                          >
                                            <span className="text-2xl mb-1">➕</span>
                                            <span className="text-[10px] font-bold text-slate-500 leading-tight">
                                              Añadir más
                                            </span>
                                            <input
                                              id={`foto_input__${item.id}-exitoso-add`}
                                              type="file"
                                              accept="image/*"
                                              multiple
                                              onChange={(e) =>
                                                handleImageSelection(
                                                  e.target.files,
                                                  item.id,
                                                  'foto_exitoso_files',
                                                  'foto_exitoso_urls',
                                                  `foto_input__${item.id}-exitoso`
                                                )
                                              }
                                              className="hidden"
                                            />
                                          </label>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateRowField(
                                              item.id,
                                              'foto_exitoso_files',
                                              undefined
                                            );
                                            updateRowField(item.id, 'foto_exitoso_urls', undefined);
                                            const input = document.getElementById(
                                              `foto_input__${item.id}-exitoso`
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
                                        <label
                                          htmlFor={`foto_input__${item.id}-exitoso`}
                                          className="flex flex-col items-center justify-center px-5 py-3 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] rounded-xl cursor-pointer shadow-sm transition-all duration-200 text-center select-none"
                                        >
                                          <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                            📸 Seleccionar Evidencias de Exitosos
                                          </span>
                                        </label>
                                        <span className="text-[10px] text-slate-400 leading-normal font-medium text-center sm:text-left">
                                          Sube evidencias específicas para tus registros exitosos.
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Evidencias de intentos fallidos */}
                                {(item.cantidad_love_fallido ?? 0) > 0 && (
                                  <div className="bg-rose-50/30 border border-dashed border-rose-200 rounded-2xl p-4 transition-all duration-300">
                                    <label className="text-xs font-bold text-rose-800 uppercase tracking-wider block mb-2">
                                      📸 Evidencias de Intentos Fallidos (Opcional)
                                    </label>

                                    <input
                                      id={`foto_input__${item.id}-fallido`}
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      name={`foto_evidencia__${item.id}-fallido`}
                                      onChange={(e) =>
                                        handleImageSelection(
                                          e.target.files,
                                          item.id,
                                          'foto_fallido_files',
                                          'foto_fallido_urls',
                                          `foto_input__${item.id}-fallido`
                                        )
                                      }
                                      className="hidden"
                                    />

                                    {item.foto_fallido_urls && item.foto_fallido_urls.length > 0 ? (
                                      <div className="space-y-4">
                                        <div className="flex flex-wrap gap-3">
                                          {item.foto_fallido_urls.map((url, imgIdx) => (
                                            <div
                                              key={imgIdx}
                                              className="relative w-28 h-28 rounded-2xl overflow-hidden border border-slate-200 shadow-md"
                                            >
                                              <img
                                                src={url}
                                                alt={`Evidencia Fallida ${imgIdx + 1}`}
                                                className="w-full h-full object-cover"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const nextFiles =
                                                    item.foto_fallido_files?.filter(
                                                      (_, i) => i !== imgIdx
                                                    ) ?? [];
                                                  const nextUrls = nextFiles.map((file) =>
                                                    URL.createObjectURL(file)
                                                  );

                                                  updateRowField(
                                                    item.id,
                                                    'foto_fallido_files',
                                                    nextFiles.length > 0 ? nextFiles : undefined
                                                  );
                                                  updateRowField(
                                                    item.id,
                                                    'foto_fallido_urls',
                                                    nextUrls.length > 0 ? nextUrls : undefined
                                                  );

                                                  syncInputFiles(
                                                    `foto_input__${item.id}-fallido`,
                                                    nextFiles
                                                  );
                                                }}
                                                className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1.5 shadow transition-all duration-200 transform hover:scale-105"
                                                title="Quitar esta foto"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ))}

                                          <label
                                            htmlFor={`foto_input__${item.id}-fallido-add`}
                                            className="flex flex-col items-center justify-center w-28 h-28 bg-white border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] rounded-2xl cursor-pointer shadow-sm transition-all duration-200 select-none text-center"
                                          >
                                            <span className="text-2xl mb-1">➕</span>
                                            <span className="text-[10px] font-bold text-slate-500 leading-tight">
                                              Añadir más
                                            </span>
                                            <input
                                              id={`foto_input__${item.id}-fallido-add`}
                                              type="file"
                                              accept="image/*"
                                              multiple
                                              onChange={(e) =>
                                                handleImageSelection(
                                                  e.target.files,
                                                  item.id,
                                                  'foto_fallido_files',
                                                  'foto_fallido_urls',
                                                  `foto_input__${item.id}-fallido`
                                                )
                                              }
                                              className="hidden"
                                            />
                                          </label>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateRowField(
                                              item.id,
                                              'foto_fallido_files',
                                              undefined
                                            );
                                            updateRowField(item.id, 'foto_fallido_urls', undefined);
                                            const input = document.getElementById(
                                              `foto_input__${item.id}-fallido`
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
                                        <label
                                          htmlFor={`foto_input__${item.id}-fallido`}
                                          className="flex flex-col items-center justify-center px-5 py-3 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] rounded-xl cursor-pointer shadow-sm transition-all duration-200 text-center select-none"
                                        >
                                          <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                            📸 Seleccionar Evidencias de Fallidos
                                          </span>
                                        </label>
                                        <span className="text-[10px] text-slate-400 leading-normal font-medium text-center sm:text-left">
                                          Sube evidencias específicas para tus intentos fallidos.
                                        </span>
                                      </div>
                                    )}
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
                                onChange={(e) =>
                                  updateRowField(item.id, 'observaciones', e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-sm focus:outline-none focus:ring-4 focus:ring-slate-100 focus:border-slate-400 transition-all duration-200 font-medium min-h-[60px]"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Botón Agregar Artículo al final */}
                    <div className="flex justify-center mt-4 mb-2">
                      <button
                        type="button"
                        onClick={addRow}
                        className={`flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-white rounded-2xl shadow-lg transform active:scale-[0.98] transition-all duration-200 ${
                          tipoRegistro === 'LOVE_ISDIN'
                            ? 'bg-pink-600 hover:bg-pink-500 shadow-pink-100 hover:shadow-pink-200/50'
                            : tipoRegistro === 'CANJE'
                              ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-100 hover:shadow-indigo-200/50'
                              : tipoRegistro === 'DESABASTO'
                                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-100 hover:shadow-amber-200/50'
                                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-100 hover:shadow-emerald-200/50'
                        }`}
                      >
                        <span>➕</span> Agregar otro artículo
                      </button>
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
                        <p className="text-white font-black text-xl mt-0.5">
                          {totals.cantidadTotal}
                        </p>
                      </div>
                    </div>
                  </>
                )}
            </div>

            {/* Banner de mensajes de error/éxito */}
            {pendingImageProcessingCount > 0 ? (
              <div
                role="status"
                className="rounded-[16px] border border-sky-200 bg-sky-50 px-4 py-3.5 text-sm font-semibold text-sky-900 shadow-sm"
              >
                Preparando {pendingImageProcessingCount}{' '}
                {pendingImageProcessingCount === 1 ? 'grupo de evidencias' : 'grupos de evidencias'}
                . El reporte se habilitará al terminar.
              </div>
            ) : null}

            {imageProcessingError ? (
              <div
                role="alert"
                className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-semibold text-rose-800 shadow-sm"
              >
                {imageProcessingError}
              </div>
            ) : null}

            {state.message && !state.ok ? (
              <div className="rounded-[16px] px-4 py-3.5 text-sm font-semibold transition-all duration-200 border border-rose-200 bg-rose-50 text-rose-800 shadow-sm">
                {state.message}
              </div>
            ) : null}

            {/* Botón de Enviar */}
            {isBatchIncomplete ? (
              <button
                type="button"
                onClick={handleIncompleteClick}
                className="w-full rounded-[16px] py-4 px-4 bg-amber-50 hover:bg-amber-100/80 text-amber-900 border-2 border-amber-300 shadow-md transition-all duration-300 flex flex-col items-center justify-center text-center gap-1 cursor-pointer transform active:scale-[0.99]"
              >
                <span className="text-sm font-bold flex items-center gap-1.5 justify-center">
                  ⚠️ Faltan datos en los artículos que agregaste.
                </span>
                <span className="text-xs font-semibold text-amber-700">
                  Completa la información para poder continuar.
                </span>
              </button>
            ) : (
              <Button
                type="submit"
                size="lg"
                className={`w-full rounded-[16px] py-4 text-sm font-bold uppercase tracking-[0.16em] transition-all duration-300 shadow-md ${
                  tipoRegistro === 'LOVE_ISDIN'
                    ? 'bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white transform hover:scale-[1.01]'
                    : tipoRegistro === 'CANJE'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white transform hover:scale-[1.01]'
                      : tipoRegistro === 'DESABASTO'
                        ? 'bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white transform hover:scale-[1.01]'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white transform hover:scale-[1.01]'
                }`}
                disabled={pendingImageProcessingCount > 0}
                isLoading={pending || pendingImageProcessingCount > 0}
              >
                {`Enviar reporte de ${ACTION_LABELS[tipoRegistro].toLowerCase()}`}
              </Button>
            )}
          </form>
        )}
      </Card>

      {/* Modal de confirmación de fecha operativa diferente a hoy */}
      {showConfirmDateModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            {/* Icono de advertencia */}
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4 text-amber-500">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-2">Fecha no corresponde a hoy</h3>

            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              La fecha seleccionada no corresponde al día de hoy.
              <br />
              ¿Deseas registrar este movimiento de todos modos?
            </p>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowConfirmDateModal(false)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors"
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
