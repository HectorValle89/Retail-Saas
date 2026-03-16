'use client'

import { useActionState, useDeferredValue, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  ESTADO_ASIGNACION_INICIAL,
  guardarAsignacionPlanificada,
} from '../actions'
import type { AssignmentIssue } from '../lib/assignmentValidation'
import { DIA_LABORAL_CODES } from '../lib/assignmentPlanning'
import type { AsignacionesPanelData } from '../services/asignacionService'
import { AsignacionEstadoControls } from './AsignacionEstadoControls'

function issueTone(severity: AssignmentIssue['severity']) {
  if (severity === 'ERROR') {
    return 'bg-rose-100 text-rose-700'
  }

  if (severity === 'ALERTA') {
    return 'bg-amber-100 text-amber-700'
  }

  return 'bg-sky-100 text-sky-700'
}

function formatDiasLaborales(value: string | null) {
  return value ?? 'Sin captura'
}

export function AsignacionesPanel({
  data,
  puedeGestionar,
}: {
  data: AsignacionesPanelData
  puedeGestionar: boolean
}) {
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('ALL')
  const [tipoFilter, setTipoFilter] = useState('ALL')
  const [issueFilter, setIssueFilter] = useState('ALL')
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  const asignacionesFiltradas = data.asignaciones.filter((item) => {
    const matchesSearch = !deferredSearch
      ? true
      : [item.empleado, item.pdv, item.pdvClaveBtl, item.cadena, item.zona]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(deferredSearch))

    const matchesEstado = estadoFilter === 'ALL' || item.estadoPublicacion === estadoFilter
    const matchesTipo = tipoFilter === 'ALL' || item.tipo === tipoFilter
    const matchesIssue =
      issueFilter === 'ALL'
        ? true
        : item.issues.some((issue) => issue.severity === issueFilter)

    return matchesSearch && matchesEstado && matchesTipo && matchesIssue
  })

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {puedeGestionar ? (
        <NuevaAsignacionCard data={data} />
      ) : (
        <Card className="border-sky-200 bg-sky-50 text-sky-900">
          <p className="font-medium">Vista operativa en solo lectura</p>
          <p className="mt-2 text-sm">
            El alta y la publicacion de asignaciones solo estan habilitadas para administradores.
          </p>
        </Card>
      )}

      {data.avisosGlobales.length > 0 && (
        <Card className="border-sky-200 bg-sky-50">
          <h2 className="text-lg font-semibold text-slate-950">Avisos de cobertura</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.avisosGlobales.map((item) => (
              <div key={item.code} className="rounded-2xl border border-sky-100 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                <p className="mt-1 text-sm text-slate-600">{item.message}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.vistaDia.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Vista del dia</h2>
            <p className="mt-1 text-sm text-slate-500">
              Asignaciones activas hoy para seguimiento operativo de coordinacion y supervision.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Empleado</th>
                  <th className="px-6 py-3 font-medium">PDV</th>
                  <th className="px-6 py-3 font-medium">Horario</th>
                  <th className="px-6 py-3 font-medium">Zona</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.vistaDia.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-900">{item.empleado ?? 'Sin empleado'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.pdv ?? 'Sin PDV'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.pdvClaveBtl ?? 'Sin clave'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.horario ?? 'Sin horario'}</td>
                    <td className="px-6 py-4 text-slate-600">{item.zona ?? 'Sin zona'}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${item.estadoPublicacion === 'PUBLICADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {item.estadoPublicacion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Total visible" value={String(data.resumen.total)} />
        <MetricCard label="Borrador" value={String(data.resumen.borrador)} />
        <MetricCard label="Publicadas" value={String(data.resumen.publicada)} />
        <MetricCard label="Coberturas" value={String(data.resumen.coberturas)} />
        <MetricCard label="Con bloqueo" value={String(data.resumen.conBloqueo)} />
        <MetricCard label="Con alertas" value={String(data.resumen.conAlerta)} />
        <MetricCard label="Con avisos" value={String(data.resumen.conAviso)} />
        <MetricCard label="Publicadas invalidas" value={String(data.resumen.publicadasInvalidas)} />
      </div>

      <Card className="border-slate-200 bg-white">
        <div className="grid gap-4 md:grid-cols-4">
          <Input
            label="Buscar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Empleado, PDV, cuenta o zona"
          />
          <Select
            label="Estado"
            value={estadoFilter}
            onChange={(event) => setEstadoFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'BORRADOR', label: 'Borrador' },
              { value: 'PUBLICADA', label: 'Publicada' },
            ]}
          />
          <Select
            label="Tipo"
            value={tipoFilter}
            onChange={(event) => setTipoFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'FIJA', label: 'Fija' },
              { value: 'ROTATIVA', label: 'Rotativa' },
              { value: 'COBERTURA', label: 'Cobertura' },
            ]}
          />
          <Select
            label="Issues"
            value={issueFilter}
            onChange={(event) => setIssueFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'ERROR', label: 'Errores' },
              { value: 'ALERTA', label: 'Alertas' },
              { value: 'AVISO', label: 'Avisos' },
            ]}
          />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Asignaciones</h2>
          <p className="mt-1 text-sm text-slate-500">
            Listado operativo con validacion tipada, filtros y publicacion controlada.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">PDV</th>
                <th className="px-6 py-3 font-medium">Planeacion</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Issues</th>
                <th className="px-6 py-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {asignacionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Sin asignaciones visibles para los filtros actuales.
                  </td>
                </tr>
              ) : (
                asignacionesFiltradas.map((asignacion) => (
                  <tr key={asignacion.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-900">
                      <div className="font-medium">{asignacion.empleado ?? 'Sin empleado'}</div>
                      <div className="mt-1 text-xs text-slate-400">{asignacion.cuentaCliente ?? 'Sin cuenta'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{asignacion.pdv ?? 'Sin PDV'}</div>
                      <div className="mt-1 text-xs text-slate-400">{asignacion.pdvClaveBtl ?? 'Sin clave'} · {asignacion.cadena ?? 'Sin cadena'}</div>
                      <div className="mt-1 text-xs text-slate-400">{asignacion.zona ?? 'Sin zona'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{asignacion.tipo}</div>
                      <div className="mt-1 text-xs text-slate-400">{asignacion.fechaInicio}{asignacion.fechaFin ? ` -> ${asignacion.fechaFin}` : ''}</div>
                      <div className="mt-1 text-xs text-slate-400">Horario: {asignacion.horario ?? 'Sin referencia'}</div>
                      <div className="mt-1 text-xs text-slate-400">Dias: {formatDiasLaborales(asignacion.diasLaborales)} / descanso {asignacion.diaDescanso ?? 'sin captura'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${asignacion.estadoPublicacion === 'PUBLICADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {asignacion.estadoPublicacion}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {asignacion.issues.length === 0 ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                          Lista para publicar
                        </span>
                      ) : (
                        <div className="space-y-2">
                          {asignacion.issues.map((issue) => (
                            <div key={`${asignacion.id}-${issue.code}`} className={`rounded-full px-3 py-1 text-xs font-medium ${issueTone(issue.severity)}`}>
                              {issue.severity}: {issue.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <AsignacionEstadoControls
                        asignacionId={asignacion.id}
                        estadoPublicacion={asignacion.estadoPublicacion}
                        bloqueada={asignacion.bloqueada}
                        puedeGestionar={puedeGestionar}
                        alertasCount={asignacion.alertasCount}
                        requiereConfirmacionAlertas={asignacion.requiereConfirmacionAlertas}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function NuevaAsignacionCard({ data }: { data: AsignacionesPanelData }) {
  const [state, formAction] = useActionState(
    guardarAsignacionPlanificada,
    ESTADO_ASIGNACION_INICIAL
  )

  return (
    <Card className="border-slate-200 bg-white">
      <h2 className="text-lg font-semibold text-slate-950">Nueva asignacion</h2>
      <p className="mt-1 text-sm text-slate-500">
        Alta mensual con validacion previa, auditoria y salida inicial en BORRADOR.
      </p>

      <form action={formAction} className="mt-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Empleado"
            name="empleado_id"
            defaultValue=""
            options={[
              { value: '', label: 'Selecciona un dermoconsejero' },
              ...data.empleadosDisponibles.map((item) => ({
                value: item.id,
                label: `${item.nombre}${item.zona ? ` - ${item.zona}` : ''}`,
              })),
            ]}
          />
          <Select
            label="PDV"
            name="pdv_id"
            defaultValue=""
            options={[
              { value: '', label: 'Selecciona un PDV activo' },
              ...data.pdvsDisponibles.map((item) => ({
                value: item.id,
                label: `${item.claveBtl} - ${item.nombre}`,
              })),
            ]}
          />
          <Select
            label="Tipo"
            name="tipo"
            defaultValue="FIJA"
            options={[
              { value: 'FIJA', label: 'Fija' },
              { value: 'ROTATIVA', label: 'Rotativa' },
              { value: 'COBERTURA', label: 'Cobertura' },
            ]}
          />
          <Select
            label="Horario"
            name="horario_referencia"
            defaultValue=""
            options={[
              { value: '', label: 'Sin referencia explicita' },
              ...data.turnosDisponibles,
            ]}
          />
          <Input label="Fecha inicio" name="fecha_inicio" type="date" required />
          <Input label="Fecha fin" name="fecha_fin" type="date" />
          <Input label="Factor tiempo" name="factor_tiempo" type="number" step="0.001" min="0.1" defaultValue="1" />
          <Select
            label="Dia descanso"
            name="dia_descanso"
            defaultValue=""
            options={[
              { value: '', label: 'Sin captura' },
              ...DIA_LABORAL_CODES.map((item) => ({ value: item, label: item })),
            ]}
          />
        </div>

        <div>
          <p className="text-sm font-medium text-slate-900">Dias laborales</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {DIA_LABORAL_CODES.map((dia) => (
              <label key={dia} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" name="dias_laborales" value={dia} className="rounded border-slate-300" />
                {dia}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900" htmlFor="asignacion-observaciones">
            Observaciones
          </label>
          <textarea
            id="asignacion-observaciones"
            name="observaciones"
            rows={3}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 focus:border-slate-950 focus:outline-none"
            placeholder="Notas operativas, coberturas o restricciones del punto."
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Guardar en borrador
        </button>

        {state.message && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${state.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            <p>{state.message}</p>
            {state.issues.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {state.issues.map((issue) => (
                  <span key={issue.code} className={`rounded-full px-3 py-1 text-xs font-medium ${issueTone(issue.severity)}`}>
                    {issue.severity}: {issue.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </Card>
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
