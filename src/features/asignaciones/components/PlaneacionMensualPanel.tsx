'use client';

import Link from 'next/link';
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  CalendarDots,
  CaretDown,
  MagnifyingGlass,
  PencilSimple,
  Storefront,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  startTransition,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ModalPanel } from '@/components/ui/modal-panel';
import { PlaneacionCuotaImportButton } from '@/features/asignaciones/components/PlaneacionCuotaImportButton';
import {
  buildPlaneacionRotacionOperations,
  getPlaneacionRotacionPatternDays,
  type PlaneacionRotacionMiembro,
  type PlaneacionRotacionPatron,
} from '@/features/asignaciones/lib/planeacionRotacionGrupo';
import {
  buildPlaneacionMasivaPdvOperations,
  type PlaneacionMasivaPdvIssue,
  type PlaneacionMasivaPdvTipo,
} from '@/features/asignaciones/lib/planeacionMasivaPdv';
import { buildLaborDaysFromRestDay } from '@/features/asignaciones/lib/assignmentPlanning';
import {
  aplicarPlaneacionMensualAction,
  previsualizarPlaneacionMensualAction,
} from '@/features/asignaciones/planeacionMensualActions';
import type {
  PlaneacionMensualActionState,
  PlaneacionMensualDetalleDia,
  PlaneacionMensualDia,
  PlaneacionMensualDiaCodigo,
  PlaneacionMensualFila,
  PlaneacionMensualNaturaleza,
  PlaneacionMensualOperacion,
  PlaneacionMensualResumen,
  PlaneacionMensualTipoOperacion,
} from '@/features/asignaciones/types/planeacionMensual';

interface PlaneacionMensualPanelProps {
  summary: PlaneacionMensualResumen;
  cuentaClienteId: string;
  puedeEditar: boolean;
}

interface SelectedCell {
  row: PlaneacionMensualFila;
  day: PlaneacionMensualDia;
  source: 'DIA' | 'PDV' | 'DC' | 'SUPERVISOR';
}

interface EditorState {
  operation: PlaneacionMensualTipoOperacion;
  empleadoId: string;
  pdvOrigenId: string;
  pdvDestinoId: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  naturaleza: PlaneacionMensualNaturaleza;
  tipo: 'FIJA' | 'ROTATIVA' | 'COBERTURA';
  factorTiempo: string;
  diasLaborales: string;
  diaDescanso: string;
  horarioReferencia: string;
  grupoRotacion: string;
  grupoTamano: '2' | '3';
  slotRotacion: 'A' | 'B' | 'C';
  patronRotacion: PlaneacionRotacionPatron;
  miembrosRotacion: PlaneacionRotacionMiembro[];
  estadoPdv: 'ACTIVO' | 'PAUSADO' | 'INACTIVO';
  eventoNombre: string;
  eventoTipo: 'FORMACION' | 'ISDINIZACION' | 'ACTIVACION' | 'EVENTO_ESPECIAL';
  eventoSede: string;
  eventoModalidad: 'PRESENCIAL' | 'EN_LINEA';
  supervisorOrigenId: string;
  supervisorDestinoId: string;
}

interface BulkEditorState {
  operation: PlaneacionMasivaPdvTipo;
  fechaInicio: string;
  supervisorDestinoId: string;
  motivo: string;
}

const MAX_BULK_PDVS = 100;
const CALENDAR_WINDOW_DAYS = 14;
const CALENDAR_DAY_COLUMN_PX = 44;
const CALENDAR_DRAG_THRESHOLD_PX = 5;

interface CalendarDragState {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  moved: boolean;
}

const CELL_INDEX = {
  fecha: 0,
  codigo: 1,
  turnoCodigo: 2,
  turnoColor: 3,
  cuotaDia: 4,
  cuotaAsignada: 5,
} as const;

const EMPTY_ACTION_STATE: PlaneacionMensualActionState = {
  ok: false,
  message: '',
  preview: null,
  loteId: null,
  version: null,
  materializacionPendiente: false,
};

const CODE_LABELS: Record<PlaneacionMensualDiaCodigo, string> = {
  '1': 'Jornada asignada',
  D: 'Descanso',
  COV: 'Cobertura',
  FOR: 'Formación',
  I: 'Incapacidad inicial',
  IS: 'Incapacidad subsecuente',
  VAC: 'Vacaciones',
  JUS: 'Falta justificada',
  SIN: 'Sin asignación',
  PC: 'Por cubrir',
  '—': 'Sin jornada en este segmento',
};

const CODE_TONES: Record<PlaneacionMensualDiaCodigo, string> = {
  '1': 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300',
  D: 'border-slate-200 bg-slate-100 text-slate-500 hover:border-slate-300',
  COV: 'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300',
  FOR: 'border-cyan-200 bg-cyan-50 text-cyan-800 hover:border-cyan-300',
  I: 'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300',
  IS: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 hover:border-fuchsia-300',
  VAC: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300',
  JUS: 'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300',
  SIN: 'border-slate-200 bg-white text-slate-400 hover:border-slate-300',
  PC: 'border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300',
  '—': 'border-slate-200 bg-slate-50 text-slate-300 hover:border-slate-300',
};

const TURN_TONES: Record<string, string> = {
  M: 'bg-amber-500',
  TCM: 'bg-sky-500',
  TC: 'bg-blue-600',
  TC_12: 'bg-violet-500',
  TCV: 'bg-purple-600',
  V1: 'bg-rose-500',
  V: 'bg-fuchsia-600',
  'ES1/ACT': 'bg-orange-500',
  CAP: 'bg-cyan-600',
  VC: 'bg-slate-500',
};

const ROW_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '44px',
} as CSSProperties;

function formatMonth(monthIso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${monthIso.slice(0, 7)}-01T12:00:00Z`));
}

function formatDate(dateIso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

function getWeekdayLetter(dateIso: string) {
  const day = new Date(`${dateIso}T12:00:00Z`).getUTCDay();
  return ['D', 'L', 'M', 'X', 'J', 'V', 'S'][day];
}

function shiftMonth(monthIso: string, offset: number) {
  const date = new Date(`${monthIso.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset, 1);
  return date.toISOString().slice(0, 7);
}

function currentDateMx() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function turnDotClass(turn: string | null) {
  if (!turn) return 'bg-transparent';
  if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(turn)) return 'bg-teal-600';
  return TURN_TONES[turn] ?? 'bg-slate-500';
}

function uniqueOptions<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function getInitialEditorState(cell: SelectedCell): EditorState {
  const isVacancy = cell.row.segmentoTipo === 'VACANTE';
  const fechaInicio =
    cell.day[CELL_INDEX.fecha] < currentDateMx() ? currentDateMx() : cell.day[CELL_INDEX.fecha];

  return {
    operation:
      cell.source === 'SUPERVISOR'
        ? 'REASIGNAR_SUPERVISOR'
        : cell.source === 'PDV'
          ? 'CAMBIAR_ROTACION'
          : isVacancy
            ? 'ASIGNAR_DC'
            : 'MOVER_DC',
    empleadoId: cell.row.empleadoId ?? '',
    pdvOrigenId: isVacancy ? '' : cell.row.pdvId,
    pdvDestinoId: isVacancy ? cell.row.pdvId : '',
    fechaInicio,
    fechaFin: '',
    motivo: '',
    naturaleza: isVacancy ? 'BASE' : 'COBERTURA_PERMANENTE',
    tipo:
      cell.source === 'PDV'
        ? cell.row.factorTiempo === 0.5
          ? 'ROTATIVA'
          : 'FIJA'
        : isVacancy
          ? 'FIJA'
          : 'COBERTURA',
    factorTiempo: isVacancy ? '1' : String(cell.row.factorTiempo || 1),
    diasLaborales: cell.row.diasLaborales ?? 'LUN-SAB',
    diaDescanso: cell.row.diaDescanso ?? 'DOM',
    horarioReferencia: cell.row.horarioReferencia ?? 'TC',
    grupoRotacion: '',
    grupoTamano: '2',
    slotRotacion: 'A',
    patronRotacion: 'LMX_JVS',
    miembrosRotacion: [
      {
        slot: 'A',
        pdvId: cell.row.pdvId,
        empleadoId: cell.row.empleadoId ?? '',
        empleadoActualId: cell.row.empleadoId ?? '',
        asignacionActualId: cell.row.asignacionId ?? '',
        diasLaborales: cell.row.diasLaborales ?? 'LUN,MAR,MIE',
        horarioReferencia: cell.row.horarioReferencia ?? 'TC',
      },
      {
        slot: 'B',
        pdvId: '',
        empleadoId: '',
        empleadoActualId: '',
        asignacionActualId: '',
        diasLaborales: 'JUE,VIE,SAB',
        horarioReferencia: cell.row.horarioReferencia ?? 'TC',
      },
    ],
    estadoPdv: cell.row.pdvEstatus ?? 'ACTIVO',
    eventoNombre: '',
    eventoTipo: 'ACTIVACION',
    eventoSede: cell.row.pdvNombre,
    eventoModalidad: 'PRESENCIAL',
    supervisorOrigenId: cell.row.supervisorId ?? '',
    supervisorDestinoId: '',
  };
}

function getRowAnchorDay(row: PlaneacionMensualFila): PlaneacionMensualDia | null {
  const today = currentDateMx();
  return row.dias.find((day) => day[CELL_INDEX.fecha] >= today) ?? row.dias[0] ?? null;
}

function getSelectionLabel(source: SelectedCell['source']) {
  if (source === 'PDV') return 'Asignación maestra del PDV';
  if (source === 'DC') return 'Asignación maestra de la DC';
  if (source === 'SUPERVISOR') return 'Responsabilidad maestra del supervisor';
  return 'Detalle diario';
}

