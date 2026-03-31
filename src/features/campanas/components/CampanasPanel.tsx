'use client'

import { useActionState, useEffect, useState, useTransition, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { ActorActual } from '@/lib/auth/session'
import {
  isSingleTenantUiEnabled,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant'
import {
  actualizarCumplimientoCampanaPdv,
  ejecutarTareasCampanaPdv,
  guardarCampana,
} from '../actions'
import { ESTADO_CAMPANA_ADMIN_INICIAL } from '../state'
import type {
  CampanaItem,
  CampanaPdvItem,
  CampanasPanelData,
} from '../services/campanaService'
import {
  CAMPAIGN_STATE_OPTIONS,
  createCampaignEvidenceRequirement,
  createVisitTaskTemplateItem,
  visitTaskRequiresPhoto,
  type CampaignEvidenceKind,
  type CampaignGoalType,
  type VisitTaskKind,
} from '../lib/campaignProgress'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00`))
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function getStatusTone(status: CampanaPdvItem['estatus'] | CampanaItem['estado']) {
  switch (status) {
    case 'ACTIVA':
    case 'CUMPLIDA':
      return 'bg-emerald-100 text-emerald-700'
    case 'BORRADOR':
    case 'PENDIENTE':
      return 'bg-slate-100 text-slate-700'
    case 'EN_PROGRESO':
      return 'bg-sky-100 text-sky-700'
    case 'CANCELADA':
    case 'INCUMPLIDA':
      return 'bg-rose-100 text-rose-700'
    case 'CERRADA':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-violet-100 text-violet-700'
  }
}

function FieldTextarea({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 4,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
  rows?: number
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
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  )
}

function StateMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) {
    return null
  }

  return (
    <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
      {state.message}
    </p>
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

function SubmitActionButton({
  label,
  pendingLabel,
}: {
  label: string
  pendingLabel: string
}) {
  return (
    <Button type="submit" size="sm">
      {label || pendingLabel}
    </Button>
  )
}

interface TaskCaptureDraft {
  file: File
  previewUrl: string
  capturedAt: string
  latitude: number | null
  longitude: number | null
  timestampStamped: boolean
  captureSource: 'camera'
}

async function readCurrentPosition() {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('Este navegador no soporta geolocalizacion para la evidencia.')
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  }
}

async function loadImageBitmap(file: File) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file)
  }

  const image = document.createElement('img')
  const objectUrl = URL.createObjectURL(file)

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('No fue posible abrir la imagen capturada.'))
      image.src = objectUrl
    })

    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function stampTaskEvidenceImage(
  file: File,
  {
    taskLabel,
    capturedAt,
    latitude,
    longitude,
  }: {
    taskLabel: string
    capturedAt: string
    latitude: number | null
    longitude: number | null
  }
) {
  const imageSource = await loadImageBitmap(file)
  const width = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width
  const height = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No fue posible inicializar el sello visual de la evidencia.')
  }

  context.drawImage(imageSource as CanvasImageSource, 0, 0, width, height)

  const lines = [
    `Tarea: ${taskLabel}`,
    `Captura: ${new Date(capturedAt).toLocaleString('es-MX')}`,
    latitude !== null && longitude !== null
      ? `GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
      : 'GPS: no disponible',
  ]

  const fontSize = Math.max(20, Math.round(width * 0.022))
  const lineHeight = Math.round(fontSize * 1.4)
  const padding = Math.max(16, Math.round(width * 0.02))
  const boxHeight = padding * 2 + lineHeight * lines.length

  context.fillStyle = 'rgba(15, 23, 42, 0.78)'
  context.fillRect(0, height - boxHeight, width, boxHeight)
  context.fillStyle = '#F9FAFB'
  context.font = `600 ${fontSize}px sans-serif`
  context.textBaseline = 'top'

  lines.forEach((line, index) => {
    context.fillText(line, padding, height - boxHeight + padding + lineHeight * index)
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('No fue posible generar el archivo sellado de la evidencia.'))
        return
      }

      resolve(value)
    }, 'image/jpeg', 0.84)
  })

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-stamped.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

function buildTaskTemplate(campaign: CampanaItem | null) {
  return (campaign?.taskTemplate ?? []).map((item) => item.label).join('\n')
}

const VISIT_TASK_KIND_OPTIONS: Array<{ value: VisitTaskKind; label: string }> = [
  { value: 'FOTO_ANAQUEL', label: 'Foto de anaquel' },
  { value: 'CONTEO_INVENTARIO', label: 'Conteo de inventario' },
  { value: 'ENCUESTA', label: 'Encuesta' },
  { value: 'REGISTRO_PRECIO', label: 'Registro de precio' },
  { value: 'OTRA', label: 'Otra' },
]

const EVIDENCE_KIND_OPTIONS: Array<{ value: CampaignEvidenceKind; label: string }> = [
  { value: 'FOTO_PRODUCTO', label: 'Foto de producto' },
  { value: 'SELFIE_LABORANDO', label: 'Selfie laborando' },
  { value: 'EVIDENCIA_ACOMODO', label: 'Evidencia de acomodo' },
  { value: 'OTRA', label: 'Otra' },
]

const PRODUCT_GOAL_TYPE_OPTIONS: Array<{ value: CampaignGoalType; label: string }> = [
  { value: 'VENTA', label: 'Cuota de venta' },
  { value: 'EXHIBICION', label: 'Cuota de exhibicion' },
]

