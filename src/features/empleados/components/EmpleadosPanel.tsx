'use client'

import { useActionState, useDeferredValue, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  actualizarEstadoExpedienteEmpleado,
  actualizarEstadoImssEmpleado,
  crearEmpleado,
  ESTADO_EMPLEADO_INICIAL,
  registrarBajaEmpleado,
  subirDocumentoEmpleado,
} from '../actions'
import type {
  DocumentoExpedienteItem,
  EmpleadoListadoItem,
  EmpleadosPanelData,
} from '../services/empleadoService'

const PUESTOS_OPTIONS = [
  'ADMINISTRADOR',
  'COORDINADOR',
  'SUPERVISOR',
  'DERMOCONSEJERO',
  'RECLUTAMIENTO',
  'NOMINA',
  'LOGISTICA',
  'VENTAS',
  'LOVE_IS',
  'CLIENTE',
]

const EXPEDIENTE_OPTIONS = [
  'PENDIENTE_DOCUMENTOS',
  'EN_REVISION',
  'VALIDADO',
  'OBSERVADO',
] as const

const IMSS_OPTIONS = [
  'NO_INICIADO',
  'PENDIENTE_DOCUMENTOS',
  'EN_PROCESO',
  'ALTA_IMSS',
  'ERROR',
] as const

const DOCUMENT_CATEGORY_OPTIONS = ['EXPEDIENTE', 'IMSS', 'BAJA'] as const
const DOCUMENT_TYPE_OPTIONS = [
  'CURP',
  'RFC',
  'NSS',
  'INE',
  'COMPROBANTE_DOMICILIO',
  'CONTRATO',
  'ALTA_IMSS',
  'BAJA',
  'OTRO',
] as const

function formatDate(value: string | null) {
  if (!value) {
    return 'Sin registro'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value))
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return 'Sin definir'
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatBytes(value: number | null) {
  if (!value) {
    return 'Sin tamano'
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

function formatPuesto(value: string | null) {
  return value ? value.replace(/_/g, ' ') : 'Sin dato'
}

function getLaboralTone(value: string) {
  if (value === 'ACTIVO') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'SUSPENDIDO') {
    return 'bg-amber-100 text-amber-700'
  }

  return 'bg-rose-100 text-rose-700'
}

function getExpedienteTone(value: string) {
  if (value === 'VALIDADO') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'OBSERVADO') {
    return 'bg-rose-100 text-rose-700'
  }

  if (value === 'EN_REVISION') {
    return 'bg-sky-100 text-sky-700'
  }

  return 'bg-amber-100 text-amber-700'
}

function getImssTone(value: string) {
  if (value === 'ALTA_IMSS') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'ERROR') {
    return 'bg-rose-100 text-rose-700'
  }

  if (value === 'EN_PROCESO') {
    return 'bg-sky-100 text-sky-700'
  }

  return 'bg-amber-100 text-amber-700'
}

function getCuentaTone(value: string | null) {
  if (value === 'ACTIVA') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'PROVISIONAL' || value === 'PENDIENTE_VERIFICACION_EMAIL') {
    return 'bg-amber-100 text-amber-700'
  }

  if (value === 'SUSPENDIDA') {
    return 'bg-rose-100 text-rose-700'
  }

  return 'bg-slate-100 text-slate-700'
}

