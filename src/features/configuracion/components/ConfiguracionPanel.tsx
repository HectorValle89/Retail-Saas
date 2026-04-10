'use client'

import { useActionState, useDeferredValue, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Select } from '@/components/ui/select'
import {
  eliminarTurnoCatalogo,
  guardarCadena,
  guardarCiudad,
  guardarMisionDia,
  guardarOcrConfiguracion,
  guardarPdfCompressionConfiguracion,
  guardarParametroConfiguracion,
  guardarProducto,
  guardarTurnoCatalogo,
  importarCatalogoProductos,
} from '../actions'
import {
  OCR_PROVIDER_OPTIONS,
  PDF_COMPRESSION_PROVIDER_OPTIONS,
  type TurnoCatalogoItem,
} from '../configuracionCatalog'
import { ESTADO_CONFIGURACION_ADMIN_INICIAL } from '../state'
import type {
  CadenaCatalogoItem,
  CiudadCatalogoItem,
  ConfiguracionPanelData,
  MisionCatalogoItem,
  OcrConfiguracionItem,
  ParametroEditableItem,
  PdfCompressionConfiguracionItem,
  ProductoCatalogoItem,
} from '../services/configuracionService'

function formatBooleanLabel(value: boolean) {
  return value ? 'ACTIVO' : 'INACTIVO'
}

function getStatusTone(active: boolean) {
  return active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
}

