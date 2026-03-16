'use client'

import { useActionState, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  agregarVisitaRutaSemanal,
  completarVisitaRutaSemanal,
  ESTADO_RUTA_INICIAL,
} from '../actions'
import {
  type RutaSemanalItem,
  type RutaSemanalPanelData,
  type RutaSemanalVisitItem,
} from '../services/rutaSemanalService'
import { WEEK_DAY_OPTIONS } from '../lib/weeklyRoute'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00`))
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Pendiente'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getRouteTone(estatus: RutaSemanalItem['estatus']) {
  if (estatus === 'CERRADA') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (estatus === 'EN_PROGRESO') {
    return 'bg-sky-100 text-sky-700'
  }

  if (estatus === 'PUBLICADA') {
    return 'bg-violet-100 text-violet-700'
  }

  return 'bg-slate-100 text-slate-700'
}

function getVisitTone(estatus: RutaSemanalVisitItem['estatus']) {
  if (estatus === 'COMPLETADA') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (estatus === 'CANCELADA') {
    return 'bg-rose-100 text-rose-700'
  }

  return 'bg-amber-100 text-amber-700'
}

export function RutaSemanalPanel({
  data,
  actorPuesto,
}: {
  data: RutaSemanalPanelData
  actorPuesto: string
}) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(data.rutas[0]?.id ?? null)
  const selectedRoute = data.rutas.find((item) => item.id === selectedRouteId) ?? data.rutas[0] ?? null

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!data.puedeEditar && (
        <Card className="border-slate-200 bg-slate-50 text-slate-700">
          <p className="font-medium">Vista solo lectura</p>
          <p className="mt-2 text-sm">
            Tu puesto actual es <span className="font-semibold">{actorPuesto}</span>. Solo SUPERVISOR puede planificar o cerrar visitas; COORDINADOR y ADMINISTRADOR consultan la semana y el cumplimiento.
          </p>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Rutas visibles" value={String(data.resumen.totalRutas)} />
        <MetricCard label="Visitas" value={String(data.resumen.totalVisitas)} />
        <MetricCard label="Completadas" value={String(data.resumen.visitasCompletadas)} />
        <MetricCard label="PDVs asignables" value={String(data.resumen.pdvsAsignables)} />
      </section>

      {data.puedeEditar && <PlanificarRutaCard data={data} />}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Rutas semanales</h2>
            <p className="mt-1 text-sm text-slate-500">
              Semanas publicadas o en progreso con conteo de visitas por supervisor.
            </p>
          </div>
          <div className="space-y-3 px-4 py-4">
            {data.rutas.length === 0 ? (
              <p className="px-2 py-8 text-sm text-slate-500">
                Todavia no hay rutas registradas. En cuanto el supervisor agregue visitas, apareceran aqui.
              </p>
            ) : (
              data.rutas.map((ruta) => (
                <button
                  key={ruta.id}
                  type="button"
                  onClick={() => setSelectedRouteId(ruta.id)}
                  className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                    selectedRoute?.id === ruta.id
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {ruta.supervisor ?? 'Supervisor sin nombre'}
                      </p>
                      <p className={`mt-1 text-xs ${selectedRoute?.id === ruta.id ? 'text-slate-300' : 'text-slate-400'}`}>
                        {formatDate(ruta.semanaInicio)} - {formatDate(ruta.semanaFin)}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${selectedRoute?.id === ruta.id ? 'bg-white/10 text-white' : getRouteTone(ruta.estatus)}`}>
                      {ruta.estatus}
                    </span>
                  </div>
                  <div className={`mt-3 text-sm ${selectedRoute?.id === ruta.id ? 'text-slate-200' : 'text-slate-600'}`}>
                    {ruta.visitasCompletadas}/{ruta.totalVisitas} visitas completadas
                  </div>
                  {ruta.notas && (
                    <p className={`mt-2 text-xs ${selectedRoute?.id === ruta.id ? 'text-slate-300' : 'text-slate-500'}`}>
                      {ruta.notas}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Mapa y secuencia</h2>
              <p className="mt-1 text-sm text-slate-500">
                Orden semanal de visita con coordenadas de geocerca cuando el PDV ya esta ubicado.
              </p>
            </div>
            <div className="px-6 py-5">
              {selectedRoute ? <RouteMap visits={selectedRoute.visitas} /> : <p className="text-sm text-slate-500">Selecciona una ruta para ver la secuencia.</p>}
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Detalle de visitas</h2>
              <p className="mt-1 text-sm text-slate-500">
                Lista diaria ordenada. La visita se cierra con selfie obligatoria, checklist de calidad y evidencia opcional.
              </p>
            </div>
            <div className="space-y-5 px-6 py-5">
              {!selectedRoute ? (
                <p className="text-sm text-slate-500">Aun no hay una ruta seleccionada.</p>
              ) : (
                WEEK_DAY_OPTIONS.map((day) => {
                  const visits = selectedRoute.visitas.filter((item) => item.diaSemana === day.value)

                  if (visits.length === 0) {
                    return null
                  }

                  return (
                    <div key={`${selectedRoute.id}-${day.value}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-950">{day.label}</h3>
                        <span className="text-xs text-slate-500">{visits.length} visita(s)</span>
                      </div>
                      <div className="mt-4 space-y-4">
                        {visits.map((visit) => (
                          <VisitCard key={visit.id} item={visit} canEdit={data.puedeEditar} />
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}

function PlanificarRutaCard({ data }: { data: RutaSemanalPanelData }) {
  const [state, formAction] = useActionState(agregarVisitaRutaSemanal, ESTADO_RUTA_INICIAL)

  return (
    <Card className="border-slate-200 bg-white">
      <h2 className="text-lg font-semibold text-slate-950">Planificar semana</h2>
      <p className="mt-1 text-sm text-slate-500">
        Agrega PDVs activos de tus asignaciones publicadas a la semana operativa en curso.
      </p>
      <form action={formAction} className="mt-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input label="Semana inicia" name="semana_inicio" type="date" defaultValue={data.semanaActualInicio} required />
          <Select
            label="Dia"
            name="dia_semana"
            defaultValue="1"
            options={WEEK_DAY_OPTIONS.map((day) => ({ value: String(day.value), label: day.label }))}
          />
          <Input label="Orden" name="orden" type="number" min="1" max="99" defaultValue="1" required />
          <Select
            label="PDV"
            name="pdv_id"
            defaultValue=""
            options={[
              { value: '', label: data.pdvsDisponibles.length === 0 ? 'Sin PDVs activos para la semana' : 'Selecciona un PDV asignado' },
              ...data.pdvsDisponibles.map((item) => ({
                value: item.id,
                label: `${item.claveBtl} - ${item.nombre}${item.zona ? ` - ${item.zona}` : ''}`,
              })),
            ]}
          />
          <Input label="Notas ruta" name="notas" placeholder="Ajustes, eventualidades o foco comercial" />
        </div>
        {state.message && (
          <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
        )}
        <SubmitButton label="Agregar visita" />
      </form>
    </Card>
  )
}

function VisitCard({ item, canEdit }: { item: RutaSemanalVisitItem; canEdit: boolean }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
              {item.diaShortLabel} #{item.orden}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${getVisitTone(item.estatus)}`}>
              {item.estatus}
            </span>
          </div>
          <p className="mt-3 text-base font-semibold text-slate-950">{item.pdv ?? 'PDV sin nombre'}</p>
          <p className="mt-1 text-sm text-slate-600">
            {item.pdvClaveBtl ?? 'Sin clave'} / {item.zona ?? 'Sin zona'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{item.direccion ?? 'Sin direccion operativa'}</p>
        </div>
        <div className="text-sm text-slate-500">
          <p>Lat: {item.latitud === null ? 'N/D' : item.latitud.toFixed(5)}</p>
          <p>Lng: {item.longitud === null ? 'N/D' : item.longitud.toFixed(5)}</p>
          <p className="mt-2">Completada: {formatDateTime(item.completadaEn)}</p>
        </div>
      </div>

      {item.comentarios && <p className="mt-3 text-sm text-slate-600">{item.comentarios}</p>}

      {canEdit && item.estatus !== 'COMPLETADA' && <CompletarVisitaCard visitId={item.id} />}
    </div>
  )
}

function CompletarVisitaCard({ visitId }: { visitId: string }) {
  const [state, formAction] = useActionState(completarVisitaRutaSemanal, ESTADO_RUTA_INICIAL)

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="visita_id" value={visitId} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Selfie URL" name="selfie_url" placeholder="https://..." required />
        <Input label="Evidencia URL" name="evidencia_url" placeholder="https://..." />
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
          <input type="checkbox" name="checklist_fachada_ok" value="true" className="h-4 w-4 rounded border-slate-300" />
          Fachada ok
        </label>
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
          <input type="checkbox" name="checklist_material_ok" value="true" className="h-4 w-4 rounded border-slate-300" />
          Material ok
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-[220px_1fr]">
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
          <input type="checkbox" name="checklist_equipo_ok" value="true" className="h-4 w-4 rounded border-slate-300" />
          Equipo ok
        </label>
        <Input label="Comentarios" name="comentarios" placeholder="Incidencias, hallazgos o seguimiento" />
      </div>
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
      )}
      <SubmitButton label="Marcar completada" />
    </form>
  )
}

function RouteMap({ visits }: { visits: RutaSemanalVisitItem[] }) {
  const points = visits.filter((item) => item.latitud !== null && item.longitud !== null)

  if (points.length === 0) {
    return <p className="text-sm text-slate-500">Aun no hay coordenadas suficientes para dibujar la ruta.</p>
  }

  const width = 640
  const height = 280
  const padding = 28
  const minLat = Math.min(...points.map((item) => item.latitud as number))
  const maxLat = Math.max(...points.map((item) => item.latitud as number))
  const minLng = Math.min(...points.map((item) => item.longitud as number))
  const maxLng = Math.max(...points.map((item) => item.longitud as number))
  const latRange = Math.max(maxLat - minLat, 0.001)
  const lngRange = Math.max(maxLng - minLng, 0.001)

  const normalized = points.map((item) => {
    const x = padding + (((item.longitud as number) - minLng) / lngRange) * (width - padding * 2)
    const y = height - padding - (((item.latitud as number) - minLat) / latRange) * (height - padding * 2)

    return {
      ...item,
      x,
      y,
    }
  })

  const pathData = normalized.map((item) => `${item.x},${item.y}`).join(' ')

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full">
          <polyline
            points={pathData}
            fill="none"
            stroke="#0f172a"
            strokeWidth="3"
            strokeDasharray="8 8"
            strokeLinecap="round"
          />
          {normalized.map((item) => (
            <g key={item.id} transform={`translate(${item.x}, ${item.y})`}>
              <circle r="13" fill="#14b8a6" stroke="#0f172a" strokeWidth="2" />
              <text y="5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff">
                {item.orden}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {normalized.map((item) => (
          <div key={`${item.id}-legend`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">
              {item.diaShortLabel} #{item.orden} - {item.pdv}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {item.latitud?.toFixed(5)}, {item.longitud?.toFixed(5)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </Card>
  )
}

function SubmitButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
    >
      {label}
    </button>
  )
}