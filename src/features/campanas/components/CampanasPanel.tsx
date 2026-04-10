'use client'

import { useActionState, useEffect, useState, useTransition, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ModalPanel } from '@/components/ui/modal-panel'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Select } from '@/components/ui/select'
import type { ActorActual } from '@/lib/auth/session'
import {
  isSingleTenantUiEnabled,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant'
import {
  ejecutarTareasCampanaPdv,
  guardarCampana,
} from '../actions'
import { injectDirectR2Manifest, injectDirectR2Upload, uploadFilesDirectToR2 } from '@/lib/storage/directR2Client'
import { CampanaPublishAction } from './CampanaPublishAction'
import { ESTADO_CAMPANA_ADMIN_INICIAL } from '../state'
import type {
  CampanaItem,
  CampanaPdvItem,
  CampanasPanelData,
} from '../services/campanaService'
import {
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
  return <SharedMetricCard label={label} value={value} />
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
  const canExecuteFieldTasks = actor.puesto === 'DERMOCONSEJERO'
  const canManageCampaigns = data.puedeGestionar
  const todayIso = new Date().toISOString().slice(0, 10)
  const draftCampaigns = data.campanas.filter((campaign) => campaign.estado === 'BORRADOR')
  const scheduledCampaigns = data.campanas.filter(
    (campaign) => campaign.estado === 'ACTIVA' && !campaign.ventanaActiva && campaign.fechaInicio > todayIso
  )
  const activeCampaigns = data.campanas.filter(
    (campaign) => campaign.estado === 'ACTIVA' && campaign.ventanaActiva
  )
  const finishedCampaigns = data.campanas.filter((campaign) => campaign.estado === 'CERRADA')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(data.campanas[0]?.id ?? null)
  const [campaignModalId, setCampaignModalId] = useState<string | null>(null)
  const [dashboardCampaignId, setDashboardCampaignId] = useState<string | null>(
    finishedCampaigns[0]?.id ?? null
  )
  const selectedCampaign = data.campanas.find((item) => item.id === selectedCampaignId) ?? null
  const selectedModalCampaign = data.campanas.find((item) => item.id === campaignModalId) ?? null
  const [activeView, setActiveView] = useState<'CREAR' | 'KPIS'>(canManageCampaigns ? 'CREAR' : 'KPIS')
  const [kpiSection, setKpiSection] = useState<
    'BORRADORES' | 'PUBLICAR' | 'ACTIVAS' | 'TERMINADAS' | 'DASHBOARD'
  >(canManageCampaigns ? 'PUBLICAR' : 'ACTIVAS')

  useEffect(() => {
    if (!canManageCampaigns) {
      setActiveView('KPIS')
    }
  }, [canManageCampaigns])

  useEffect(() => {
    if (!dashboardCampaignId || !finishedCampaigns.some((item) => item.id === dashboardCampaignId)) {
      setDashboardCampaignId(finishedCampaigns[0]?.id ?? null)
    }
  }, [dashboardCampaignId, finishedCampaigns])

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
          <p className="font-medium">Vista operativa de campanas</p>
          <p className="mt-2 text-sm">
            Tu puesto actual es <span className="font-semibold">{actor.puesto}</span>. Aqui solo
            monitoreas avance, cumplimiento y campanas visibles para tu alcance.
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
              <p className="text-sm font-semibold">Crear campanas</p>
              <p className={`mt-1 text-xs ${activeView === 'CREAR' ? 'text-slate-300' : 'text-slate-500'}`}>
                Configura borradores, PDVs, metas y manual.
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
              <p className="text-sm font-semibold">Operacion y KPIs</p>
              <p className={`mt-1 text-xs ${activeView === 'KPIS' ? 'text-slate-300' : 'text-slate-500'}`}>
                Borradores, publicacion, activas, terminadas y dashboard.
              </p>
            </button>
          </div>
        </Card>
      )}

      {activeView === 'CREAR' && canManageCampaigns ? (
        <div className="space-y-6">
          <CampanaEditorCard key={selectedCampaign?.id ?? 'new'} data={data} campaign={selectedCampaign} />

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Borradores y campanas existentes</h2>
                <p className="mt-1 text-sm text-slate-500">Usa esta lista para retomar o duplicar configuraciones.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCampaignId(null)}>
                Nueva campana
              </Button>
            </div>
            <div className="grid gap-3 px-4 py-4 md:grid-cols-2 xl:grid-cols-3">
              {data.campanas.length === 0 ? (
                <p className="col-span-full px-2 py-8 text-sm text-slate-500">
                  Todavia no hay campanas registradas para el alcance actual.
                </p>
              ) : (
                data.campanas.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => setSelectedCampaignId(campaign.id)}
                    className={`rounded-3xl border px-4 py-4 text-left transition ${
                      selectedCampaign?.id === campaign.id
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{campaign.nombre}</p>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${selectedCampaign?.id === campaign.id ? 'bg-white/10 text-white' : getStatusTone(campaign.estado)}`}>
                        {getCampaignDisplayStatus(campaign)}
                      </span>
                    </div>
                    <p className={`mt-2 text-xs ${selectedCampaign?.id === campaign.id ? 'text-slate-300' : 'text-slate-500'}`}>
                      {formatDate(campaign.fechaInicio)} - {formatDate(campaign.fechaFin)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Borradores" value={String(draftCampaigns.length)} />
            <MetricCard label="Programadas" value={String(scheduledCampaigns.length)} />
            <MetricCard label="Activas" value={String(activeCampaigns.length)} />
            <MetricCard label="Terminadas" value={String(finishedCampaigns.length)} />
            <MetricCard label="PDVs objetivo" value={String(data.resumen.pdvsObjetivo)} />
            <MetricCard label="Avance" value={formatPercent(data.resumen.avancePromedio)} />
          </section>

          <Card className="border-slate-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {canManageCampaigns ? (
                <KpiSectionButton active={kpiSection === 'BORRADORES'} onClick={() => setKpiSection('BORRADORES')}>
                  Borradores
                </KpiSectionButton>
              ) : null}
              {canManageCampaigns ? (
                <KpiSectionButton active={kpiSection === 'PUBLICAR'} onClick={() => setKpiSection('PUBLICAR')}>
                  Publicar
                </KpiSectionButton>
              ) : null}
              <KpiSectionButton active={kpiSection === 'ACTIVAS'} onClick={() => setKpiSection('ACTIVAS')}>
                Activas
              </KpiSectionButton>
              <KpiSectionButton active={kpiSection === 'TERMINADAS'} onClick={() => setKpiSection('TERMINADAS')}>
                Terminadas
              </KpiSectionButton>
              <KpiSectionButton active={kpiSection === 'DASHBOARD'} onClick={() => setKpiSection('DASHBOARD')}>
                Dashboard
              </KpiSectionButton>
            </div>
          </Card>

          {kpiSection === 'BORRADORES' && canManageCampaigns ? (
            <CampaignCompactSection
              title="Borradores"
              items={draftCampaigns}
              emptyLabel="Sin borradores por ahora."
              onOpen={(campaignId) => setCampaignModalId(campaignId)}
            />
          ) : null}

          {kpiSection === 'PUBLICAR' && canManageCampaigns ? (
            <CampaignPublishSection
              items={draftCampaigns}
              onOpen={(campaignId) => setCampaignModalId(campaignId)}
            />
          ) : null}

          {kpiSection === 'ACTIVAS' ? (
            <div className="space-y-4">
              <CampaignCompactSection
                title="Campanas activas"
                items={activeCampaigns}
                emptyLabel="No hay campanas activas en este momento."
                onOpen={(campaignId) => setCampaignModalId(campaignId)}
              />
              <CampaignCompactSection
                title="Programadas"
                items={scheduledCampaigns}
                emptyLabel="No hay campanas proximas publicadas."
                onOpen={(campaignId) => setCampaignModalId(campaignId)}
              />
            </div>
          ) : null}

          {kpiSection === 'TERMINADAS' ? (
            <CampaignCompactSection
              title="Campanas terminadas"
              items={finishedCampaigns}
              emptyLabel="No hay campanas terminadas para mostrar."
              onOpen={(campaignId) => setCampaignModalId(campaignId)}
            />
          ) : null}

          {kpiSection === 'DASHBOARD' ? (
            <CampaignDashboardSection
              campaigns={finishedCampaigns}
              selectedCampaignId={dashboardCampaignId}
              onOpen={(campaignId) => setCampaignModalId(campaignId)}
              onSelect={(campaignId) => setDashboardCampaignId(campaignId)}
            />
          ) : null}
        </div>
      )}

      {selectedModalCampaign ? (
        <CampaignDetailModal
          campaign={selectedModalCampaign}
          canManage={data.puedeGestionar}
          canExecuteFieldTasks={canExecuteFieldTasks}
          onClose={() => setCampaignModalId(null)}
        />
      ) : null}
    </div>
  )
}

function KpiSectionButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

function getCampaignDisplayStatus(campaign: CampanaItem) {
  if (campaign.estado === 'CERRADA') {
    return 'TERMINADA'
  }

  if (campaign.ventanaActiva) {
    return 'ACTIVA'
  }

  if (campaign.estado === 'ACTIVA' && campaign.fechaInicio > new Date().toISOString().slice(0, 10)) {
    return 'PROGRAMADA'
  }

  return campaign.estado
}

function CampaignCompactSection({
  title,
  items,
  emptyLabel,
  onOpen,
}: {
  title: string
  items: CampanaItem[]
  emptyLabel: string
  onOpen: (campaignId: string) => void
}) {
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((campaign) => (
            <CampaignCompactButton
              key={campaign.id}
              campaign={campaign}
              onClick={() => onOpen(campaign.id)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function CampaignPublishSection({
  items,
  onOpen,
}: {
  items: CampanaItem[]
  onOpen: (campaignId: string) => void
}) {
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">Publicar campañas</h2>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No hay borradores listos para publicar.</p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((campaign) => (
            <div key={campaign.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="min-w-0 text-left" onClick={() => onOpen(campaign.id)}>
                  <p className="truncate text-sm font-semibold text-slate-950">{campaign.nombre}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(campaign.fechaInicio)} - {formatDate(campaign.fechaFin)}
                  </p>
                </button>
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${getStatusTone(campaign.estado)}`}>
                  {campaign.estado}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniMetric label="PDVs" value={String(campaign.totalPdvs)} />
                <MiniMetric label="Productos" value={String(campaign.productosFoco.length)} />
                <MiniMetric label="Evidencias" value={String(campaign.evidenciasRequeridas.length)} />
              </div>
              <div className="mt-4 flex justify-end">
                <CampanaPublishAction campaignId={campaign.id} align="right" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function CampaignCompactButton({
  campaign,
  onClick,
}: {
  campaign: CampanaItem
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="line-clamp-1 text-sm font-semibold text-slate-950">{campaign.nombre}</p>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${getStatusTone(campaign.estado)}`}>
          {getCampaignDisplayStatus(campaign)}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {formatDate(campaign.fechaInicio)} - {formatDate(campaign.fechaFin)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{campaign.totalPdvs} PDVs</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{formatPercent(campaign.avancePromedio)}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{campaign.tareasPendientes} pendientes</span>
      </div>
    </button>
  )
}

function CampaignDetailModal({
  campaign,
  canManage,
  canExecuteFieldTasks,
  onClose,
}: {
  campaign: CampanaItem
  canManage: boolean
  canExecuteFieldTasks: boolean
  onClose: () => void
}) {
  return (
    <ModalPanel
      open
      onClose={onClose}
      title={campaign.nombre}
      subtitle={`${campaign.cuentaCliente ?? 'Sin cuenta'} · ${formatDate(campaign.fechaInicio)} - ${formatDate(campaign.fechaFin)}`}
      maxWidthClassName="max-w-6xl"
    >
      <CampaignDetailCard
        campaign={campaign}
        canManage={canManage}
        canExecuteFieldTasks={canExecuteFieldTasks}
      />
    </ModalPanel>
  )
}

function CampaignDashboardSection({
  campaigns,
  selectedCampaignId,
  onSelect,
  onOpen,
}: {
  campaigns: CampanaItem[]
  selectedCampaignId: string | null
  onSelect: (campaignId: string) => void
  onOpen: (campaignId: string) => void
}) {
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null

  if (!selectedCampaign) {
    return (
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-950">Dashboard de KPIs</h2>
        <p className="mt-2 text-sm text-slate-500">No hay campanas terminadas para graficar todavia.</p>
      </Card>
    )
  }

  const totalEvidencias = selectedCampaign.pdvs.reduce((acc, item) => acc + item.evidenciasCargadas, 0)
  const totalTareas = selectedCampaign.pdvs.reduce((acc, item) => acc + item.tareasCumplidas.length, 0)
  const chartItems = selectedCampaign.pdvs
    .slice()
    .sort((left, right) => right.avancePorcentaje - left.avancePorcentaje)
    .map((item) => ({
      id: item.id,
      label: item.claveBtl,
      helper: item.pdv,
      total: item.avancePorcentaje,
      meta: `${item.evidenciasCargadas} evidencias`,
    }))
  const evidenceItems = selectedCampaign.pdvs
    .slice()
    .sort((left, right) => right.evidenciasCargadas - left.evidenciasCargadas)
    .map((item) => ({
      id: item.id + '-evidence',
      label: item.claveBtl,
      helper: item.pdv,
      total: item.evidenciasCargadas,
      meta: `${item.tareasCumplidas.length} tareas`,
    }))

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">Dashboard de KPIs por campana</h2>
          <button
            type="button"
            onClick={() => onOpen(selectedCampaign.id)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Abrir detalle
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              onClick={() => onSelect(campaign.id)}
              className={`rounded-[22px] border px-4 py-3 text-left transition ${
                selectedCampaign.id === campaign.id
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <p className="line-clamp-1 text-sm font-semibold">{campaign.nombre}</p>
              <p className={`mt-1 text-xs ${selectedCampaign.id === campaign.id ? 'text-slate-300' : 'text-slate-500'}`}>
                {formatDate(campaign.fechaFin)}
              </p>
            </button>
          ))}
        </div>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="PDVs" value={String(selectedCampaign.totalPdvs)} />
        <MetricCard label="Cumplidos" value={String(selectedCampaign.pdvsCumplidos)} />
        <MetricCard label="Tareas" value={String(totalTareas)} />
        <MetricCard label="Evidencias" value={String(totalEvidencias)} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <CampaignBarChartCard title="Avance por PDV" items={chartItems} valueSuffix="%" />
        <CampaignBarChartCard title="Evidencias por PDV" items={evidenceItems} />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-950">KPIs por PDV y fecha</h3>
          <span className="text-xs text-slate-500">Fecha cierre {formatDate(selectedCampaign.fechaFin)}</span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">PDV</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">KPIs</th>
                <th className="px-4 py-3 font-medium">Avance</th>
              </tr>
            </thead>
            <tbody>
              {selectedCampaign.pdvs.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{item.claveBtl}</div>
                    <div className="text-xs text-slate-400">{item.pdv}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(selectedCampaign.fechaFin)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(item.estatus)}`}>
                      {item.estatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.tareasCumplidas.length}/{item.tareasRequeridas.length} tareas · {item.evidenciasCargadas}/{item.evidenciasRequeridas.length} evidencias
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatPercent(item.avancePorcentaje)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function CampaignBarChartCard({
  title,
  items,
  valueSuffix = '',
}: {
  title: string
  items: Array<{ id: string; label: string; helper: string; total: number; meta: string }>
  valueSuffix?: string
}) {
  const visibleItems = items.slice(0, 8)
  const maxValue = visibleItems.reduce((current, item) => Math.max(current, item.total), 0)

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      {visibleItems.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sin datos para graficar.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {visibleItems.map((item) => (
            <div key={item.id} className="grid gap-3 sm:grid-cols-[1fr_110px] sm:items-center">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-950">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.helper}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-950">
                    {item.total.toFixed(0)}{valueSuffix}
                  </span>
                </div>
                <div className="mt-3 h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-sky-600 to-emerald-400"
                    style={{ width: `${maxValue <= 0 ? 0 : Math.max(8, (item.total / maxValue) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <SharedMetricCard
      label={label}
      value={value}
      className="rounded-2xl px-4 py-3 shadow-none"
      labelClassName="text-[10px] text-slate-400"
      valueClassName="text-sm font-semibold"
    />
  )
}

export function CampanaEditorCard({
  data,
  campaign,
}: {
  data: CampanasPanelData
  campaign: CampanaItem | null
}) {
  const [state, formAction] = useActionState(guardarCampana, ESTADO_CAMPANA_ADMIN_INICIAL)
  const [isUploadingR2, setIsUploadingR2] = useState(false)
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

  const handleSubmit = async (formData: FormData) => {
    const manual = formData.get('manual_mercadeo')
    if (manual instanceof File && manual.size > 0) {
      setIsUploadingR2(true)
      try {
        await injectDirectR2Upload(formData, manual, {
          modulo: 'campanas',
          removeFieldName: 'manual_mercadeo',
          fieldNames: {
            objectKey: 'manual_mercadeo_r2_object_key',
            sha256: 'manual_mercadeo_r2_sha256',
            fileName: 'manual_mercadeo_r2_file_name',
            contentType: 'manual_mercadeo_r2_type',
            size: 'manual_mercadeo_r2_size',
          },
        })
      } catch (error) {
        console.error('No fue posible subir el manual de campaña a R2.', error)
      } finally {
        setIsUploadingR2(false)
      }
    }

    const submit = formAction as unknown as (payload: FormData) => void
    submit(formData)
  }

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

      <form action={handleSubmit} className="space-y-5">
        <input type="hidden" name="campana_id" value={campaign?.id ?? ''} />
        <input type="hidden" name="estado" value={campaign?.estado ?? 'BORRADOR'} />
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
        </div>

        <div className="rounded-3xl border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-4 py-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">Estado operativo</p>
          <p className="mt-1">
            {campaign
              ? `Esta campana conserva el estado ${campaign.estado}. La publicacion se controla desde Operacion y KPIs.`
              : 'Toda campana nueva se guarda como BORRADOR. La publicacion se realiza despues desde Operacion y KPIs.'}
          </p>
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
          label={isUploadingR2 ? 'Subiendo manual...' : campaign ? 'Actualizar campana' : 'Crear campana'}
          pendingLabel={campaign ? 'Actualizando...' : 'Creando...'}
        />
      </form>
    </Card>
  )
}

export function CampaignDetailCard({
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
      {canManage && <CumplimientoAutomaticoNotice item={item} />}
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

    void (async () => {
      try {
        const evidenceFiles = formData
          .getAll('evidencia')
          .filter((item): item is File => item instanceof File && item.size > 0)

        if (evidenceFiles.length > 0) {
          await injectDirectR2Manifest(formData, evidenceFiles, {
            modulo: 'campanas',
            manifestFieldName: 'evidencia_r2_manifest',
            removeFieldName: 'evidencia',
          })
        }

        const taskEntries: Array<{ file: File; metadata: Record<string, unknown> }> = []
        for (const task of activeSession?.tasks ?? []) {
          const capture = taskCaptures[task.key]
          if (!capture) {
            continue
          }

          taskEntries.push({
            file: capture.file,
            metadata: {
              taskKey: task.key,
              capturedAt: capture.capturedAt,
              latitude: capture.latitude,
              longitude: capture.longitude,
              timestampStamped: capture.timestampStamped,
              captureSource: capture.captureSource,
            },
          })
        }

        if (taskEntries.length > 0) {
          const uploadedTaskEvidence = await uploadFilesDirectToR2(taskEntries, 'campanas')
          formData.set('task_evidence_r2_manifest', JSON.stringify(uploadedTaskEvidence))
        }
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : 'No fue posible subir la evidencia de campaña a R2.'
        )
      }

      startTransition(() => {
        formAction(formData)
      })
    })()
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

function CumplimientoAutomaticoNotice({ item }: { item: CampanaPdvItem }) {
  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Cumplimiento automatico</p>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Este seguimiento ya no se captura manualmente desde este panel. Las tareas resueltas, las evidencias y el
            porcentaje de avance se actualizan automaticamente desde la ejecucion real de la campana en campo.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusTone(item.estatus)}`}>
          {item.estatus}
        </span>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Tareas resueltas</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {item.tareasCumplidas.length}/{item.tareasRequeridas.length}
          </p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Evidencias detectadas</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {item.evidenciasCargadas}/{item.evidenciasRequeridas.length}
          </p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Origen del avance</p>
          <p className="mt-2 text-sm font-medium text-slate-700">
            {item.activeVisitSession
              ? 'Sesion activa de visita y evidencia operativa'
              : 'Consolidado automatico de ejecucion ya registrada'}
          </p>
        </div>
      </div>
    </div>
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