function getOcrTone(value: string | null) {
  if (value === 'ok') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'needs_review') {
    return 'bg-amber-100 text-amber-700'
  }

  if (value === 'unreadable' || value === 'error' || value === 'gemini_missing_api_key') {
    return 'bg-rose-100 text-rose-700'
  }

  return 'bg-slate-100 text-slate-700'
}
export function EmpleadosPanel({ data }: { data: EmpleadosPanelData }) {
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('ALL')
  const [zonaFilter, setZonaFilter] = useState('ALL')
  const [supervisorFilter, setSupervisorFilter] = useState('ALL')
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  const empleadosFiltrados = data.empleados.filter((empleado) => {
    const matchSearch = !deferredSearch
      ? true
      : [
          empleado.nombreCompleto,
          empleado.idNomina,
          empleado.puesto,
          empleado.zona,
          empleado.supervisor,
          empleado.username,
          empleado.curp,
          empleado.rfc,
          empleado.nss,
          empleado.correoElectronico,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(deferredSearch))

    const matchEstado = estadoFilter === 'ALL' || empleado.estatusLaboral === estadoFilter
    const matchZona = zonaFilter === 'ALL' || (empleado.zona ?? 'SIN_ZONA') === zonaFilter
    const matchSupervisor =
      supervisorFilter === 'ALL' ||
      (supervisorFilter === 'SIN_SUPERVISOR'
        ? !empleado.supervisorEmpleadoId
        : empleado.supervisorEmpleadoId === supervisorFilter)

    return matchSearch && matchEstado && matchZona && matchSupervisor
  })

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura parcial</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!data.ocrDisponible && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">OCR no configurado en este entorno</p>
          <p className="mt-2 text-sm">
            El flujo OCR+IA ya esta integrado, pero hoy no existe proveedor efectivo. Configuralo
            en <code>/configuracion</code> o via entorno y asegure tambien las credenciales del
            proveedor seleccionado.
          </p>
        </Card>
      )}

      {!data.pdfOptimizationAvailable && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Compresion documental no disponible en este entorno</p>
          <p className="mt-2 text-sm">
            La carga documental intenta optimizar imagenes y PDFs antes de validar limites. Si esta
            alerta aparece, revisa dependencias del pipeline server-side.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Empleados visibles" value={String(data.resumen.total)} />
        <MetricCard label="Activos" value={String(data.resumen.activos)} />
        <MetricCard label="Bajas" value={String(data.resumen.bajas)} />
        <MetricCard label="Expediente validado" value={String(data.resumen.expedienteValidado)} />
        <MetricCard label="IMSS en proceso" value={String(data.resumen.imssEnProceso)} />
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Alta de empleado</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Alta operativa para Reclutamiento con expediente inicial, supervisor, zona y opcion
              de provisionar acceso provisional en el mismo flujo.
            </p>
          </div>
          <div className="text-sm text-slate-500">
            <p>
              Supervisores activos:{' '}
              <span className="font-semibold text-slate-900">{data.supervisors.length}</span>
            </p>
            <p className="mt-1">
              OCR provider:{' '}
              <span className="font-semibold text-slate-900">
                {data.ocrProvider ?? 'sin configurar'}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-5">
          <CrearEmpleadoForm data={data} />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Expedientes y estatus</h2>
            <p className="mt-1 text-sm text-slate-500">
              Filtros por estado laboral, zona y supervisor, con acceso directo a expediente,
              IMSS, baja y documentos deduplicados.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Mostrando{' '}
            <span className="font-semibold text-slate-900">{empleadosFiltrados.length}</span> de{' '}
            <span className="font-semibold text-slate-900">{data.empleados.length}</span>{' '}
            empleados.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Buscar"
            placeholder="Nombre, nomina, CURP, RFC, NSS o username"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            label="Estado laboral"
            value={estadoFilter}
            onChange={(event) => setEstadoFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'ACTIVO', label: 'ACTIVO' },
              { value: 'SUSPENDIDO', label: 'SUSPENDIDO' },
              { value: 'BAJA', label: 'BAJA' },
            ]}
          />
          <Select
            label="Zona"
            value={zonaFilter}
            onChange={(event) => setZonaFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todas' },
              { value: 'SIN_ZONA', label: 'Sin zona' },
              ...data.zonas.map((zona) => ({ value: zona, label: zona })),
            ]}
          />
          <Select
            label="Supervisor"
            value={supervisorFilter}
            onChange={(event) => setSupervisorFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'SIN_SUPERVISOR', label: 'Sin supervisor' },
              ...data.supervisors.map((supervisor) => ({
                value: supervisor.id,
                label: supervisor.nombreCompleto,
              })),
            ]}
          />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">Zona / supervisor</th>
                <th className="px-6 py-3 font-medium">Acceso</th>
                <th className="px-6 py-3 font-medium">Expediente</th>
                <th className="px-6 py-3 font-medium">IMSS</th>
                <th className="px-6 py-3 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {empleadosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No hay empleados que coincidan con los filtros activos.
                  </td>
                </tr>
              ) : (
                empleadosFiltrados.map((empleado) => (
                  <EmpleadoRow
                    key={empleado.id}
                    data={data}
                    empleado={empleado}
                    expanded={expandedEmployeeId === empleado.id}
                    onToggle={() =>
                      setExpandedEmployeeId((current) =>
                        current === empleado.id ? null : empleado.id
                      )
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
function EmpleadoRow({
  empleado,
  data,
  expanded,
  onToggle,
}: {
  empleado: EmpleadoListadoItem
  data: EmpleadosPanelData
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="px-6 py-4">
          <div className="font-medium text-slate-900">{empleado.nombreCompleto}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
            {formatPuesto(empleado.puesto)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill
              label={empleado.estatusLaboral}
              className={getLaboralTone(empleado.estatusLaboral)}
            />
            {empleado.idNomina && (
              <StatusPill
                label={`Nomina ${empleado.idNomina}`}
                className="bg-slate-100 text-slate-700"
              />
            )}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <div className="font-medium text-slate-900">{empleado.zona ?? 'Sin zona'}</div>
          <div className="mt-1 text-xs text-slate-500">
            supervisor: {empleado.supervisor ?? 'Sin supervisor'}
          </div>
          <div className="mt-1 text-xs text-slate-500">alta: {formatDate(empleado.fechaAlta)}</div>
          {empleado.fechaBaja && (
            <div className="mt-1 text-xs text-rose-600">baja: {formatDate(empleado.fechaBaja)}</div>
          )}
        </td>
        <td className="px-6 py-4 text-slate-600">
          <div className="font-medium text-slate-900">{empleado.username ?? 'Sin acceso digital'}</div>
          <div className="mt-1 text-xs text-slate-500">
            correo: {empleado.correoElectronico ?? 'sin correo'}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill
              label={empleado.estadoCuenta ?? 'SIN_USUARIO'}
              className={getCuentaTone(empleado.estadoCuenta)}
            />
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill
            label={empleado.expedienteEstado}
            className={getExpedienteTone(empleado.expedienteEstado)}
          />
          <div className="mt-2 text-xs text-slate-500">documentos: {empleado.documentosCount}</div>
          <div className="mt-1 text-xs text-slate-500">
            validado: {formatDate(empleado.expedienteValidadoEn)}
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          <StatusPill label={empleado.imssEstado} className={getImssTone(empleado.imssEstado)} />
          <div className="mt-2 text-xs text-slate-500">
            solicitud: {formatDate(empleado.imssFechaSolicitud)}
          </div>
          <div className="mt-1 text-xs text-slate-500">alta: {formatDate(empleado.imssFechaAlta)}</div>
          <div className="mt-1 text-xs text-slate-500">
            sueldo: {formatCurrency(empleado.sueldoBaseMensual)}
          </div>
        </td>
        <td className="px-6 py-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onToggle}
          >
            {expanded ? 'Ocultar expediente' : 'Ver expediente'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/70">
          <td colSpan={6} className="px-6 py-5">
            <div className="grid gap-4 xl:grid-cols-2">
              <DetailCard
                title="Ficha laboral"
                description="Datos obligatorios, supervisor, baja y checklist operativo."
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <InfoRow label="CURP" value={empleado.curp ?? 'Sin CURP'} />
                  <InfoRow label="RFC" value={empleado.rfc ?? 'Sin RFC'} />
                  <InfoRow label="NSS" value={empleado.nss ?? 'Sin NSS'} />
                  <InfoRow label="Telefono" value={empleado.telefono ?? 'Sin telefono'} />
                  <InfoRow label="Correo" value={empleado.correoElectronico ?? 'Sin correo'} />
                  <InfoRow label="Supervisor" value={empleado.supervisor ?? 'Sin supervisor'} />
                  <InfoRow label="Puesto" value={formatPuesto(empleado.puesto)} />
                  <InfoRow label="Zona" value={empleado.zona ?? 'Sin zona'} />
                  <InfoRow label="Motivo baja" value={empleado.motivoBaja ?? 'Sin motivo registrado'} />
                </div>
                {empleado.motivoBaja && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                    <p className="font-semibold">Checklist de baja</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(empleado.checklistBaja).length === 0 ? (
                        <StatusPill label="Sin checklist" className="bg-white text-rose-700" />
                      ) : (
                        Object.entries(empleado.checklistBaja).map(([key, value]) => (
                          <StatusPill
                            key={key}
                            label={`${key.replace(/_/g, ' ')}: ${value ? 'OK' : 'Pendiente'}`}
                            className={value ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-rose-700'}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </DetailCard>

              <DetailCard
                title="Expediente"
                description="Control del estado documental y validacion interna."
              >
                <ExpedienteEstadoForm empleado={empleado} />
              </DetailCard>

              <DetailCard
                title="Flujo IMSS"
                description="Seguimiento de tramite y sueldo base mensual."
              >
                <ImssEstadoForm empleado={empleado} />
              </DetailCard>

              <DetailCard
                title="Documentos"
                description="Carga deduplicada por SHA-256 y acceso firmado a Storage."
              >
                <DocumentoUploadForm data={data} empleado={empleado} />
                <div className="mt-5">
                  <DocumentosList documentos={empleado.documentos} />
                </div>
              </DetailCard>

              <DetailCard
                title="Baja operativa"
                description="Fecha efectiva, motivo y checklist de cierre."
              >
                <BajaEmpleadoForm empleado={empleado} />
              </DetailCard>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CrearEmpleadoForm({ data }: { data: EmpleadosPanelData }) {
  const [state, formAction] = useActionState(crearEmpleado, ESTADO_EMPLEADO_INICIAL)

  return (
    <form action={formAction} className="space-y-4">
      <datalist id="empleados-zonas-sugeridas">
        {data.zonas.map((zona) => (
          <option key={zona} value={zona} />
        ))}
      </datalist>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Nombre completo" name="nombre_completo" required />
        <Input label="CURP" name="curp" required maxLength={18} />
        <Input label="NSS" name="nss" required />
        <Input label="RFC" name="rfc" required maxLength={13} />
        <Select
          label="Puesto"
          name="puesto"
          defaultValue="DERMOCONSEJERO"
          options={PUESTOS_OPTIONS.map((puesto) => ({
            value: puesto,
            label: formatPuesto(puesto),
          }))}
        />
        <Input label="Zona" name="zona" required list="empleados-zonas-sugeridas" />
        <Select
          label="Supervisor"
          name="supervisor_empleado_id"
          options={[
            { value: '', label: 'Sin supervisor' },
            ...data.supervisors.map((supervisor) => ({
              value: supervisor.id,
              label: supervisor.nombreCompleto,
            })),
          ]}
        />
        <Input label="ID nomina" name="id_nomina" placeholder="Opcional" />
        <Input label="Telefono" name="telefono" type="tel" placeholder="Opcional" />
        <Input label="Correo negocio" name="correo_electronico" type="email" placeholder="Opcional" />
        <Input label="Fecha alta" name="fecha_alta" type="date" />
        <Input label="Username provisional" name="username" placeholder="Opcional si se crea acceso" />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="crear_acceso"
          defaultChecked
          className="h-4 w-4 rounded border-slate-300"
        />
        Provisionar acceso provisional en auth.users
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton idleLabel="Crear empleado" pendingLabel="Creando..." variant="primary" />
        <p className="text-sm text-slate-500">
          Si el acceso se provisiona, el panel devuelve username, correo auth y password temporal.
        </p>
      </div>

      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}

      {state.ok && state.generatedUsername && state.temporaryPassword && (
        <div className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 md:grid-cols-3">
          <CredentialBlock label="Username" value={state.generatedUsername} />
          <CredentialBlock label="Password temporal" value={state.temporaryPassword} />
          <CredentialBlock label="Correo auth" value={state.temporaryEmail ?? 'sin correo'} />
        </div>
      )}
    </form>
  )
}
function ExpedienteEstadoForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(
    actualizarEstadoExpedienteEmpleado,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <Select
        label="Estado expediente"
        name="expediente_estado"
        defaultValue={empleado.expedienteEstado}
        options={EXPEDIENTE_OPTIONS.map((option) => ({ value: option, label: option }))}
      />
      <TextareaField
        label="Observaciones"
        name="expediente_observaciones"
        defaultValue={empleado.expedienteObservaciones ?? ''}
        placeholder="Notas internas de validacion"
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton idleLabel="Actualizar expediente" pendingLabel="Guardando..." variant="secondary" />
        <p className="text-sm text-slate-500">
          Ultima validacion:{' '}
          <span className="font-semibold text-slate-900">{formatDate(empleado.expedienteValidadoEn)}</span>
        </p>
      </div>
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function ImssEstadoForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(actualizarEstadoImssEmpleado, ESTADO_EMPLEADO_INICIAL)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Estado IMSS"
          name="imss_estado"
          defaultValue={empleado.imssEstado}
          options={IMSS_OPTIONS.map((option) => ({ value: option, label: option }))}
        />
        <Input
          label="Sueldo base mensual"
          name="sueldo_base_mensual"
          type="number"
          min="0"
          step="0.01"
          defaultValue={empleado.sueldoBaseMensual ?? ''}
        />
        <Input
          label="Fecha solicitud"
          name="imss_fecha_solicitud"
          type="date"
          defaultValue={empleado.imssFechaSolicitud ?? ''}
        />
        <Input
          label="Fecha alta IMSS"
          name="imss_fecha_alta"
          type="date"
          defaultValue={empleado.imssFechaAlta ?? ''}
        />
      </div>
      <TextareaField
        label="Observaciones IMSS"
        name="imss_observaciones"
        defaultValue={empleado.imssObservaciones ?? ''}
        placeholder="Incidencias, folios o notas internas"
      />
      <SubmitButton idleLabel="Actualizar IMSS" pendingLabel="Guardando..." variant="secondary" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function DocumentoUploadForm({
  empleado,
  data,
}: {
  empleado: EmpleadoListadoItem
  data: EmpleadosPanelData
}) {
  const [state, formAction] = useActionState(subirDocumentoEmpleado, ESTADO_EMPLEADO_INICIAL)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Select
          label="Categoria"
          name="categoria"
          defaultValue="EXPEDIENTE"
          options={DOCUMENT_CATEGORY_OPTIONS.map((option) => ({ value: option, label: option }))}
        />
        <Select
          label="Tipo documento"
          name="tipo_documento"
          defaultValue="CURP"
          options={DOCUMENT_TYPE_OPTIONS.map((option) => ({ value: option, label: option }))}
        />
        <div className="w-full">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Archivo</label>
          <input
            type="file"
            name="archivo"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
          />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p>
          Dedupe activo por SHA-256. Imagenes se comprimen automaticamente a menor o igual a 100 KB y los PDFs se optimizan server-side antes de validar el limite de 1 MB. OCR provider actual:{' '}
          <span className="font-semibold text-slate-900">{data.ocrProvider ?? 'sin configurar'}</span>.
        </p>
      </div>
      <SubmitButton idleLabel="Subir documento" pendingLabel="Subiendo..." variant="outline" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
          {state.duplicatedUpload ? ' Referencia reutilizada.' : ''}
        </p>
      )}
    </form>
  )
}

function BajaEmpleadoForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(registrarBajaEmpleado, ESTADO_EMPLEADO_INICIAL)

  if (empleado.estatusLaboral === 'BAJA') {
    return (
      <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-semibold">Baja ya registrada</p>
        <p>Fecha efectiva: {formatDate(empleado.fechaBaja)}</p>
        <p>Motivo: {empleado.motivoBaja ?? 'Sin motivo registrado'}</p>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (!window.confirm(`Registrar baja efectiva para ${empleado.nombreCompleto}?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Fecha baja" name="fecha_baja" type="date" required />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Checklist minimo</p>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" name="check_activos_recuperados" className="h-4 w-4 rounded border-slate-300" />
            Activos recuperados
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="check_nomina_notificada" className="h-4 w-4 rounded border-slate-300" />
            Nomina notificada
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="check_logistica_notificada" className="h-4 w-4 rounded border-slate-300" />
            Logistica notificada
          </label>
        </div>
      </div>
      <TextareaField
        label="Motivo baja"
        name="motivo_baja"
        required
        placeholder="Motivo operativo o administrativo"
      />
      <SubmitButton idleLabel="Registrar baja" pendingLabel="Guardando..." variant="danger" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function DocumentosList({ documentos }: { documentos: DocumentoExpedienteItem[] }) {
  if (documentos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Este expediente todavia no tiene documentos cargados.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {documentos.map((documento) => (
        <div
          key={documento.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <StatusPill label={documento.categoria} className="bg-slate-100 text-slate-700" />
                <StatusPill label={documento.tipoDocumento} className="bg-sky-100 text-sky-700" />
                <StatusPill label={documento.estadoDocumento} className="bg-emerald-100 text-emerald-700" />
                <StatusPill
                  label={`OCR ${documento.ocrResultado.status ?? 'sin estado'}`}
                  className={getOcrTone(documento.ocrResultado.status)}
                />
              </div>
              <p className="mt-3 font-medium text-slate-900">{documento.nombreArchivo}</p>
              <div className="mt-2 grid gap-1 text-xs text-slate-500">
                <span>subido: {formatDate(documento.createdAt)}</span>
                <span>tamano: {formatBytes(documento.tamanoBytes)}</span>
                <span>mime: {documento.mimeType ?? 'sin mime type'}</span>
                <span>sha256: {documento.sha256 ?? 'sin hash'}</span>
                <span>ocr provider: {documento.ocrProvider ?? 'sin proveedor'}</span>
                <span>modelo: {documento.ocrResultado.model ?? 'sin modelo'}</span>
                {documento.optimization && (
                  <span>
                    optimizacion: {documento.optimization.kind ?? 'registrada'} | objetivo{' '}
                    {documento.optimization.targetMet === null
                      ? 'sin dato'
                      : documento.optimization.targetMet
                        ? 'cumplido'
                        : 'best effort'}
                  </span>
                )}
                {documento.optimization && (
                  <span>
                    tamano origen/final: {formatBytes(documento.optimization.originalBytes)}{' -> '}{formatBytes(documento.optimization.finalBytes)}
                  </span>
                )}
              </div>
              <DocumentOptimizationSummary documento={documento} />
              <OcrResultSummary documento={documento} />
            </div>
            <div className="flex flex-wrap gap-2">
              {documento.signedUrl ? (
                <a
                  href={documento.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Abrir documento
                </a>
              ) : (
                <StatusPill label="Preview no disponible" className="bg-amber-100 text-amber-700" />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DocumentOptimizationSummary({ documento }: { documento: DocumentoExpedienteItem }) {
  const optimization = documento.optimization

  if (!optimization) {
    return null
  }

  const title = optimization.optimizedPdf
    ? 'PDF optimizado'
    : optimization.optimizedImage
      ? 'Imagen optimizada'
      : optimization.kind ?? 'Optimizacion registrada'
  const tone = optimization.targetMet
    ? 'bg-emerald-100 text-emerald-700'
    : optimization.optimized
      ? 'bg-sky-100 text-sky-700'
      : 'bg-amber-100 text-amber-700'

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap gap-2">
        <StatusPill label={title} className={tone} />
        {optimization.targetMet === false && (
          <StatusPill label="Best effort" className="bg-amber-100 text-amber-700" />
        )}
      </div>
      <div className="grid gap-1 text-xs text-slate-500">
        <span>tamano origen/final: {formatBytes(optimization.originalBytes)}{' -> '}{formatBytes(optimization.finalBytes)}</span>
        <span>objetivo: {optimization.targetMet === null ? 'sin dato' : optimization.targetMet ? 'cumplido' : 'no cumplido'}</span>
        {optimization.notes.length > 0 && <span>detalle: {optimization.notes.join(' | ')}</span>}
      </div>
    </div>
  )
}

function OcrResultSummary({ documento }: { documento: DocumentoExpedienteItem }) {
  const fields = [
    { label: 'Nombre', value: documento.ocrResultado.employeeName },
    { label: 'CURP', value: documento.ocrResultado.curp },
    { label: 'RFC', value: documento.ocrResultado.rfc },
    { label: 'NSS', value: documento.ocrResultado.nss },
    { label: 'Direccion', value: documento.ocrResultado.address },
    { label: 'Emisor', value: documento.ocrResultado.employer },
    { label: 'Puesto', value: documento.ocrResultado.position },
    { label: 'Folio', value: documento.ocrResultado.documentNumber },
  ].filter((field) => Boolean(field.value))

  const hasUsefulOutput =
    fields.length > 0 ||
    documento.ocrResultado.confidenceSummary ||
    documento.ocrResultado.errorMessage ||
    documento.ocrResultado.extractedText ||
    documento.ocrResultado.mismatchHints.length > 0 ||
    documento.ocrResultado.observations.length > 0

  if (!hasUsefulOutput) {
    return null
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Extraccion OCR+IA
      </p>
      {documento.ocrResultado.confidenceSummary && (
        <p className="text-sm text-slate-700">{documento.ocrResultado.confidenceSummary}</p>
      )}
      {documento.ocrResultado.errorMessage && (
        <p className="text-sm text-rose-700">{documento.ocrResultado.errorMessage}</p>
      )}
      {fields.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => (
            <div key={field.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {field.label}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">{field.value}</p>
            </div>
          ))}
        </div>
      )}
      {documento.ocrResultado.keyDates.length > 0 && (
        <p className="text-xs text-slate-500">
          fechas detectadas: {documento.ocrResultado.keyDates.join(', ')}
        </p>
      )}
      {documento.ocrResultado.mismatchHints.length > 0 && (
        <p className="text-xs text-amber-700">
          revisar: {documento.ocrResultado.mismatchHints.join(' | ')}
        </p>
      )}
      {documento.ocrResultado.observations.length > 0 && (
        <p className="text-xs text-slate-500">
          notas: {documento.ocrResultado.observations.join(' | ')}
        </p>
      )}
      {documento.ocrResultado.extractedText && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold text-slate-700">
            Ver texto extraido
          </summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] text-slate-600">
            {documento.ocrResultado.extractedText}
          </pre>
        </details>
      )}
    </div>
  )
}

function TextareaField(
  {
    label,
    name,
    defaultValue,
    placeholder,
    required,
  }: {
    label: string
    name: string
    defaultValue?: string
    placeholder?: string
    required?: boolean
  }
) {
  const textAreaId = `${name}-field`

  return (
    <div className="w-full">
      <label htmlFor={textAreaId} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={textAreaId}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        rows={4}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  )
}

function DetailCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

function CredentialBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{label}</p>
      <p className="mt-2 break-all text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
}: {
  idleLabel: string
  pendingLabel: string
  variant: 'primary' | 'secondary' | 'outline' | 'danger'
}) {
  const { pending } = useFormStatus()

  const className =
    variant === 'primary'
      ? 'bg-slate-950 text-white hover:bg-slate-800'
      : variant === 'secondary'
        ? 'bg-sky-600 text-white hover:bg-sky-500'
        : variant === 'danger'
          ? 'bg-rose-600 text-white hover:bg-rose-500'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
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

function StatusPill({ label, className }: { label: ReactNode; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