export function CampanasPanel({
  actor,
  data,
}: {
  actor: ActorActual
  data: CampanasPanelData
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(data.campanas[0]?.id ?? null)
  const selectedCampaign = data.campanas.find((item) => item.id === selectedCampaignId) ?? null
  const canExecuteFieldTasks = actor.puesto === 'DERMOCONSEJERO'
  const canManageCampaigns = data.puedeGestionar
  const [activeView, setActiveView] = useState<'CREAR' | 'KPIS'>(canManageCampaigns ? 'CREAR' : 'KPIS')

  useEffect(() => {
    if (!canManageCampaigns) {
      setActiveView('KPIS')
    }
  }, [canManageCampaigns])

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!data.puedeGestionar && (
        <Card className="border-slate-200 bg-slate-50 text-slate-700">
          <p className="font-medium">Vista de KPIs y seguimiento</p>
          <p className="mt-2 text-sm">
            Tu puesto actual es <span className="font-semibold">{actor.puesto}</span>. Solo ADMINISTRADOR y VENTAS pueden crear o editar campanas; DERMOCONSEJERO puede ejecutar tareas durante una visita activa y el resto monitorea avance y cumplimiento.
          </p>
        </Card>
      )}

      {canManageCampaigns && (
        <Card className="border-slate-200 bg-white p-2">
          <div className="grid gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveView('CREAR')}
              className={`rounded-2xl px-4 py-4 text-left transition ${
                activeView === 'CREAR'
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <p className="text-sm font-semibold">Crear campana</p>
              <p className={`mt-1 text-xs ${activeView === 'CREAR' ? 'text-slate-300' : 'text-slate-500'}`}>
                Configura la ventana comercial, manual, PDVs y metas del nuevo esfuerzo.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('KPIS')}
              className={`rounded-2xl px-4 py-4 text-left transition ${
                activeView === 'KPIS'
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <p className="text-sm font-semibold">KPIs de campanas</p>
              <p className={`mt-1 text-xs ${activeView === 'KPIS' ? 'text-slate-300' : 'text-slate-500'}`}>
                Revisa campanas activas, avance por PDV y cumplimiento consolidado.
              </p>
            </button>
          </div>
        </Card>
      )}

      {activeView === 'CREAR' && canManageCampaigns ? (
        <div className="space-y-6">
          <CampanaEditorCard
            key={selectedCampaign?.id ?? 'new'}
            data={data}
            campaign={selectedCampaign}
          />

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Campanas existentes</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Selecciona una campana para editarla o parte desde una nueva configuracion.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCampaignId(null)}>
                Nueva campana
              </Button>
            </div>
            <div className="space-y-3 px-4 py-4">
              {data.campanas.length === 0 ? (
                <p className="px-2 py-8 text-sm text-slate-500">
                  Todavia no hay campanas registradas para el alcance actual.
                </p>
              ) : (
                data.campanas.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => setSelectedCampaignId(campaign.id)}
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                      selectedCampaign?.id === campaign.id
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{campaign.nombre}</p>
                        <p className={`mt-1 text-xs ${selectedCampaign?.id === campaign.id ? 'text-slate-300' : 'text-slate-400'}`}>
                          {campaign.cuentaCliente ?? 'Sin cuenta'} · {formatDate(campaign.fechaInicio)} - {formatDate(campaign.fechaFin)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCampaign?.id === campaign.id ? 'bg-white/10 text-white' : getStatusTone(campaign.estado)}`}>
                        {campaign.ventanaActiva ? 'ACTIVA' : campaign.estado}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Campanas visibles" value={String(data.resumen.totalCampanas)} />
            <MetricCard label="Activas" value={String(data.resumen.activas)} />
            <MetricCard label="PDVs objetivo" value={String(data.resumen.pdvsObjetivo)} />
            <MetricCard label="PDVs cumplidos" value={String(data.resumen.pdvsCumplidos)} />
            <MetricCard label="Avance promedio" value={formatPercent(data.resumen.avancePromedio)} />
            <MetricCard label="Cuota adicional" value={formatCurrency(data.resumen.cuotaAdicionalTotal)} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-950">Campanas activas e historicas</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ventana comercial, cuotas adicionales y avance de cada PDV objetivo.
                </p>
              </div>
              <div className="space-y-3 px-4 py-4">
                {data.campanas.length === 0 ? (
                  <p className="px-2 py-8 text-sm text-slate-500">
                    Todavia no hay campanas registradas para el alcance actual.
                  </p>
                ) : (
                  data.campanas.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => setSelectedCampaignId(campaign.id)}
                      className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                        selectedCampaign?.id === campaign.id
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{campaign.nombre}</p>
                          <p className={`mt-1 text-xs ${selectedCampaign?.id === campaign.id ? 'text-slate-300' : 'text-slate-400'}`}>
                            {campaign.cuentaCliente ?? 'Sin cuenta'} · {formatDate(campaign.fechaInicio)} - {formatDate(campaign.fechaFin)}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCampaign?.id === campaign.id ? 'bg-white/10 text-white' : getStatusTone(campaign.estado)}`}>
                          {campaign.ventanaActiva ? 'ACTIVA' : campaign.estado}
                        </span>
                      </div>
                      <div className={`mt-3 text-sm ${selectedCampaign?.id === campaign.id ? 'text-slate-200' : 'text-slate-600'}`}>
                        {campaign.pdvsCumplidos}/{campaign.totalPdvs} PDVs cumplidos · {formatPercent(campaign.avancePromedio)}
                      </div>
                      {campaign.descripcion && (
                        <p className={`mt-2 text-xs ${selectedCampaign?.id === campaign.id ? 'text-slate-300' : 'text-slate-500'}`}>
                          {campaign.descripcion}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </Card>

            <div className="space-y-6">
              <CampaignDetailCard campaign={selectedCampaign} canManage={data.puedeGestionar} canExecuteFieldTasks={canExecuteFieldTasks} />
              <ReportesCampanaCard data={data} />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
function CampanaEditorCard({
  data,
  campaign,
}: {
  data: CampanasPanelData
  campaign: CampanaItem | null
}) {
  const [state, formAction] = useActionState(guardarCampana, ESTADO_CAMPANA_ADMIN_INICIAL)
  const fixedAccount = resolveSingleTenantAccountOption(data.cuentasDisponibles)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)
  const [accountFilter, setAccountFilter] = useState<string>(
    campaign?.cuentaClienteId ?? fixedAccount?.id ?? data.cuentaSeleccionadaId ?? data.cuentasDisponibles[0]?.id ?? ''
  )
  const [cadenaFilter, setCadenaFilter] = useState<string>(campaign?.cadenaId ?? '')
  const [pdvSearch, setPdvSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [selectedPdvIds, setSelectedPdvIds] = useState<string[]>(campaign?.pdvs.map((item) => item.pdvId) ?? [])
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(campaign?.productoIds ?? [])
  const [taskTemplateRows, setTaskTemplateRows] = useState(
    campaign?.taskTemplate?.length
      ? campaign.taskTemplate
      : buildTaskTemplate(campaign)
          .split('\n')
          .filter(Boolean)
          .map((label) => createVisitTaskTemplateItem(label))
  )
  const [evidenceTemplateRows, setEvidenceTemplateRows] = useState(
    campaign?.evidenceTemplate?.length
      ? campaign.evidenceTemplate
      : (campaign?.evidenciasRequeridas ?? []).map((label) => createCampaignEvidenceRequirement(label))
  )
  const [productGoalRows, setProductGoalRows] = useState(
    campaign?.productGoals ?? []
  )
  const selectedPdvSet = new Set(selectedPdvIds)
  const selectedProductSet = new Set(selectedProductIds)
  const eligiblePdvs = data.pdvsDisponibles.filter((item) => {
    if (accountFilter && item.cuentaClienteId !== accountFilter) {
      return false
    }

    if (cadenaFilter && item.cadenaId !== cadenaFilter) {
      return false
    }

    return true
  })
  const visiblePdvs = eligiblePdvs.filter((item) => {

    const haystack = `${item.claveBtl} ${item.nombre} ${item.zona ?? ''} ${item.cadena ?? ''}`.toLowerCase()
    return haystack.includes(pdvSearch.trim().toLowerCase())
  })
  const visibleProducts = data.productosDisponibles.filter((item) => {
    const haystack = `${item.sku} ${item.nombre} ${item.nombreCorto}`.toLowerCase()
    return haystack.includes(productSearch.trim().toLowerCase())
  })

  useEffect(() => {
    setSelectedPdvIds(campaign?.pdvs.map((item) => item.pdvId) ?? [])
    setSelectedProductIds(campaign?.productoIds ?? [])
    setCadenaFilter(campaign?.cadenaId ?? '')
    setEvidenceTemplateRows(
      campaign?.evidenceTemplate?.length
        ? campaign.evidenceTemplate
        : (campaign?.evidenciasRequeridas ?? []).map((label) => createCampaignEvidenceRequirement(label))
    )
    setProductGoalRows(campaign?.productGoals ?? [])
  }, [campaign])

  useEffect(() => {
    setSelectedPdvIds((current) => current.filter((item) => eligiblePdvs.some((pdv) => pdv.id === item)))
  }, [eligiblePdvs])

  useEffect(() => {
    setProductGoalRows((current) => {
      const selectedIds = new Set(selectedProductIds)
      const next = current.filter((row) => selectedIds.has(row.productId))
      const missingRows = selectedProductIds
        .filter((productId) => !next.some((row) => row.productId === productId))
        .map((productId) => ({
          productId,
          productLabel:
            data.productosDisponibles.find((item) => item.id === productId)?.nombreCorto ?? productId,
          productSku:
            data.productosDisponibles.find((item) => item.id === productId)?.sku ?? null,
          quota: 0,
          goalType: 'VENTA' as CampaignGoalType,
          notes: null,
        }))

      return [...next, ...missingRows]
    })
  }, [data.productosDisponibles, selectedProductIds])

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {campaign ? 'Editar campana' : 'Crear campana'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Define segmentacion por cadena, manual de mercadeo, metas por producto y PDVs participantes.
          </p>
        </div>
        {campaign && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(campaign.estado)}`}>
            {campaign.estado}
          </span>
        )}
      </div>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="campana_id" value={campaign?.id ?? ''} />
        {useSingleTenantUi ? (
          <input type="hidden" name="cuenta_cliente_id" value={accountFilter} />
        ) : data.cuentasDisponibles.length > 1 ? (
          <Select
            label="Cuenta cliente"
            name="cuenta_cliente_id"
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
            options={[
              { value: '', label: 'Selecciona cuenta cliente' },
              ...data.cuentasDisponibles.map((item) => ({
                value: item.id,
                label: `${item.nombre} (${item.identificador})`,
              })),
            ]}
          />
        ) : (
          <input type="hidden" name="cuenta_cliente_id" value={accountFilter} />
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          <Input label="Nombre" name="nombre" defaultValue={campaign?.nombre ?? ''} required />
          <Input label="Fecha inicio" name="fecha_inicio" type="date" defaultValue={campaign?.fechaInicio ?? ''} required />
          <Input label="Fecha fin" name="fecha_fin" type="date" defaultValue={campaign?.fechaFin ?? ''} required />
          <Select
            label="Estado"
            name="estado"
            defaultValue={campaign?.estado ?? 'BORRADOR'}
            options={CAMPAIGN_STATE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Select
            label="Cadena foco"
            name="cadena_id"
            value={cadenaFilter}
            onChange={(event) => setCadenaFilter(event.target.value)}
            options={[
              { value: '', label: 'Todas las cadenas visibles' },
              ...data.cadenasDisponibles.map((item) => ({
                value: item.id,
                label: item.codigo ? `${item.codigo} - ${item.nombre}` : item.nombre,
              })),
            ]}
          />
          <Input
            label="Cuota adicional"
            name="cuota_adicional"
            type="number"
            min="0"
            step="0.01"
            defaultValue={String(campaign?.cuotaAdicional ?? 0)}
            required
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <FieldTextarea
            label="Descripcion"
            name="descripcion"
            rows={3}
            defaultValue={campaign?.descripcion ?? ''}
            placeholder="Objetivo comercial, cobertura, discurso y alcance de la activacion."
          />
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <label className="mb-1.5 block text-sm font-medium text-slate-900">Manual de mercadeo (PDF)</label>
            <input
              type="file"
              name="manual_mercadeo"
              accept="application/pdf"
              className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-[#ff9b7a] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
            />
            <p className="mt-2 text-xs text-slate-500">
              La DC lo vera desde su dashboard cuando opere en un PDV participante.
            </p>
            {campaign?.manualMercadeo && (
              <a
                href={campaign.manualMercadeo.signedUrl ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Abrir manual actual: {campaign.manualMercadeo.fileName}
              </a>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <FieldTextarea
            label="Instrucciones de mercadeo"
            name="instrucciones"
            rows={4}
            defaultValue={campaign?.instrucciones ?? ''}
            placeholder="Lineamientos operativos, visibilidad, mecánica promocional o speech sugerido."
          />
          <div className="grid gap-4">
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Auditoria y evidencias requeridas</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Define exactamente qué debe subir la DC durante la campaña.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEvidenceTemplateRows((current) => [
                      ...current,
                      createCampaignEvidenceRequirement(`Nueva evidencia ${current.length + 1}`),
                    ])
                  }
                >
                  Agregar evidencia
                </Button>
              </div>
              <div className="space-y-3">
                {evidenceTemplateRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Agrega al menos una evidencia o selfie de cumplimiento.</p>
                ) : (
                  evidenceTemplateRows.map((item, index) => (
                    <div
                      key={item.id}
                      className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 xl:grid-cols-[1.2fr_0.8fr_auto]"
                    >
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Evidencia
                        </label>
                        <input
                          name="evidence_template_label"
                          value={item.label}
                          onChange={(event) =>
                            setEvidenceTemplateRows((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index
                                  ? createCampaignEvidenceRequirement(event.target.value, row.kind)
                                  : row
                              )
                            )
                          }
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Tipo
                        </label>
                        <select
                          name="evidence_template_kind"
                          value={item.kind}
                          onChange={(event) =>
                            setEvidenceTemplateRows((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index
                                  ? createCampaignEvidenceRequirement(
                                      row.label,
                                      event.target.value as CampaignEvidenceKind
                                    )
                                  : row
                              )
                            )
                          }
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                        >
                          {EVIDENCE_KIND_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEvidenceTemplateRows((current) =>
                              current.filter((_, rowIndex) => rowIndex !== index)
                            )
                          }
                        >
                          Quitar
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <textarea
                name="evidencias_requeridas"
                value={evidenceTemplateRows.map((item) => item.label).join('\n')}
                className="hidden"
                readOnly
              />
            </div>
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Plantilla tipada de tareas de visita</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Cada tarea debe tener tipo explícito para cumplir el canon antifraude.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTaskTemplateRows((current) => [
                      ...current,
                      createVisitTaskTemplateItem(`Nueva tarea ${current.length + 1}`),
                    ])
                  }
                >
                  Agregar tarea
                </Button>
              </div>
              <div className="space-y-3">
                {taskTemplateRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Agrega al menos una tarea tipada para la campana.</p>
                ) : (
                  taskTemplateRows.map((task, index) => (
                    <div key={task.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 xl:grid-cols-[1.2fr_0.8fr_auto]">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Tarea
                        </label>
                        <input
                          name="task_template_label"
                          value={task.label}
                          onChange={(event) =>
                            setTaskTemplateRows((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? createVisitTaskTemplateItem(event.target.value, row.kind) : row
                              )
                            )
                          }
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Tipo
                        </label>
                        <select
                          name="task_template_kind"
                          value={task.kind}
                          onChange={(event) =>
                            setTaskTemplateRows((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index
                                  ? createVisitTaskTemplateItem(row.label, event.target.value as VisitTaskKind)
                                  : row
                              )
                            )
                          }
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                        >
                          {VISIT_TASK_KIND_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTaskTemplateRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                          }
                        >
                          Quitar
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <textarea
                name="tareas_template"
                defaultValue={buildTaskTemplate(campaign)}
                className="hidden"
                readOnly
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950">Productos foco</h3>
              <span className="text-xs text-slate-500">
                {selectedProductIds.length} seleccionados · {visibleProducts.length} visibles
              </span>
            </div>
            <Input
              label="Buscar producto"
              name="producto_search_helper"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="SKU o nombre corto"
            />
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {visibleProducts.map((item) => (
                <label key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="producto_id"
                    value={item.id}
                    checked={selectedProductSet.has(item.id)}
                    onChange={(event) =>
                      setSelectedProductIds((current) =>
                        event.target.checked
                          ? Array.from(new Set([...current, item.id]))
                          : current.filter((value) => value !== item.id)
                      )
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-medium text-slate-950">{item.nombreCorto}</span>
                    <span className="text-xs text-slate-500">{item.sku} · {item.nombre}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950">PDVs objetivo</h3>
              <span className="text-xs text-slate-500">
                {selectedPdvIds.length} seleccionados · {visiblePdvs.length} visibles
              </span>
            </div>
            <Input
              label="Buscar PDV"
              name="pdv_search_helper"
              value={pdvSearch}
              onChange={(event) => setPdvSearch(event.target.value)}
              placeholder="Clave, nombre, zona o cadena"
            />
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {visiblePdvs.map((item) => (
                <label key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="pdv_id"
                    value={item.id}
                    checked={selectedPdvSet.has(item.id)}
                    onChange={(event) =>
                      setSelectedPdvIds((current) =>
                        event.target.checked
                          ? Array.from(new Set([...current, item.id]))
                          : current.filter((value) => value !== item.id)
                      )
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-medium text-slate-950">{item.claveBtl} · {item.nombre}</span>
                    <span className="text-xs text-slate-500">
                      {item.cuentaCliente} · {item.cadena ?? 'Sin cadena'} · {item.zona ?? 'Sin zona'}
                    </span>
                    {(item.dcNombre || item.supervisorNombre) && (
                      <span className="mt-1 block text-xs text-slate-400">
                        DC {item.dcNombre ?? 'Sin DC'} · SUP {item.supervisorNombre ?? 'Sin SUP'}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Metas por producto foco</h3>
              <p className="mt-1 text-xs text-slate-500">
                Si subes la matriz Excel por PDV, esa carga prevalece y se vuelve la fuente oficial por tienda.
              </p>
            </div>
            <span className="text-xs text-slate-500">{productGoalRows.length} metas configuradas</span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Carga por PDV y producto</p>
                <p className="mt-1 text-xs text-slate-500">
                  Sube un Excel con `BTL CVE`, `SKU`/`ARTICULO` y `CUOTA` para definir metas distintas por punto de venta.
                </p>
              </div>
              <a
                href="/api/campanas/metas-template"
                className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Descargar plantilla
              </a>
            </div>
            <input
              type="file"
              name="metas_producto_excel"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="mt-4 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-sky-700"
            />
            <p className="mt-2 text-xs text-slate-500">
              Si no subes archivo, la campaña seguirá usando la meta global capturada aquí abajo como compatibilidad temporal.
            </p>
          </div>
          {productGoalRows.length === 0 ? (
            <p className="text-sm text-slate-500">
              Selecciona productos foco para capturar sus cuotas de campaña.
            </p>
          ) : (
            <div className="space-y-3">
              {productGoalRows.map((row, index) => (
                <div
                  key={row.productId}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 xl:grid-cols-[1.1fr_0.6fr_0.6fr_1fr]"
                >
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Producto
                    </label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                      <input type="hidden" name="product_goal_product_id" value={row.productId} />
                      <div className="font-medium">{row.productLabel}</div>
                      {row.productSku && <div className="text-xs text-slate-500">{row.productSku}</div>}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tipo de meta
                    </label>
                    <select
                      name="product_goal_type"
                      value={row.goalType}
                      onChange={(event) =>
                        setProductGoalRows((current) =>
                          current.map((item, rowIndex) =>
                            rowIndex === index
                              ? { ...item, goalType: event.target.value as CampaignGoalType }
                              : item
                          )
                        )
                      }
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                    >
                      {PRODUCT_GOAL_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Cuota
                    </label>
                    <input
                      type="number"
                      name="product_goal_quota"
                      min="0"
                      step="0.01"
                      value={String(row.quota)}
                      onChange={(event) =>
                        setProductGoalRows((current) =>
                          current.map((item, rowIndex) =>
                            rowIndex === index
                              ? { ...item, quota: Number(event.target.value || 0) }
                              : item
                          )
                        )
                      }
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Observacion
                    </label>
                    <input
                      type="text"
                      name="product_goal_notes"
                      value={row.notes ?? ''}
                      onChange={(event) =>
                        setProductGoalRows((current) =>
                          current.map((item, rowIndex) =>
                            rowIndex === index
                              ? { ...item, notes: event.target.value || null }
                              : item
                          )
                        )
                      }
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                      placeholder="Venta sugerida, acomodo, prioridad..."
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <StateMessage state={state} />
        <SubmitActionButton
          label={campaign ? 'Actualizar campana' : 'Crear campana'}
          pendingLabel={campaign ? 'Actualizando...' : 'Creando...'}
        />
      </form>
    </Card>
  )
}

function CampaignDetailCard({
  campaign,
  canManage,
  canExecuteFieldTasks,
}: {
  campaign: CampanaItem | null
  canManage: boolean
  canExecuteFieldTasks: boolean
}) {
  if (!campaign) {
    return (
      <Card className="border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-950">Detalle de campana</h2>
        <p className="mt-2 text-sm text-slate-500">
          Selecciona una campana para revisar alcance por PDV, instrucciones y cumplimiento.
        </p>
      </Card>
    )
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">{campaign.nombre}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(campaign.ventanaActiva ? 'ACTIVA' : campaign.estado)}`}>
              {campaign.ventanaActiva ? 'ACTIVA' : campaign.estado}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {campaign.cuentaCliente ?? 'Sin cuenta'} · {formatDate(campaign.fechaInicio)} - {formatDate(campaign.fechaFin)}
          </p>
          {campaign.descripcion && <p className="mt-2 text-sm text-slate-600">{campaign.descripcion}</p>}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <p>Cuota adicional: <span className="font-semibold text-slate-900">{formatCurrency(campaign.cuotaAdicional)}</span></p>
          <p className="mt-2">Avance: <span className="font-semibold text-slate-900">{formatPercent(campaign.avancePromedio)}</span></p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <MetaList title="Productos foco" items={campaign.productosFoco} emptyLabel="Sin productos foco definidos" />
        <MetaList title="Evidencias requeridas" items={campaign.evidenciasRequeridas} emptyLabel="Sin evidencia obligatoria" />
        <MetaList title="Instrucciones" items={campaign.instrucciones ? [campaign.instrucciones] : []} emptyLabel="Sin instrucciones adicionales" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MetaList
          title="Resumen de metas por producto"
          items={(campaign.productGoals ?? []).map((item) =>
            `${item.productLabel}${item.productSku ? ` (${item.productSku})` : ''} · ${item.goalType === 'EXHIBICION' ? 'Exhibicion' : 'Venta'} · ${item.quota}`
          )}
          emptyLabel="Sin metas por producto configuradas"
        />
        <MetaList
          title="Manual de mercadeo"
          items={campaign.manualMercadeo ? [campaign.manualMercadeo.fileName] : []}
          emptyLabel="Sin manual cargado"
        />
      </div>
      {campaign.manualMercadeo?.signedUrl && (
        <div>
          <a
            href={campaign.manualMercadeo.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Abrir manual de mercadeo
          </a>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-950">Seguimiento por PDV</h3>
          <span className="text-xs text-slate-500">{campaign.totalPdvs} objetivo(s)</span>
        </div>
        {campaign.pdvs.length === 0 ? (
          <p className="text-sm text-slate-500">Esta campana no tiene PDVs visibles en el alcance actual.</p>
        ) : (
          campaign.pdvs.map((item) => (
            <CampaignPdvRow key={item.id} item={item} canManage={canManage} canExecuteFieldTasks={canExecuteFieldTasks} />
          ))
        )}
      </div>
    </Card>
  )
}

function MetaList({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignPdvRow({
  item,
  canManage,
  canExecuteFieldTasks,
}: {
  item: CampanaPdvItem
  canManage: boolean
  canExecuteFieldTasks: boolean
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
              {item.claveBtl}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusTone(item.estatus)}`}>
              {item.estatus}
            </span>
          </div>
          <p className="mt-3 text-base font-semibold text-slate-950">{item.pdv}</p>
          <p className="mt-1 text-sm text-slate-600">
            {item.cuentaCliente ?? 'Sin cuenta'} · {item.cadena ?? 'Sin cadena'} · {item.zona ?? 'Sin zona'}
          </p>
          {(item.dcNombre || item.supervisorNombre) && (
            <p className="mt-1 text-xs text-slate-500">
              DC {item.dcNombre ?? 'Sin DC'} · SUP {item.supervisorNombre ?? 'Sin SUP'}
            </p>
          )}
        </div>
        <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <p className="font-medium text-slate-950">Avance {formatPercent(item.avancePorcentaje)}</p>
          <div className="mt-3 h-2 rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-sky-500"
              style={{ width: `${Math.max(6, item.avancePorcentaje)}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {item.tareasCumplidas.length}/{item.tareasRequeridas.length} tareas · {item.evidenciasCargadas}/{item.evidenciasRequeridas.length} evidencias
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <MetaList
          title="Metas producto en PDV"
          items={item.productGoals.map((goal) =>
            `${goal.productLabel}${goal.productSku ? ` (${goal.productSku})` : ''} · ${goal.goalType === 'EXHIBICION' ? 'Exhibicion' : 'Venta'} · ${goal.quota}`
          )}
          emptyLabel="Sin metas por producto especificas en este PDV"
        />
        <MetaList title="Tareas requeridas" items={item.tareasRequeridas} emptyLabel="Sin tareas declaradas" />
        <MetaList title="Tareas cumplidas" items={item.tareasCumplidas} emptyLabel="Sin avances registrados" />
      </div>

      {item.activeVisitSession && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">Sesion activa de tareas de visita</p>
          <p className="mt-1 text-xs text-slate-500">
            Visita {item.activeVisitSession.attendanceId.slice(0, 8)} · generada {new Date(item.activeVisitSession.generatedAt).toLocaleString('es-MX')}
            {item.activeVisitSession.executionMinutes !== null ? ` · ${item.activeVisitSession.executionMinutes} min` : ''}
          </p>
        </div>
      )}

      {item.comentarios && <p className="mt-4 text-sm text-slate-600">{item.comentarios}</p>}
      {canExecuteFieldTasks && <EjecucionCampoForm item={item} />}
      {canManage && <CumplimientoForm item={item} />}
    </div>
  )
}

function EjecucionCampoForm({ item }: { item: CampanaPdvItem }) {
  const [state, formAction] = useActionState(ejecutarTareasCampanaPdv, ESTADO_CAMPANA_ADMIN_INICIAL)
  const [isPending, startTransition] = useTransition()
  const activeSession = item.activeVisitSession
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isPreparingEvidence, setIsPreparingEvidence] = useState(false)
  const [taskCaptures, setTaskCaptures] = useState<Record<string, TaskCaptureDraft>>({})

  useEffect(() => {
    return () => {
      for (const capture of Object.values(taskCaptures)) {
        URL.revokeObjectURL(capture.previewUrl)
      }
    }
  }, [taskCaptures])

  const handleTaskEvidenceChange = async (
    taskKey: string,
    taskLabel: string,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]

    if (!file) {
      setTaskCaptures((current) => {
        const existing = current[taskKey]
        if (existing) {
          URL.revokeObjectURL(existing.previewUrl)
        }

        const next = { ...current }
        delete next[taskKey]
        return next
      })
      return
    }

    setIsPreparingEvidence(true)
    setFeedback(null)

    try {
      const capturedAt = new Date().toISOString()
      const position = await readCurrentPosition().catch(() => ({ latitude: null, longitude: null }))
      const stampedFile = await stampTaskEvidenceImage(file, {
        taskLabel,
        capturedAt,
        latitude: position.latitude,
        longitude: position.longitude,
      })
      const previewUrl = URL.createObjectURL(stampedFile)

      setTaskCaptures((current) => {
        const existing = current[taskKey]
        if (existing) {
          URL.revokeObjectURL(existing.previewUrl)
        }

        return {
          ...current,
          [taskKey]: {
            file: stampedFile,
            previewUrl,
            capturedAt,
            latitude: position.latitude,
            longitude: position.longitude,
            timestampStamped: true,
            captureSource: 'camera',
          },
        }
      })

      setFeedback(`Evidencia preparada para "${taskLabel}".`)
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'No fue posible preparar la evidencia de la tarea.'
      )
    } finally {
      event.target.value = ''
      setIsPreparingEvidence(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    for (const task of activeSession?.tasks ?? []) {
      const capture = taskCaptures[task.key]
      if (!capture) {
        continue
      }

      formData.append(`task_evidence__${task.key}`, capture.file)
      formData.set(
        `task_evidence_meta__${task.key}`,
        JSON.stringify({
          capturedAt: capture.capturedAt,
          latitude: capture.latitude,
          longitude: capture.longitude,
          timestampStamped: capture.timestampStamped,
          captureSource: capture.captureSource,
        })
      )
    }

    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <input type="hidden" name="campana_pdv_id" value={item.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Ejecucion en campo</p>
          <p className="mt-1 text-xs text-slate-500">
            Requiere check-in valido y activo en este PDV. Las tareas tipo foto se sellan con timestamp y GPS antes de enviarse.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusTone(item.estatus)}`}>
          {item.estatus}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-950">Tareas de la visita activa</p>
        {!activeSession || activeSession.tasks.length === 0 ? (
          <p className="text-sm text-slate-500">
            Necesitas una visita activa en este PDV para generar el subconjunto de tareas de esta jornada.
          </p>
        ) : (
          <div className="space-y-3">
            {activeSession.tasks.map((task) => (
              <div key={task.key} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                <input type="hidden" name="task_key" value={task.key} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-950">{task.label}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        {task.kind.replace(/_/g, ' ')}
                      </span>
                      {task.suspicious && (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          Sospechosa
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {task.startedAt ? `Inicio ${new Date(task.startedAt).toLocaleString('es-MX')}` : 'Sin iniciar'}
                      {task.finishedAt ? ` · Fin ${new Date(task.finishedAt).toLocaleString('es-MX')}` : ''}
                      {task.evidenceCount > 0 ? ` · Evidencias ${task.evidenceCount}` : ''}
                    </p>
                    {task.suspiciousReason && (
                      <p className="mt-1 text-xs font-medium text-amber-700">{task.suspiciousReason}</p>
                    )}
                  </div>
                  <div className="w-full max-w-[220px]">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Estado
                    </label>
                    <select
                      name={`task_status__${task.key}`}
                      defaultValue={task.status}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                    >
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="COMPLETADA">Completada</option>
                      <option value="JUSTIFICADA">Justificada</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Justificacion si no se completa
                  </label>
                  <textarea
                    name={`task_justification__${task.key}`}
                    defaultValue={task.justification ?? ''}
                    rows={2}
                    placeholder="Motivo de justificacion"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
                  />
                </div>
                {visitTaskRequiresPhoto(task.kind) && (
                  <div className="mt-3 space-y-2 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Evidencia fotografica de la tarea
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => handleTaskEvidenceChange(task.key, task.label, event)}
                      className="block w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                    />
                    <p className="text-xs text-slate-500">
                      Solo se acepta captura de camara. La foto se marca con fecha, hora y coordenadas visibles antes de enviarse.
                    </p>
                    {taskCaptures[task.key] && (
                      <div className="space-y-2">
                        <img
                          src={taskCaptures[task.key]!.previewUrl}
                          alt={`Preview de evidencia ${task.label}`}
                          className="max-h-44 rounded-2xl border border-slate-200 object-cover"
                        />
                        <p className="text-[11px] text-slate-500">
                          {new Date(taskCaptures[task.key]!.capturedAt).toLocaleString('es-MX')}
                          {taskCaptures[task.key]!.latitude !== null && taskCaptures[task.key]!.longitude !== null
                            ? ` · ${taskCaptures[task.key]!.latitude!.toFixed(6)}, ${taskCaptures[task.key]!.longitude!.toFixed(6)}`
                            : ' · GPS no disponible'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Evidencia operativa
            <input
              type="file"
              name="evidencia"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              className="mt-2 block w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
            />
          </label>
          <p className="text-xs text-slate-500">
            Usa camara en vivo cuando la tarea lo requiera. El pipeline optimiza y deduplica cada archivo.
          </p>
        </div>
        <FieldTextarea
          label="Comentarios"
          name="comentarios"
          rows={3}
          defaultValue={item.comentarios ?? ''}
          placeholder="Hallazgos, justificacion o detalle de la ejecucion."
        />
      </div>

      {feedback && (
        <p className={`text-sm ${feedback.toLowerCase().includes('no fue posible') ? 'text-rose-700' : 'text-sky-700'}`}>
          {feedback}
        </p>
      )}
      <StateMessage state={state} />
      <Button type="submit" size="sm" isLoading={isPending || isPreparingEvidence}>
        {isPending || isPreparingEvidence ? 'Guardando...' : 'Guardar avance de visita'}
      </Button>
    </form>
  )
}

function CumplimientoForm({ item }: { item: CampanaPdvItem }) {
  const [state, formAction] = useActionState(actualizarCumplimientoCampanaPdv, ESTADO_CAMPANA_ADMIN_INICIAL)

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="campana_pdv_id" value={item.id} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-950">Marcar tareas cumplidas</p>
          {item.tareasRequeridas.length === 0 ? (
            <p className="text-sm text-slate-500">Sin tareas configuradas para este PDV.</p>
          ) : (
            item.tareasRequeridas.map((task) => (
              <label key={task} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="tarea_cumplida"
                  value={task}
                  defaultChecked={item.tareasCumplidas.includes(task)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {task}
              </label>
            ))
          )}
        </div>
        <div className="space-y-4">
          <Input
            label="Evidencias cargadas"
            name="evidencias_cargadas"
            type="number"
            min="0"
            defaultValue={String(item.evidenciasCargadas)}
            required
          />
          <FieldTextarea
            label="Comentarios"
            name="comentarios"
            rows={3}
            defaultValue={item.comentarios ?? ''}
            placeholder="Notas de cumplimiento, observaciones o hallazgos."
          />
        </div>
      </div>
      <StateMessage state={state} />
      <SubmitActionButton label="Actualizar cumplimiento" pendingLabel="Actualizando..." />
    </form>
  )
}

function ReportesCampanaCard({ data }: { data: CampanasPanelData }) {
  const reportePorDc = data.reportePorDc.slice(0, 12)
  const reportePorPdv = data.reportePorPdv.slice(0, 16)

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Reporte de avance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Seguimiento consolidado por dermoconsejera y por PDV para identificar rezagos comerciales.
        </p>
      </div>

      {data.puedeVerDc ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">DC</th>
                <th className="px-4 py-3 font-medium">Campanas activas</th>
                <th className="px-4 py-3 font-medium">PDVs</th>
                <th className="px-4 py-3 font-medium">Cumplidas</th>
                <th className="px-4 py-3 font-medium">Avance</th>
              </tr>
            </thead>
            <tbody>
              {reportePorDc.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Sin informacion visible por dermoconsejera en este alcance.
                  </td>
                </tr>
              ) : (
                reportePorDc.map((item) => (
                  <tr key={item.empleadoId} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{item.empleado}</div>
                      <div className="text-xs text-slate-400">{item.puesto ?? 'Sin puesto'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.campanasActivas}</td>
                    <td className="px-4 py-3 text-slate-600">{item.pdvsObjetivo}</td>
                    <td className="px-4 py-3 text-slate-600">{item.pdvsCumplidos}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatPercent(item.avancePromedio)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          El detalle por dermoconsejera se oculta para el alcance cliente.
        </p>
      )}

      <div className="overflow-x-auto rounded-3xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Campana</th>
              <th className="px-4 py-3 font-medium">PDV</th>
              <th className="px-4 py-3 font-medium">DC</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Pendientes</th>
              <th className="px-4 py-3 font-medium">Avance</th>
            </tr>
          </thead>
          <tbody>
            {reportePorPdv.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Sin PDVs visibles para reporte en el alcance actual.
                </td>
              </tr>
            ) : (
              reportePorPdv.map((item) => (
                <tr key={`${item.campanaId}-${item.pdvId}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-900">{item.campana}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{item.claveBtl}</div>
                    <div className="text-xs text-slate-400">{item.pdv}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.dc ?? 'No visible'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(item.estatus)}`}>
                      {item.estatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.tareasPendientes} tareas · {item.evidenciasPendientes} evidencias
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatPercent(item.avancePorcentaje)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