function getOcrTone(status: OcrConfiguracionItem['status']) {
  switch (status) {
    case 'LISTO':
      return 'bg-emerald-100 text-emerald-700'
    case 'FALTA_API_KEY':
      return 'bg-amber-100 text-amber-700'
    case 'NO_IMPLEMENTADO':
      return 'bg-rose-100 text-rose-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getPdfCompressionTone(status: PdfCompressionConfiguracionItem['status']) {
  switch (status) {
    case 'LISTO':
      return 'bg-emerald-100 text-emerald-700'
    case 'FALTA_BASE_URL':
      return 'bg-amber-100 text-amber-700'
    case 'INALCANZABLE':
      return 'bg-rose-100 text-rose-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function FieldTextarea({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
}) {
  const textId = `${name}-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="w-full">
      <label htmlFor={textId} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={textId}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  )
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  )
}

function StateMessage({
  state,
}: {
  state: { ok: boolean; message: string | null }
}) {
  if (!state.message) {
    return null
  }

  return (
    <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
      {state.message}
    </p>
  )
}

function SubmitActionButton({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string
  pendingLabel: string
  variant?: 'primary' | 'outline' | 'danger'
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant={variant} isLoading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

export function ConfiguracionPanel({ data }: { data: ConfiguracionPanelData }) {
  const [productSearch, setProductSearch] = useState('')
  const [missionSearch, setMissionSearch] = useState('')
  const deferredProductSearch = useDeferredValue(productSearch.trim().toLowerCase())
  const deferredMissionSearch = useDeferredValue(missionSearch.trim().toLowerCase())

  const filteredProducts = data.productos.filter((item) => {
    if (!deferredProductSearch) {
      return true
    }

    return [item.sku, item.nombre, item.nombreCorto, item.categoria]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(deferredProductSearch))
  })

  const filteredMissions = data.misiones.filter((item) => {
    if (!deferredMissionSearch) {
      return true
    }

    return [item.codigo, item.instruccion]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(deferredMissionSearch))
  })

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura parcial</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Productos activos" value={String(data.resumen.productosActivos)} />
        <MetricCard label="Cadenas activas" value={String(data.resumen.cadenasActivas)} />
        <MetricCard label="Ciudades activas" value={String(data.resumen.ciudadesActivas)} />
        <MetricCard label="Turnos catalogo" value={String(data.resumen.turnosCatalogo)} />
        <MetricCard label="Misiones activas" value={String(data.resumen.misionesActivas)} />
        <MetricCard label="Parametros guardados" value={String(data.resumen.parametrosConfigurados)} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card className="space-y-5 p-6">
            <SectionHeader
              title="Catalogo de productos"
              description="CRUD operativo para ventas, reportes y catalogo comercial visible en campo."
            />
            <ImportCatalogForm />
            <Input
              label="Buscar producto"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="SKU, nombre, nombre corto o categoria"
            />
            <ProductoForm />
            <div className="space-y-3">
              {filteredProducts.map((item) => (
                <ProductoForm key={item.id} item={item} />
              ))}
            </div>
          </Card>

          <Card className="space-y-6 p-6">
            <SectionHeader
              title="Cadenas y ciudades"
              description="Catalogos base para PDVs, rutas, clientes y asignaciones multi-zona."
            />
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Cadenas
                </p>
                <CadenaForm />
                <div className="space-y-3">
                  {data.cadenas.map((item) => (
                    <CadenaForm key={item.id} item={item} />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Ciudades
                </p>
                <CiudadForm />
                <div className="space-y-3">
                  {data.ciudades.map((item) => (
                    <CiudadForm key={item.id} item={item} />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="space-y-5 p-6">
            <SectionHeader
              title="Catalogo de horarios"
              description="Turnos heredables por PDV y cadena. Este JSON gobierna el modo CADENA del modulo de PDVs."
            />
            <TurnoForm />
            <div className="space-y-3">
              {data.turnos.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Aun no hay turnos guardados en el catalogo operativo.
                </p>
              ) : (
                data.turnos.map((item) => <TurnoForm key={item.nomenclatura} item={item} />)
              )}
            </div>
          </Card>

          <Card className="space-y-5 p-6">
            <SectionHeader
              title="Misiones del dia"
              description="Catalogo antifraude para check-in y check-out. Solo administracion central puede modificarlo."
            />
            <Input
              label="Buscar mision"
              value={missionSearch}
              onChange={(event) => setMissionSearch(event.target.value)}
              placeholder="Codigo o instruccion"
            />
            <MisionForm />
            <div className="space-y-3">
              {filteredMissions.map((item) => (
                <MisionForm key={item.id} item={item} />
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <SectionHeader
              title="Parametros globales"
              description="Ajustes de geocerca, biometria y tolerancias operativas de la plataforma."
            />
            <ParametroSection items={data.parametrosGlobales} />
          </Card>

          <Card className="space-y-4 p-6">
            <SectionHeader
              title="OCR e integraciones"
              description="Proveedor preferido y modelo runtime para el flujo documental de expedientes."
            />
            <OcrConfigForm item={data.ocr} />
          </Card>

          <Card className="space-y-4 p-6">
            <SectionHeader
              title="Compresion PDF"
              description="Proveedor runtime del pipeline PDF para expedientes, IMSS, solicitudes, gastos y adjuntos."
            />
            <PdfCompressionConfigForm item={data.pdfCompression} />
          </Card>

          <Card className="space-y-4 p-6">
            <SectionHeader
              title="Retencion de archivos"
              description="Minimos operativos para storage de expediente, selfies y exportaciones."
            />
            <ParametroSection items={data.parametrosRetencion} />
          </Card>

          <Card className="space-y-4 p-6">
            <SectionHeader
              title="Parametros de nomina"
              description="Base editable para periodos, bono comercial y deducciones por falta."
            />
            <ParametroSection items={data.parametrosNomina} />
          </Card>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />
}

function ImportCatalogForm() {
  const [state, formAction] = useActionState(
    importarCatalogoProductos,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  )

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Actualizar catalogo ISDIN</p>
          <p className="text-xs text-slate-600">
            Carga tu XLSX activo para crear o actualizar productos por SKU. Ventas usara este
            catalogo como fuente maestra.
          </p>
        </div>
        <StatusPill label="XLSX" tone="bg-emerald-100 text-emerald-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="w-full">
          <label
            htmlFor="catalogo-productos-file"
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground-tertiary"
          >
            Archivo catalogo
          </label>
          <input
            id="catalogo-productos-file"
            name="catalogo_productos_file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="w-full rounded-[12px] border border-border bg-white px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-800 hover:border-primary-200 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />
        </div>

        <SubmitActionButton
          label="Importar catalogo"
          pendingLabel="Importando..."
        />
      </div>

      <StateMessage state={state} />
    </form>
  )
}

function ProductoForm({ item }: { item?: ProductoCatalogoItem }) {
  const [state, formAction] = useActionState(guardarProducto, ESTADO_CONFIGURACION_ADMIN_INICIAL)

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <input type="hidden" name="producto_id" value={item?.id ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item ? `${item.nombreCorto} / ${item.sku}` : 'Alta de producto'}
          </p>
          <p className="text-xs text-slate-500">
            {item ? item.nombre : 'SKU, nombre comercial, categoria y estado de disponibilidad.'}
          </p>
        </div>
        {item && <StatusPill label={formatBooleanLabel(item.activo)} tone={getStatusTone(item.activo)} />}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Input label="SKU" name="sku" defaultValue={item?.sku} placeholder="ISD-001" />
        <Input label="Nombre" name="nombre" defaultValue={item?.nombre} placeholder="Nombre largo" />
        <Input
          label="Nombre corto"
          name="nombre_corto"
          defaultValue={item?.nombreCorto}
          placeholder="Nombre corto"
        />
        <Input
          label="Categoria"
          name="categoria"
          defaultValue={item?.categoria}
          placeholder="Protector solar"
        />
        <Select
          label="Top 30"
          name="top_30"
          defaultValue={item ? String(item.top30) : 'false'}
          options={[
            { value: 'false', label: 'No' },
            { value: 'true', label: 'Si' },
          ]}
        />
        <Select
          label="Activo"
          name="activo"
          defaultValue={item ? String(item.activo) : 'true'}
          options={[
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar producto' : 'Crear producto'}
          pendingLabel="Guardando producto..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  )
}

function CadenaForm({ item }: { item?: CadenaCatalogoItem }) {
  const [state, formAction] = useActionState(guardarCadena, ESTADO_CONFIGURACION_ADMIN_INICIAL)

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <input type="hidden" name="cadena_id" value={item?.id ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{item ? item.nombre : 'Alta de cadena'}</p>
          <p className="text-xs text-slate-500">Codigo, nombre comercial y factor base de cuota.</p>
        </div>
        {item && <StatusPill label={formatBooleanLabel(item.activa)} tone={getStatusTone(item.activa)} />}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Codigo" name="codigo" defaultValue={item?.codigo} placeholder="SAN_PABLO" />
        <Input label="Nombre" name="nombre" defaultValue={item?.nombre} placeholder="San Pablo" />
        <Input
          label="Factor cuota default"
          name="factor_cuota_default"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={item ? String(item.factorCuotaDefault) : '1'}
        />
        <Select
          label="Activo"
          name="activa"
          defaultValue={item ? String(item.activa) : 'true'}
          options={[
            { value: 'true', label: 'Activa' },
            { value: 'false', label: 'Inactiva' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar cadena' : 'Crear cadena'}
          pendingLabel="Guardando cadena..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  )
}

function CiudadForm({ item }: { item?: CiudadCatalogoItem }) {
  const [state, formAction] = useActionState(guardarCiudad, ESTADO_CONFIGURACION_ADMIN_INICIAL)

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <input type="hidden" name="ciudad_id" value={item?.id ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{item ? item.nombre : 'Alta de ciudad'}</p>
          <p className="text-xs text-slate-500">Ciudad operativa, zona y estado de disponibilidad.</p>
        </div>
        {item && <StatusPill label={formatBooleanLabel(item.activa)} tone={getStatusTone(item.activa)} />}
      </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Ciudad" name="nombre" defaultValue={item?.nombre} placeholder="MONTERREY" />
          <Input label="Zona" name="zona" defaultValue={item?.zona} placeholder="NORTE" />
          <Input label="Estado" name="estado" defaultValue={item?.estado ?? ''} placeholder="NUEVO LEON" />
          <Select
            label="Activa"
            name="activa"
          defaultValue={item ? String(item.activa) : 'true'}
          options={[
            { value: 'true', label: 'Activa' },
            { value: 'false', label: 'Inactiva' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar ciudad' : 'Crear ciudad'}
          pendingLabel="Guardando ciudad..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  )
}

function TurnoForm({ item }: { item?: TurnoCatalogoItem }) {
  const [state, formAction] = useActionState(
    guardarTurnoCatalogo,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  )

  return (
    <div className={`rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item ? item.nomenclatura : 'Alta de turno catalogo'}
          </p>
          <p className="text-xs text-slate-500">
            {item?.turno ?? 'Nomenclatura, descripcion operativa y rango horario reusable.'}
          </p>
        </div>
        {item && <TurnoDeleteForm nomenclatura={item.nomenclatura} />}
      </div>
      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="turno_original" value={item?.nomenclatura ?? ''} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input
            label="Nomenclatura"
            name="nomenclatura"
            defaultValue={item?.nomenclatura}
            placeholder="SP_9_18"
          />
          <Input label="Turno" name="turno" defaultValue={item?.turno ?? ''} placeholder="Base semanal" />
          <Input label="Horario" name="horario" defaultValue={item?.horario ?? ''} placeholder="09:00 a 18:00" />
          <Input label="Hora entrada" name="hora_entrada" type="time" defaultValue={item?.horaEntrada?.slice(0, 5) ?? ''} />
          <Input label="Hora salida" name="hora_salida" type="time" defaultValue={item?.horaSalida?.slice(0, 5) ?? ''} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton
            label={item ? 'Actualizar turno' : 'Crear turno'}
            pendingLabel="Guardando turno..."
          />
          <StateMessage state={state} />
        </div>
      </form>
    </div>
  )
}