function buildOperation(editor: EditorState, selected: SelectedCell): PlaneacionMensualOperacion {
  const assignmentMatches =
    selected.row.empleadoId === editor.empleadoId && selected.row.pdvId === editor.pdvOrigenId;

  return {
    tipoOperacion: editor.operation,
    empleadoId:
      editor.operation === 'CAMBIAR_ROTACION' ||
      editor.operation === 'CAMBIAR_ESTADO_PDV' ||
      editor.operation === 'REASIGNAR_SUPERVISOR'
        ? null
        : editor.empleadoId,
    pdvOrigenId:
      editor.operation === 'ASIGNAR_DC'
        ? null
        : editor.operation === 'REASIGNAR_SUPERVISOR'
          ? selected.row.pdvId
          : editor.pdvOrigenId || null,
    pdvDestinoId: ['ASIGNAR_DC', 'MOVER_DC'].includes(editor.operation)
      ? editor.pdvDestinoId || null
      : null,
    fechaInicio: editor.fechaInicio,
    fechaFin: editor.fechaFin || null,
    motivo: editor.motivo.trim(),
    payload: {
      asignacionId: assignmentMatches ? selected.row.asignacionId : null,
      naturaleza: editor.naturaleza,
      tipo: editor.tipo,
      factorTiempo: Number(editor.factorTiempo) || 1,
      diasLaborales:
        editor.diasLaborales.trim() && editor.diasLaborales !== 'LUN-SAB'
          ? editor.diasLaborales.trim()
          : buildLaborDaysFromRestDay(editor.diaDescanso),
      diaDescanso: editor.diaDescanso.trim() || null,
      horarioReferencia: editor.horarioReferencia.trim() || null,
      grupoRotacion: editor.grupoRotacion.trim() || null,
      grupoTamano: editor.tipo === 'ROTATIVA' ? (Number(editor.grupoTamano) as 2 | 3) : null,
      slotRotacion: editor.tipo === 'ROTATIVA' ? editor.slotRotacion : null,
      estadoPdv: editor.estadoPdv,
      eventoNombre: editor.eventoNombre.trim() || null,
      eventoTipo: editor.eventoTipo,
      eventoSede: editor.eventoSede.trim() || null,
      eventoModalidad: editor.eventoModalidad,
      supervisorOrigenId: editor.supervisorOrigenId || null,
      supervisorDestinoId: editor.supervisorDestinoId || null,
    },
  };
}

function getBulkIssueLabel(issue: PlaneacionMasivaPdvIssue, pdvName?: string) {
  const scope = pdvName ? ` · ${pdvName}` : '';
  const labels: Record<PlaneacionMasivaPdvIssue['code'], string> = {
    FECHA_REQUERIDA: 'Indica la fecha efectiva.',
    MOTIVO_REQUERIDO: 'Captura el motivo operativo.',
    PDVS_REQUERIDOS: 'Selecciona al menos un PDV.',
    PDV_SIN_DC_VIGENTE: `El PDV no tiene una DC vigente para liberar${scope}.`,
    PDV_SIN_SUPERVISOR_VIGENTE: `El PDV no tiene supervisor vigente${scope}.`,
    SUPERVISOR_DESTINO_REQUERIDO: 'Selecciona el supervisor que recibirá los PDVs.',
    SUPERVISOR_SIN_CAMBIO: `El PDV ya pertenece al supervisor elegido${scope}.`,
    LOTE_SUPERA_100_OPERACIONES: 'El lote supera 100 operaciones; divide la selección.',
  };
  return labels[issue.code];
}

function SummaryMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.04)] xl:px-2 xl:py-1.5">
      <div className="flex items-center gap-2.5 xl:gap-1.5">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg xl:h-7 xl:w-7 ${tone}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="text-base font-bold leading-5 text-slate-950 xl:text-sm xl:leading-4">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function LegendPill({ code }: { code: PlaneacionMensualDiaCodigo }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${CODE_TONES[code]}`}
    >
      <strong>{code}</strong>
      <span>{CODE_LABELS[code]}</span>
    </span>
  );
}

export function PlaneacionMensualPanel({
  summary,
  cuentaClienteId,
  puedeEditar,
}: PlaneacionMensualPanelProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('es'));
  const [chainId, setChainId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [rowState, setRowState] = useState('');
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [detail, setDetail] = useState<PlaneacionMensualDetalleDia | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [actionState, setActionState] = useState(EMPTY_ACTION_STATE);
  const [actionPending, setActionPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [selectedPdvIds, setSelectedPdvIds] = useState<Set<string>>(() => new Set());
  const [bulkEditor, setBulkEditor] = useState<BulkEditorState | null>(null);
  const [bulkActionState, setBulkActionState] = useState(EMPTY_ACTION_STATE);
  const [bulkIssues, setBulkIssues] = useState<PlaneacionMasivaPdvIssue[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkIdempotencyKey, setBulkIdempotencyKey] = useState('');
  const triggerRef = useRef<HTMLElement | null>(null);
  const requestSequence = useRef(0);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const calendarDragRef = useRef<CalendarDragState | null>(null);
  const suppressCalendarClickRef = useRef(false);

  const chainOptions = useMemo(
    () =>
      uniqueOptions(
        summary.rows
          .filter((row): row is PlaneacionMensualFila & { cadenaId: string } =>
            Boolean(row.cadenaId)
          )
          .map((row) => ({ id: row.cadenaId, label: row.cadenaNombre ?? 'Sin cadena' }))
      ).sort((left, right) => left.label.localeCompare(right.label, 'es')),
    [summary.rows]
  );

  const supervisorOptions = useMemo(
    () =>
      uniqueOptions(
        summary.supervisoresDisponibles.length > 0
          ? summary.supervisoresDisponibles
          : summary.rows
              .filter((row): row is PlaneacionMensualFila & { supervisorId: string } =>
                Boolean(row.supervisorId)
              )
              .map((row) => ({
                id: row.supervisorId,
                label: row.supervisorNombre ?? 'Sin supervisor',
              }))
      ).sort((left, right) => left.label.localeCompare(right.label, 'es')),
    [summary.rows, summary.supervisoresDisponibles]
  );

  const employeeOptions = useMemo(
    () =>
      uniqueOptions(
        summary.empleadosDisponibles.length > 0
          ? summary.empleadosDisponibles
          : summary.rows
              .filter((row): row is PlaneacionMensualFila & { empleadoId: string } =>
                Boolean(row.empleadoId)
              )
              .map((row) => ({
                id: row.empleadoId,
                label: `${row.empleadoNombre}${row.empleadoNomina ? ` · ${row.empleadoNomina}` : ''}`,
              }))
      ).sort((left, right) => left.label.localeCompare(right.label, 'es')),
    [summary.empleadosDisponibles, summary.rows]
  );

  const pdvOptions = useMemo(
    () =>
      uniqueOptions(
        summary.rows.map((row) => ({
          id: row.pdvId,
          label: `${row.pdvClave ?? 'S/C'} · ${row.pdvNombre}`,
        }))
      ).sort((left, right) => left.label.localeCompare(right.label, 'es')),
    [summary.rows]
  );

  const visibleRows = useMemo(
    () =>
      summary.rows.filter((row) => {
        const searchText = [
          row.cadenaNombre,
          row.pdvClave,
          row.pdvNombre,
          row.empleadoNombre,
          row.supervisorNombre,
          row.ciudadNombre,
          row.zona,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('es');
        return (
          (!deferredSearch || searchText.includes(deferredSearch)) &&
          (!chainId || row.cadenaId === chainId) &&
          (!supervisorId || row.supervisorId === supervisorId) &&
          (!rowState || row.segmentoTipo === rowState || row.pdvEstatus === rowState)
        );
      }),
    [chainId, deferredSearch, rowState, summary.rows, supervisorId]
  );

  const visiblePdvIds = useMemo(
    () => [...new Set(visibleRows.map((row) => row.pdvId))],
    [visibleRows]
  );
  const allVisiblePdvsSelected =
    visiblePdvIds.length > 0 && visiblePdvIds.every((pdvId) => selectedPdvIds.has(pdvId));
  const selectedVisibleCount = visiblePdvIds.filter((pdvId) => selectedPdvIds.has(pdvId)).length;

  const monthDays = summary.rows[0]?.dias ?? [];
  const visiblePdvCount = new Set(visibleRows.map((row) => row.pdvId)).size;
  const vacancyCount = visibleRows.filter((row) => row.segmentoTipo === 'VACANTE').length;
  const workedDays = visibleRows.reduce((total, row) => total + row.diasLaborados, 0);
  const individualQuota = visibleRows.reduce((total, row) => total + row.cuotaIndividual, 0);
  const editableMonth = summary.mes.slice(0, 7) >= currentDateMx().slice(0, 7);
  const assignmentOperation =
    editor?.operation === 'ASIGNAR_DC' || editor?.operation === 'MOVER_DC';
  const rotationOperation = editor?.operation === 'CAMBIAR_ROTACION';
  const requiresDc = Boolean(
    editor &&
    [
      'ASIGNAR_DC',
      'LIBERAR_DC',
      'MOVER_DC',
      'CAMBIAR_DESCANSO',
      'CAMBIAR_HORARIO',
      'AGREGAR_EVENTO',
    ].includes(editor.operation)
  );
  const requiresOriginPdv = Boolean(
    editor &&
    [
      'LIBERAR_DC',
      'MOVER_DC',
      'CAMBIAR_DESCANSO',
      'CAMBIAR_HORARIO',
      'CAMBIAR_ESTADO_PDV',
    ].includes(editor.operation)
  );
  const requiresDestinationPdv = Boolean(
    editor && ['ASIGNAR_DC', 'MOVER_DC'].includes(editor.operation)
  );
  const supportsEffectiveEnd = Boolean(
    editor &&
    (editor.operation === 'AGREGAR_EVENTO' ||
      ['CAMBIAR_DESCANSO', 'CAMBIAR_HORARIO', 'CAMBIAR_ESTADO_PDV'].includes(editor.operation) ||
      (assignmentOperation && editor.naturaleza === 'COBERTURA_TEMPORAL'))
  );

  function scrollCalendarWindow(direction: -1 | 1) {
    calendarScrollRef.current?.scrollBy({
      left: direction * CALENDAR_WINDOW_DAYS * CALENDAR_DAY_COLUMN_PX,
      behavior: 'smooth',
    });
  }

  function startCalendarDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (!target.closest('[data-calendar-pan="true"]')) return;

    calendarDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    };
  }

  function moveCalendarDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = calendarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < CALENDAR_DRAG_THRESHOLD_PX) return;

    if (!drag.moved) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    drag.moved = true;
    event.preventDefault();
    event.currentTarget.style.cursor = 'grabbing';
    event.currentTarget.scrollLeft = drag.startScrollLeft - deltaX;
  }

  function finishCalendarDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = calendarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.moved) {
      suppressCalendarClickRef.current = true;
      window.setTimeout(() => {
        suppressCalendarClickRef.current = false;
      }, 0);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.style.cursor = '';
    calendarDragRef.current = null;
  }

  function togglePdvSelection(pdvId: string) {
    setSelectedPdvIds((current) => {
      const next = new Set(current);
      if (next.has(pdvId)) next.delete(pdvId);
      else if (next.size < MAX_BULK_PDVS) next.add(pdvId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedPdvIds((current) => {
      const next = new Set(current);
      if (allVisiblePdvsSelected) {
        visiblePdvIds.forEach((pdvId) => next.delete(pdvId));
        return next;
      }
      for (const pdvId of visiblePdvIds) {
        if (next.size >= MAX_BULK_PDVS) break;
        next.add(pdvId);
      }
      return next;
    });
  }

  function openBulkEditor(operation: PlaneacionMasivaPdvTipo) {
    const monthStart = summary.mes.slice(0, 10);
    const today = currentDateMx();
    setBulkEditor({
      operation,
      fechaInicio: today > monthStart ? today : monthStart,
      supervisorDestinoId: '',
      motivo: '',
    });
    setBulkActionState(EMPTY_ACTION_STATE);
    setBulkIssues([]);
    setBulkIdempotencyKey(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `planeacion-masiva-${Date.now()}`
    );
  }

  function closeBulkEditor() {
    setBulkEditor(null);
    setBulkActionState(EMPTY_ACTION_STATE);
    setBulkIssues([]);
  }

  function updateBulkEditor<K extends keyof BulkEditorState>(key: K, value: BulkEditorState[K]) {
    setBulkEditor((current) => (current ? { ...current, [key]: value } : current));
    setBulkActionState(EMPTY_ACTION_STATE);
    setBulkIssues([]);
  }

  function buildBulkOperations() {
    if (!bulkEditor) return { operations: [], issues: [] as PlaneacionMasivaPdvIssue[] };
    return buildPlaneacionMasivaPdvOperations({
      rows: summary.rows,
      pdvIds: selectedPdvIds,
      tipo: bulkEditor.operation,
      fechaInicio: bulkEditor.fechaInicio,
      motivo: bulkEditor.motivo,
      supervisorDestinoId: bulkEditor.supervisorDestinoId,
    });
  }

  function previewBulkChange() {
    if (!bulkEditor) return;
    const pending = buildBulkOperations();
    setBulkIssues(pending.issues);
    if (pending.issues.length > 0) return;
    setBulkPending(true);
    startTransition(async () => {
      try {
        const result = await previsualizarPlaneacionMensualAction({
          cuentaClienteId,
          mes: summary.mes,
          operaciones: pending.operations,
        });
        setBulkActionState(result);
      } finally {
        setBulkPending(false);
      }
    });
  }

  function applyBulkChange() {
    if (!bulkEditor || !bulkActionState.preview?.ok) return;
    const pending = buildBulkOperations();
    setBulkIssues(pending.issues);
    if (pending.issues.length > 0) return;
    setBulkPending(true);
    startTransition(async () => {
      try {
        const result = await aplicarPlaneacionMensualAction({
          cuentaClienteId,
          mes: summary.mes,
          idempotencyKey: bulkIdempotencyKey,
          versionBase: bulkActionState.version ?? summary.version,
          operaciones: pending.operations,
        });
        setBulkActionState(result);
        if (result.ok) {
          setSelectedPdvIds(new Set());
          router.refresh();
          window.setTimeout(closeBulkEditor, 250);
        }
      } finally {
        setBulkPending(false);
      }
    });
  }

  function navigateMonth(offset: number) {
    router.push(`/asignaciones?mes=${shiftMonth(summary.mes, offset)}`);
  }

  function closeModal() {
    requestSequence.current += 1;
    setSelectedCell(null);
    setDetail(null);
    setDetailError('');
    setEditorOpen(false);
    setEditor(null);
    setActionState(EMPTY_ACTION_STATE);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  async function openDetail(cell: SelectedCell, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelectedCell(cell);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    setEditorOpen(false);
    const sequence = ++requestSequence.current;

    try {
      const query = new URLSearchParams({
        cuentaClienteId,
        pdvId: cell.row.pdvId,
        fecha: cell.day[CELL_INDEX.fecha],
      });
      const response = await fetch(`/api/asignaciones/planeacion-mensual/dia?${query}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        data?: PlaneacionMensualDetalleDia;
        error?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? 'No fue posible abrir el detalle del día.');
      }
      if (sequence === requestSequence.current) setDetail(payload.data);
    } catch (error) {
      if (sequence === requestSequence.current) {
        setDetailError(error instanceof Error ? error.message : 'No fue posible abrir el detalle.');
      }
    } finally {
      if (sequence === requestSequence.current) setDetailLoading(false);
    }
  }

  function openMasterEditor(
    row: PlaneacionMensualFila,
    source: Exclude<SelectedCell['source'], 'DIA'>,
    trigger: HTMLButtonElement
  ) {
    const day = getRowAnchorDay(row);
    if (!day) return;

    const selection: SelectedCell = { row, day, source };
    triggerRef.current = trigger;
    setSelectedCell(selection);
    setDetail(null);
    setDetailError('');
    setDetailLoading(false);
    setEditor(getInitialEditorState(selection));
    setActionState(EMPTY_ACTION_STATE);
    setIdempotencyKey(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `planeacion-${Date.now()}`
    );
    setEditorOpen(true);
  }

  function openEditor() {
    if (!selectedCell) return;
    setEditor(getInitialEditorState(selectedCell));
    setActionState(EMPTY_ACTION_STATE);
    setIdempotencyKey(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `planeacion-${Date.now()}`
    );
    setEditorOpen(true);
  }

  function updateEditor<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((current) => (current ? { ...current, [key]: value } : current));
    setActionState(EMPTY_ACTION_STATE);
  }

  function findPdvRowAtDate(pdvId: string, fecha: string) {
    return (
      summary.rows.find(
        (row) =>
          row.pdvId === pdvId &&
          row.segmentoTipo === 'DC' &&
          row.rangoFechaInicio <= fecha &&
          row.rangoFechaFin >= fecha
      ) ?? summary.rows.find((row) => row.pdvId === pdvId)
    );
  }

  function findEmployeeAssignmentsOutsidePdvs(
    empleadoId: string,
    fecha: string,
    excludedPdvIds: Set<string>
  ) {
    if (!empleadoId) return [];
    return [
      ...new Map(
        summary.rows
          .filter(
            (row) =>
              row.empleadoId === empleadoId &&
              Boolean(row.asignacionId) &&
              !excludedPdvIds.has(row.pdvId) &&
              row.rangoFechaInicio <= fecha &&
              row.rangoFechaFin >= fecha
          )
          .map((row) => [row.asignacionId, row])
      ).values(),
    ];
  }

  function updateRotationMember(
    index: number,
    patch: Partial<PlaneacionRotacionMiembro>,
    hydratePdv = false
  ) {
    setEditor((current) => {
      if (!current) return current;
      const members = [...current.miembrosRotacion];
      const previous = members[index];
      if (!previous) return current;
      let next = { ...previous, ...patch };
      if (hydratePdv && patch.pdvId !== undefined) {
        const row = findPdvRowAtDate(patch.pdvId, current.fechaInicio);
        next = {
          ...next,
          empleadoId: row?.empleadoId ?? '',
          empleadoActualId: row?.empleadoId ?? '',
          asignacionActualId: row?.asignacionId ?? '',
          horarioReferencia: row?.horarioReferencia ?? next.horarioReferencia ?? 'TC',
        };
      }
      members[index] = next;
      return { ...current, miembrosRotacion: members };
    });
    setActionState(EMPTY_ACTION_STATE);
  }

  function updateRotationGroupSize(size: '2' | '3') {
    setEditor((current) => {
      if (!current) return current;
      const members = [...current.miembrosRotacion];
      if (size === '3' && members.length === 2) {
        members.push({
          slot: 'C',
          pdvId: '',
          empleadoId: '',
          empleadoActualId: '',
          asignacionActualId: '',
          diasLaborales: 'DOM',
          horarioReferencia: 'TC',
        });
      }
      return { ...current, grupoTamano: size, miembrosRotacion: members.slice(0, Number(size)) };
    });
    setActionState(EMPTY_ACTION_STATE);
  }

  function updateRotationType(type: 'FIJA' | 'ROTATIVA') {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        tipo: type,
        factorTiempo: type === 'ROTATIVA' ? '0.5' : '1',
        miembrosRotacion: current.miembrosRotacion.map((member, index) => ({
          ...member,
          diasLaborales:
            type === 'FIJA' && index === 0
              ? 'LUN-SAB'
              : getPlaneacionRotacionPatternDays(current.patronRotacion, member.slot) ||
                member.diasLaborales,
        })),
      };
    });
    setActionState(EMPTY_ACTION_STATE);
  }

  function updateEffectiveDate(fechaInicio: string) {
    setEditor((current) => {
      if (!current) return current;
      if (current.operation !== 'CAMBIAR_ROTACION') return { ...current, fechaInicio };
      return {
        ...current,
        fechaInicio,
        miembrosRotacion: current.miembrosRotacion.map((member) => {
          const row = findPdvRowAtDate(member.pdvId, fechaInicio);
          return {
            ...member,
            empleadoId: row?.empleadoId ?? member.empleadoId,
            empleadoActualId: row?.empleadoId ?? '',
            asignacionActualId: row?.asignacionId ?? '',
            horarioReferencia: row?.horarioReferencia ?? member.horarioReferencia,
          };
        }),
      };
    });
    setActionState(EMPTY_ACTION_STATE);
  }

  function applyRotationPattern(pattern: PlaneacionRotacionPatron) {
    setEditor((current) =>
      current
        ? {
            ...current,
            patronRotacion: pattern,
            miembrosRotacion: current.miembrosRotacion.map((member) => ({
              ...member,
              diasLaborales:
                getPlaneacionRotacionPatternDays(pattern, member.slot) || member.diasLaborales,
            })),
          }
        : current
    );
    setActionState(EMPTY_ACTION_STATE);
  }

  function buildPendingOperations() {
    if (!editor || !selectedCell) return { operations: [], issues: ['EDITOR_INCOMPLETO'] };
    if (!rotationOperation) {
      return { operations: [buildOperation(editor, selectedCell)], issues: [] as string[] };
    }
    const result = buildPlaneacionRotacionOperations({
      tipo: editor.tipo === 'ROTATIVA' ? 'ROTATIVA' : 'FIJA',
      fechaInicio: editor.fechaInicio,
      motivo: editor.motivo.trim(),
      members:
        editor.tipo === 'ROTATIVA'
          ? editor.miembrosRotacion.slice(0, Number(editor.grupoTamano))
          : editor.miembrosRotacion.slice(0, 1),
      additionalReleases: (() => {
        const activeMembers =
          editor.tipo === 'ROTATIVA'
            ? editor.miembrosRotacion.slice(0, Number(editor.grupoTamano))
            : editor.miembrosRotacion.slice(0, 1);
        const groupPdvIds = new Set(activeMembers.map((member) => member.pdvId).filter(Boolean));
        return activeMembers.flatMap((member) =>
          findEmployeeAssignmentsOutsidePdvs(
            member.empleadoId,
            editor.fechaInicio,
            groupPdvIds
          ).map((row) => ({
            pdvId: row.pdvId,
            empleadoId: member.empleadoId,
            asignacionId: row.asignacionId as string,
          }))
        );
      })(),
    });
    return { operations: result.operations, issues: result.issues.map((issue) => issue.code) };
  }

  function previewChange() {
    if (!editor || !selectedCell) return;
    const pending = buildPendingOperations();
    if (pending.issues.length > 0) {
      setActionState({
        ...EMPTY_ACTION_STATE,
        message: `Corrige la configuración del grupo: ${[...new Set(pending.issues)].join(', ')}.`,
      });
      return;
    }
    setActionPending(true);
    startTransition(async () => {
      try {
        const result = await previsualizarPlaneacionMensualAction({
          cuentaClienteId,
          mes: summary.mes,
          operaciones: pending.operations,
        });
        setActionState(result);
      } finally {
        setActionPending(false);
      }
    });
  }

  function applyChange() {
    if (!editor || !selectedCell || !actionState.preview?.ok) return;
    const pending = buildPendingOperations();
    if (pending.issues.length > 0) return;
    setActionPending(true);
    startTransition(async () => {
      try {
        const result = await aplicarPlaneacionMensualAction({
          cuentaClienteId,
          mes: summary.mes,
          idempotencyKey,
          versionBase: actionState.version ?? summary.version,
          operaciones: pending.operations,
        });
        setActionState(result);
        if (result.ok) {
          router.refresh();
          window.setTimeout(closeModal, 250);
        }
      } finally {
        setActionPending(false);
      }
    });
  }

  return (
    <div className="space-y-3" data-testid="planeacion-mensual">
      <Card className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-100 bg-gradient-to-r from-teal-50 via-white to-sky-50 px-4 py-3 sm:px-5 xl:py-2">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
            <div className="min-w-0 xl:flex xl:items-baseline xl:gap-3">
              <div className="shrink-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-teal-700 xl:hidden">
                  Nodo central de asignaciones
                </p>
                <h1 className="mt-1 text-xl font-bold leading-6 text-slate-950 xl:mt-0">
                  Planeación mensual
                </h1>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 xl:mt-0 xl:truncate">
                Consulta la cobertura diaria, abre cualquier celda y programa movimientos efectivos
                sin romper la regla de una DC por sitio y día.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {puedeEditar && editableMonth ? (
                <PlaneacionCuotaImportButton cuentaClienteId={cuentaClienteId} mes={summary.mes} />
              ) : null}
              <Link
                href="/asignaciones/asignaciones"
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-teal-100 xl:min-h-8 xl:text-[11px]"
              >
                Gestión avanzada
              </Link>
              <Link
                href="/asignaciones/horarios"
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-teal-100 xl:min-h-8 xl:text-[11px]"
              >
                Horarios
              </Link>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.refresh()}
                className="xl:min-h-8 xl:px-3 xl:text-[11px]"
              >
                <ArrowClockwise className="h-4 w-4" aria-hidden="true" />
                Recargar
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 sm:px-5">
          <div className="grid gap-2 xl:grid-cols-[200px_460px_minmax(0,1fr)] xl:items-center">
            <div>
              <div className="flex items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:justify-start">
                <button
                  type="button"
                  onClick={() => navigateMonth(-1)}
                  aria-label="Mes anterior"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-teal-100 xl:h-8 xl:w-8"
                >
                  <ArrowLeft className="h-5 w-5 xl:h-4 xl:w-4" aria-hidden="true" />
                </button>
                <p className="min-w-32 flex-1 text-center text-xs font-bold capitalize text-slate-900">
                  {formatMonth(summary.mes)}
                </p>
                <button
                  type="button"
                  onClick={() => navigateMonth(1)}
                  aria-label="Mes siguiente"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-teal-100 xl:h-8 xl:w-8"
                >
                  <ArrowRight className="h-5 w-5 xl:h-4 xl:w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 truncate text-[9px] text-slate-500">
                {visibleRows.length} de {summary.total} filas · versión {summary.version}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-4">
              <SummaryMetric
                label="PDVs visibles"
                value={String(visiblePdvCount)}
                icon={<Storefront className="h-5 w-5" aria-hidden="true" />}
                tone="bg-teal-100 text-teal-700"
              />
              <SummaryMetric
                label="Por cubrir"
                value={String(vacancyCount)}
                icon={<WarningCircle className="h-5 w-5" aria-hidden="true" />}
                tone="bg-orange-100 text-orange-700"
              />
              <SummaryMetric
                label="Días laborados"
                value={workedDays.toLocaleString('es-MX')}
                icon={<CalendarDots className="h-5 w-5" aria-hidden="true" />}
                tone="bg-sky-100 text-sky-700"
              />
              <SummaryMetric
                label="Cuota"
                value={formatMoney(individualQuota)}
                icon={<UsersThree className="h-5 w-5" aria-hidden="true" />}
                tone="bg-violet-100 text-violet-700"
              />
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1.1fr_0.72fr]">
              <label className="relative block">
                <span className="sr-only">Buscar en la planeación</span>
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400 xl:top-2.5"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar cadena, tienda, DC..."
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100 xl:min-h-9 xl:text-xs"
                />
              </label>
              <label className="relative block">
                <span className="sr-only">Filtrar por cadena</span>
                <select
                  value={chainId}
                  onChange={(event) => setChainId(event.target.value)}
                  className="min-h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-9 text-sm text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 xl:min-h-9 xl:text-xs"
                >
                  <option value="">Todas las cadenas</option>
                  {chainOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <CaretDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400 xl:top-2.5" />
              </label>
              <label className="relative block">
                <span className="sr-only">Filtrar por supervisor</span>
                <select
                  value={supervisorId}
                  onChange={(event) => setSupervisorId(event.target.value)}
                  className="min-h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-9 text-sm text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 xl:min-h-9 xl:text-xs"
                >
                  <option value="">Todos los supervisores</option>
                  {supervisorOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <CaretDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400 xl:top-2.5" />
              </label>
              <label className="relative block">
                <span className="sr-only">Filtrar por estado</span>
                <select
                  value={rowState}
                  onChange={(event) => setRowState(event.target.value)}
                  className="min-h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-9 text-sm text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 xl:min-h-9 xl:text-xs"
                >
                  <option value="">Todos</option>
                  <option value="DC">Con DC</option>
                  <option value="VACANTE">Por cubrir</option>
                  <option value="ACTIVO">PDV activo</option>
                  <option value="PAUSADO">PDV pausado</option>
                  <option value="INACTIVO">PDV inactivo</option>
                </select>
                <CaretDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400 xl:top-2.5" />
              </label>
            </div>
          </div>

          <p className="mt-1.5 text-[10px] text-slate-500 xl:hidden">
            Desliza horizontalmente para recorrer el mes.
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        {puedeEditar && editableMonth && selectedPdvIds.size > 0 ? (
          <div
            className="flex flex-col gap-2 border-b border-teal-100 bg-teal-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            data-testid="planeacion-seleccion-masiva"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-teal-950">
                {selectedPdvIds.size} PDV{selectedPdvIds.size === 1 ? '' : 's'} seleccionado
                {selectedPdvIds.size === 1 ? '' : 's'}
              </p>
              <p className="text-[10px] text-teal-800">
                {selectedVisibleCount} visibles con los filtros actuales · máximo {MAX_BULK_PDVS}{' '}
                por lote
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => openBulkEditor('LIBERAR_DCS')}
                className="min-h-10 bg-white text-xs xl:min-h-8"
              >
                Liberar DCs
              </Button>
              <Button
                type="button"
                onClick={() => openBulkEditor('REASIGNAR_SUPERVISOR')}
                className="min-h-10 text-xs xl:min-h-8"
              >
                Asignar supervisor
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedPdvIds(new Set())}
                className="min-h-10 text-xs xl:min-h-8"
              >
                Limpiar
              </Button>
            </div>
          </div>
        ) : null}
        {visibleRows.length > 0 && monthDays.length > 0 ? (
          <div>
            <div className="flex min-h-10 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-3 py-1.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-800">Ventana de 14 días</p>
                <p className="hidden truncate text-[10px] text-slate-500 sm:block">
                  Arrastra sobre el calendario para recorrer el mes; un clic abre el día.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => scrollCalendarWindow(-1)}
                  aria-label="Mostrar las dos semanas anteriores"
                  className="min-h-10 gap-1 bg-white px-2 text-[11px] xl:min-h-8"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">2 semanas</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => scrollCalendarWindow(1)}
                  aria-label="Mostrar las dos semanas siguientes"
                  className="min-h-10 gap-1 bg-white px-2 text-[11px] xl:min-h-8"
                >
                  <span className="hidden sm:inline">2 semanas</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div
              ref={calendarScrollRef}
              className="max-h-[calc(100vh-14.5rem)] overflow-auto overscroll-contain"
              data-testid="planeacion-scroll"
              onPointerDown={startCalendarDrag}
              onPointerMove={moveCalendarDrag}
              onPointerUp={finishCalendarDrag}
              onPointerCancel={finishCalendarDrag}
              onClickCapture={(event) => {
                if (!suppressCalendarClickRef.current) return;
                event.preventDefault();
                event.stopPropagation();
                suppressCalendarClickRef.current = false;
              }}
            >
              <table className="w-max min-w-full border-separate border-spacing-0 text-left text-[11px] xl:text-[10px]">
                <thead className="sticky top-0 z-40 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 xl:text-[9px] xl:tracking-[0.04em]">
                  <tr>
                    <th className="z-50 min-w-28 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 lg:sticky lg:left-0 xl:w-[105px] xl:min-w-[105px] xl:max-w-[105px] xl:px-2 xl:py-2">
                      <span className="flex items-center gap-1.5">
                        {puedeEditar && editableMonth ? (
                          <input
                            type="checkbox"
                            checked={allVisiblePdvsSelected}
                            onChange={toggleVisibleSelection}
                            aria-label="Seleccionar todos los PDVs visibles"
                            className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                        ) : null}
                        <span className="truncate">Cadena</span>
                      </span>
                    </th>
                    <th className="z-50 min-w-52 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 lg:sticky lg:left-28 xl:left-[105px] xl:w-[170px] xl:min-w-[170px] xl:max-w-[170px] xl:px-2 xl:py-2">
                      Tienda
                    </th>
                    <th className="z-50 min-w-20 border-b border-r border-slate-200 bg-slate-50 px-2 py-3 text-center lg:sticky lg:left-[320px] xl:left-[275px] xl:w-[70px] xl:min-w-[70px] xl:max-w-[70px] xl:px-1.5 xl:py-2">
                      Rol
                    </th>
                    <th className="z-50 min-w-52 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 lg:sticky lg:left-[400px] xl:left-[345px] xl:w-[170px] xl:min-w-[170px] xl:max-w-[170px] xl:px-2 xl:py-2">
                      Dermoconsejera
                    </th>
                    <th className="z-50 min-w-28 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 lg:sticky lg:left-[608px] xl:left-[515px] xl:w-[85px] xl:min-w-[85px] xl:max-w-[85px] xl:px-2 xl:py-2">
                      Vigencia
                    </th>
                    <th className="z-50 min-w-28 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 lg:sticky lg:left-[720px] xl:left-[600px] xl:w-[105px] xl:min-w-[105px] xl:max-w-[105px] xl:px-2 xl:py-2">
                      Turno / descanso
                    </th>
                    <th className="z-50 min-w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 shadow-[6px_0_10px_-8px_rgba(15,23,42,0.5)] lg:sticky lg:left-[832px] xl:left-[705px] xl:w-[145px] xl:min-w-[145px] xl:max-w-[145px] xl:px-2 xl:py-2">
                      Supervisor
                    </th>
                    {monthDays.map((day) => {
                      const fecha = day[CELL_INDEX.fecha];
                      const isMonday = getWeekdayLetter(fecha) === 'L';
                      return (
                        <th
                          key={fecha}
                          data-calendar-pan="true"
                          className={`min-w-12 cursor-grab select-none border-b border-slate-200 px-1 py-2 text-center xl:w-11 xl:min-w-11 xl:max-w-11 xl:px-0 xl:py-1.5 ${isMonday ? 'border-l-2 border-l-teal-200' : ''}`}
                        >
                          <span className="block text-[9px] text-slate-400 xl:text-[8px]">
                            {getWeekdayLetter(fecha)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-800 xl:mt-0 xl:text-[10px]">
                            {Number(fecha.slice(-2))}
                          </span>
                        </th>
                      );
                    })}
                    <th className="z-50 min-w-20 border-b border-l border-slate-200 bg-slate-50 px-2 py-3 text-center shadow-[-6px_0_10px_-8px_rgba(15,23,42,0.5)] lg:sticky lg:right-48 xl:right-[164px] xl:w-14 xl:min-w-14 xl:max-w-14 xl:px-1 xl:py-2">
                      # Lab.
                    </th>
                    <th className="z-50 min-w-24 border-b border-slate-200 bg-slate-50 px-2 py-3 text-right lg:sticky lg:right-24 xl:right-[82px] xl:w-[82px] xl:min-w-[82px] xl:max-w-[82px] xl:px-1.5 xl:py-2">
                      Cuota PDV
                    </th>
                    <th className="z-50 min-w-24 border-b border-slate-200 bg-slate-50 px-2 py-3 text-right lg:sticky lg:right-0 xl:w-[82px] xl:min-w-[82px] xl:max-w-[82px] xl:px-1.5 xl:py-2">
                      Cuota DC
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={`${row.pdvId}-${row.segmentoClave}`}
                      className="group align-middle hover:bg-slate-50/70"
                      style={ROW_STYLE}
                    >
                      <td className="z-20 border-b border-r border-slate-100 bg-white px-3 py-2 font-semibold text-slate-700 group-hover:bg-slate-50 lg:sticky lg:left-0 xl:w-[105px] xl:min-w-[105px] xl:max-w-[105px] xl:px-2 xl:py-1.5">
                        <span className="flex items-center gap-1.5">
                          {puedeEditar && editableMonth ? (
                            <input
                              type="checkbox"
                              checked={selectedPdvIds.has(row.pdvId)}
                              onChange={() => togglePdvSelection(row.pdvId)}
                              disabled={
                                !selectedPdvIds.has(row.pdvId) &&
                                selectedPdvIds.size >= MAX_BULK_PDVS
                              }
                              aria-label={`Seleccionar PDV ${row.pdvNombre}`}
                              data-testid="seleccionar-pdv"
                              className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
                            />
                          ) : null}
                          <span
                            className="block max-w-24 truncate xl:max-w-[75px]"
                            title={row.cadenaNombre ?? ''}
                          >
                            {row.cadenaNombre ?? 'Sin cadena'}
                          </span>
                        </span>
                      </td>
                      <td className="z-20 border-b border-r border-slate-100 bg-white px-3 py-2 group-hover:bg-slate-50 lg:sticky lg:left-28 xl:left-[105px] xl:w-[170px] xl:min-w-[170px] xl:max-w-[170px] xl:px-2 xl:py-1.5">
                        <button
                          type="button"
                          disabled={!puedeEditar || !editableMonth}
                          onClick={(event) => openMasterEditor(row, 'PDV', event.currentTarget)}
                          className="group/master block w-full rounded-lg text-left focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-default disabled:ring-0"
                          aria-label={`Editar asignación maestra de ${row.pdvNombre}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className="max-w-44 truncate font-bold text-slate-950 xl:max-w-[142px] xl:text-[10px]"
                              title={row.pdvNombre}
                            >
                              {row.pdvNombre}
                            </span>
                            {puedeEditar && editableMonth ? (
                              <PencilSimple className="h-3.5 w-3.5 shrink-0 text-teal-600 opacity-0 transition group-hover/master:opacity-100 group-focus/master:opacity-100" />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block max-w-52 truncate text-[10px] text-slate-500 xl:max-w-[154px] xl:text-[9px]">
                            <span data-testid="planeacion-pdv-meta">
                              {row.pdvClave ?? 'Sin clave'} ·{' '}
                              {row.ciudadNombre ?? row.zona ?? 'Sin ciudad'}
                            </span>
                          </span>
                        </button>
                        {row.pdvEstatus && row.pdvEstatus !== 'ACTIVO' ? (
                          <span
                            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${
                              row.pdvEstatus === 'PAUSADO'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {row.pdvEstatus === 'PAUSADO' ? 'PDV pausado' : 'PDV inactivo'}
                          </span>
                        ) : null}
                      </td>
                      <td className="z-20 border-b border-r border-slate-100 bg-white px-2 py-2 text-center group-hover:bg-slate-50 lg:sticky lg:left-[320px] xl:left-[275px] xl:w-[70px] xl:min-w-[70px] xl:max-w-[70px] xl:px-1 xl:py-1.5">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 xl:px-1.5 xl:py-0.5 xl:text-[10px]">
                          {row.factorTiempo}
                        </span>
                        <span className="mt-1 block truncate text-[9px] text-slate-400 xl:mt-0.5 xl:text-[8px]">
                          {row.rol}
                        </span>
                      </td>
                      <td className="z-20 border-b border-r border-slate-100 bg-white px-3 py-2 group-hover:bg-slate-50 lg:sticky lg:left-[400px] xl:left-[345px] xl:w-[170px] xl:min-w-[170px] xl:max-w-[170px] xl:px-2 xl:py-1.5">
                        <button
                          type="button"
                          disabled={!puedeEditar || !editableMonth}
                          onClick={(event) => openMasterEditor(row, 'DC', event.currentTarget)}
                          className="group/master block w-full rounded-lg text-left focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-default disabled:ring-0"
                          aria-label={`Editar asignación maestra de ${row.empleadoNombre}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`max-w-44 truncate font-bold xl:max-w-[142px] xl:text-[10px] ${row.segmentoTipo === 'VACANTE' ? 'text-orange-700' : 'text-slate-950'}`}
                              title={row.empleadoNombre}
                            >
                              {row.empleadoNombre}
                            </span>
                            {puedeEditar && editableMonth ? (
                              <PencilSimple className="h-3.5 w-3.5 shrink-0 text-teal-600 opacity-0 transition group-hover/master:opacity-100 group-focus/master:opacity-100" />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block max-w-52 truncate text-[10px] text-slate-500 xl:max-w-[154px] xl:text-[9px]">
                            {row.empleadoNomina ?? row.naturaleza}
                          </span>
                        </button>
                      </td>
                      <td className="z-20 border-b border-r border-slate-100 bg-white px-3 py-2 text-[10px] text-slate-600 group-hover:bg-slate-50 lg:sticky lg:left-[608px] xl:left-[515px] xl:w-[85px] xl:min-w-[85px] xl:max-w-[85px] xl:px-2 xl:py-1.5 xl:text-[9px]">
                        {formatDate(row.rangoFechaInicio)}
                        <span className="block">a {formatDate(row.rangoFechaFin)}</span>
                      </td>
                      <td className="z-20 border-b border-r border-slate-100 bg-white px-3 py-2 text-[10px] text-slate-600 group-hover:bg-slate-50 lg:sticky lg:left-[720px] xl:left-[600px] xl:w-[105px] xl:min-w-[105px] xl:max-w-[105px] xl:px-2 xl:py-1.5 xl:text-[9px]">
                        <span className="font-bold text-slate-800">
                          {row.horarioReferencia ??
                            (row.segmentoTipo === 'VACANTE' ? 'VC' : 'Sin turno')}
                        </span>
                        <span className="mt-0.5 block">Desc. {row.diaDescanso ?? 'variable'}</span>
                      </td>
                      <td className="z-20 border-b border-r border-slate-100 bg-white px-3 py-2 text-[10px] text-slate-600 shadow-[6px_0_10px_-8px_rgba(15,23,42,0.5)] group-hover:bg-slate-50 lg:sticky lg:left-[832px] xl:left-[705px] xl:w-[145px] xl:min-w-[145px] xl:max-w-[145px] xl:px-2 xl:py-1.5 xl:text-[9px]">
                        <button
                          type="button"
                          disabled={!puedeEditar || !editableMonth || !row.supervisorId}
                          onClick={(event) =>
                            openMasterEditor(row, 'SUPERVISOR', event.currentTarget)
                          }
                          className="group/master flex w-full items-center gap-1.5 rounded-lg text-left focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-default disabled:ring-0"
                          aria-label={`Editar responsabilidad de ${row.supervisorNombre ?? 'supervisor sin asignar'}`}
                        >
                          <span
                            className="max-w-36 truncate xl:max-w-[118px]"
                            title={row.supervisorNombre ?? ''}
                          >
                            {row.supervisorNombre ?? 'Sin supervisor'}
                          </span>
                          {puedeEditar && editableMonth && row.supervisorId ? (
                            <PencilSimple className="h-3.5 w-3.5 shrink-0 text-teal-600 opacity-0 transition group-hover/master:opacity-100 group-focus/master:opacity-100" />
                          ) : null}
                        </button>
                      </td>
                      {row.dias.map((day) => {
                        const fecha = day[CELL_INDEX.fecha];
                        const code = day[CELL_INDEX.codigo];
                        const turn =
                          day[CELL_INDEX.turnoCodigo] ??
                          (code === 'PC' ? 'VC' : row.horarioReferencia);
                        const isMonday = getWeekdayLetter(fecha) === 'L';
                        return (
                          <td
                            key={`${row.segmentoClave}-${fecha}`}
                            className={`min-w-12 border-b border-slate-100 p-1 xl:w-11 xl:min-w-11 xl:max-w-11 xl:p-1 ${isMonday ? 'border-l-2 border-l-teal-100' : ''}`}
                          >
                            <button
                              type="button"
                              data-testid="planeacion-dia"
                              data-calendar-pan="true"
                              onClick={(event) =>
                                openDetail({ row, day, source: 'DIA' }, event.currentTarget)
                              }
                              aria-label={`${row.empleadoNombre}, ${row.pdvNombre}, ${fecha}: ${CODE_LABELS[code]}${turn ? `, turno ${turn}` : ''}`}
                              className={`relative flex h-11 w-11 cursor-grab select-none flex-col items-center justify-center rounded-lg border text-[10px] font-extrabold leading-none transition focus:outline-none focus:ring-4 focus:ring-teal-200 lg:h-9 lg:w-11 xl:h-9 xl:w-9 xl:rounded-md xl:text-[9px] xl:focus:ring-2 ${CODE_TONES[code]}`}
                            >
                              <span>{code}</span>
                              {turn && code !== 'D' && code !== '—' ? (
                                <span className="mt-1 flex max-w-10 items-center gap-1 truncate text-[7px] font-bold opacity-80 xl:mt-0.5 xl:max-w-8 xl:gap-0.5 xl:text-[7px]">
                                  <span
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full xl:h-1 xl:w-1 ${turnDotClass(turn)}`}
                                  />
                                  {turn}
                                </span>
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                      <td className="z-20 border-b border-l border-slate-100 bg-white px-2 py-2 text-center font-bold text-slate-800 shadow-[-6px_0_10px_-8px_rgba(15,23,42,0.5)] group-hover:bg-slate-50 lg:sticky lg:right-48 xl:right-[164px] xl:w-14 xl:min-w-14 xl:max-w-14 xl:px-1 xl:py-1.5 xl:text-[10px]">
                        {row.diasLaborados}
                      </td>
                      <td className="z-20 border-b border-slate-100 bg-white px-2 py-2 text-right font-semibold text-slate-700 group-hover:bg-slate-50 lg:sticky lg:right-24 xl:right-[82px] xl:w-[82px] xl:min-w-[82px] xl:max-w-[82px] xl:px-1.5 xl:py-1.5 xl:text-[9px]">
                        {formatMoney(row.cuotaMensual)}
                      </td>
                      <td className="z-20 border-b border-slate-100 bg-white px-2 py-2 text-right font-bold text-teal-700 group-hover:bg-slate-50 lg:sticky lg:right-0 xl:w-[82px] xl:min-w-[82px] xl:max-w-[82px] xl:px-1.5 xl:py-1.5 xl:text-[9px]">
                        {formatMoney(row.cuotaIndividual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="px-5 py-16 text-center">
            <Storefront className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="mt-4 text-sm font-bold text-slate-900">Sin filas para estos filtros</p>
            <p className="mt-1 text-sm text-slate-500">
              Limpia la búsqueda o selecciona otro mes para consultar la planeación.
            </p>
          </div>
        )}

        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {(['1', 'D', 'COV', 'FOR', 'I', 'IS', 'VAC', 'JUS', 'SIN', 'PC'] as const).map(
              (code) => (
                <LegendPill key={code} code={code} />
              )
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
            {Object.entries(TURN_TONES).map(([turn, tone]) => (
              <span key={turn} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${tone}`} />
                {turn}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-teal-600" />
              HH:MM-HH:MM
            </span>
          </div>
        </div>
      </Card>

      <ModalPanel
        open={Boolean(selectedCell)}
        onClose={closeModal}
        title={
          editorOpen
            ? 'Editar asignación efectiva'
            : `${selectedCell?.row.pdvNombre ?? 'Detalle diario'}`
        }
        subtitle={
          selectedCell
            ? `${getSelectionLabel(selectedCell.source)} · ${formatDate(selectedCell.day[CELL_INDEX.fecha])} · ${selectedCell.row.cadenaNombre ?? 'Sin cadena'}`
            : null
        }
        maxWidthClassName={editorOpen ? 'max-w-4xl' : 'max-w-3xl'}
      >
        {editorOpen && editor && selectedCell ? (
          <div className="space-y-5" data-testid="planeacion-editor">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              La asignación vigente se hereda automáticamente en los meses posteriores. Este cambio
              creará una nueva versión desde la fecha efectiva; si no indicas fin, continuará hasta
              que publiques otro cambio. Primero se valida el impacto y después se habilita la
              confirmación transaccional.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Operación
                <select
                  value={editor.operation}
                  onChange={(event) =>
                    updateEditor('operation', event.target.value as PlaneacionMensualTipoOperacion)
                  }
                  className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                >
                  <option value="ASIGNAR_DC">Asignar DC</option>
                  <option value="LIBERAR_DC">Liberar DC</option>
                  <option value="MOVER_DC">Mover DC</option>
                  <option value="CAMBIAR_ROTACION">Cambiar rotación del PDV</option>
                  <option value="CAMBIAR_DESCANSO">Cambiar descanso</option>
                  <option value="CAMBIAR_HORARIO">Cambiar horario</option>
                  <option value="CAMBIAR_ESTADO_PDV">Pausar, activar o inactivar PDV</option>
                  <option value="AGREGAR_EVENTO">Agregar evento independiente</option>
                  <option value="REASIGNAR_SUPERVISOR">Sustituir supervisor</option>
                </select>
              </label>
              {requiresDc ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Dermoconsejera
                  <select
                    value={editor.empleadoId}
                    onChange={(event) => updateEditor('empleadoId', event.target.value)}
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  >
                    <option value="">Selecciona una DC</option>
                    {employeeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {requiresOriginPdv ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  PDV origen
                  <select
                    value={editor.pdvOrigenId}
                    onChange={(event) => updateEditor('pdvOrigenId', event.target.value)}
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  >
                    <option value="">Selecciona origen</option>
                    {pdvOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {requiresDestinationPdv ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  PDV destino
                  <select
                    value={editor.pdvDestinoId}
                    onChange={(event) => updateEditor('pdvDestinoId', event.target.value)}
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  >
                    <option value="">Selecciona destino</option>
                    {pdvOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Inicio de la nueva vigencia
                <input
                  type="date"
                  min={currentDateMx()}
                  max={monthDays.at(-1)?.[CELL_INDEX.fecha]}
                  value={editor.fechaInicio}
                  onChange={(event) => updateEffectiveDate(event.target.value)}
                  className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                />
              </label>
              {assignmentOperation ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Naturaleza
                  <select
                    value={editor.naturaleza}
                    onChange={(event) =>
                      updateEditor('naturaleza', event.target.value as PlaneacionMensualNaturaleza)
                    }
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  >
                    <option value="BASE">Definitiva / base</option>
                    <option value="COBERTURA_PERMANENTE">Cobertura permanente</option>
                    <option value="COBERTURA_TEMPORAL">Cobertura temporal</option>
                  </select>
                </label>
              ) : null}
              {supportsEffectiveEnd ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  {editor.operation === 'AGREGAR_EVENTO' ? 'Fin del evento' : 'Fin (opcional)'}
                  <input
                    type="date"
                    min={editor.fechaInicio}
                    value={editor.fechaFin}
                    onChange={(event) => updateEditor('fechaFin', event.target.value)}
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                  <span className="text-xs font-normal text-slate-500">
                    Déjalo vacío para mantener la versión hasta el siguiente cambio.
                  </span>
                </label>
              ) : null}
              {assignmentOperation ? (
                <>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Rol
                    <select
                      value={editor.tipo}
                      onChange={(event) =>
                        updateEditor('tipo', event.target.value as EditorState['tipo'])
                      }
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    >
                      <option value="FIJA">Fija</option>
                      <option value="ROTATIVA">Rotativa</option>
                      <option value="COBERTURA">Cobertura</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Factor
                    <select
                      value={editor.factorTiempo}
                      onChange={(event) => updateEditor('factorTiempo', event.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    >
                      <option value="1">1.0 · Fija</option>
                      <option value="0.5">0.5 · Rotativa</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Turno o rango directo
                    <input
                      value={editor.horarioReferencia}
                      onChange={(event) => updateEditor('horarioReferencia', event.target.value)}
                      placeholder="TC o 09:00-18:00"
                      list="planeacion-turnos"
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Descanso recurrente
                    <select
                      value={editor.diaDescanso}
                      onChange={(event) => updateEditor('diaDescanso', event.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    >
                      <option value="DOM">Domingo (DOM)</option>
                      <option value="LUN">Lunes (LUN)</option>
                      <option value="MAR">Martes (MAR)</option>
                      <option value="MIE">Miércoles (MIE)</option>
                      <option value="JUE">Jueves (JUE)</option>
                      <option value="VIE">Viernes (VIE)</option>
                      <option value="SAB">Sábado (SAB)</option>
                    </select>
                  </label>
                </>
              ) : null}
              <datalist id="planeacion-turnos">
                {['M', 'TCM', 'TC', 'TC_12', 'TCV', 'V1', 'V', 'ES1/ACT', 'CAP', 'VC'].map(
                  (turn) => (
                    <option key={turn} value={turn} />
                  )
                )}
              </datalist>
              {editor.operation === 'CAMBIAR_ROTACION' ? (
                <div className="space-y-4 sm:col-span-2" data-testid="rotacion-pdv-editor">
                  <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
                    <p className="font-bold text-teal-950">Configuración maestra del PDV</p>
                    <p className="mt-1 text-xs leading-5 text-teal-800">
                      La vigencia comienza en la fecha indicada y continúa hasta el siguiente
                      cambio. El supervisor se hereda del PDV; la DC, los días y el turno se
                      resuelven desde esta configuración para calendario, asistencia, cuota y app
                      móvil.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Nueva naturaleza
                      <select
                        value={editor.tipo === 'ROTATIVA' ? 'ROTATIVA' : 'FIJA'}
                        onChange={(event) =>
                          updateRotationType(event.target.value as 'FIJA' | 'ROTATIVA')
                        }
                        className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                      >
                        <option value="FIJA">Fija · 1.0</option>
                        <option value="ROTATIVA">Rotativa · 0.5</option>
                      </select>
                    </label>
                    {editor.tipo === 'ROTATIVA' ? (
                      <>
                        <label className="grid gap-2 text-sm font-semibold text-slate-700">
                          PDVs en el grupo
                          <select
                            value={editor.grupoTamano}
                            onChange={(event) =>
                              updateRotationGroupSize(event.target.value as '2' | '3')
                            }
                            className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                          >
                            <option value="2">2 PDVs</option>
                            <option value="3">3 PDVs</option>
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm font-semibold text-slate-700">
                          Patrón semanal
                          <select
                            value={editor.patronRotacion}
                            onChange={(event) =>
                              applyRotationPattern(event.target.value as PlaneacionRotacionPatron)
                            }
                            className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                          >
                            <option value="LMX_JVS">A: L-M-X · B: J-V-S</option>
                            <option value="JVS_LMX">A: J-V-S · B: L-M-X</option>
                            <option value="PERSONALIZADA">Personalizado</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {(editor.tipo === 'ROTATIVA'
                      ? editor.miembrosRotacion.slice(0, Number(editor.grupoTamano))
                      : editor.miembrosRotacion.slice(0, 1)
                    ).map((member, index) => {
                      const pdvRow = findPdvRowAtDate(member.pdvId, editor.fechaInicio);
                      const selectedPdvIds = new Set(
                        editor.miembrosRotacion.map((item) => item.pdvId).filter(Boolean)
                      );
                      const externalAssignments = findEmployeeAssignmentsOutsidePdvs(
                        member.empleadoId,
                        editor.fechaInicio,
                        selectedPdvIds
                      );
                      return (
                        <div
                          key={member.slot}
                          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-extrabold text-slate-950">
                              PDV {member.slot}
                            </p>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                              {editor.tipo === 'ROTATIVA' ? 'Factor 0.5' : 'Factor 1.0'}
                            </span>
                          </div>
                          <div className="mt-4 grid gap-3">
                            <label className="grid gap-2 text-xs font-semibold text-slate-700">
                              {index === 0 ? 'Punto de venta base' : 'Punto de venta que rota'}
                              <select
                                aria-label={`Punto de venta ${member.slot}`}
                                value={member.pdvId}
                                disabled={index === 0}
                                onChange={(event) =>
                                  updateRotationMember(index, { pdvId: event.target.value }, true)
                                }
                                className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 disabled:text-slate-600"
                              >
                                <option value="">Selecciona el PDV</option>
                                {pdvOptions.map((option) => (
                                  <option
                                    key={option.id}
                                    value={option.id}
                                    disabled={
                                      option.id !== member.pdvId && selectedPdvIds.has(option.id)
                                    }
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {externalAssignments.length > 0 ? (
                              <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">
                                Movimiento maestro: al confirmar se liberará esta DC de{' '}
                                <strong>
                                  {externalAssignments.map((row) => row.pdvNombre).join(', ')}
                                </strong>{' '}
                                desde la misma fecha; esos PDVs quedarán Por cubrir si no reciben
                                otra DC.
                              </div>
                            ) : null}
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              Supervisor efectivo:{' '}
                              <strong className="text-slate-900">
                                {pdvRow?.supervisorNombre ?? 'Sin supervisor asignado'}
                              </strong>
                            </div>
                            <label className="grid gap-2 text-xs font-semibold text-slate-700">
                              Dermoconsejera del PDV {member.slot}
                              <select
                                value={member.empleadoId}
                                onChange={(event) =>
                                  updateRotationMember(index, { empleadoId: event.target.value })
                                }
                                className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                              >
                                <option value="">Por cubrir</option>
                                {employeeOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-2 text-xs font-semibold text-slate-700">
                              Días laborados del PDV {member.slot}
                              <input
                                value={member.diasLaborales}
                                onChange={(event) =>
                                  updateRotationMember(index, {
                                    diasLaborales: event.target.value,
                                  })
                                }
                                placeholder="LUN,MAR,MIE"
                                className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                              />
                            </label>
                            <label className="grid gap-2 text-xs font-semibold text-slate-700">
                              Turno del PDV {member.slot}
                              <input
                                value={member.horarioReferencia}
                                onChange={(event) =>
                                  updateRotationMember(index, {
                                    horarioReferencia: event.target.value,
                                  })
                                }
                                placeholder="TC o 09:00-18:00"
                                list="planeacion-turnos"
                                className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    Puedes usar la misma DC en varios PDVs únicamente cuando sus días no se
                    traslapen. Dejar una DC vacía convierte ese PDV en “Por cubrir” desde la fecha
                    efectiva.
                  </p>
                </div>
              ) : null}
              {editor.operation === 'CAMBIAR_HORARIO' ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Nuevo turno o rango directo
                  <input
                    value={editor.horarioReferencia}
                    onChange={(event) => updateEditor('horarioReferencia', event.target.value)}
                    placeholder="TC o 09:00-18:00"
                    list="planeacion-turnos"
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                </label>
              ) : null}
              {editor.operation === 'CAMBIAR_DESCANSO' ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Nuevo descanso recurrente
                  <select
                    value={editor.diaDescanso}
                    onChange={(event) => updateEditor('diaDescanso', event.target.value)}
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  >
                    <option value="DOM">Domingo (DOM)</option>
                    <option value="LUN">Lunes (LUN)</option>
                    <option value="MAR">Martes (MAR)</option>
                    <option value="MIE">Miércoles (MIE)</option>
                    <option value="JUE">Jueves (JUE)</option>
                    <option value="VIE">Viernes (VIE)</option>
                    <option value="SAB">Sábado (SAB)</option>
                  </select>
                </label>
              ) : null}
              {editor.operation === 'CAMBIAR_ESTADO_PDV' ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Nuevo estado del PDV
                  <select
                    value={editor.estadoPdv}
                    onChange={(event) =>
                      updateEditor('estadoPdv', event.target.value as EditorState['estadoPdv'])
                    }
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  >
                    <option value="ACTIVO">Activo</option>
                    <option value="PAUSADO">Pausado</option>
                    <option value="INACTIVO">Inactivo</option>
                  </select>
                </label>
              ) : null}
              {editor.operation === 'AGREGAR_EVENTO' ? (
                <>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Nombre del evento
                    <input
                      value={editor.eventoNombre}
                      onChange={(event) => updateEditor('eventoNombre', event.target.value)}
                      placeholder="Activación especial"
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Tipo de evento
                    <select
                      value={editor.eventoTipo}
                      onChange={(event) =>
                        updateEditor('eventoTipo', event.target.value as EditorState['eventoTipo'])
                      }
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    >
                      <option value="ACTIVACION">Activación / Es1</option>
                      <option value="EVENTO_ESPECIAL">Evento especial</option>
                      <option value="FORMACION">Capacitación</option>
                      <option value="ISDINIZACION">ISDINización</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Sede
                    <input
                      value={editor.eventoSede}
                      onChange={(event) => updateEditor('eventoSede', event.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Modalidad
                    <select
                      value={editor.eventoModalidad}
                      onChange={(event) =>
                        updateEditor(
                          'eventoModalidad',
                          event.target.value as EditorState['eventoModalidad']
                        )
                      }
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    >
                      <option value="PRESENCIAL">Presencial</option>
                      <option value="EN_LINEA">En línea</option>
                    </select>
                  </label>
                </>
              ) : null}
              {editor.operation === 'REASIGNAR_SUPERVISOR' ? (
                <>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Supervisor saliente
                    <select
                      value={editor.supervisorOrigenId}
                      onChange={(event) => updateEditor('supervisorOrigenId', event.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    >
                      <option value="">Selecciona supervisor</option>
                      {supervisorOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Supervisor sucesor
                    <select
                      value={editor.supervisorDestinoId}
                      onChange={(event) => updateEditor('supervisorDestinoId', event.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    >
                      <option value="">Selecciona sucesor</option>
                      {supervisorOptions
                        .filter((option) => option.id !== editor.supervisorOrigenId)
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              ) : null}
              <label className="grid gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                Motivo operativo
                <textarea
                  rows={3}
                  value={editor.motivo}
                  onChange={(event) => updateEditor('motivo', event.target.value)}
                  placeholder="Explica por qué cambia la asignación y desde cuándo."
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                />
              </label>
            </div>

            {actionState.message ? (
              <div
                role={actionState.ok ? 'status' : 'alert'}
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  actionState.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}
              >
                <p className="font-semibold">{actionState.message}</p>
                {actionState.preview?.impact ? (
                  <p className="mt-1 text-xs">
                    {actionState.preview.impact.employees} DC · {actionState.preview.impact.pdvs}{' '}
                    PDVs · {actionState.preview.impact.operations} operación
                  </p>
                ) : null}
                {[...(actionState.preview?.errors ?? []), ...(actionState.preview?.conflicts ?? [])]
                  .slice(0, 5)
                  .map((issue, index) => (
                    <p key={`${issue.code}-${index}`} className="mt-1 text-xs">
                      {issue.code.replaceAll('_', ' ')}
                      {issue.fecha ? ` · ${issue.fecha}` : ''}
                    </p>
                  ))}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setEditorOpen(false)}>
                Volver al detalle
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={previewChange}
                  disabled={actionPending}
                  isLoading={actionPending}
                >
                  Previsualizar impacto
                </Button>
                <Button
                  type="button"
                  onClick={applyChange}
                  disabled={actionPending || !actionState.preview?.ok}
                  isLoading={actionPending}
                >
                  Confirmar cambio
                </Button>
              </div>
            </div>
          </div>
        ) : detailLoading ? (
          <div className="grid min-h-56 place-items-center" role="status">
            <div className="text-center">
              <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              <p className="mt-3 text-sm font-semibold text-slate-600">Cargando detalle...</p>
            </div>
          </div>
        ) : detailError ? (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-900"
            role="alert"
          >
            {detailError}
          </div>
        ) : detail && selectedCell ? (
          <div className="space-y-5" data-testid="planeacion-detail">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Estado
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {CODE_LABELS[selectedCell.day[CELL_INDEX.codigo]]}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Turno
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {selectedCell.day[CELL_INDEX.turnoCodigo] ??
                    selectedCell.row.horarioReferencia ??
                    'Sin turno'}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Cuota del día
                </p>
                <p className="mt-1 font-bold text-slate-950">{formatMoney(detail.cuotaDia)}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-950">Resolución de personas</h3>
              <div className="mt-3 space-y-3">
                {detail.personas.length > 0 ? (
                  detail.personas.map((person) => (
                    <div
                      key={person.empleado_id}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold text-slate-950">{person.nombre_completo}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {person.naturaleza ?? 'Sin naturaleza'} · {person.tipo ?? 'Sin rol'} ·
                            factor {person.factor_tiempo ?? 0}
                          </p>
                        </div>
                        <span className="w-fit rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
                          {person.estado_operativo ?? 'SIN_ASIGNACION'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        <p>Origen: {person.origen ?? 'NINGUNO'}</p>
                        <p>
                          Horario: {person.horario_inicio ?? '--:--'} -{' '}
                          {person.horario_fin ?? '--:--'}
                        </p>
                        <p>Descanso: {person.dia_descanso ?? 'Variable'}</p>
                        <p>
                          {person.programada ? 'Jornada programada' : 'Sin jornada estructural'}
                        </p>
                      </div>
                      {person.mensaje_operativo ? (
                        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {person.mensaje_operativo}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50 px-4 py-6 text-center text-sm text-orange-900">
                    El PDV no tiene una DC resuelta para este día.
                  </div>
                )}
              </div>
            </div>

            {puedeEditar && editableMonth ? (
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button type="button" onClick={openEditor}>
                  <PencilSimple className="h-4 w-4" aria-hidden="true" />
                  Editar asignación
                </Button>
              </div>
            ) : puedeEditar ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Este mes es histórico y se mantiene en modo de consulta. Los cambios sólo pueden
                programarse para el mes actual o uno futuro.
              </div>
            ) : null}
          </div>
        ) : null}
      </ModalPanel>

      <ModalPanel
        open={Boolean(bulkEditor)}
        onClose={closeBulkEditor}
        title={
          bulkEditor?.operation === 'LIBERAR_DCS'
            ? 'Liberar DCs de PDVs seleccionados'
            : 'Asignar PDVs a un supervisor'
        }
        subtitle={`${selectedPdvIds.size} PDV${selectedPdvIds.size === 1 ? '' : 's'} · cambio masivo con validación transaccional`}
        maxWidthClassName="max-w-2xl"
      >
        {bulkEditor ? (
          <div className="space-y-5" data-testid="planeacion-editor-masivo">
            <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
              {bulkEditor.operation === 'LIBERAR_DCS' ? (
                <p>
                  Se cerrarán todas las asignaciones de DC vigentes en los PDVs elegidos desde la
                  fecha efectiva. Cada tienda quedará <strong>Por cubrir</strong> hasta una nueva
                  asignación.
                </p>
              ) : (
                <p>
                  Sólo los PDVs seleccionados saldrán de sus supervisores actuales y pasarán al
                  sucesor. Las demás tiendas de esas carteras permanecerán sin cambios.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Fecha efectiva
                <input
                  type="date"
                  min={currentDateMx()}
                  max={monthDays.at(-1)?.[CELL_INDEX.fecha]}
                  value={bulkEditor.fechaInicio}
                  onChange={(event) => updateBulkEditor('fechaInicio', event.target.value)}
                  className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                />
              </label>
              {bulkEditor.operation === 'REASIGNAR_SUPERVISOR' ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Supervisor que recibirá los PDVs
                  <select
                    value={bulkEditor.supervisorDestinoId}
                    onChange={(event) =>
                      updateBulkEditor('supervisorDestinoId', event.target.value)
                    }
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  >
                    <option value="">Selecciona un supervisor</option>
                    {supervisorOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="grid gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                Motivo operativo
                <textarea
                  rows={3}
                  value={bulkEditor.motivo}
                  onChange={(event) => updateBulkEditor('motivo', event.target.value)}
                  placeholder="Explica el movimiento masivo y su fecha de aplicación."
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                />
              </label>
            </div>

            {bulkIssues.length > 0 ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3" role="alert">
                <p className="text-sm font-bold text-rose-900">
                  Corrige el lote antes de continuar
                </p>
                {bulkIssues.slice(0, 8).map((issue, index) => (
                  <p
                    key={`${issue.code}-${issue.pdvId ?? index}`}
                    className="mt-1 text-xs text-rose-800"
                  >
                    {getBulkIssueLabel(
                      issue,
                      issue.pdvId
                        ? summary.rows.find((row) => row.pdvId === issue.pdvId)?.pdvNombre
                        : undefined
                    )}
                  </p>
                ))}
              </div>
            ) : null}

            {bulkActionState.message ? (
              <div
                role={bulkActionState.ok ? 'status' : 'alert'}
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  bulkActionState.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}
              >
                <p className="font-semibold">{bulkActionState.message}</p>
                {bulkActionState.preview?.impact ? (
                  <p className="mt-1 text-xs">
                    {bulkActionState.preview.impact.pdvs} PDVs ·{' '}
                    {bulkActionState.preview.impact.operations} operaciones
                  </p>
                ) : null}
                {[
                  ...(bulkActionState.preview?.errors ?? []),
                  ...(bulkActionState.preview?.conflicts ?? []),
                ]
                  .slice(0, 8)
                  .map((issue, index) => (
                    <p key={`${issue.code}-${index}`} className="mt-1 text-xs">
                      {issue.code.replaceAll('_', ' ')}
                      {issue.fecha ? ` · ${issue.fecha}` : ''}
                    </p>
                  ))}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={closeBulkEditor}>
                Cancelar
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={previewBulkChange}
                  disabled={bulkPending}
                  isLoading={bulkPending}
                >
                  Previsualizar lote
                </Button>
                <Button
                  type="button"
                  onClick={applyBulkChange}
                  disabled={bulkPending || !bulkActionState.preview?.ok}
                  isLoading={bulkPending}
                >
                  Confirmar {selectedPdvIds.size} PDV
                  {selectedPdvIds.size === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </ModalPanel>
    </div>
  );
}
