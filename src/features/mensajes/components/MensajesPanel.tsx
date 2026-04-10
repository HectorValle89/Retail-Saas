'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EvidencePreview } from '@/components/ui/evidence-preview'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Select } from '@/components/ui/select'
import { ESTADO_MENSAJE_INICIAL } from '../state'
import {
  marcarMensajeLeido,
  publicarMensajeInterno,
  responderEncuesta,
} from '../actions'
import { injectDirectR2Manifest } from '@/lib/storage/directR2Client'
import type {
  MensajeItem,
  MensajesPanelData,
  SurveyAnalyticsItem,
} from '../services/mensajeService'

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function buildMensajesHref(
  page: number,
  pageSize: number,
  direction: MensajesPanelData['direction'],
  tab: MensajesPanelData['tab']
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    tab,
  })

  if (direction !== 'todos') {
    params.set('direction', direction)
  }

  return `/mensajes?${params.toString()}`
}

export function MensajesPanel({ data }: { data: MensajesPanelData }) {
  const topTabs = data.puedeVerAnalitica
    ? [
        { value: 'bandeja', label: 'Bandeja' },
        { value: 'analitica', label: 'Analitica de encuestas' },
      ]
    : [{ value: 'bandeja', label: 'Bandeja' }]

  const directionTabs = data.esSoloReceptor
    ? [
        { value: 'recibidos', label: `Recibidos (${data.resumen.recibidos})` },
        { value: 'leidos', label: `Leidos (${data.resumen.leidos})` },
      ]
    : [
        { value: 'todos', label: `Todos (${data.resumen.totalMensajes})` },
        { value: 'enviados', label: `Enviados (${data.resumen.enviados})` },
        { value: 'recibidos', label: `Recibidos (${data.resumen.recibidos})` },
      ]

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <section className={`grid gap-4 ${data.esSoloReceptor ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        <MetricCard label="Mensajes visibles" value={String(data.resumen.totalMensajes)} />
        <MetricCard label="No leidos" value={String(data.resumen.noLeidos)} />
        {!data.esSoloReceptor ? (
          <MetricCard label="Encuestas pendientes" value={String(data.resumen.encuestasPendientes)} />
        ) : null}
      </section>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {topTabs.map((item) => {
            const active = data.tab === item.value
            return (
              <Link
                key={item.value}
                href={buildMensajesHref(1, data.pageSize, data.direction, item.value as MensajesPanelData['tab'])}
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

        {data.tab === 'bandeja' && (
          <>
            <div className="flex flex-wrap gap-2">
              {directionTabs.map((item) => {
                const active = data.direction === item.value
                return (
                  <Link
                    key={item.value}
                    href={buildMensajesHref(1, data.pageSize, item.value as MensajesPanelData['direction'], data.tab)}
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
              {data.esSoloReceptor
                ? 'Bandeja personal por empleado autenticado, separada entre mensajes recibidos y mensajes ya leidos.'
                : 'Bandeja personal por empleado autenticado, separada entre mensajes enviados, recibidos y encuestas pendientes.'}
            </p>
          </>
        )}

        {data.puedeVerAnalitica && data.tab === 'analitica' && (
          <p className="text-sm text-slate-500">
            Todas las encuestas enviadas quedan disponibles aqui para revisar alcance, tasa de respuesta y resultados.
          </p>
        )}
      </Card>

      {data.puedeGestionar && <ComposerCard data={data} />}

      {data.tab === 'bandeja' ? (
        <InboxSection data={data} />
      ) : (
        <AnalyticsSection data={data} />
      )}
    </div>
  )
}

function InboxSection({ data }: { data: MensajesPanelData }) {
  return (
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
              href={buildMensajesHref(data.page - 1, data.pageSize, data.direction, data.tab)}
              className="rounded-full border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
            >
              Anterior
            </Link>
          )}
          {data.hasMore && (
            <Link
              href={buildMensajesHref(data.page + 1, data.pageSize, data.direction, data.tab)}
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
  )
}

function AnalyticsSection({ data }: { data: MensajesPanelData }) {
  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Analitica de encuestas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Alcance, respondidas y resultados por encuesta enviada.
          </p>
        </div>
        <div className="text-xs text-slate-500">Pagina {data.page}</div>
      </div>

      <div className="space-y-4">
        {data.surveyAnalytics.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
            No hay encuestas enviadas para analizar.
          </p>
        ) : (
          data.surveyAnalytics.map((survey) => <SurveyAnalyticsCard key={survey.id} survey={survey} />)
        )}
      </div>
    </Card>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />
}

function ComposerCard({ data }: { data: MensajesPanelData }) {
  const [state, formAction] = useActionState(publicarMensajeInterno, ESTADO_MENSAJE_INICIAL)
  const [isUploadingR2, setIsUploadingR2] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    const attachmentFiles = formData
      .getAll('adjunto')
      .filter((item): item is File => item instanceof File && item.size > 0)

    if (attachmentFiles.length > 0) {
      setIsUploadingR2(true)
      try {
        await injectDirectR2Manifest(formData, attachmentFiles, {
          modulo: 'mensajes',
          manifestFieldName: 'adjunto_r2_manifest',
          removeFieldName: 'adjunto',
        })
      } catch (error) {
        console.error('No fue posible subir adjuntos de mensajes a R2.', error)
      } finally {
        setIsUploadingR2(false)
      }
    }

    const submit = formAction as unknown as (payload: FormData) => void
    submit(formData)
  }

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Publicar mensaje o encuesta</h2>
        <p className="mt-1 text-sm text-slate-500">
          Administracion y Coordinacion pueden enviar comunicacion general por rol, zona, supervisor o todos los DCs. Las encuestas aceptan multiple opcion o respuesta libre y pueden cargarse desde Excel.
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Titulo" name="titulo" required />
          <Select
            label="Tipo"
            name="tipo"
            defaultValue="MENSAJE"
            options={[
              { value: 'MENSAJE', label: 'Mensaje general' },
              { value: 'ENCUESTA', label: 'Encuesta' },
            ]}
          />
          <Select
            label="Grupo destino"
            name="grupo_destino"
            defaultValue="PUESTO"
            options={[
              { value: 'PUESTO', label: 'Rol operativo' },
              { value: 'TODOS_DCS', label: 'Todos los DCs' },
              { value: 'ZONA', label: 'Zona' },
              { value: 'SUPERVISOR', label: 'Supervisor' },
            ]}
          />
          <Select
            label="Rol destino"
            name="puesto_destino"
            defaultValue=""
            options={[{ value: '', label: 'Rol (opcional)' }, ...data.puestosDestino]}
          />
          <Select
            label="Zona"
            name="zona"
            defaultValue=""
            options={[{ value: '', label: 'Zona (opcional)' }, ...data.zonas]}
          />
          <Select
            label="Supervisor"
            name="supervisor_empleado_id"
            defaultValue=""
            options={[{ value: '', label: 'Supervisor (opcional)' }, ...data.supervisores]}
          />
          <Select
            label="Visibilidad de respuestas"
            name="survey_visibility"
            defaultValue="ANONIMA"
            options={[
              { value: 'ANONIMA', label: 'Encuesta anonima' },
              { value: 'IDENTIFICADA', label: 'Mostrar quien respondio' },
            ]}
          />
          <Select
            label="Tipo de pregunta manual"
            name="pregunta_tipo"
            defaultValue="OPCION_MULTIPLE"
            options={[
              { value: 'OPCION_MULTIPLE', label: 'Opcion multiple' },
              { value: 'RESPUESTA_LIBRE', label: 'Respuesta libre' },
            ]}
          />
        </div>

        <FieldTextarea label="Mensaje" name="cuerpo" rows={3} required placeholder="Contexto operativo, instruccion o seguimiento." />
        <Input label="Pregunta manual" name="pregunta_titulo" hint="Si no subes Excel, esta sera la pregunta principal de la encuesta." />
        <FieldTextarea label="Descripcion de pregunta" name="pregunta_descripcion" rows={2} placeholder="Ayuda opcional para contextualizar la pregunta." />
        <FieldTextarea label="Opciones de respuesta" name="opciones_respuesta" rows={3} placeholder="Solo para opcion multiple. Una opcion por linea." />
        <Input
          label="Encuesta por Excel"
          name="encuesta_excel"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hint="Sube una plantilla XLSX para generar varias preguntas. Si la subes, reemplaza la pregunta manual."
        />
        <div className="text-sm">
          <Link href="/api/mensajes/encuestas-template" className="font-medium text-cyan-700 underline-offset-2 hover:underline">
            Descargar plantilla de encuesta
          </Link>
        </div>
        <Input
          label="Adjuntos"
          name="adjunto"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          hint="Se optimizan automaticamente a un objetivo operativo de hasta 100 KB por archivo compatible."
        />

        <StateMessage state={state} />
        <SubmitButton
          idleLabel={isUploadingR2 ? 'Subiendo adjuntos...' : 'Publicar'}
          pendingLabel="Publicando..."
        />
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
            {mensaje.tipo === 'ENCUESTA' && (
              <>
                <span>•</span>
                <span>{mensaje.surveyVisibility === 'ANONIMA' ? 'Anonima' : 'Identificada'}</span>
              </>
            )}
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

      {mensaje.tipo === 'ENCUESTA' && mensaje.surveyQuestions.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-4">
          <p className="text-sm font-semibold text-slate-950">Preguntas</p>
          <div className="mt-3 space-y-3">
            {mensaje.surveyQuestions.map((item, index) => (
              <div key={item.id} className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <p className="font-medium">{index + 1}. {item.titulo}</p>
                {item.descripcion && <p className="mt-1 text-slate-500">{item.descripcion}</p>}
                {item.tipoPregunta === 'OPCION_MULTIPLE' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.opciones.map((option) => (
                      <span key={option.id} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700">
                        {option.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
          {mensaje.surveyQuestions.length > 0 ? (
            mensaje.surveyQuestions.map((question) =>
              question.tipoPregunta === 'OPCION_MULTIPLE' ? (
                <Select
                  key={question.id}
                  label={question.titulo}
                  name={`pregunta_${question.id}`}
                  defaultValue=""
                  options={[
                    { value: '', label: 'Selecciona una opcion' },
                    ...question.opciones.map((item) => ({ value: item.id, label: item.label })),
                  ]}
                />
              ) : (
                <FieldTextarea
                  key={question.id}
                  label={question.titulo}
                  name={`pregunta_${question.id}`}
                  rows={3}
                  required={question.obligatoria}
                  placeholder="Escribe tu respuesta"
                />
              )
            )
          ) : (
            <Select
              label="Responder encuesta"
              name="respuesta"
              defaultValue=""
              options={[
                { value: '', label: 'Selecciona una opcion' },
                ...mensaje.opcionesRespuesta.map((item) => ({ value: item.label, label: item.label })),
              ]}
            />
          )}
          <StateMessage state={surveyState} />
          <SubmitButton idleLabel="Enviar respuesta" pendingLabel="Enviando..." />
        </form>
      )}
    </article>
  )
}

function SurveyAnalyticsCard({ survey }: { survey: SurveyAnalyticsItem }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span>{survey.audienceLabel}</span>
            <span>•</span>
            <span>{survey.anonymous ? 'Anonima' : 'Identificada'}</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">{survey.titulo}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{survey.cuerpo}</p>
        </div>
        <div className="min-w-52 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p>Creada: {formatDateTime(survey.createdAt)}</p>
          <p className="mt-1">Creado por: {survey.creadoPor ?? 'Sistema'}</p>
          <p className="mt-3 font-medium">Alcance: {survey.respondidas}/{survey.totalReceptores}</p>
          <p className="mt-1 text-slate-500">Pendientes: {survey.pendientes}</p>
          <p className="mt-1 text-slate-500">Tasa: {survey.responseRate}%</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {survey.questions.map((question) => (
          <div key={question.id} className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-sm font-semibold text-slate-950">{question.titulo}</p>
            <p className="mt-1 text-xs text-slate-500">Respuestas: {question.respuestasTotales}</p>

            {question.tipoPregunta === 'OPCION_MULTIPLE' ? (
              <div className="mt-3 space-y-2">
                {question.opciones.map((option) => (
                  <div key={option.id}>
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <span>{option.label}</span>
                      <span>{option.count} · {option.percentage}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-cyan-500"
                        style={{ width: `${Math.min(option.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {question.respuestasTexto.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin respuestas de texto todavia.</p>
                ) : (
                  question.respuestasTexto.map((item, index) => (
                    <div key={`${question.id}-${index}`} className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                      <p>{item.value}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.empleadoNombre ? `${item.empleadoNombre} · ` : ''}{formatDateTime(item.respondedAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
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
