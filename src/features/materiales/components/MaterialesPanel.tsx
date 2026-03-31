'use client'

import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Card, EvidencePreview, Input, Select } from '@/components/ui'
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog'
import {
  getSingleTenantAccountLabel,
  isSingleTenantUiEnabled,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant'
import {
  confirmarDistribucionMateriales,
  confirmarRecepcionMaterial,
  descartarPreviewMateriales,
  guardarMaterialCatalogo,
  importarDistribucionMateriales,
  registrarEntregaPromocional,
  registrarConteoJornadaMaterial,
  registrarEvidenciaMercadeoMaterial,
} from '../actions'
import { ESTADO_MATERIAL_IMPORTACION_INICIAL, ESTADO_MATERIAL_INICIAL } from '../state'
import type { MaterialDistributionItem, MaterialLotPreviewItem, MaterialesPanelData } from '../services/materialService'
import { fileToDataUrl, stampMaterialEvidencePhoto } from '../lib/materialEvidenceCapture'

const ADMIN_ROLES = ['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA']

interface MaterialCameraCaptureDraft {
  file: File
  previewUrl: string
  dataUrl: string
  fileName: string
  fileSize: number
  capturedAt: string
  targetBytes: number
  targetMet: boolean
}

export function MaterialesPanel({ data }: { data: MaterialesPanelData }) {
  const [selectedMonth, setSelectedMonth] = useState(data.currentMonth)
  const fixedAccount = resolveSingleTenantAccountOption(data.accountOptions)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)
  const [selectedAccountId, setSelectedAccountId] = useState(fixedAccount?.id ?? data.accountOptions[0]?.id ?? '')
  const [catalogState, catalogAction] = useActionState(guardarMaterialCatalogo, ESTADO_MATERIAL_INICIAL)
  const [importState, importAction] = useActionState(
    importarDistribucionMateriales,
    ESTADO_MATERIAL_IMPORTACION_INICIAL
  )

  const summary = useMemo(() => {
    return data.distributions.reduce(
      (acc, item) => {
        acc.distributions += 1
        acc.sent += item.totalEnviado
        acc.received += item.totalRecibido
        acc.delivered += item.totalEntregado
        acc.remaining += item.totalDisponible
        return acc
      },
      {
        distributions: 0,
        sent: 0,
        received: 0,
        delivered: 0,
        remaining: 0,
      }
    )
  }, [data.distributions])

  const monthDistributions = useMemo(
    () =>
      data.distributions.filter(
        (item) => item.mesOperacion === selectedMonth && (!selectedAccountId || item.cuentaClienteId === selectedAccountId)
      ),
    [data.distributions, selectedAccountId, selectedMonth]
  )

  const monthSupervisorRows = useMemo(
    () =>
      data.supervisorView.filter(
        (item) =>
          item.mesOperacion === selectedMonth &&
          (!selectedAccountId ||
            data.distributions.some(
              (distribution) =>
                distribution.pdvId === item.pdvId &&
                distribution.mesOperacion === item.mesOperacion &&
                distribution.cuentaClienteId === selectedAccountId
            ))
      ),
    [data.distributions, data.supervisorView, selectedAccountId, selectedMonth]
  )

  const monthReportRows = useMemo(
    () =>
      data.reportRows.filter((item) => {
        if (item.month !== selectedMonth) {
          return false
        }
        if (!selectedAccountId) {
          return true
        }
        return data.distributions.some(
          (distribution) =>
            distribution.mesOperacion === item.month &&
            distribution.pdvClaveBtl === item.pdvClaveBtl &&
            distribution.cuentaClienteId === selectedAccountId
        )
      }),
    [data.distributions, data.reportRows, selectedAccountId, selectedMonth]
  )

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Catalogo activo" value={String(data.catalog.length)} />
        <MetricCard label="Dispersiones" value={String(summary.distributions)} />
        <MetricCard label="Enviado" value={String(summary.sent)} />
        <MetricCard label="Recibido" value={String(summary.received)} />
        <MetricCard label="Entregado" value={String(summary.delivered)} />
        <MetricCard label="Saldo" value={String(summary.remaining)} />
      </div>

      <Card className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Operacion mensual</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Control por PDV y material</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Toda la trazabilidad vive por mes, PDV y material: lo enviado, lo recibido formalmente en
            tienda, lo entregado al shopper y el saldo restante.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Select
            label="Mes"
            options={data.monthOptions.map((item) => ({ value: item, label: formatMonth(item) }))}
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
          {useSingleTenantUi ? (
            <div>
              <p className="mb-1.5 block text-sm font-medium text-foreground">Cuenta operativa</p>
              <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
                {getSingleTenantAccountLabel()}
              </div>
            </div>
          ) : (
            <Select
              label="Cuenta"
              options={[
                { value: '', label: 'Todas las cuentas' },
                ...data.accountOptions.map((item) => ({ value: item.id, label: item.label })),
              ]}
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            />
          )}
        </div>
      </Card>

      {ADMIN_ROLES.includes(data.actorRole) && (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <AdminCatalogSection data={data} state={catalogState} action={catalogAction} />
            <AdminImportSection data={data} state={importState} action={importAction} />
          </div>
          <DraftLotsSection data={data} importState={importState} />
          <DistributionsSection title="Dispersión por PDV" items={monthDistributions} />
          <ReportSection rows={monthReportRows} />
        </>
      )}

      {data.actorRole === 'DERMOCONSEJERO' && (
        <>
          <DermoReceptionSection data={data} />
          <DermoMercadeoSection data={data} />
          <DermoDeliverySection data={data} />
          <DermoInventorySection data={data} />
        </>
      )}

      {data.actorRole === 'SUPERVISOR' && (
        <>
          <SupervisorControlSection items={monthSupervisorRows} />
          <DistributionsSection title="Acuses y recepciones del mes" items={monthDistributions} />
        </>
      )}
    </div>
  )
}

