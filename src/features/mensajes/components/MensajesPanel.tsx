'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EvidencePreview } from '@/components/ui/evidence-preview'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ESTADO_MENSAJE_INICIAL } from '../state'
import {
  marcarMensajeLeido,
  publicarMensajeInterno,
  responderEncuesta,
} from '../actions'
import type { MensajeItem, MensajesPanelData } from '../services/mensajeService'

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function buildMensajesHref(page: number, pageSize: number, direction: MensajesPanelData['direction']) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })

  if (direction !== 'todos') {
    params.set('direction', direction)
  }

  return `/mensajes?${params.toString()}`
}

export function MensajesPanel({ data }: { data: MensajesPanelData }) {
  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Mensajes visibles" value={String(data.resumen.totalMensajes)} />
        <MetricCard label="No leidos" value={String(data.resumen.noLeidos)} />
        <MetricCard label="Encuestas pendientes" value={String(data.resumen.encuestasPendientes)} />
      </section>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'todos', label: `Todos (${data.resumen.totalMensajes})` },
            { value: 'enviados', label: `Enviados (${data.resumen.enviados})` },
            { value: 'recibidos', label: `Recibidos (${data.resumen.recibidos})` },
          ].map((item) => {
            const active = data.direction === item.value
            return (
              <Link
                key={item.value}
                href={buildMensajesHref(1, data.pageSize, item.value as MensajesPanelData['direction'])}
                className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-cyan-700 bg-cyan-700 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
        <p className="text-sm text-slate-500">
          Historial personal por empleado autenticado, separado entre mensajes enviados y recibidos.
        </p>
      </Card>

      {data.puedeGestionar && <ComposerCard data={data} />}

      <Card className="space-y-4 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Historial de mensajes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Bandeja operativa con lectura y respuesta sobre el alcance actual.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Pagina {data.page}</span>
            {data.page > 1 && (
              <Link
                href={buildMensajesHref(data.page - 1, data.pageSize, data.direction)}
                className="rounded-full border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
              >
                Anterior
              </Link>
            )}
            {data.hasMore && (
              <Link
                href={buildMensajesHref(data.page + 1, data.pageSize, data.direction)}
                className="rounded-full border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {data.mensajes.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              No hay mensajes para el alcance actual.
            </p>
          ) : (
            data.mensajes.map((mensaje) => (
              <MensajeCard key={mensaje.id} mensaje={mensaje} canManage={data.puedeGestionar} />
            ))
          )}
        </div>
      </Card>
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

function ComposerCard({ data }: { data: MensajesPanelData }) {
  const [state, formAction] = useActionState(publicarMensajeInterno, ESTADO_MENSAJE_INICIAL)

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Publicar mensaje</h2>
        <p className="mt-1 text-sm text-slate-500">
          Mensajes internos por zona, supervisor o todos los DCs. Las encuestas aceptan multiples opciones simples.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Titulo" name="titulo" required />
          <Select
            label="Tipo"
            name="tipo"
            defaultValue="MENSAJE"
            options={[
              { value: 'MENSAJE', label: 'Mensaje' },
              { value: 'ENCUESTA', label: 'Encuesta' },
            ]}
          />
          <Select
            label="Grupo destino"
            name="grupo_destino"
            defaultValue="TODOS_DCS"
            options={[
              { value: 'TODOS_DCS', label: 'Todos los DCs' },
              { value: 'ZONA', label: 'Zona' },
              { value: 'SUPERVISOR', label: 'Supervisor' },
            ]}
          />
          <Select
            label="Zona"
            name="zona"
            defaultValue=""
            options={[{ value: '', label: 'Zona (opcional)' }, ...data.zonas]}
          />
        </div>

        <Select
          label="Supervisor"
          name="supervisor_empleado_id"
          defaultValue=""
          options={[{ value: '', label: 'Supervisor (opcional)' }, ...data.supervisores]}
        />

        <FieldTextarea label="Mensaje" name="cuerpo" rows={3} required placeholder="Contexto operativo, instruccion o seguimiento." />
        <FieldTextarea label="Opciones de respuesta" name="opciones_respuesta" rows={3} placeholder="Solo para encuestas. Una opcion por linea." />
        <Input
          label="Adjuntos"
          name="adjunto"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          hint="Se optimizan automaticamente a un objetivo operativo de hasta 100 KB por archivo compatible."
        />

        <StateMessage state={state} />
        <SubmitButton idleLabel="Publicar" pendingLabel="Publicando..." />
      </form>
    </Card>
  )
}

function MensajeCard({ mensaje, canManage }: { mensaje: MensajeItem; canManage: boolean }) {
  const [readState, readAction] = useActionState(marcarMensajeLeido, ESTADO_MENSAJE_INICIAL)
  const [surveyState, surveyAction] = useActionState(responderEncuesta, ESTADO_MENSAJE_INICIAL)
  const recipientState = mensaje.recipientState
  const needsReadAction = recipientState?.estado === 'PENDIENTE'
  const canAnswer = mensaje.tipo === 'ENCUESTA' && recipientState && recipientState.estado !== 'RESPONDIDO'

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span>{mensaje.tipo}</span>
            <span>•</span>
            <span>{mensaje.audienceLabel}</span>
            {mensaje.enviadoPorMi && (
              <>
                <span>•</span>
                <span>Enviado</span>
              </>
            )}
            {mensaje.recibidoPorMi && (
              <>
                <span>•</span>
                <span>Recibido</span>
              </>
            )}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">{mensaje.titulo}</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{mensaje.cuerpo}</p>
        </div>
        <div className="min-w-44 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <p>{formatDateTime(mensaje.createdAt)}</p>
          <p className="mt-2">Creado por: {mensaje.creadoPor ?? 'Sistema'}</p>
          <p className="mt-1">Receptores: {mensaje.totalReceptores}</p>
          {canManage && <p className="mt-1">No leidos: {mensaje.noLeidas}</p>}
          {canManage && mensaje.tipo === 'ENCUESTA' && <p className="mt-1">Respondidas: {mensaje.respondidas}</p>}
        </div>
      </div>

      {recipientState && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-medium">Estado personal: {recipientState.estado}</p>
          {recipientState.respuesta && <p className="mt-1 text-slate-500">Respuesta: {recipientState.respuesta}</p>}
        </div>
      )}

      {mensaje.tipo === 'ENCUESTA' && mensaje.opcionesRespuesta.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-4">
          <p className="text-sm font-semibold text-slate-950">Opciones</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {mensaje.opcionesRespuesta.map((item) => (
              <span key={item.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {mensaje.adjuntos.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-4">
          <p className="text-sm font-semibold text-slate-950">Adjuntos</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {mensaje.adjuntos.map((adjunto) => (
              <EvidencePreview
                key={adjunto.id}
                url={adjunto.archivoUrl}
                label={adjunto.nombreArchivoOriginal}
                hash={adjunto.archivoHash}
              />
            ))}
          </div>
        </div>
      )}

      {needsReadAction && recipientState && (
        <form action={readAction} className="mt-4 flex items-center gap-3">
          <input type="hidden" name="receptor_id" value={recipientState.id} />
          <SubmitButton idleLabel="Marcar como leido" pendingLabel="Actualizando..." />
          <StateMessage state={readState} />
        </form>
      )}

      {canAnswer && recipientState && (
        <form action={surveyAction} className="mt-4 space-y-3">
          <input type="hidden" name="receptor_id" value={recipientState.id} />
          <Select
            label="Responder encuesta"
            name="respuesta"
            defaultValue=""
            options={[
              { value: '', label: 'Selecciona una opcion' },
              ...mensaje.opcionesRespuesta.map((item) => ({ value: item.label, label: item.label })),
            ]}
          />
          <StateMessage state={surveyState} />
          <SubmitButton idleLabel="Enviar respuesta" pendingLabel="Enviando..." />
        </form>
      )}
    </article>
  )
}

function FieldTextarea({
  label,
  name,
  rows,
  placeholder = '',
  required = false,
}: {
  label: string
  name: string
  rows: number
  placeholder?: string
  required?: boolean
}) {
  const fieldId = `${name}-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="w-full">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={fieldId}
        name={name}
        rows={rows}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  )
}

function StateMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) {
    return null
  }

  return <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
}

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" isLoading={pending}>
      {pending ? pendingLabel : idleLabel}
    </Button>
  )
}
