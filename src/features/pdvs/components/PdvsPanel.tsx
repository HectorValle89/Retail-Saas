'use client';

import { useActionState, useDeferredValue, useEffect, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { MexicoMap, type MexicoMapPoint } from '@/components/maps/MexicoMap';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ModalPanel } from '@/components/ui/modal-panel';
import { Select } from '@/components/ui/select';
import {
  actualizarGeocercaPdv,
  actualizarHorarioPdv,
  actualizarPdvBase,
  actualizarSupervisorPdv,
  crearPdv,
} from '../actions';
import { ESTADO_PDV_INICIAL, type PdvCreateDraft } from '../state';
import type {
  PdvAttendanceHistoryItem,
  PdvCadenaOption,
  PdvCiudadOption,
  PdvHorarioItem,
  PdvListadoItem,
  PdvSupervisorHistoryItem,
  PdvSupervisorOption,
  PdvTurnoCatalogOption,
  PdvsPanelData,
} from '../services/pdvService';

function formatDate(value: string | null) {
  if (!value) {
    return 'Sin registro';
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sin registro';
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatTime(value: string | null) {
  if (!value) {
    return 'Sin horario';
  }

  return value.slice(0, 5);
}

function formatDistance(value: number | null) {
  if (value === null) {
    return 'Sin medicion';
  }

  return `${Math.round(value)} m`;
}

function getPdvTone(value: string) {
  return value === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700';
}

function getGeofenceTone(pdv: PdvListadoItem) {
  if (!pdv.geocercaCompleta) {
    return 'bg-rose-100 text-rose-700';
  }

  if (pdv.alertarGeocercaFueraDeRango) {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-emerald-100 text-emerald-700';
}

function getHorarioTone(mode: PdvListadoItem['horarioMode']) {
  if (mode === 'CADENA') {
    return 'bg-sky-100 text-sky-700';
  }

  if (mode === 'PERSONALIZADO') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (mode === 'GLOBAL') {
    return 'bg-violet-100 text-violet-700';
  }

  if (mode === 'BASE_PDV') {
    return 'bg-slate-100 text-slate-700';
  }

  return 'bg-rose-100 text-rose-700';
}

function getGpsTone(value: PdvAttendanceHistoryItem['estadoGps']) {
  if (value === 'DENTRO_GEOCERCA') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (value === 'FUERA_GEOCERCA') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-slate-100 text-slate-700';
}

function getAsistenciaTone(value: PdvAttendanceHistoryItem['estatus']) {
  if (value === 'VALIDA' || value === 'CERRADA') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (value === 'RECHAZADA') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-amber-100 text-amber-700';
}

function getHorarioLabel(mode: PdvListadoItem['horarioMode']) {
  switch (mode) {
    case 'CADENA':
      return 'Heredado cadena';
    case 'PERSONALIZADO':
      return 'Personalizado';
    case 'BASE_PDV':
      return 'Base PDV';
    case 'GLOBAL':
      return 'Fallback global';
    default:
      return 'Sin horario';
  }
}

export function PdvsPanel({
  data,
  canEdit,
  actorPuesto,
}: {
  data: PdvsPanelData;
  canEdit: boolean;
  actorPuesto: string;
}) {
  const [search, setSearch] = useState('');
  const [cadenaFilter, setCadenaFilter] = useState('ALL');
  const [ciudadFilter, setCiudadFilter] = useState('ALL');
  const [estadoFilter, setEstadoFilter] = useState('ALL');
  const [zonaFilter, setZonaFilter] = useState('ALL');
  const [supervisorFilter, setSupervisorFilter] = useState('ALL');
  const [estatusFilter, setEstatusFilter] = useState('ALL');
  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(data.pdvs[0]?.id ?? null);
  const [detailPdvId, setDetailPdvId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const selectedPdv = data.pdvs.find((pdv) => pdv.id === detailPdvId) ?? null;

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const clearFilters = () => {
    setSearch('');
    setCadenaFilter('ALL');
    setCiudadFilter('ALL');
    setEstadoFilter('ALL');
    setZonaFilter('ALL');
    setSupervisorFilter('ALL');
    setEstatusFilter('ALL');
  };

  const pdvsFiltrados = data.pdvs.filter((pdv) => {
    const matchesSearch = !deferredSearch
      ? true
      : [
          pdv.nombre,
          pdv.claveBtl,
          pdv.cadena,
          pdv.ciudad,
          pdv.estado,
          pdv.zona,
          pdv.direccion,
          pdv.supervisorActual,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(deferredSearch));

    const matchesCadena = cadenaFilter === 'ALL' || pdv.cadenaId === cadenaFilter;
    const matchesCiudad = ciudadFilter === 'ALL' || pdv.ciudadId === ciudadFilter;
    const matchesEstado = estadoFilter === 'ALL' || (pdv.estado ?? 'SIN_ESTADO') === estadoFilter;
    const matchesZona = zonaFilter === 'ALL' || (pdv.zona ?? 'SIN_ZONA') === zonaFilter;
    const matchesSupervisor =
      supervisorFilter === 'ALL'
        ? true
        : supervisorFilter === 'SIN_SUPERVISOR'
          ? !pdv.supervisorActualId
          : pdv.supervisorActualId === supervisorFilter;
    const matchesStatus = estatusFilter === 'ALL' || pdv.estatus === estatusFilter;

    return (
      matchesSearch &&
      matchesCadena &&
      matchesCiudad &&
      matchesEstado &&
      matchesZona &&
      matchesSupervisor &&
      matchesStatus
    );
  });

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura parcial</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!canEdit && (
        <Card className="border-slate-200 bg-slate-50 text-slate-700">
          <p className="font-medium">Vista solo lectura</p>
          <p className="mt-2 text-sm">
            Tu puesto actual es <span className="font-semibold">{actorPuesto}</span>. Solo
            ADMINISTRADOR puede crear o editar PDVs; el resto consulta ubicacion, geocerca, horario
            y supervisor vigente.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Total visible" value={String(data.resumen.total)} />
        <MetricCard label="Activos" value={String(data.resumen.activos)} />
        <MetricCard label="Con geocerca" value={String(data.resumen.conGeocerca)} />
        <MetricCard label="Con supervisor" value={String(data.resumen.conSupervisor)} />
        <MetricCard label="Con horario" value={String(data.resumen.conHorario)} />
      </div>

      {canEdit && (
        <Card className="p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Gestion de PDVs</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Da de alta puntos de venta y administra cobertura, geocerca, supervisor y horario.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <div className="text-sm text-slate-500">
                <p>
                  Supervisores disponibles:{' '}
                  <span className="font-semibold text-slate-900">{data.supervisores.length}</span>
                </p>
                <p className="mt-1">
                  Turnos de cadena:{' '}
                  <span className="font-semibold text-slate-900">{data.turnosCadena.length}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex min-h-11 items-center justify-center rounded-[14px] bg-[var(--module-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--module-hover)]"
              >
                Alta de PDV
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card className="p-6">
          <div className="grid gap-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Catalogo y filtros</h2>
              <p className="mt-1 text-sm text-slate-500">
                Busca por nombre, clave, estado, zona o supervisor. La tabla y el mapa comparten los mismos
                filtros.
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                  Mostrando <span className="font-semibold text-slate-900">{pdvsFiltrados.length}</span>{' '}
                  de <span className="font-semibold text-slate-900">{data.pdvs.length}</span> PDVs.
                </div>
                <a
                  href="/api/pdvs/export"
                  className="inline-flex min-h-11 items-center justify-center rounded-[16px] border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100"
                >
                  Descargar base de PDVs
                </a>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="xl:col-span-2">
                <Input
                  label="Buscar"
                  placeholder="Nombre, clave, ciudad o supervisor"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div>
                <Select
                  label="Cadena"
                  value={cadenaFilter}
                  onChange={(event) => setCadenaFilter(event.target.value)}
                  options={[
                    { value: 'ALL', label: 'Todas' },
                    ...data.cadenas.map((item) => ({ value: item.id, label: item.nombre })),
                  ]}
                />
              </div>
              <div>
                <Select
                  label="Ciudad"
                  value={ciudadFilter}
                  onChange={(event) => setCiudadFilter(event.target.value)}
                  options={[
                    { value: 'ALL', label: 'Todas' },
                    ...data.ciudades.map((item) => ({ value: item.id, label: item.nombre })),
                  ]}
                />
              </div>
              <div>
                <Select
                  label="Estado"
                  value={estadoFilter}
                  onChange={(event) => setEstadoFilter(event.target.value)}
                  options={[
                    { value: 'ALL', label: 'Todos' },
                    { value: 'SIN_ESTADO', label: 'Sin estado' },
                    ...data.estados.map((item) => ({ value: item, label: item })),
                  ]}
                />
              </div>
              <div>
                <Select
                  label="Zona"
                  value={zonaFilter}
                  onChange={(event) => setZonaFilter(event.target.value)}
                  options={[
                    { value: 'ALL', label: 'Todas' },
                    { value: 'SIN_ZONA', label: 'Sin zona' },
                    ...data.zonas.map((item) => ({ value: item, label: item })),
                  ]}
                />
              </div>
              <div className="xl:col-span-2">
                <Select
                  label="Supervisor"
                  value={supervisorFilter}
                  onChange={(event) => setSupervisorFilter(event.target.value)}
                  options={[
                    { value: 'ALL', label: 'Todos' },
                    {
                      value: 'SIN_SUPERVISOR',
                      label: 'Sin supervisor',
                    },
                    ...data.supervisores.map((item) => ({
                      value: item.id,
                      label: item.zona
                        ? `${item.nombreCompleto} · ${item.zona}`
                        : item.nombreCompleto,
                    })),
                  ]}
                />
              </div>
              <div>
                <Select
                  label="Estatus"
                  value={estatusFilter}
                  onChange={(event) => setEstatusFilter(event.target.value)}
                  options={[
                    { value: 'ALL', label: 'Todos' },
                    { value: 'ACTIVO', label: 'ACTIVO' },
                    { value: 'INACTIVO', label: 'INACTIVO' },
                  ]}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <div className="flex h-full flex-col justify-end">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-[16px] bg-[var(--module-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--module-hover)]"
                  >
                    Borrar filtros
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <CoverageMap
          pdvs={pdvsFiltrados}
          selectedPdvId={selectedPdvId}
          onSelect={(pdvId) => {
            setSelectedPdvId(pdvId);
            setDetailPdvId(pdvId);
          }}
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">PDV</th>
                <th className="px-6 py-3 font-medium">Cadena / ciudad</th>
                <th className="px-6 py-3 font-medium">Geocerca</th>
                <th className="px-6 py-3 font-medium">Horario</th>
                <th className="px-6 py-3 font-medium">Supervisor</th>
                <th className="px-6 py-3 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {pdvsFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No hay PDVs que coincidan con los filtros activos.
                  </td>
                </tr>
              ) : (
                pdvsFiltrados.map((pdv) => (
                  <PdvRow
                    key={pdv.id}
                    data={data}
                    pdv={pdv}
                    canEdit={canEdit}
                    expanded={false}
                    onToggle={() => {
                      setSelectedPdvId(pdv.id);
                      setDetailPdvId(pdv.id);
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedPdv ? (
        <PdvDetailModal
          key={selectedPdv.id}
          open
          onClose={() => setDetailPdvId(null)}
          pdv={selectedPdv}
          data={data}
          canEdit={canEdit}
        />
      ) : null}

      {canEdit ? (
        <ModalPanel
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Alta de PDV"
          subtitle="Crea un punto de venta operativo con cadena, geocerca, supervisor y horario."
          maxWidthClassName="max-w-6xl"
        >
          <CrearPdvForm
            data={data}
            onCreated={({ nombre, claveBtl }) => {
              setCreateModalOpen(false);
              setToast({
                tone: 'success',
                message: `PDV creado: ${nombre}${claveBtl ? ` · ${claveBtl}` : ''}`,
              });
            }}
          />
        </ModalPanel>
      ) : null}

      {toast ? <CenteredFeedbackNotice tone={toast.tone} message={toast.message} /> : null}
    </div>
  );
}

function CenteredFeedbackNotice({
  tone,
  message,
}: {
  tone: 'success' | 'error' | 'info';
  message: string;
}) {
  const toneClasses =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-sky-200 bg-sky-50 text-sky-900';

  return (
    <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div
        className={`${toneClasses} pointer-events-auto w-full max-w-md rounded-[24px] border px-5 py-4 text-center shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur`}
        role="status"
        aria-live="polite"
      >
        <p className="text-base font-semibold sm:text-lg">{message}</p>
      </div>
    </div>
  );
}
function PdvRow({
  pdv,
  data,
  canEdit,
  expanded,
  onToggle,
}: {
  pdv: PdvListadoItem;
  data: PdvsPanelData;
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="px-6 py-4">
          <div className="font-medium text-slate-900">{pdv.nombre}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
            {pdv.claveBtl}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill label={pdv.estatus} className={getPdvTone(pdv.estatus)} />
            {pdv.formato && (
              <StatusPill label={pdv.formato} className="bg-slate-100 text-slate-700" />
            )}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <div className="font-medium text-slate-900">{pdv.cadena ?? 'Sin cadena'}</div>
          <div className="mt-1 text-xs text-slate-500">{pdv.ciudad ?? 'Sin ciudad'}</div>
          <div className="mt-1 text-xs text-slate-500">estado: {pdv.estado ?? 'Sin estado'}</div>
          <div className="mt-1 text-xs text-slate-500">zona: {pdv.zona ?? 'Sin zona'}</div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill
            label={pdv.geocercaCompleta ? `${pdv.radioMetros} m` : 'Sin geocerca'}
            className={getGeofenceTone(pdv)}
          />
          <div className="mt-2 text-xs text-slate-500">
            {pdv.latitud !== null && pdv.longitud !== null
              ? `${pdv.latitud.toFixed(5)}, ${pdv.longitud.toFixed(5)}`
              : 'Sin coordenadas'}
          </div>
          {pdv.alertarGeocercaFueraDeRango && (
            <div className="mt-1 text-xs text-amber-700">
              Radio fuera del rango operativo 50-300 m
            </div>
          )}
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill
            label={getHorarioLabel(pdv.horarioMode)}
            className={getHorarioTone(pdv.horarioMode)}
          />
          <div className="mt-2 text-xs text-slate-500">
            {pdv.horarios[0]
              ? `${formatTime(pdv.horarios[0].horaEntrada)} - ${formatTime(pdv.horarios[0].horaSalida)}`
              : 'Sin horario efectivo'}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <div className="font-medium text-slate-900">{pdv.supervisorActual ?? 'Pendiente'}</div>
          <div className="mt-1 text-xs text-slate-500">
            vigente desde: {formatDate(pdv.supervisorVigenteDesde)}
          </div>
        </td>
        <td className="px-6 py-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onToggle}
          >
            {expanded ? 'Ocultar detalle' : 'Ver detalle'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/70">
          <td colSpan={6} className="px-6 py-5">
            <div className="grid gap-4 xl:grid-cols-2">
              <DetailCard
                title="Ficha PDV"
                description="Cadena, ciudad, zona, direccion, formato y estatus operativo."
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <InfoRow label="Clave BTL" value={pdv.claveBtl} />
                  <InfoRow label="Cadena" value={pdv.cadena ?? 'Sin cadena'} />
                  <InfoRow label="Ciudad" value={pdv.ciudad ?? 'Sin ciudad'} />
                  <InfoRow label="Zona" value={pdv.zona ?? 'Sin zona'} />
                  <InfoRow label="Direccion" value={pdv.direccion ?? 'Sin direccion'} />
                  <InfoRow label="Formato" value={pdv.formato ?? 'Sin formato'} />
                </div>
                {canEdit && (
                  <div className="mt-4">
                    <EditarPdvBaseForm data={data} pdv={pdv} />
                  </div>
                )}
              </DetailCard>

              <DetailCard
                title="Geocerca"
                description="Coordenadas, radio y tolerancia de check-in del punto de venta."
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <InfoRow
                    label="Latitud"
                    value={pdv.latitud !== null ? pdv.latitud.toFixed(7) : 'Sin dato'}
                  />
                  <InfoRow
                    label="Longitud"
                    value={pdv.longitud !== null ? pdv.longitud.toFixed(7) : 'Sin dato'}
                  />
                  <InfoRow
                    label="Radio"
                    value={pdv.radioMetros !== null ? `${pdv.radioMetros} m` : 'Sin dato'}
                  />
                  <InfoRow
                    label="Justificacion"
                    value={pdv.permiteCheckinConJustificacion ? 'Permitida' : 'No permitida'}
                  />
                </div>
                {canEdit && (
                  <div className="mt-4">
                    <GeocercaForm data={data} pdv={pdv} />
                  </div>
                )}
              </DetailCard>

              <DetailCard
                title="Horario"
                description="Horario efectivo del PDV, con herencia desde cadena o reglas personalizadas."
              >
                <HorarioSummary horarios={pdv.horarios} />
                {canEdit && (
                  <div className="mt-4">
                    <HorarioForm data={data} pdv={pdv} />
                  </div>
                )}
              </DetailCard>

              <DetailCard
                title="Supervisor"
                description="Supervisor heredado por asignacion al PDV y su historial reciente."
              >
                <SupervisorHistoryList items={pdv.supervisorHistorial} />
                {canEdit && (
                  <div className="mt-4">
                    <SupervisorForm data={data} pdv={pdv} />
                  </div>
                )}
              </DetailCard>

              <DetailCard
                title="Historial de asignaciones"
                description="Ultimas asignaciones publicadas o en borrador para este PDV."
              >
                <AssignmentHistoryList items={pdv.historialAsignaciones} />
              </DetailCard>

              <DetailCard
                title="Historial de asistencias"
                description="Ultimas jornadas registradas en el PDV, con estado GPS y check-in."
              >
                <AttendanceHistoryList items={pdv.historialAsistencias} />
              </DetailCard>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PdvDetailModal({
  open,
  onClose,
  pdv,
  data,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  pdv: PdvListadoItem;
  data: PdvsPanelData;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<'general' | 'geocerca' | 'operacion'>('general');

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={pdv.nombre}
      subtitle={pdv.claveBtl}
      maxWidthClassName="max-w-6xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 border-b border-border/70 pb-4">
          <DetailTabButton active={tab === 'general'} onClick={() => setTab('general')}>
            General
          </DetailTabButton>
          <DetailTabButton active={tab === 'geocerca'} onClick={() => setTab('geocerca')}>
            Geocerca
          </DetailTabButton>
          <DetailTabButton active={tab === 'operacion'} onClick={() => setTab('operacion')}>
            Operacion
          </DetailTabButton>
        </div>

        {tab === 'general' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Ficha PDV" description="Identidad base del punto de venta.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Clave BTL" value={pdv.claveBtl} />
                <InfoRow label="Cadena" value={pdv.cadena ?? 'Sin cadena'} />
                <InfoRow label="Ciudad" value={pdv.ciudad ?? 'Sin ciudad'} />
                <InfoRow label="Zona" value={pdv.zona ?? 'Sin zona'} />
                <InfoRow label="Direccion" value={pdv.direccion ?? 'Sin direccion'} />
                <InfoRow label="Formato" value={pdv.formato ?? 'Sin formato'} />
              </div>
              {canEdit ? (
                <div className="mt-4">
                  <EditarPdvBaseForm data={data} pdv={pdv} />
                </div>
              ) : null}
            </DetailCard>

            <DetailCard title="Supervisor" description="Cobertura vigente e historial reciente.">
              <SupervisorHistoryList items={pdv.supervisorHistorial} />
              {canEdit ? (
                <div className="mt-4">
                  <SupervisorForm data={data} pdv={pdv} />
                </div>
              ) : null}
            </DetailCard>
          </div>
        ) : null}

        {tab === 'geocerca' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Geocerca" description="Coordenadas, radio y justificacion.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow
                  label="Latitud"
                  value={pdv.latitud !== null ? pdv.latitud.toFixed(7) : 'Sin dato'}
                />
                <InfoRow
                  label="Longitud"
                  value={pdv.longitud !== null ? pdv.longitud.toFixed(7) : 'Sin dato'}
                />
                <InfoRow
                  label="Radio"
                  value={pdv.radioMetros !== null ? `${pdv.radioMetros} m` : 'Sin dato'}
                />
                <InfoRow
                  label="Justificacion"
                  value={pdv.permiteCheckinConJustificacion ? 'Permitida' : 'No permitida'}
                />
              </div>
              {canEdit ? (
                <div className="mt-4">
                  <GeocercaForm data={data} pdv={pdv} />
                </div>
              ) : null}
            </DetailCard>

            <DetailCard
              title="Historial de asistencias"
              description="Ultimas jornadas registradas."
            >
              <AttendanceHistoryList items={pdv.historialAsistencias} />
            </DetailCard>
          </div>
        ) : null}

        {tab === 'operacion' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Horario" description="Horario efectivo y herencia.">
              <HorarioSummary horarios={pdv.horarios} />
              {canEdit ? (
                <div className="mt-4">
                  <HorarioForm data={data} pdv={pdv} />
                </div>
              ) : null}
            </DetailCard>

            <DetailCard
              title="Historial de asignaciones"
              description="Ultimos movimientos del PDV."
            >
              <AssignmentHistoryList items={pdv.historialAsignaciones} />
            </DetailCard>
          </div>
        ) : null}
      </div>
    </ModalPanel>
  );
}

function DetailTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[var(--module-soft-bg)] text-[var(--module-text)] shadow-[inset_0_0_0_1px_var(--module-border)]'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function buildInitialCreatePdvDraft(
  data: PdvsPanelData,
  draft?: PdvCreateDraft | null
): PdvCreateDraft {
  return {
    clave_btl: draft?.clave_btl ?? '',
    nombre: draft?.nombre ?? '',
    cadena_id: draft?.cadena_id ?? '',
    ciudad_id: draft?.ciudad_id ?? '',
    zona: draft?.zona ?? '',
    direccion: draft?.direccion ?? '',
    formato: draft?.formato ?? '',
    id_cadena: draft?.id_cadena ?? '',
    estatus: draft?.estatus ?? 'ACTIVO',
    coordenadas: draft?.coordenadas ?? '',
    radio_tolerancia_metros: draft?.radio_tolerancia_metros ?? String(data.geocercaDefaultMetros),
    permite_checkin_con_justificacion:
      draft?.permite_checkin_con_justificacion ?? data.permiteCheckinConJustificacionDefault,
    supervisor_empleado_id: draft?.supervisor_empleado_id ?? '',
    horario_mode:
      draft?.horario_mode ?? (data.turnosCadena.length > 0 ? 'CADENA' : 'PERSONALIZADO'),
    turno_nomenclatura: draft?.turno_nomenclatura ?? '',
    hora_entrada: draft?.hora_entrada ?? '',
    hora_salida: draft?.hora_salida ?? '',
    horario_observaciones: draft?.horario_observaciones ?? '',
  };
}

function CrearPdvForm({
  data,
  onCreated,
}: {
  data: PdvsPanelData;
  onCreated: (payload: { nombre: string; claveBtl: string }) => void;
}) {
  const [state, formAction] = useActionState(crearPdv, ESTADO_PDV_INICIAL);
  const [formValues, setFormValues] = useState<PdvCreateDraft>(() =>
    buildInitialCreatePdvDraft(data, ESTADO_PDV_INICIAL.fields)
  );
  const [mode, setMode] = useState<'CADENA' | 'PERSONALIZADO'>(formValues.horario_mode);

  useEffect(() => {
    if (!state.ok && state.fields) {
      setFormValues(buildInitialCreatePdvDraft(data, state.fields));
      setMode(state.fields.horario_mode);
    }
  }, [data, state]);

  useEffect(() => {
    if (state.ok) {
      onCreated({
        nombre: formValues.nombre.trim() || 'Nuevo PDV',
        claveBtl: formValues.clave_btl.trim(),
      });
    }
  }, [formValues.clave_btl, formValues.nombre, onCreated, state.ok]);

  function updateField<K extends keyof PdvCreateDraft>(key: K, value: PdvCreateDraft[K]) {
    setFormValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input
          label="Clave BTL"
          name="clave_btl"
          value={formValues.clave_btl}
          onChange={(event) => updateField('clave_btl', event.target.value)}
          required
        />
        <Input
          label="Nombre PDV"
          name="nombre"
          value={formValues.nombre}
          onChange={(event) => updateField('nombre', event.target.value)}
          required
        />
        <Select
          label="Cadena"
          name="cadena_id"
          value={formValues.cadena_id}
          onChange={(event) => updateField('cadena_id', event.target.value)}
          options={buildCadenaOptions(data.cadenas)}
        />
        <Select
          label="Ciudad"
          name="ciudad_id"
          value={formValues.ciudad_id}
          onChange={(event) => updateField('ciudad_id', event.target.value)}
          options={buildCiudadOptions(data.ciudades)}
        />
        <Input
          label="Zona"
          name="zona"
          value={formValues.zona}
          onChange={(event) => updateField('zona', event.target.value)}
          placeholder="Opcional; si se omite, se hereda de la ciudad"
        />
        <Input
          label="Direccion"
          name="direccion"
          value={formValues.direccion}
          onChange={(event) => updateField('direccion', event.target.value)}
          placeholder="Opcional"
        />
        <Input
          label="Formato"
          name="formato"
          value={formValues.formato}
          onChange={(event) => updateField('formato', event.target.value)}
          placeholder="Opcional"
        />
        <Input
          label="ID PDV cadena"
          name="id_cadena"
          value={formValues.id_cadena}
          onChange={(event) => updateField('id_cadena', event.target.value)}
          placeholder="Opcional"
        />
        <Select
          label="Estatus"
          name="estatus"
          value={formValues.estatus}
          onChange={(event) => updateField('estatus', event.target.value === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO')}
          options={[
            { value: 'ACTIVO', label: 'ACTIVO' },
            { value: 'INACTIVO', label: 'INACTIVO' },
          ]}
        />
        <Input
          label="Coordenadas"
          name="coordenadas"
          value={formValues.coordenadas}
          onChange={(event) => updateField('coordenadas', event.target.value)}
          placeholder="19.432608, -99.133209"
          hint="Captura latitud y longitud juntas, separadas por coma."
          required
        />
        <Input
          label="Radio geocerca (m)"
          name="radio_tolerancia_metros"
          type="number"
          min="1"
          max="1000"
          value={formValues.radio_tolerancia_metros}
          onChange={(event) => updateField('radio_tolerancia_metros', event.target.value)}
          required
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="permite_checkin_con_justificacion"
          checked={formValues.permite_checkin_con_justificacion}
          onChange={(event) => updateField('permite_checkin_con_justificacion', event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Permitir check-in con justificacion fuera de geocerca
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Supervisor"
          name="supervisor_empleado_id"
          value={formValues.supervisor_empleado_id}
          onChange={(event) => updateField('supervisor_empleado_id', event.target.value)}
          options={buildSupervisorOptions(data.supervisores)}
        />
        <Select
          label="Modo horario"
          name="horario_mode"
          value={mode}
          onChange={(event) => {
            const nextMode = event.target.value as 'CADENA' | 'PERSONALIZADO';
            setMode(nextMode);
            updateField('horario_mode', nextMode);
          }}
          options={[
            { value: 'CADENA', label: 'Heredado cadena' },
            { value: 'PERSONALIZADO', label: 'Personalizado' },
          ]}
        />
      </div>

      {mode === 'CADENA' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Select
            label="Turno catalogo cadena"
            name="turno_nomenclatura"
            value={formValues.turno_nomenclatura}
            onChange={(event) => updateField('turno_nomenclatura', event.target.value)}
            options={[
              {
                value: '',
                label: data.turnosCadena.length > 0 ? 'Selecciona un turno' : 'Sin catalogo disponible',
              },
              ...data.turnosCadena.map((item) => ({ value: item.nomenclatura, label: item.label })),
            ]}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 md:col-span-2">
            La herencia usa el catalogo operativo de cadena cargado en configuracion. Al aplicar este
            modo se desactivan reglas personalizadas activas del PDV.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Codigo turno"
            name="turno_nomenclatura"
            value={formValues.turno_nomenclatura}
            onChange={(event) => updateField('turno_nomenclatura', event.target.value)}
            placeholder="Opcional"
          />
          <Input
            label="Hora entrada"
            name="hora_entrada"
            type="time"
            value={formValues.hora_entrada}
            onChange={(event) => updateField('hora_entrada', event.target.value)}
            required
          />
          <Input
            label="Hora salida"
            name="hora_salida"
            type="time"
            value={formValues.hora_salida}
            onChange={(event) => updateField('hora_salida', event.target.value)}
            required
          />
          <Input
            label="Observaciones"
            name="horario_observaciones"
            value={formValues.horario_observaciones}
            onChange={(event) => updateField('horario_observaciones', event.target.value)}
            placeholder="Opcional"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton idleLabel="Crear PDV" pendingLabel="Creando..." variant="primary" />
        <p className="text-sm text-slate-500">
          Se valida clave BTL unica, coordenadas no duplicadas, supervisor activo y horario
          efectivo.
        </p>
      </div>
      {!state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}

function EditarPdvBaseForm({ data, pdv }: { data: PdvsPanelData; pdv: PdvListadoItem }) {
  const [state, formAction] = useActionState(actualizarPdvBase, ESTADO_PDV_INICIAL);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="pdv_id" value={pdv.id} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Clave BTL" name="clave_btl" defaultValue={pdv.claveBtl} required />
        <Input label="Nombre PDV" name="nombre" defaultValue={pdv.nombre} required />
        <Select
          label="Cadena"
          name="cadena_id"
          defaultValue={pdv.cadenaId ?? ''}
          options={buildCadenaOptions(data.cadenas)}
        />
        <Select
          label="Ciudad"
          name="ciudad_id"
          defaultValue={pdv.ciudadId ?? ''}
          options={buildCiudadOptions(data.ciudades)}
        />
        <Input label="Zona" name="zona" defaultValue={pdv.zona ?? ''} />
        <Input label="Direccion" name="direccion" defaultValue={pdv.direccion ?? ''} />
        <Input label="Formato" name="formato" defaultValue={pdv.formato ?? ''} />
        <Input label="ID PDV cadena" name="id_cadena" defaultValue={pdv.idCadena ?? ''} />
        <Select
          label="Estatus"
          name="estatus"
          defaultValue={pdv.estatus}
          options={[
            { value: 'ACTIVO', label: 'ACTIVO' },
            { value: 'INACTIVO', label: 'INACTIVO' },
          ]}
        />
      </div>
      <SubmitButton idleLabel="Guardar ficha" pendingLabel="Guardando..." variant="secondary" />
      <FormMessage state={state} />
    </form>
  );
}

function GeocercaForm({ data, pdv }: { data: PdvsPanelData; pdv: PdvListadoItem }) {
  const [state, formAction] = useActionState(actualizarGeocercaPdv, ESTADO_PDV_INICIAL);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="pdv_id" value={pdv.id} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input
          label="Coordenadas"
          name="coordenadas"
          defaultValue={
            pdv.latitud !== null && pdv.longitud !== null ? `${pdv.latitud.toFixed(7)}, ${pdv.longitud.toFixed(7)}` : ''
          }
          placeholder="19.432608, -99.133209"
          hint="Usa el formato latitud, longitud."
          required
        />
        <Input
          label="Radio geocerca (m)"
          name="radio_tolerancia_metros"
          type="number"
          min="1"
          max="1000"
          defaultValue={pdv.radioMetros ?? data.geocercaDefaultMetros}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="permite_checkin_con_justificacion"
          defaultChecked={
            pdv.geocercaCompleta
              ? pdv.permiteCheckinConJustificacion
              : data.permiteCheckinConJustificacionDefault
          }
          className="h-4 w-4 rounded border-slate-300"
        />
        Permitir check-in con justificacion
      </label>
      <SubmitButton
        idleLabel="Actualizar geocerca"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      <FormMessage state={state} />
    </form>
  );
}
function HorarioForm({ data, pdv }: { data: PdvsPanelData; pdv: PdvListadoItem }) {
  const [state, formAction] = useActionState(actualizarHorarioPdv, ESTADO_PDV_INICIAL);
  const [mode, setMode] = useState<'CADENA' | 'PERSONALIZADO'>(
    pdv.horarioMode === 'CADENA' ? 'CADENA' : 'PERSONALIZADO'
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="pdv_id" value={pdv.id} />
      <Select
        label="Modo horario"
        name="horario_mode"
        value={mode}
        onChange={(event) => setMode(event.target.value as 'CADENA' | 'PERSONALIZADO')}
        options={[
          { value: 'CADENA', label: 'Heredado cadena' },
          { value: 'PERSONALIZADO', label: 'Personalizado' },
        ]}
      />
      <ScheduleFields mode={mode} turnosCadena={data.turnosCadena} pdv={pdv} />
      <SubmitButton
        idleLabel="Actualizar horario"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      <FormMessage state={state} />
    </form>
  );
}

function SupervisorForm({ data, pdv }: { data: PdvsPanelData; pdv: PdvListadoItem }) {
  const [state, formAction] = useActionState(actualizarSupervisorPdv, ESTADO_PDV_INICIAL);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="pdv_id" value={pdv.id} />
      <Select
        label="Cambiar de supervisor"
        name="supervisor_empleado_id"
        defaultValue={pdv.supervisorActualId ?? ''}
        options={buildSupervisorOptions(data.supervisores)}
      />
      <SubmitButton
        idleLabel="Actualizar supervisor"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      <FormMessage state={state} />
    </form>
  );
}

function ScheduleFields({
  mode,
  turnosCadena,
  pdv,
}: {
  mode: 'CADENA' | 'PERSONALIZADO';
  turnosCadena: PdvTurnoCatalogOption[];
  pdv?: PdvListadoItem;
}) {
  if (mode === 'CADENA') {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Select
          label="Turno catalogo cadena"
          name="turno_nomenclatura"
          defaultValue={pdv?.horarios[0]?.code ?? ''}
          options={[
            {
              value: '',
              label: turnosCadena.length > 0 ? 'Selecciona un turno' : 'Sin catalogo disponible',
            },
            ...turnosCadena.map((item) => ({ value: item.nomenclatura, label: item.label })),
          ]}
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 md:col-span-2">
          La herencia usa el catalogo operativo de cadena cargado en configuracion. Al aplicar este
          modo se desactivan reglas personalizadas activas del PDV.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Input
        label="Codigo turno"
        name="turno_nomenclatura"
        defaultValue={pdv?.horarios[0]?.code ?? ''}
        placeholder="Opcional"
      />
      <Input
        label="Hora entrada"
        name="hora_entrada"
        type="time"
        defaultValue={pdv?.horarios[0]?.horaEntrada ?? pdv?.horarioEntrada ?? ''}
        required
      />
      <Input
        label="Hora salida"
        name="hora_salida"
        type="time"
        defaultValue={pdv?.horarios[0]?.horaSalida ?? pdv?.horarioSalida ?? ''}
        required
      />
      <Input
        label="Observaciones"
        name="horario_observaciones"
        defaultValue={pdv?.horarios[0]?.observations ?? ''}
        placeholder="Opcional"
      />
    </div>
  );
}

function CoverageMap({
  pdvs,
  selectedPdvId,
  onSelect,
}: {
  pdvs: PdvListadoItem[];
  selectedPdvId: string | null;
  onSelect: (pdvId: string) => void;
}) {
  const points = pdvs.filter(
    (item) => item.latitud !== null && item.longitud !== null && item.geocercaCompleta
  );

  const latitudes = points.map((item) => item.latitud ?? 0);
  const longitudes = points.map((item) => item.longitud ?? 0);
  const minLat = points.length > 0 ? Math.min(...latitudes) : null;
  const maxLat = points.length > 0 ? Math.max(...latitudes) : null;
  const minLng = points.length > 0 ? Math.min(...longitudes) : null;
  const maxLng = points.length > 0 ? Math.max(...longitudes) : null;
  const mapPoints: MexicoMapPoint[] = points.map((pdv) => ({
    id: pdv.id,
    lat: pdv.latitud ?? 0,
    lng: pdv.longitud ?? 0,
    title: pdv.nombre,
    subtitle: `${pdv.claveBtl} · ${pdv.ciudad ?? 'Sin ciudad'}`,
    detail: `${pdv.cadena ?? 'Sin cadena'} · ${pdv.zona ?? 'Sin zona'}`,
    tone:
      pdv.estatus === 'INACTIVO' ? 'slate' : pdv.alertarGeocercaFueraDeRango ? 'amber' : 'emerald',
    radiusMeters: pdv.radioMetros,
  }));

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Mapa operacional</h2>
          <p className="mt-1 text-sm text-slate-500">
            Vista geoespacial de PDVs filtrados con geocerca. Haz clic en un punto para abrir su
            detalle.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusPill label="Geocerca OK" className="bg-emerald-100 text-emerald-700" />
          <StatusPill label="Radio alerta" className="bg-amber-100 text-amber-700" />
          <StatusPill label="Inactivo" className="bg-slate-200 text-slate-700" />
        </div>
      </div>

      <div className="mt-5">
        {points.length > 0 ? (
          <MexicoMap
            points={mapPoints}
            selectedPointId={selectedPdvId}
            onSelect={onSelect}
            showCoverageCircles
            heightClassName="h-[320px] sm:h-[360px]"
          />
        ) : (
          <div className="flex h-[320px] items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 px-6 text-center sm:h-[360px]">
            <div className="max-w-sm space-y-2">
              <p className="text-base font-semibold text-slate-900">Sin resultados en el mapa</p>
              <p className="text-sm leading-6 text-slate-500">
                No hay puntos de venta con geocerca dentro de los filtros actuales. Ajusta los
                filtros o borralos para volver a ver ubicaciones en Mexico.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoRow label="PDVs georreferenciados" value={String(points.length)} />
        <InfoRow
          label="Latitud"
          value={
            minLat !== null && maxLat !== null
              ? `${minLat.toFixed(3)} a ${maxLat.toFixed(3)}`
              : 'Sin resultados'
          }
        />
        <InfoRow
          label="Longitud"
          value={
            minLng !== null && maxLng !== null
              ? `${minLng.toFixed(3)} a ${maxLng.toFixed(3)}`
              : 'Sin resultados'
          }
        />
      </div>
    </Card>
  );
}

function HorarioSummary({ horarios }: { horarios: PdvHorarioItem[] }) {
  if (horarios.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        El PDV no tiene horario efectivo configurado.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {horarios.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
        >
          <div className="flex flex-wrap gap-2">
            <StatusPill label={item.source} className={getHorarioTone(item.source)} />
            {item.code && <StatusPill label={item.code} className="bg-slate-100 text-slate-700" />}
          </div>
          <p className="mt-3 font-medium text-slate-900">{item.dayLabel}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatTime(item.horaEntrada)} - {formatTime(item.horaSalida)}
          </p>
          {item.observations && <p className="mt-2 text-xs text-slate-500">{item.observations}</p>}
        </div>
      ))}
    </div>
  );
}
function SupervisorHistoryList({ items }: { items: PdvSupervisorHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Sin historial de supervisor cargado.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
        >
          <div className="flex flex-wrap gap-2">
            <StatusPill
              label={item.activo ? 'ACTIVO' : 'HISTORICO'}
              className={
                item.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
              }
            />
          </div>
          <p className="mt-3 font-medium text-slate-900">
            {item.empleado ?? 'Supervisor sin nombre'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(item.fechaInicio)} - {formatDate(item.fechaFin)}
          </p>
        </div>
      ))}
    </div>
  );
}

function AssignmentHistoryList({ items }: { items: PdvListadoItem['historialAsignaciones'] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Sin asignaciones recientes para este PDV.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
        >
          <div className="flex flex-wrap gap-2">
            <StatusPill label={item.tipo} className="bg-sky-100 text-sky-700" />
            <StatusPill
              label={item.estadoPublicacion}
              className={
                item.estadoPublicacion === 'PUBLICADA'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }
            />
          </div>
          <p className="mt-3 font-medium text-slate-900">
            {item.empleado ?? 'Sin empleado vinculado'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(item.fechaInicio)} - {formatDate(item.fechaFin)}
          </p>
        </div>
      ))}
    </div>
  );
}

function AttendanceHistoryList({ items }: { items: PdvAttendanceHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Sin asistencias recientes para este PDV.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
        >
          <div className="flex flex-wrap gap-2">
            <StatusPill label={item.estatus} className={getAsistenciaTone(item.estatus)} />
            <StatusPill label={item.estadoGps} className={getGpsTone(item.estadoGps)} />
          </div>
          <p className="mt-3 font-medium text-slate-900">{item.empleado}</p>
          <div className="mt-1 grid gap-1 text-xs text-slate-500">
            <span>fecha: {formatDate(item.fechaOperacion)}</span>
            <span>check-in: {formatDateTime(item.checkInUtc)}</span>
            <span>distancia: {formatDistance(item.distanciaCheckInMetros)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildCadenaOptions(cadenas: PdvCadenaOption[]) {
  return [
    { value: '', label: 'Selecciona una cadena' },
    ...cadenas.map((item) => ({ value: item.id, label: item.nombre })),
  ];
}

function buildCiudadOptions(ciudades: PdvCiudadOption[]) {
  return [
    { value: '', label: 'Selecciona una ciudad' },
    ...ciudades.map((item) => ({
      value: item.id,
      label: [item.nombre, item.estado ?? 'Sin estado', item.zona].filter(Boolean).join(' · '),
    })),
  ];
}

function buildSupervisorOptions(supervisores: PdvSupervisorOption[]) {
  return [
    { value: '', label: 'Selecciona un supervisor' },
    ...supervisores.map((item) => ({
      value: item.id,
      label: item.zona ? `${item.nombreCompleto} · ${item.zona}` : item.nombreCompleto,
    })),
  ];
}

function FormMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
  );
}

function DetailCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
}: {
  idleLabel: string;
  pendingLabel: string;
  variant: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  const className =
    variant === 'primary'
      ? 'bg-slate-950 text-white hover:bg-slate-800'
      : 'bg-sky-600 text-white hover:bg-sky-500';

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </Card>
  );
}

function StatusPill({ label, className }: { label: ReactNode; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