function AdminCatalogSection({
  data,
  state,
  action,
}: {
  data: MaterialesPanelData
  state: { ok: boolean; message: string | null }
  action: (formData: FormData) => void
}) {
  const fixedAccount = resolveSingleTenantAccountOption(data.accountOptions)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Catalogo</p>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">Alta y control de promocionales</h3>
      </div>

      <form action={action} className="grid gap-4 md:grid-cols-2">
        {useSingleTenantUi ? (
          <>
            <input type="hidden" name="cuenta_cliente_id" value={fixedAccount?.id ?? ''} />
            <div className="md:col-span-2">
              <p className="mb-1.5 block text-sm font-medium text-foreground">Cuenta operativa</p>
              <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
                {getSingleTenantAccountLabel()}
              </div>
            </div>
          </>
        ) : (
          <Select
            name="cuenta_cliente_id"
            label="Cuenta cliente"
            options={data.accountOptions.map((item) => ({ value: item.id, label: item.label }))}
            defaultValue={data.accountOptions[0]?.id}
            className="md:col-span-2"
          />
        )}
        <Input name="nombre" label="Nombre del articulo" placeholder="Tester Fusion Water" />
        <Input name="tipo" label="Tipo" placeholder="TESTER, MUESTRA, REGALO..." />
        <Input name="cantidad_default" type="number" min="1" defaultValue="1" label="Cantidad sugerida" />
        <div className="grid gap-3 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" name="requiere_ticket_compra" value="true" className="h-4 w-4" />
            Requiere ticket de compra
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="requiere_evidencia_obligatoria"
              value="true"
              defaultChecked
              className="h-4 w-4"
            />
            Requiere evidencia obligatoria
          </label>
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <SubmitButton label="Guardar material" pendingLabel="Guardando..." />
          <StateMessage ok={state.ok} message={state.message} />
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {data.catalog.slice(0, 8).map((item) => (
          <div key={item.id} className="rounded-[18px] border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-950">{item.nombre}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{item.tipo}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {item.cantidadDefault} base
              </span>
            </div>
          </div>
        ))}
        {data.catalog.length === 0 && <EmptyState message="Todavia no hay promocionales visibles en el catalogo." />}
      </div>
    </Card>
  )
}

function AdminImportSection({
  data,
  state,
  action,
}: {
  data: MaterialesPanelData
  state: {
    ok: boolean
    message: string | null
    loteId?: string | null
    preview?: MaterialLotPreviewItem['preview'] | null
  }
  action: (formData: FormData) => void
}) {
  const fixedAccount = resolveSingleTenantAccountOption(data.accountOptions)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Dispersión mensual</p>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">Subir Excel y generar preview</h3>
      </div>

      <form action={action} className="grid gap-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">Plantilla oficial ISDIN</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Descarga el formato vigente para que el cliente arme la dispersión con la estructura correcta:
            fila 1 preset + mecánica, fila 2 totales, fila 3 encabezados y fila 4 en adelante registros por
            PDV.
          </p>
          <div className="mt-3">
            <a
              href="/api/materiales/template"
              className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-[var(--module-border)] bg-white px-4.5 py-2.5 text-sm font-medium text-[var(--module-text)] transition-colors duration-200 hover:bg-[var(--module-soft-bg)]"
            >
              Descargar plantilla ISDIN
            </a>
          </div>
        </div>
        {useSingleTenantUi ? (
          <>
            <input type="hidden" name="cuenta_cliente_id" value={fixedAccount?.id ?? ''} />
            <div>
              <p className="mb-1.5 block text-sm font-medium text-foreground">Cuenta operativa</p>
              <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
                {getSingleTenantAccountLabel()}
              </div>
            </div>
          </>
        ) : (
          <Select
            name="cuenta_cliente_id"
            label="Cuenta cliente"
            options={data.accountOptions.map((item) => ({ value: item.id, label: item.label }))}
            defaultValue={data.accountOptions[0]?.id}
          />
        )}
        <label className="block text-sm text-slate-600">
          Archivo Excel
          <input
            name="archivo_excel"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-2 block w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
          />
        </label>
        <div className="rounded-[18px] border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
          El archivo no crea dispersión al subirlo. Primero genera un preview por bloques para validar el match de
          PDV con ID BTL, revisar los productos detectados y decidir cuáles entran al lote con sus reglas mensuales.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label="Generar preview" pendingLabel="Analizando archivo..." />
          <StateMessage ok={state.ok} message={state.message} />
        </div>
        {state.preview && (
          <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Preview listo para revisión</p>
            <p className="mt-2">
              Mes: {formatMonth(state.preview.resolvedMonth)} · PDVs detectados: {state.preview.pdvPackages.length} ·
              Bloques: {state.preview.sheetSummaries.length} · Productos: {state.preview.materialRules.length} ·
              Advertencias: {state.preview.warnings.length}
            </p>
          </div>
        )}
      </form>
    </Card>
  )
}