function TurnoDeleteForm({ nomenclatura }: { nomenclatura: string }) {
  const [state, formAction] = useActionState(
    eliminarTurnoCatalogo,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  )

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="nomenclatura" value={nomenclatura} />
      <SubmitActionButton
        label="Eliminar"
        pendingLabel="Eliminando..."
        variant="danger"
      />
      <StateMessage state={state} />
    </form>
  )
}

function MisionForm({ item }: { item?: MisionCatalogoItem }) {
  const [state, formAction] = useActionState(guardarMisionDia, ESTADO_CONFIGURACION_ADMIN_INICIAL)

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <input type="hidden" name="mision_id" value={item?.id ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item ? item.codigo ?? item.instruccion : 'Alta de mision'}
          </p>
          <p className="text-xs text-slate-500">Control de misiones diarias presentadas en jornada.</p>
        </div>
        {item && <StatusPill label={formatBooleanLabel(item.activa)} tone={getStatusTone(item.activa)} />}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Input label="Codigo" name="codigo" defaultValue={item?.codigo ?? ''} placeholder="M0001" />
        <Input label="Orden" name="orden" type="number" defaultValue={item?.orden ? String(item.orden) : ''} />
        <Input label="Peso" name="peso" type="number" min="1" defaultValue={item ? String(item.peso) : '1'} />
      </div>
      <FieldTextarea
        label="Instruccion"
        name="instruccion"
        defaultValue={item?.instruccion}
        placeholder="Solicitar evidencia fisica antifraude."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Activa"
          name="activa"
          defaultValue={item ? String(item.activa) : 'true'}
          options={[
            { value: 'true', label: 'Activa' },
            { value: 'false', label: 'Inactiva' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar mision' : 'Crear mision'}
          pendingLabel="Guardando mision..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  )
}

function ParametroSection({ items }: { items: ParametroEditableItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ParametroConfigForm key={item.key} item={item} />
      ))}
    </div>
  )
}

function ParametroConfigForm({ item }: { item: ParametroEditableItem }) {
  const [state, formAction] = useActionState(
    guardarParametroConfiguracion,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  )

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="key" value={item.key} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{item.label}</p>
          <p className="mt-1 text-xs text-slate-500">{item.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusPill
            label={item.persisted ? 'CONFIGURADO' : 'DEFAULT'}
            tone={item.persisted ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-700'}
          />
          <StatusPill label={item.module.toUpperCase()} tone="bg-white text-slate-600" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        {item.kind === 'BOOLEAN' ? (
          <Select
            label="Valor"
            name="value"
            defaultValue={item.value}
            options={[
              { value: 'true', label: 'Si' },
              { value: 'false', label: 'No' },
            ]}
          />
        ) : (
          <Input
            label="Valor"
            name="value"
            type={item.kind === 'NUMBER' ? 'number' : 'text'}
            defaultValue={item.value}
            min={item.min}
            max={item.max}
            step={item.step}
          />
        )}
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            Valor visible: <span className="font-semibold text-slate-900">{item.displayValue}</span>
          </div>
          <SubmitActionButton label="Guardar" pendingLabel="Guardando..." />
        </div>
      </div>
      <StateMessage state={state} />
    </form>
  )
}

function OcrConfigForm({ item }: { item: OcrConfiguracionItem }) {
  const [state, formAction] = useActionState(
    guardarOcrConfiguracion,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  )

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-950">Estado runtime</p>
            <StatusPill label={item.status} tone={getOcrTone(item.status)} />
          </div>
          <dl className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <dt>Fuente</dt>
              <dd className="font-medium text-slate-900">{item.source}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Proveedor efectivo</dt>
              <dd className="font-medium text-slate-900">{item.effectiveProvider ?? 'disabled'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Modelo efectivo</dt>
              <dd className="font-medium text-slate-900">{item.effectiveModel ?? 'n/a'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Proveedor entorno</dt>
              <dd className="font-medium text-slate-900">{item.envProvider ?? 'disabled'}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-950">Diagnostico</p>
          <p className="mt-3 leading-6">{item.message}</p>
          <p className="mt-3 text-xs text-slate-500">
            Disponible para uso documental: <span className="font-semibold text-slate-900">{item.available ? 'si' : 'no'}</span>
          </p>
        </div>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Proveedor preferido"
            name="provider"
            defaultValue={item.preferredProvider ?? item.envProvider ?? 'disabled'}
            options={OCR_PROVIDER_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <Input
            label="Modelo preferido"
            name="model"
            defaultValue={item.preferredModel ?? item.effectiveModel ?? 'gemini-2.5-flash'}
            placeholder="gemini-2.5-flash"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton label="Guardar OCR" pendingLabel="Guardando OCR..." />
          <StateMessage state={state} />
        </div>
      </form>
    </div>
  )
}

function PdfCompressionConfigForm({ item }: { item: PdfCompressionConfiguracionItem }) {
  const [state, formAction] = useActionState(
    guardarPdfCompressionConfiguracion,
    ESTADO_CONFIGURACION_ADMIN_INICIAL
  )

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-950">Estado runtime</p>
            <StatusPill label={item.status} tone={getPdfCompressionTone(item.status)} />
          </div>
          <dl className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <dt>Fuente</dt>
              <dd className="font-medium text-slate-900">{item.source}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Proveedor efectivo</dt>
              <dd className="font-medium text-slate-900">{item.effectiveProvider}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>URL base</dt>
              <dd className="truncate font-medium text-slate-900">
                {item.effectiveBaseUrl ?? 'n/a'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>API key env</dt>
              <dd className="font-medium text-slate-900">
                {item.apiKeyConfigured ? 'configurada' : 'no configurada'}
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-950">Diagnostico</p>
          <p className="mt-3 leading-6">{item.message}</p>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt>Optimize level</dt>
              <dd className="font-semibold text-slate-900">{item.effectiveOptimizeLevel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Image quality</dt>
              <dd className="font-semibold text-slate-900">{item.effectiveImageQuality}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Image DPI</dt>
              <dd className="font-semibold text-slate-900">{item.effectiveImageDpi}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Fast web view</dt>
              <dd className="font-semibold text-slate-900">{item.effectiveFastWebView}</dd>
            </div>
          </dl>
        </div>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Proveedor preferido"
            name="provider"
            defaultValue={item.preferredProvider ?? item.envProvider ?? 'local'}
            options={PDF_COMPRESSION_PROVIDER_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <Input
            label="URL base Stirling"
            name="stirling_base_url"
            defaultValue={item.effectiveBaseUrl ?? 'http://127.0.0.1:8088'}
            placeholder="http://127.0.0.1:8088"
          />
          <Input
            label="Nivel de optimizacion"
            name="optimize_level"
            type="number"
            min="0"
            max="4"
            defaultValue={item.effectiveOptimizeLevel}
          />
          <Input
            label="Calidad de imagen"
            name="image_quality"
            type="number"
            min="10"
            max="100"
            defaultValue={item.effectiveImageQuality}
          />
          <Input
            label="DPI de imagen"
            name="image_dpi"
            type="number"
            min="72"
            max="600"
            defaultValue={item.effectiveImageDpi}
          />
          <Select
            label="Fast web view"
            name="fast_web_view"
            defaultValue={item.effectiveFastWebView}
            options={[
              { value: 'true', label: 'Si' },
              { value: 'false', label: 'No' },
            ]}
          />
        </div>
        <p className="text-xs text-slate-500">
          El API key de Stirling se mantiene en variables de entorno. La configuracion central
          gobierna proveedor, endpoint y tuning.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton
            label="Guardar compresion PDF"
            pendingLabel="Guardando compresion..."
          />
          <StateMessage state={state} />
        </div>
      </form>
    </div>
  )
}