function DraftLotsSection({
  data,
  importState,
}: {
  data: MaterialesPanelData
  importState: {
    ok: boolean
    message: string | null
    loteId: string | null
    preview: MaterialLotPreviewItem['preview'] | null
    cuentaClienteId: string | null
  }
}) {
  const [state, action] = useActionState(confirmarDistribucionMateriales, ESTADO_MATERIAL_INICIAL)
  const [discardState, discardAction] = useActionState(descartarPreviewMateriales, ESTADO_MATERIAL_INICIAL)
  const [dismissedLotIds, setDismissedLotIds] = useState<string[]>([])
  const [pendingDiscardLotId, setPendingDiscardLotId] = useState<string | null>(null)
  const [dismissNotice, setDismissNotice] = useState<string | null>(null)

  useEffect(() => {
    setDismissedLotIds([])
    setDismissNotice(null)
    setPendingDiscardLotId(null)
  }, [importState.loteId])

  useEffect(() => {
    if (!pendingDiscardLotId) {
      return
    }

    if (discardState.ok) {
      setDismissedLotIds((current) =>
        current.includes(pendingDiscardLotId) ? current : [...current, pendingDiscardLotId]
      )
      setDismissNotice(discardState.message)
      setPendingDiscardLotId(null)
      return
    }
  }, [discardState.message, discardState.ok, pendingDiscardLotId])

  const visibleLots = useMemo(() => {
    if (importState.loteId && importState.preview) {
      const previewLots = [
        {
        id: importState.loteId,
        cuentaClienteId: importState.cuentaClienteId ?? '',
        cuentaCliente:
          data.accountOptions.find((item) => item.id === importState.cuentaClienteId)?.label ?? 'Cuenta actual',
        mesOperacion: importState.preview.resolvedMonth,
        estado: 'BORRADOR_PREVIEW',
        archivoNombre: 'Preview actual',
        archivoUrl: null,
        geminiStatus: 'PREVIEW',
        warningCount: importState.preview.warnings.length,
        canConfirm: importState.preview.canConfirm,
        pdvCount: importState.preview.pdvPackages.length,
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        preview: importState.preview,
        geminiSummary: null,
        },
      ]
      return previewLots.filter((lot) => !dismissedLotIds.includes(lot.id))
    }
    return []
  }, [data.accountOptions, dismissedLotIds, importState.cuentaClienteId, importState.loteId, importState.preview])

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Preview y confirmación</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Preview actual por confirmar</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          El preview es temporal: cada archivo nuevo reemplaza el anterior y al recargar la página se limpia. Solo la
          confirmación crea el lote activo y lanza la dispersión al resto del sistema.
        </p>
      </div>

      {visibleLots.length === 0 ? (
        <div className="space-y-3">
          <EmptyState message="No hay un preview activo en este momento. Sube el Excel del cliente para generar uno nuevo." />
          <StateMessage ok={discardState.ok} message={dismissNotice} />
        </div>
      ) : (
        <div className="space-y-6">
          {visibleLots.map((lot) => (
            <form key={lot.id} action={action} className="space-y-5 rounded-[22px] border border-slate-200 p-5">
              <input type="hidden" name="lote_id" value={lot.id} />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-950">{lot.archivoNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {lot.cuentaCliente ?? 'Sin cuenta'} · {formatMonth(lot.mesOperacion)} · {lot.pdvCount} PDVs
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Gemini: {lot.geminiStatus} · creado {formatDateTime(lot.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={lot.canConfirm ? 'emerald' : 'amber'}>
                    {lot.canConfirm ? 'Listo para confirmar' : 'Con advertencias bloqueantes'}
                  </Pill>
                  <Pill tone="slate">{lot.warningCount} advertencias</Pill>
                </div>
              </div>

              {lot.geminiSummary && (
                <div className="rounded-[18px] border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
                  <p className="font-medium">Resumen asistido por Gemini</p>
                  <p className="mt-2">{lot.geminiSummary}</p>
                </div>
              )}

              {lot.preview && (
                <>
                  {lot.preview.warnings.length > 0 && (
                    <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-medium">Advertencias detectadas</p>
                      <ul className="mt-2 space-y-1">
                        {lot.preview.warnings.slice(0, 8).map((warning) => (
                          <li key={warning.code + warning.message}>
                            {warning.sheetName ? `${warning.sheetName}: ` : ''}
                            {warning.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid gap-4 lg:grid-cols-[0.95fr_1.35fr]">
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-950">PDVs detectados</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {lot.preview.pdvPackages.slice(0, 8).map((pdvPackage) => (
                          <div
                            key={`${pdvPackage.sheetNames.join('-')}-${pdvPackage.rowNumbers.join('-')}-${pdvPackage.idBtl ?? pdvPackage.idPdvCadena}`}
                            className="rounded-[14px] bg-white px-3 py-2"
                          >
                            <div className="font-medium text-slate-900">{pdvPackage.sucursal ?? 'Sin sucursal'}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {pdvPackage.idBtl ?? 'Sin ID BTL'} · {pdvPackage.idPdvCadena ?? 'Sin ID cadena'} ·{' '}
                              {pdvPackage.nombreDc ?? 'Vacante'} · {pdvPackage.idNominaDc ?? 'Sin nómina / vacante'} ·{' '}
                              {pdvPackage.sheetNames.join(', ')} ·{' '}
                              {pdvPackage.pdvMatch.matched ? 'PDV resuelto' : 'Sin match'}
                            </div>
                          </div>
                        ))}
                        {lot.preview.pdvPackages.length > 8 && (
                          <p className="text-xs text-slate-500">
                            + {lot.preview.pdvPackages.length - 8} registros más en el lote.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Input
                        name="mes_operacion_override"
                        label="Mes de operación"
                        defaultValue={lot.mesOperacion.slice(0, 7)}
                        placeholder="2026-03"
                      />
                      <div className="space-y-4">
                        {lot.preview.sheetSummaries.map((sheetSummary) => {
                          const blockRules =
                            lot.preview?.materialRules.filter(
                            (rule) => (rule.blockName ?? rule.sheetNames?.[0] ?? '') === sheetSummary.sheetName
                            ) ?? []

                          if (blockRules.length === 0) {
                            return null
                          }

                          return (
                            <div key={sheetSummary.sheetName} className="rounded-[20px] border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-950">{sheetSummary.sheetName}</p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                                    Bloque homologado del cliente
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Pill tone="sky">{sheetSummary.packageCount} dispersiones</Pill>
                                  <Pill tone="slate">{sheetSummary.productCount} productos</Pill>
                                  <Pill tone="emerald">{sheetSummary.totalAssignedQuantity} piezas</Pill>
                                </div>
                              </div>

                              <div className="mt-4 space-y-4">
                                {blockRules.map((rule) => (
                                  <div key={rule.key} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <label className="flex items-start gap-3">
                                          <input
                                            type="checkbox"
                                            name={`rule__${rule.key}__selected`}
                                            value="true"
                                            defaultChecked={rule.selected ?? true}
                                            className="mt-1 h-4 w-4"
                                          />
                                          <div>
                                            <p className="font-medium text-slate-950">{rule.displayName}</p>
                                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                                              {rule.materialType} · {rule.pdvCount} PDVs · {rule.assignedQuantityTotal} piezas
                                            </p>
                                            {rule.sourceContext ? (
                                              <p className="mt-1 text-xs text-slate-500">{rule.sourceContext}</p>
                                            ) : null}
                                          </div>
                                        </label>
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        Total bloque: {rule.totalColumn ?? rule.assignedQuantityTotal}
                                      </div>
                                    </div>

                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                      <Input
                                        name={`rule__${rule.key}__tipo`}
                                        label="Tipo de promoción"
                                        defaultValue={rule.materialType}
                                        placeholder="TESTER, DOSIS, REGALO..."
                                      />
                                      <Input
                                        name={`rule__${rule.key}__mecanica`}
                                        label="Mecánica de canje"
                                        defaultValue={rule.mecanicaCanje ?? ''}
                                        placeholder="Opcional"
                                      />
                                      <label className="block text-sm text-slate-600 md:col-span-2">
                                        Observación / indicaciones del producto
                                        <textarea
                                          name={`rule__${rule.key}__indicaciones`}
                                          rows={2}
                                          defaultValue={rule.indicacionesProducto ?? ''}
                                          className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                                        />
                                      </label>
                                      <label className="block text-sm text-slate-600 md:col-span-2">
                                        Instrucciones de mercadeo
                                        <textarea
                                          name={`rule__${rule.key}__mercadeo`}
                                          rows={2}
                                          defaultValue={rule.instruccionesMercadeo ?? ''}
                                          className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                                        />
                                      </label>
                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                      <CheckboxField
                                        name={`rule__${rule.key}__excluir`}
                                        label="Excluir de registrar entrega"
                                        defaultChecked={rule.flags.excluirDeRegistrarEntrega}
                                      />
                                      <CheckboxField
                                        name={`rule__${rule.key}__ticket`}
                                        label="Requiere ticket"
                                        defaultChecked={rule.flags.requiereTicketMes}
                                      />
                                      <CheckboxField
                                        name={`rule__${rule.key}__evidencia_entrega`}
                                        label="Requiere evidencia de entrega"
                                        defaultChecked={rule.flags.requiereEvidenciaEntregaMes}
                                      />
                                      <CheckboxField
                                        name={`rule__${rule.key}__evidencia_mercadeo`}
                                        label="Requiere mercadeo"
                                        defaultChecked={rule.flags.requiereEvidenciaMercadeo}
                                      />
                                      <CheckboxField
                                        name={`rule__${rule.key}__regalo_dc`}
                                        label="Regalo para DC"
                                        defaultChecked={rule.flags.esRegaloDc}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="Confirmar lote mensual" pendingLabel="Confirmando lote..." disabled={!lot.canConfirm} />
                <Button
                  type="submit"
                  variant="outline"
                  formAction={discardAction}
                  onClick={() => setPendingDiscardLotId(lot.id)}
                >
                  Descartar preview
                </Button>
                <StateMessage ok={state.ok} message={state.message} />
                <StateMessage ok={discardState.ok} message={pendingDiscardLotId === lot.id ? discardState.message : null} />
              </div>
            </form>
          ))}
        </div>
      )}
    </Card>
  )
}

function DermoReceptionSection({ data }: { data: MaterialesPanelData }) {
  const [state, action] = useActionState(confirmarRecepcionMaterial, ESTADO_MATERIAL_INICIAL)

  if (!data.dermoContext) {
    return (
      <Card className="border-slate-200 bg-slate-50">
        <h2 className="text-lg font-semibold text-slate-950">Recepción de material</h2>
        <p className="mt-2 text-sm text-slate-600">
          Tu recepción formal se habilita cuando tengas un PDV asignado en el mes actual.
        </p>
      </Card>
    )
  }

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Recepción en tienda</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Checklist de material esperado</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Confirma formalmente lo recibido en {data.dermoContext.pdvNombre}. La firma digital, la foto y las
          diferencias reportadas quedan como acuse oficial.
        </p>
      </div>

      {data.dermoPendingReception.length === 0 ? (
        <EmptyState message="No tienes recepciones pendientes para este mes en tu PDV actual." />
      ) : (
        <div className="space-y-5">
          {data.dermoPendingReception.map((distribution) => (
            <form key={distribution.id} action={action} className="space-y-5 rounded-[22px] border border-slate-200 p-5">
              <input type="hidden" name="distribucion_id" value={distribution.id} />
              <input type="hidden" name="cuenta_cliente_id" value={distribution.cuentaClienteId} />

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-950">{distribution.pdvNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {distribution.pdvClaveBtl ?? 'Sin clave'} · {distribution.cadena ?? 'Sin cadena'} ·{' '}
                    {formatMonth(distribution.mesOperacion)}
                  </p>
                </div>
                <Pill tone={distribution.estado === 'PENDIENTE_ACLARACION' ? 'amber' : 'sky'}>
                  {formatStatus(distribution.estado)}
                </Pill>
              </div>

              <div className="grid gap-4">
                {distribution.detalles.map((detail) => (
                  <div key={detail.id} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{detail.materialNombre}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{detail.materialTipo}</p>
                      </div>
                      <div className="text-right text-sm text-slate-600">Esperado: {detail.cantidadEnviada}</div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_0.8fr_1.4fr]">
                      <Input
                        name={`cantidad_recibida__${detail.id}`}
                        label="Recibido"
                        type="number"
                        min="0"
                        defaultValue={String(detail.cantidadEnviada)}
                      />
                      <Input
                        name={`cantidad_observada__${detail.id}`}
                        label="Diferencia"
                        type="number"
                        min="0"
                        defaultValue="0"
                      />
                      <label className="block text-sm text-slate-600">
                        Observacion
                        <textarea
                          name={`observacion__${detail.id}`}
                          rows={2}
                          className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                          placeholder="Reporta faltantes o diferencias."
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
                <SignatureField name="firma_recepcion_data_url" />
                <CameraCaptureField
                  name="foto_recepcion"
                  pdvLabel={distribution.pdvNombre}
                  flowLabel="Recepcion de material"
                  title="Foto oficial en tienda"
                  description="Toma la foto desde cámara en vivo. El borrador final se sella con fecha, hora y PDV."
                  buttonLabel="Capturar recepción"
                />
              </div>

              <label className="block text-sm text-slate-600">
                Observaciones generales
                <textarea
                  name="observaciones"
                  rows={3}
                  className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="Confirmar recepción" pendingLabel="Guardando..." />
                <StateMessage ok={state.ok} message={state.message} />
              </div>
            </form>
          ))}
        </div>
      )}
    </Card>
  )
}

function DermoMercadeoSection({ data }: { data: MaterialesPanelData }) {
  const [state, action] = useActionState(registrarEvidenciaMercadeoMaterial, ESTADO_MATERIAL_INICIAL)

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">Evidencia de mercadeo</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Foto única del material exhibido</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Después de la recepción, sube una sola foto por lote cuando el material requiera validar exhibición en el
          PDV. Esa evidencia cubre testers, dosis o bloques marcados para mercadeo.
        </p>
      </div>

      {!data.dermoContext || data.dermoMercadeoPending.length === 0 ? (
        <EmptyState message="No tienes lotes pendientes con evidencia de mercadeo por registrar." />
      ) : (
        <div className="space-y-5">
          {data.dermoMercadeoPending.map((distribution) => (
            <form key={distribution.id} action={action} className="space-y-4 rounded-[22px] border border-slate-200 p-5">
              <input type="hidden" name="cuenta_cliente_id" value={distribution.cuentaClienteId} />
              <input type="hidden" name="distribucion_id" value={distribution.id} />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-950">{distribution.pdvNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {distribution.pdvClaveBtl ?? 'Sin clave'} · {formatMonth(distribution.mesOperacion)}
                  </p>
                </div>
                <Pill tone="violet">Mercadeo pendiente</Pill>
              </div>
              <div className="rounded-[18px] border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                <p className="font-medium">Materiales que requieren exhibición</p>
                <ul className="mt-2 space-y-1">
                  {distribution.detalles
                    .filter((detail) => detail.requiereEvidenciaMercadeo)
                    .map((detail) => (
                      <li key={detail.id}>
                        {detail.materialNombre}
                        {detail.instruccionesMercadeo ? ` · ${detail.instruccionesMercadeo}` : ''}
                      </li>
                    ))}
                </ul>
              </div>
              <CameraCaptureField
                name="foto_mercadeo"
                pdvLabel={distribution.pdvNombre}
                flowLabel="Evidencia de mercadeo"
                title="Foto de exhibición en PDV"
                description="Usa la cámara en vivo y confirma una sola foto por lote. El sistema la sella con fecha, hora y PDV."
                buttonLabel="Capturar exhibición"
              />
              <label className="block text-sm text-slate-600">
                Observaciones
                <textarea
                  name="observaciones"
                  rows={2}
                  className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="Guardar evidencia" pendingLabel="Guardando..." />
                <StateMessage ok={state.ok} message={state.message} />
              </div>
            </form>
          ))}
        </div>
      )}
    </Card>
  )
}

function DermoDeliverySection({ data }: { data: MaterialesPanelData }) {
  const [state, action] = useActionState(registrarEntregaPromocional, ESTADO_MATERIAL_INICIAL)
  const [selectedDetailId, setSelectedDetailId] = useState(data.dermoDeliverableDetails[0]?.id ?? '')

  const selectedDetail = useMemo(
    () => data.dermoDeliverableDetails.find((item) => item.id === selectedDetailId) ?? null,
    [data.dermoDeliverableDetails, selectedDetailId]
  )

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Entregar promocional</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Salida de muestras, testers y regalos</h2>
      </div>

      {!data.dermoContext || data.dermoDeliverableDetails.length === 0 ? (
        <EmptyState message="Aun no tienes saldo disponible de promocionales para registrar en tu tienda." />
      ) : (
        <form action={action} className="grid gap-4 xl:grid-cols-2">
          <input type="hidden" name="cuenta_cliente_id" value={data.dermoContext.cuentaClienteId ?? ''} />
          <input type="hidden" name="pdv_id" value={data.dermoContext.pdvId} />
          <input type="hidden" name="distribucion_id" value={selectedDetail?.distribucionId ?? ''} />
          <input type="hidden" name="distribucion_detalle_id" value={selectedDetail?.id ?? ''} />
          <input type="hidden" name="material_catalogo_id" value={selectedDetail?.materialCatalogoId ?? ''} />

          <Select
            label="Promocional"
            name="_selected_detail"
            options={data.dermoDeliverableDetails.map((item) => ({
              value: item.id,
              label: `${item.materialNombre} · saldo ${item.saldoDisponible}`,
            }))}
            value={selectedDetailId}
            onChange={(event) => setSelectedDetailId(event.target.value)}
            className="xl:col-span-2"
          />
          <Input
            name="cantidad_entregada"
            label="Piezas entregadas"
            type="number"
            min="1"
            max={selectedDetail?.saldoDisponible ?? 1}
            defaultValue="1"
          />
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-950">{selectedDetail?.materialNombre ?? 'Sin material'}</p>
            <p className="mt-2">Saldo disponible: {selectedDetail?.saldoDisponible ?? 0}</p>
            <p className="mt-1">Recibido: {selectedDetail?.cantidadRecibida ?? 0}</p>
            <p className="mt-1">Entregado: {selectedDetail?.cantidadEntregada ?? 0}</p>
          </div>
          <CameraCaptureField
            key={`material-${selectedDetail?.id ?? 'sin-detalle'}`}
            name="evidencia_material"
            pdvLabel={data.dermoContext.pdvNombre}
            flowLabel="Entrega de material"
            title="Foto del material entregado"
            description="Captura desde cámara en vivo el material entregado. La evidencia se sella con fecha, hora y PDV."
            buttonLabel="Capturar material"
          />
          <CameraCaptureField
            key={`pdv-${selectedDetail?.id ?? 'sin-detalle'}`}
            name="evidencia_pdv"
            pdvLabel={data.dermoContext.pdvNombre}
            flowLabel="Evidencia en PDV"
            title="Foto dentro del PDV"
            description="Captura la evidencia dentro del punto de venta con sello visible de fecha, hora y PDV."
            buttonLabel="Capturar PDV"
          />

          {selectedDetail?.requiereTicketCompra && (
            <div className="xl:col-span-2">
              <CameraCaptureField
                key={`ticket-${selectedDetail?.id ?? 'sin-detalle'}`}
                name="ticket_compra"
                pdvLabel={data.dermoContext.pdvNombre}
                flowLabel="Ticket de compra"
                title="Ticket de compra"
                description="Cuando el material requiera ticket, súbelo como foto desde cámara en vivo sellada."
                buttonLabel="Capturar ticket"
              />
            </div>
          )}

          <label className="block text-sm text-slate-600 xl:col-span-2">
            Observaciones
            <textarea
              name="observaciones"
              rows={3}
              className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <div className="xl:col-span-2 flex flex-wrap items-center gap-3">
            <SubmitButton label="Guardar entrega" pendingLabel="Guardando..." />
            <StateMessage ok={state.ok} message={state.message} />
          </div>
        </form>
      )}
    </Card>
  )
}

function DermoInventorySection({ data }: { data: MaterialesPanelData }) {
  const [state, action] = useActionState(registrarConteoJornadaMaterial, ESTADO_MATERIAL_INICIAL)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">Conteo de jornada</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Apertura y cierre del inventario inventariable</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Este conteo solo toma materiales inventariables. Si la apertura no coincide contra el cierre previo, el
          sistema pedirá explicación y clasificará la diferencia.
        </p>
      </div>

      {!data.dermoContext || data.dermoInventoryItems.length === 0 ? (
        <EmptyState message="Todavía no tienes inventario vivo en el PDV para registrar conteo de jornada." />
      ) : (
        <form action={action} className="space-y-5">
          <input type="hidden" name="cuenta_cliente_id" value={data.dermoContext.cuentaClienteId ?? ''} />
          <input type="hidden" name="pdv_id" value={data.dermoContext.pdvId} />

          <div className="grid gap-4 md:grid-cols-3">
            <Input name="fecha_operacion" label="Fecha de operación" type="date" defaultValue={today} />
            <Select
              name="momento"
              label="Momento"
              options={[
                { value: 'APERTURA', label: 'Apertura' },
                { value: 'CIERRE', label: 'Cierre' },
              ]}
              defaultValue="CIERRE"
            />
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-950">Último cierre registrado</p>
              <p className="mt-2">{data.latestCloseDate ? formatDate(data.latestCloseDate) : 'Sin cierre previo'}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.dermoInventoryItems.map((item) => (
              <div key={item.materialCatalogoId} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{item.materialNombre}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{item.materialTipo}</p>
                  </div>
                  <Pill tone="slate">Saldo {item.balanceActual}</Pill>
                </div>
                <Input
                  name={`conteo__${item.materialCatalogoId}`}
                  label="Cantidad contada"
                  type="number"
                  min="0"
                  defaultValue={String(Math.max(item.balanceActual, 0))}
                  className="mt-4"
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              name="clasificacion_diferencia"
              label="Clasificación si detectas diferencia"
              options={[
                { value: '', label: 'Sin diferencia / se llenará si aplica' },
                { value: 'AJUSTE_FUERA_TURNO', label: 'Movimiento fuera de turno' },
                { value: 'MERMA', label: 'Merma' },
              ]}
              defaultValue=""
            />
            <label className="block text-sm text-slate-600">
              Explicación de diferencia
              <textarea
                name="observacion_diferencia"
                rows={3}
                className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                placeholder="Solo se vuelve obligatoria si la apertura difiere del cierre previo."
              />
            </label>
          </div>

          <label className="block text-sm text-slate-600">
            Observaciones generales
            <textarea
              name="observaciones"
              rows={2}
              className="mt-2 w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton label="Guardar conteo" pendingLabel="Guardando..." />
            <StateMessage ok={state.ok} message={state.message} />
          </div>
        </form>
      )}
    </Card>
  )
}

function SupervisorControlSection({ items }: { items: MaterialesPanelData['supervisorView'] }) {
  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Supervisión</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Control por tienda</h2>
      </div>

      <div className="grid gap-4">
        {items.length === 0 ? (
          <EmptyState message="No hay tiendas visibles con control promocional para el mes filtrado." />
        ) : (
          items.map((item) => (
            <div key={`${item.pdvId}-${item.mesOperacion}`} className="rounded-[18px] border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-950">{item.pdvNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.pdvClaveBtl ?? 'Sin clave'} · {item.cadena ?? 'Sin cadena'} · {item.zona ?? 'Sin zona'}
                  </p>
                </div>
                <Pill tone={item.estadoRecepcion.includes('OBSERVACIONES') ? 'amber' : 'sky'}>
                  {formatStatus(item.estadoRecepcion)}
                </Pill>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                <MiniMetric label="Enviado" value={String(item.enviado)} />
                <MiniMetric label="Recibido" value={String(item.recibido)} />
                <MiniMetric label="Entregado" value={String(item.entregado)} />
                <MiniMetric label="Saldo" value={String(item.restante)} />
                <MiniMetric label="Evidencias" value={String(item.evidencias)} />
              </div>
              <div className="mt-3">
                <Pill tone={item.mercadeoRegistrado ? 'violet' : 'slate'}>
                  {item.mercadeoRegistrado ? 'Mercadeo registrado' : 'Mercadeo pendiente o no aplica'}
                </Pill>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function DistributionsSection({ title, items }: { title: string; items: MaterialDistributionItem[] }) {
  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Trazabilidad</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">{title}</h2>
      </div>

      {items.length === 0 ? (
        <EmptyState message="No hay dispersiones visibles con el filtro actual." />
      ) : (
        <div className="space-y-4">
          {items.map((distribution) => (
            <div key={distribution.id} className="rounded-[20px] border border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-950">{distribution.pdvNombre}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {distribution.pdvClaveBtl ?? 'Sin clave'} · {distribution.cadena ?? 'Sin cadena'} ·{' '}
                    {distribution.zona ?? 'Sin zona'} · {formatMonth(distribution.mesOperacion)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{distribution.cuentaCliente ?? 'Sin cuenta cliente'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={distribution.estado.includes('OBSERVACIONES') ? 'amber' : 'sky'}>
                    {formatStatus(distribution.estado)}
                  </Pill>
                  <Pill tone="slate">Enviado {distribution.totalEnviado}</Pill>
                  <Pill tone="emerald">Saldo {distribution.totalDisponible}</Pill>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3">
                  {distribution.detalles.map((detail) => (
                    <div key={detail.id} className="rounded-[16px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-950">{detail.materialNombre}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{detail.materialTipo}</p>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-600">
                          <MiniNumber label="Env." value={detail.cantidadEnviada} />
                          <MiniNumber label="Rec." value={detail.cantidadRecibida} />
                          <MiniNumber label="Ent." value={detail.cantidadEntregada} />
                          <MiniNumber label="Saldo" value={detail.saldoDisponible} />
                        </div>
                      </div>
                      {detail.observaciones && <p className="mt-3 text-sm text-amber-800">{detail.observaciones}</p>}
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Evidencias oficiales</p>
                    <div className="mt-3 space-y-3">
                      <EvidencePreview url={distribution.firmaRecepcionUrl} hash={distribution.id} label="Firma de recepción" emptyLabel="Sin firma" />
                      <EvidencePreview url={distribution.fotoRecepcionUrl} hash={distribution.id} label="Foto de recepción" emptyLabel="Sin foto" />
                      <EvidencePreview
                        url={distribution.mercadeoEvidence?.fotoUrl ?? null}
                        hash={distribution.mercadeoEvidence?.fotoHash ?? distribution.id}
                        label="Evidencia de mercadeo"
                        emptyLabel="Sin mercadeo cargado"
                      />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Confirmado en: {distribution.confirmadoEn ? formatDateTime(distribution.confirmadoEn) : 'Pendiente'}
                    </p>
                  </div>

                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-950">Observaciones</p>
                    <p className="mt-2">{distribution.observaciones ?? 'Sin observaciones registradas.'}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ReportSection({ rows }: { rows: MaterialesPanelData['reportRows'] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 px-6 py-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Reporte mensual</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Vista consolidada por PDV, cadena y material</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">PDV</th>
              <th className="px-6 py-3 font-medium">Cadena</th>
              <th className="px-6 py-3 font-medium">Promocional</th>
              <th className="px-6 py-3 font-medium">Enviado</th>
              <th className="px-6 py-3 font-medium">Recibido</th>
              <th className="px-6 py-3 font-medium">Entregado</th>
              <th className="px-6 py-3 font-medium">Saldo</th>
              <th className="px-6 py-3 font-medium">Obs.</th>
              <th className="px-6 py-3 font-medium">Evidencias</th>
              <th className="px-6 py-3 font-medium">Mercadeo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                  No hay datos del reporte para el mes filtrado.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.month}-${row.pdvClaveBtl}-${row.material}`} className="border-t border-slate-100">
                  <td className="px-6 py-4 text-slate-700">
                    <div className="font-medium text-slate-900">{row.pdv}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.pdvClaveBtl ?? 'Sin clave'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{row.chain ?? 'Sin cadena'}</td>
                  <td className="px-6 py-4 text-slate-700">
                    <div className="font-medium text-slate-900">{row.material}</div>
                    <div className="mt-1 text-xs text-slate-400">{row.materialTipo}</div>
                  </td>
                  <td className="px-6 py-4">{row.enviado}</td>
                  <td className="px-6 py-4">{row.recibido}</td>
                  <td className="px-6 py-4">{row.entregado}</td>
                  <td className="px-6 py-4 font-medium text-emerald-700">{row.restante}</td>
                  <td className="px-6 py-4">{row.observaciones}</td>
                  <td className="px-6 py-4">{row.evidencias}</td>
                  <td className="px-6 py-4">{row.mercadeo ? 'Sí' : 'No'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function CameraCaptureField({
  name,
  pdvLabel,
  flowLabel,
  title,
  description,
  buttonLabel,
}: {
  name:
    | 'foto_recepcion'
    | 'foto_mercadeo'
    | 'evidencia_material'
    | 'evidencia_pdv'
    | 'ticket_compra'
  pdvLabel: string
  flowLabel:
    | 'Recepcion de material'
    | 'Evidencia de mercadeo'
    | 'Entrega de material'
    | 'Evidencia en PDV'
    | 'Ticket de compra'
  title: string
  description: string
  buttonLabel: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<MaterialCameraCaptureDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (draft?.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl)
      }
    }
  }, [draft])

  const handleCapture = async (file: File) => {
    const capturedAt = new Date().toISOString()
    const stamped = await stampMaterialEvidencePhoto(file, {
      capturedAt,
      pdvLabel,
      flowLabel,
    })
    const dataUrl = await fileToDataUrl(stamped.file)

    setError(null)
    setDraft((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }

      return {
        file: stamped.file,
        previewUrl: URL.createObjectURL(stamped.file),
        dataUrl,
        fileName: stamped.file.name,
        fileSize: stamped.file.size,
        capturedAt,
        targetBytes: stamped.targetBytes,
        targetMet: stamped.targetMet,
      }
    })
  }

  return (
    <div className="space-y-4 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (draft.previewUrl) {
                  URL.revokeObjectURL(draft.previewUrl)
                }
                setDraft(null)
                setError(null)
              }}
            >
              Limpiar
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
            {draft ? 'Tomar de nuevo' : buttonLabel}
          </Button>
        </div>
      </div>

      <input type="hidden" name={`${name}_data_url`} value={draft?.dataUrl ?? ''} />
      <input type="hidden" name={`${name}_capturada_en`} value={draft?.capturedAt ?? ''} />

      {draft ? (
        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white">
          <img src={draft.previewUrl} alt={title} className="aspect-[4/5] w-full object-cover" />
          <div className="grid gap-3 px-4 py-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-950">Captura lista</p>
              <p className="mt-1 break-all">{draft.fileName}</p>
              <p className="mt-1">Hora: {new Date(draft.capturedAt).toLocaleString('es-MX')}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-950">Sello aplicado</p>
              <p className="mt-1">PDV: {pdvLabel}</p>
              <p className="mt-1">
                Peso final: {(draft.fileSize / 1024).toFixed(1)} KB ·{' '}
                {draft.targetMet ? 'objetivo cumplido' : 'compresión máxima aplicada'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-[16px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
          La cámara en vivo generará un borrador sellado con fecha, hora y PDV antes de enviar la evidencia.
        </p>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}

      <NativeCameraSelfieDialog
        open={isOpen}
        title={title}
        description={description}
        facingMode="environment"
        captureLabel={buttonLabel}
        onClose={() => setIsOpen(false)}
        onCapture={async (file) => {
          try {
            await handleCapture(file)
          } catch (captureError) {
            setError(
              captureError instanceof Error
                ? captureError.message
                : 'No fue posible preparar la captura sellada.'
            )
            throw captureError
          }
        }}
      />
    </div>
  )
}

function SignatureField({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#0f172a'
    context.lineWidth = 2
    context.lineCap = 'round'
    context.lineJoin = 'round'

    let drawing = false

    const getPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      }
    }

    const handleDown = (event: PointerEvent) => {
      drawing = true
      const point = getPoint(event)
      context.beginPath()
      context.moveTo(point.x, point.y)
    }

    const handleMove = (event: PointerEvent) => {
      if (!drawing) {
        return
      }
      const point = getPoint(event)
      context.lineTo(point.x, point.y)
      context.stroke()
      setDataUrl(canvas.toDataURL('image/png'))
    }

    const handleUp = () => {
      if (!drawing) {
        return
      }
      drawing = false
      setDataUrl(canvas.toDataURL('image/png'))
    }

    canvas.addEventListener('pointerdown', handleDown)
    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)

    return () => {
      canvas.removeEventListener('pointerdown', handleDown)
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [])

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-950">Firma digital</p>
        <p className="mt-1 text-sm text-slate-600">Firma con tu dedo o cursor. Esto queda como acuse oficial.</p>
      </div>
      <canvas
        ref={canvasRef}
        width={720}
        height={220}
        className="w-full rounded-[18px] border border-slate-300 bg-white touch-none"
      />
      <input type="hidden" name={name} value={dataUrl} />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const canvas = canvasRef.current
          const context = canvas?.getContext('2d')
          if (!canvas || !context) {
            return
          }
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
          setDataUrl('')
        }}
      >
        Limpiar firma
      </Button>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function MiniNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string
  label: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-start gap-3 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="mt-1 h-4 w-4" />
      <span>{label}</span>
    </label>
  )
}

function Pill({ children, tone }: { children: ReactNode; tone: 'emerald' | 'amber' | 'sky' | 'slate' | 'violet' }) {
  const className =
    tone === 'emerald'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : tone === 'violet'
          ? 'bg-violet-100 text-violet-800'
        : tone === 'sky'
          ? 'bg-sky-100 text-sky-800'
          : 'bg-slate-100 text-slate-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>{children}</span>
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-500">
      {message}
    </div>
  )
}

function StateMessage({ ok, message }: { ok: boolean; message: string | null }) {
  if (!message) {
    return null
  }

  return <p className={`text-sm ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{message}</p>
}

function SubmitButton({ label, pendingLabel, disabled }: { label: string; pendingLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" isLoading={pending} disabled={disabled}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function formatMonth(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`)
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`))
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ')
}
