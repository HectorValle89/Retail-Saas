'use client'

import {
  useActionState,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
  useRef,
  type ChangeEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { useFormStatus } from 'react-dom'
import type { ActorActual } from '@/lib/auth/session'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { ModalPanel } from '@/components/ui/modal-panel'
import { Select } from '@/components/ui/select'
import {
  actualizarDatosAdministrativosEmpleado,
  cancelarProcesoAltaEmpleado,
  crearEmpleado,
  registrarBajaEmpleado,
  subirDocumentoEmpleado,
  actualizarEstadoImssEmpleado,
  cerrarBajaEmpleadoNomina,
  rechazarBajaEmpleadoNomina,
} from '../actions'
import {
  ESTADO_EMPLEADO_INICIAL,
  type EmpleadoOcrSnapshot,
} from '../state'
import { deriveYearsFromAgencyStartDate } from '../lib/ocrMapping'
import {
  filterEmpleadosListado,
  IMSS_FILTER_OPTIONS,
  normalizeImssFilterValue,
  type EmpleadosImssFilterValue,
  type EmpleadosPanelInitialFilters,
} from '../lib/empleadosFilters'
import type { EmpleadosMainTab } from '../lib/empleadosTabs'
import type {
  DocumentoExpedienteItem,
  EmpleadoListadoItem,
  EmpleadosPanelData,
  PdvOption,
} from '../services/empleadoService'
import type { Puesto } from '@/types/database'
import { ClientImageFileInput } from '@/components/ui/client-image-file-input'
import { injectDirectR2Upload } from '@/lib/storage/directR2Client'
import { useScopedWidgetData } from '@/lib/ui-change/client'
import { getUiChangeScopeKeysForActor } from '@/lib/ui-change/types'


import { startTransition } from 'react'

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

const SEXO_OPTIONS = [
  { value: '', label: 'Sin definir' },
  { value: 'FEMENINO', label: 'Femenino' },
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'NO_BINARIO', label: 'No binario' },
  { value: 'OTRO', label: 'Otro' },
] as const

const ESTADO_CIVIL_OPTIONS = [
  { value: '', label: 'Sin definir' },
  { value: 'SOLTERO', label: 'Soltero(a)' },
  { value: 'CASADO', label: 'Casado(a)' },
  { value: 'DIVORCIADO', label: 'Divorciado(a)' },
  { value: 'VIUDO', label: 'Viudo(a)' },
  { value: 'UNION_LIBRE', label: 'Union libre' },
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

function formatOptionLabel(value: string) {
  return value.replace(/_/g, ' ')
}

function formatTipoDocumentoLabel(value: string, sourceDocument?: string | null) {
  switch (value) {
    case 'OTRO':
      return sourceDocument === 'CV' ? 'Curriculum / CV' : 'Expediente completo'
    case 'INE':
      return 'Credencial oficial'
    case 'RFC':
      return 'Constancia SAT'
    case 'ALTA_IMSS':
      return 'Comprobante alta IMSS'
    case 'BAJA':
      return 'Expediente de baja'
    case 'COMPROBANTE_DOMICILIO':
      return 'Comprobante domicilio'
    default:
      return value.replace(/_/g, ' ')
  }
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

function getCuentaCompactLabel(value: string | null) {
  if (value === 'ACTIVA') {
    return 'ACTIVO'
  }

  if (value === 'PROVISIONAL' || value === 'PENDIENTE_VERIFICACION_EMAIL') {
    return 'PROVISIONAL'
  }

  if (value === 'SUSPENDIDA') {
    return 'SUSPENDIDO'
  }

  return 'SIN ACCESO'
}

function getExpedienteCompactLabel(value: string) {
  return value === 'VALIDADO' ? 'OK' : 'PENDIENTE'
}

function getExpedienteCompactTone(value: string) {
  return value === 'VALIDADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
}

function getImssCompactLabel(value: string) {
  return value === 'ALTA_IMSS' ? 'OK' : 'PENDIENTE'
}

function getImssCompactTone(value: string) {
  return value === 'ALTA_IMSS' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
}

function isPendingPayrollOffboarding(empleado: EmpleadoListadoItem) {
  return empleado.workflowStage === 'PENDIENTE_BAJA_IMSS'
}



export function EmpleadosPanel({
  actor,
  data: initialData,
  initialFilters,
  initialTab,
}: {
  actor: ActorActual
  data: EmpleadosPanelData
  initialFilters?: EmpleadosPanelInitialFilters
  initialTab?: EmpleadosMainTab
}) {
  const actorPuesto = actor.puesto as Puesto
  const scopeKeys = useMemo(() => getUiChangeScopeKeysForActor(actor), [actor])
  const fetcher = useCallback(async (signal: AbortSignal) => {
    const response = await fetch('/api/empleados/panel', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    })
    const payload = (await response.json()) as { data?: EmpleadosPanelData; message?: string }

    if (!response.ok || !payload.data) {
      throw new Error(payload.message ?? 'No fue posible refrescar el panel de empleados.')
    }

    return payload.data
  }, [])

  const { data } = useScopedWidgetData({
    initialData,
    module: 'empleados',
    surfaces: ['panel', 'all'],
    scopeKeys,
    roleTargets: [actor.puesto],
    fetcher,
    debounceMs: 650,
  })

  const [mainTab, setMainTab] = useState<EmpleadosMainTab>('base')
  const [search, setSearch] = useState(initialFilters?.search ?? '')
  const [estadoFilter, setEstadoFilter] = useState(initialFilters?.estadoLaboral ?? 'ALL')
  const [zonaFilter, setZonaFilter] = useState(initialFilters?.zona ?? 'ALL')
  const [supervisorFilter, setSupervisorFilter] = useState(initialFilters?.supervisorId ?? 'ALL')
  const [imssFilter, setImssFilter] = useState<EmpleadosImssFilterValue>(
    normalizeImssFilterValue(initialFilters?.imss)
  )
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(search)





  const operationalEmployees = data.empleados.filter(
    (empleado) =>
      ![
        'NUEVOS',
        'EXPEDIENTE',
        'EN_GESTION',
        'ONBOARDING',
        'PENDIENTE_COORDINACION',
        'SELECCION_APROBADA',
        'PENDIENTE_IMSS_NOMINA',
        'EN_FLUJO_IMSS',
        'PENDIENTE_VALIDACION_FINAL',
        'PENDIENTE_ACCESO_ADMIN',
        'RECLUTAMIENTO_CORRECCION_ALTA',
        'ALTA_CANCELADA',
      ].includes(empleado.workflowStage ?? '')
  )

  const empleadosFiltrados = filterEmpleadosListado(operationalEmployees, {
    search: deferredSearch,
    estadoLaboral: estadoFilter,
    zona: zonaFilter,
    supervisorId: supervisorFilter,
    imss: imssFilter,
  })

  const selectedEmployee = data.empleados.find((empleado) => empleado.id === selectedEmployeeId) ?? null
  const topMetrics = [
    {
      label: 'Base operativa',
      value: String(operationalEmployees.length),
      accentClass: 'from-emerald-100 via-teal-50 to-white text-emerald-700',
    },
    {
      label: 'Activos',
      value: String(data.resumen.activos),
      accentClass: 'from-lime-100 via-emerald-50 to-white text-lime-700',
    },
    {
      label: 'IMSS en proceso',
      value: String(data.resumen.imssEnProceso),
      accentClass: 'from-amber-100 via-yellow-50 to-white text-amber-700',
    },
    {
      label: 'Bajas registradas',
      value: String(data.resumen.bajas),
      accentClass: 'from-rose-100 via-orange-50 to-white text-rose-700',
    },
    {
      label: 'Plantilla objetivo',
      value: String(data.pdvs.length),
      accentClass: 'from-sky-100 via-cyan-50 to-white text-sky-700',
    },
  ]

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {topMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            accentClass={metric.accentClass}
            emphasized={false}
            tinted={false}
          />
        ))}
      </div>

      {mainTab === 'base' ? (
        <>
          <Card className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Base operativa de empleados</h2>
                <p className="mt-1 text-sm text-slate-500">
Consulta la plantilla ya integrada. Los candidatos y expedientes vivos ya no se mezclan con esta base estabilizada.
                </p>
              </div>
              <p className="text-sm text-slate-500">
                Mostrando{' '}
                <span className="font-semibold text-slate-900">{empleadosFiltrados.length}</span> de{' '}
                <span className="font-semibold text-slate-900">{operationalEmployees.length}</span>{' '}
                empleados.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
              <Select
                label="Estado IMSS"
                value={imssFilter}
                onChange={(event) => setImssFilter(normalizeImssFilterValue(event.target.value))}
                options={IMSS_FILTER_OPTIONS}
              />
            </div>
            {imssFilter === 'PENDIENTE_IMSS' && (
              <p className="mt-3 text-xs font-medium text-amber-700">
                Vista enfocada en empleados integrados que todavia siguen pendientes de alta IMSS.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="w-[24%] px-5 py-3 font-medium">Empleado</th>
                    <th className="w-[20%] px-5 py-3 font-medium">Zona / supervisor</th>
                    <th className="w-[18%] px-5 py-3 font-medium">Acceso</th>
                    <th className="w-[14%] px-5 py-3 font-medium">Expediente</th>
                    <th className="w-[14%] px-5 py-3 font-medium">IMSS</th>
                    <th className="w-[110px] px-5 py-3 text-right font-medium">Detalle</th>
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
                        empleado={empleado}
                        onToggle={() => setSelectedEmployeeId(empleado.id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {selectedEmployee ? (
        <EmpleadoDetailModal
          key={selectedEmployee.id}
          open
          onClose={() => setSelectedEmployeeId(null)}
          empleado={selectedEmployee}
          data={data}
          actorPuesto={actorPuesto}
        />
      ) : null}
    </div>
  )
}






function EmpleadoRow({
  empleado,
  onToggle,
}: {
  empleado: EmpleadoListadoItem
  onToggle: () => void
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-5 py-4">
          <div className="break-words text-[14px] font-semibold leading-5 text-slate-900">
            {empleado.nombreCompleto}
          </div>
          <div className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-slate-400">
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
            {empleado.adminAccessPending && (
              <StatusPill
                label="Pendiente acceso admin"
                className="bg-violet-100 text-violet-700"
              />
            )}
            {empleado.workflowStage === 'ALTA_IMSS_CERRADA' && (
              <StatusPill
                label="Alta finalizada"
                className="bg-slate-100 text-slate-700"
              />
            )}
          </div>
      </td>
      <td className="px-5 py-4 text-slate-600">
          <div className="truncate font-medium text-slate-900">{empleado.zona ?? 'Sin zona'}</div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {empleado.supervisor ?? 'Sin supervisor'}
          </div>
          {empleado.fechaBaja && (
            <div className="mt-2 truncate text-xs text-rose-600">{formatDate(empleado.fechaBaja)}</div>
          )}
      </td>
      <td className="px-5 py-4 text-slate-600">
          <div className="truncate font-medium text-slate-900">{empleado.username ?? 'Sin acceso'}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill
              label={getCuentaCompactLabel(empleado.estadoCuenta)}
              className={getCuentaTone(empleado.estadoCuenta)}
            />
          </div>
      </td>
      <td className="px-5 py-4 text-slate-600">
          <StatusPill
            label={getExpedienteCompactLabel(empleado.expedienteEstado)}
            className={getExpedienteCompactTone(empleado.expedienteEstado)}
          />
      </td>
      <td className="px-5 py-4 text-slate-600">
          <StatusPill
            label={getImssCompactLabel(empleado.imssEstado)}
            className={getImssCompactTone(empleado.imssEstado)}
          />
      </td>
      <td className="px-5 py-4 text-right">
          <button
            type="button"
            className="inline-flex min-h-9 min-w-[80px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onToggle}
          >
            Ver
          </button>
      </td>
    </tr>
  )
}

export function EmpleadoDetailModal({
  open,
  onClose,
  empleado,
  data,
  actorPuesto,
}: {
  open: boolean
  onClose: () => void
  empleado: EmpleadoListadoItem
  data: EmpleadosPanelData
  actorPuesto: Puesto
}) {
  const [tab, setTab] = useState<'personal' | 'laboral' | 'contacto' | 'documentos'>('personal')
  const canManageAdminFields = actorPuesto === 'ADMINISTRADOR' || actorPuesto === 'COORDINADOR'

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={empleado.nombreCompleto}
      subtitle={formatPuesto(empleado.puesto)}
      maxWidthClassName="max-w-6xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 border-b border-border/70 pb-4">
          <DetailTabButton active={tab === 'personal'} onClick={() => setTab('personal')}>Personal</DetailTabButton>
          <DetailTabButton active={tab === 'laboral'} onClick={() => setTab('laboral')}>Laboral</DetailTabButton>
          <DetailTabButton active={tab === 'contacto'} onClick={() => setTab('contacto')}>Contacto</DetailTabButton>
          <DetailTabButton active={tab === 'documentos'} onClick={() => setTab('documentos')}>Documentos</DetailTabButton>
        </div>



        {tab === 'personal' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Personal" description="Identidad y datos base del expediente.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="NSS" value={empleado.nss ?? 'Sin NSS'} />
                <InfoRow label="CURP" value={empleado.curp ?? 'Sin CURP'} />
                <InfoRow label="RFC" value={empleado.rfc ?? 'Sin RFC'} />
                <InfoRow label="Edad" value={empleado.edad !== null ? String(empleado.edad) : 'Sin edad'} />
                <InfoRow label="Sexo" value={empleado.sexo ?? 'Sin sexo'} />
                <InfoRow label="Estado civil" value={empleado.estadoCivil ?? 'Sin estado civil'} />
                <InfoRow label="Fecha nacimiento" value={formatDate(empleado.fechaNacimiento)} />
                <InfoRow label="Originario" value={empleado.originario ?? 'Sin origen'} />
              </div>
            </DetailCard>

            <DetailCard title="Cuenta de acceso" description="Estado digital del colaborador.">
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex flex-wrap gap-2">
                  <StatusPill label={empleado.estadoCuenta ?? 'SIN_USUARIO'} className={getCuentaTone(empleado.estadoCuenta)} />
                  {empleado.adminAccessPending ? (
                    <StatusPill label="Pendiente acceso admin" className="bg-violet-100 text-violet-700" />
                  ) : null}
                  {empleado.workflowStage === 'ALTA_IMSS_CERRADA' ? (
                    <StatusPill label="Alta finalizada" className="bg-slate-100 text-slate-700" />
                  ) : null}
                </div>
                <InfoRow label="Usuario" value={empleado.username ?? 'Sin usuario'} />
                <InfoRow label="Correo acceso" value={empleado.correoElectronico ?? 'Sin correo'} />
              </div>
            </DetailCard>
          </div>
        ) : null}

        {tab === 'contacto' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Contacto" description="Canales de contacto y cobertura.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Telefono" value={empleado.telefono ?? 'Sin telefono'} />
                <InfoRow label="Correo" value={empleado.correoElectronico ?? 'Sin correo'} />
                <InfoRow label="Codigo postal" value={empleado.codigoPostal ?? 'Sin codigo postal'} />
                <InfoRow label="Zona" value={empleado.zona ?? 'Sin zona'} />
              </div>
            </DetailCard>

            <DetailCard title="Domicilio" description="Direccion y origen del expediente.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Domicilio" value={empleado.domicilioCompleto ?? 'Sin domicilio'} />
                <InfoRow label="Originario" value={empleado.originario ?? 'Sin origen'} />
                <InfoRow label="Supervisor" value={empleado.supervisor ?? 'Sin supervisor'} />
                <InfoRow label="Puesto" value={formatPuesto(empleado.puesto)} />
              </div>
            </DetailCard>
          </div>
        ) : null}

        {tab === 'laboral' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Ficha laboral" description="Datos operativos y workflow.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Puesto" value={formatPuesto(empleado.puesto)} />
                <InfoRow label="Zona" value={empleado.zona ?? 'Sin zona'} />
                <InfoRow label="Supervisor" value={empleado.supervisor ?? 'Sin supervisor'} />
                <InfoRow label="Fecha alta" value={formatDate(empleado.fechaAlta)} />
                <InfoRow label="Fecha baja" value={formatDate(empleado.fechaBaja)} />
                <InfoRow label="Anios laborando" value={empleado.aniosLaborando !== null ? String(empleado.aniosLaborando) : 'Sin antiguedad'} />
                <InfoRow label="SBC diario" value={empleado.sbcDiario !== null ? formatCurrency(empleado.sbcDiario) : 'Sin SBC'} />
                <InfoRow label="Motivo baja" value={empleado.motivoBaja ?? 'Sin motivo registrado'} />
              </div>
              {empleado.motivoBaja ? (
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
              ) : null}

            </DetailCard>



            {canManageAdminFields ? (
              <DetailCard title="Datos administrativos" description="Campos reservados para administracion.">
                <AdminEmployeeFieldsForm data={data} empleado={empleado} />
              </DetailCard>
            ) : null}

            <DetailCard title="Baja operativa" description="Control del cierre institucional.">
              {empleado.estatusLaboral === 'BAJA' ? (
                <ReadOnlyWorkflowCard
                  lines={[
                    `estatus: BAJA`,
                    `fecha efectiva: ${formatDate(empleado.fechaBaja)}`,
                    `motivo: ${empleado.motivoBaja ?? 'sin motivo registrado'}`,
                    `workflow: ${empleado.workflowStage ?? 'sin etapa'}`,
                  ]}
                />
              ) : canManageAdminFields && !isPendingPayrollOffboarding(empleado) ? (
                <BajaEmpleadoForm empleado={empleado} />
              ) : (
                <ReadOnlyWorkflowCard
                  lines={[
                    `workflow: ${empleado.workflowStage ?? 'sin etapa'}`,
                    `motivo: ${empleado.motivoBaja ?? 'sin baja en curso'}`,
                  ]}
                />
              )}
            </DetailCard>
          </div>
        ) : null}

        {tab === 'documentos' ? (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <DetailCard title="Carga documental" description="Soportes del expediente y flujo.">
                <DocumentoUploadForm
                  empleado={empleado}
                  actorPuesto={actorPuesto}
                  ocrProvider={data.ocrProvider}
                />
              </DetailCard>

              <DetailCard title="Documentos" description="Acceso firmado y evidencia organizada.">
                <DocumentosList documentos={empleado.documentos} />
              </DetailCard>
            </div>


          </div>
        ) : null}
      </div>


    </ModalPanel>
  )
}

function DetailTabButton({
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
      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[var(--module-soft-bg)] text-[var(--module-text)] shadow-[inset_0_0_0_1px_var(--module-border)]'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  )
}


















function AdminEmployeeFieldsForm({
  empleado,
  data,
}: {
  empleado: EmpleadoListadoItem
  data: EmpleadosPanelData
}) {
  const [state, formAction] = useActionState(
    actualizarDatosAdministrativosEmpleado,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="ID nomina"
          name="id_nomina"
          defaultValue={empleado.idNomina ?? ''}
          placeholder="Definido por Administracion"
        />
        <Select
          label="Supervisor"
          name="supervisor_empleado_id"
          defaultValue={empleado.supervisorEmpleadoId ?? ''}
          options={[
            { value: '', label: 'Sin supervisor' },
            ...data.supervisors.map((supervisor) => ({
              value: supervisor.id,
              label: supervisor.nombreCompleto,
            })),
          ]}
        />
      </div>
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <p>
          El username provisional se define una vez que el expediente esta completo.
          Administracion debe crear el acceso final desde{' '}
          <span className="font-semibold">Usuarios</span>.
        </p>
      </div>
      <SubmitButton
        idleLabel="Guardar datos administrativos"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function CrearEmpleadoForm({ data }: { data: EmpleadosPanelData }) {
  const [state, formAction] = useActionState(crearEmpleado, ESTADO_EMPLEADO_INICIAL)
  const [selectedPuesto, setSelectedPuesto] = useState<Puesto>('DERMOCONSEJERO')

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="CV / curriculum PDF" name="curriculum_pdf" type="file" accept="application/pdf" required />
        <Input label="Nombre completo" name="nombre_completo" placeholder="Nombre del candidato" required />
        <Select
          label="Puesto"
          name="puesto"
          defaultValue={selectedPuesto}
          onChange={(event) => setSelectedPuesto(event.target.value as Puesto)}
          options={PUESTOS_OPTIONS.map((option) => ({ value: option, label: formatOptionLabel(option) }))}
        />
        <Select
          label="PDV sugerido"
          name="pdv_sugerido_id"
          defaultValue=""
          options={[
            { value: '', label: 'Selecciona un PDV' },
            ...data.pdvs.map((pdv) => ({
              value: pdv.id,
              label: `${pdv.nombre}${pdv.claveBtl ? ` (${pdv.claveBtl})` : ''}`,
            })),
          ]}
        />
        <Select
          label="Coordinador"
          name="coordinador_empleado_id"
          defaultValue=""
          options={[
            { value: '', label: 'Sin coordinador' },
            ...data.coordinators.map((coordinador) => ({
              value: coordinador.id,
              label: coordinador.nombreCompleto,
            })),
          ]}
        />
        <Input label="Fecha alta" name="fecha_alta" type="date" />
        <Input label="Fecha nacimiento" name="fecha_nacimiento" type="date" />
        <Input label="Telefono" name="telefono" placeholder="10 digitos" />
        <Input label="Correo electronico" name="correo_electronico" type="email" placeholder="correo@dominio.com" />
        <Input label="CURP" name="curp" placeholder="CURP" />
        <Input label="NSS" name="nss" placeholder="NSS" />
        <Input label="RFC" name="rfc" placeholder="RFC" />
        <Input label="Edad" name="edad" type="number" min={0} step="1" />
        <Input label="Codigo postal" name="codigo_postal" placeholder="00000" />
        <Input label="Zona" name="zona" placeholder="Zona de cobertura" />
        <Input label="Domicilio completo" name="domicilio_completo" placeholder="Direccion completa" />
        <Input label="Originario" name="originario" placeholder="Lugar de origen" />
        <Select
          label="Sexo"
          name="sexo"
          defaultValue=""
          options={SEXO_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <Select
          label="Estado civil"
          name="estado_civil"
          defaultValue=""
          options={ESTADO_CIVIL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <Input label="Fecha ingreso oficial" name="fecha_ingreso_oficial" type="date" />
        <Input label="Fecha isdinizacion" name="fecha_isdinizacion" type="date" />
      </div>
      <TextareaField
        label="Observaciones de acceso externo"
        name="accesos_externos_observaciones"
        placeholder="Notas del proceso de alta"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Estatus accesos externos"
          name="accesos_externos_status"
          defaultValue="PENDIENTE"
          options={[
            { value: 'PENDIENTE', label: 'Pendiente' },
            { value: 'SOLICITADO_A_VIRIDIANA', label: 'Solicitado a Viridiana' },
            { value: 'CONFIRMADO', label: 'Confirmado' },
          ]}
        />
        <Select
          label="Contrato"
          name="contrato_status"
          defaultValue="PENDIENTE"
          options={[
            { value: 'PENDIENTE', label: 'Pendiente' },
            { value: 'AGENDADO', label: 'Agendado' },
            { value: 'FIRMADO', label: 'Firmado' },
          ]}
        />
        <Input label="Fecha contrato firmado" name="contrato_firmado_en" type="date" />
      </div>
      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <input type="checkbox" name="expediente_completo_recibido" className="h-4 w-4 rounded border-slate-300" />
        Expediente completo recibido
      </label>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">Carga inicial</p>
        <p className="mt-1">
          Sube el curriculum en PDF. Los campos adicionales ayudan a dejar listo el expediente y la ruta de onboarding desde el primer envio.
        </p>
      </div>
      <SubmitButton idleLabel="Crear candidato" pendingLabel="Creando..." variant="primary" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function ImssEstadoForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(actualizarEstadoImssEmpleado, ESTADO_EMPLEADO_INICIAL)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Estado IMSS"
          name="imss_estado"
          defaultValue={empleado.imssEstado}
          options={IMSS_OPTIONS.map((option) => ({ value: option, label: formatOptionLabel(option) }))}
        />
        <Input
          label="Fecha solicitud IMSS"
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
        <Input
          label="Sueldo base mensual"
          name="sueldo_base_mensual"
          type="number"
          min={0}
          step="0.01"
          defaultValue={empleado.sueldoBaseMensual ?? ''}
        />
        <Input
          label="SBC diario"
          name="sbc_diario"
          type="number"
          min={0}
          step="0.01"
          defaultValue={empleado.sbcDiario ?? ''}
        />
      </div>
      <TextareaField
        label="Observaciones IMSS"
        name="imss_observaciones"
        defaultValue={empleado.imssObservaciones ?? ''}
        placeholder="Notas del tramite o validacion"
      />
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">Flujo IMSS</p>
        <p className="mt-1">
          Este formulario alimenta el estado operativo de Nomina y solo debe usarse cuando el expediente ya tiene soporte suficiente para continuar.
        </p>
      </div>
      <SubmitButton idleLabel="Actualizar IMSS" pendingLabel="Actualizando..." variant="secondary" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function CancelarAltaForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(cancelarProcesoAltaEmpleado, ESTADO_EMPLEADO_INICIAL)

  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (!window.confirm(`Cancelar por completo el proceso de alta de ${empleado.nombreCompleto}?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <TextareaField
        label="Motivo de cancelacion"
        name="motivo_cancelacion_alta"
        placeholder="Explica por que se cancela el proceso"
        required
      />
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-semibold">Esta accion detiene el flujo actual</p>
        <p className="mt-1">
          El expediente pasara a cancelado y se notificara a los equipos involucrados.
        </p>
      </div>
      <SubmitButton idleLabel="Cancelar alta" pendingLabel="Cancelando..." variant="danger" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function ReadOnlyWorkflowCard({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

export function DocumentoUploadForm({
  empleado,
  actorPuesto,
  ocrProvider,
}: {
  empleado: EmpleadoListadoItem
  actorPuesto: Puesto
  ocrProvider?: string | null
}) {
  const [state, formAction] = useActionState(subirDocumentoEmpleado, ESTADO_EMPLEADO_INICIAL)
  const isPayroll = actorPuesto === 'NOMINA'
  const isRecruitment = actorPuesto === 'RECLUTAMIENTO' || actorPuesto === 'ADMINISTRADOR'
  const availableCategories = isPayroll ? ['IMSS', 'BAJA'] : ['EXPEDIENTE', 'BAJA']
  const defaultCategory = isPayroll ? 'IMSS' : 'EXPEDIENTE'
  const [selectedCategory, setSelectedCategory] = useState<'EXPEDIENTE' | 'IMSS' | 'BAJA'>(
    defaultCategory
  )
  const availableTypes =
    isPayroll
      ? selectedCategory === 'BAJA'
        ? [{ value: 'BAJA', label: 'Comprobante baja IMSS' }]
        : [{ value: 'ALTA_IMSS', label: 'Comprobante alta IMSS' }]
      : selectedCategory === 'BAJA'
        ? [{ value: 'BAJA', label: 'Expediente de baja' }]
        : [
            { value: 'OTRO', label: 'Expediente / soporte general' },
            { value: 'INE', label: 'Credencial oficial' },
            { value: 'RFC', label: 'Constancia SAT' },
          ]
  const [selectedType, setSelectedType] = useState<string>(availableTypes[0]?.value ?? 'OTRO')
  const acceptedMimeTypes = isPayroll
    ? 'application/pdf'
    : 'image/jpeg,image/png,image/webp,application/pdf'

  const [isUploadingR2, setIsUploadingR2] = useState(false)

  const handleInterceptedSubmit = async (formData: FormData) => {
    const archivo = formData.get('archivo') as File | null
    if (archivo && archivo.size > 0) {
      setIsUploadingR2(true)
      try {
        await injectDirectR2Upload(formData, archivo, {
          modulo: 'reclutamiento',
          removeFieldName: 'archivo',
        })
      } catch (err) {
        console.error('Error fallback a R2', err)
      } finally {
        setIsUploadingR2(false)
      }
    }
    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <form action={handleInterceptedSubmit} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Categoria"
          name="categoria"
          value={selectedCategory}
          onChange={(event) => {
            const nextCategory = event.target.value as 'EXPEDIENTE' | 'IMSS' | 'BAJA'
            setSelectedCategory(nextCategory)
            const nextType =
              isPayroll
                ? nextCategory === 'BAJA'
                  ? 'BAJA'
                  : 'ALTA_IMSS'
                : nextCategory === 'BAJA'
                  ? 'BAJA'
                  : 'OTRO'
            setSelectedType(nextType)
          }}
          options={availableCategories.map((option) => ({ value: option, label: option }))}
        />
        <Select
          label="Tipo documento"
          name="tipo_documento"
          value={selectedType}
          onChange={(event) => setSelectedType(event.target.value)}
          options={availableTypes}
        />
        <div className="w-full md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Archivo</label>
          <ClientImageFileInput
            useNativeInput
            name="archivo"
            accept={acceptedMimeTypes}
            className="w-full overflow-hidden rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground file:mr-3 file:max-w-full file:truncate file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
          />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        {isPayroll ? (
          <p>
            Nomina carga comprobantes institucionales en PDF, tanto de{' '}
            <span className="font-semibold text-slate-900">alta IMSS</span> como de{' '}
            <span className="font-semibold text-slate-900">baja IMSS</span>. Si cierra un alta en{' '}
            <span className="font-semibold text-slate-900">ALTA_IMSS</span> y no existe usuario
            vinculado, el sistema avisara a Administracion cuando se complete la validacion final del expediente.
          </p>
        ) : isRecruitment ? (
          <p>
            Administracion solo adjunta soportes y verifica datos ya cargados desde el CV, como expediente, credencial oficial o constancia SAT. No carga comprobantes IMSS ni relanza OCR sobre estos documentos. OCR provider actual:{' '}
            <span className="font-semibold text-slate-900">{ocrProvider ?? 'sin configurar'}</span>.
          </p>
        ) : (
          <p>
            Dedupe activo por SHA-256. Los PDFs deben venir comprimidos desde origen y no pueden
            exceder 10 MB. OCR provider actual:{' '}
            <span className="font-semibold text-slate-900">{ocrProvider ?? 'sin configurar'}</span>.
          </p>
        )}
      </div>
      <SubmitButton 
        idleLabel={isUploadingR2 ? "Saltando hacia Bodega R2..." : "Subir documento"} 
        pendingLabel={isUploadingR2 ? "Saltando hacia Bodega R2..." : "Subiendo..."} 
        variant="outline" 
      />
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

  if (isPendingPayrollOffboarding(empleado)) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Baja enviada a Nomina</p>
        <p>Fecha efectiva propuesta: {formatDate(empleado.fechaBaja)}</p>
        <p>Motivo: {empleado.motivoBaja ?? 'Sin motivo registrado'}</p>
        <p>
          El expediente de baja ya fue cargado. Nomina debe revisar los soportes,
          registrar la baja IMSS y subir el comprobante institucional para cerrar el proceso.
        </p>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (!window.confirm(`Enviar expediente de baja de ${empleado.nombreCompleto} a Nomina?`)) {
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
      {empleado.imssObservaciones && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Baja observada por Nomina</p>
          <p className="mt-1">{empleado.imssObservaciones}</p>
        </div>
      )}
      <div className="w-full">
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Expediente de baja (PDF)
        </label>
        <input
          type="file"
          name="expediente_baja_pdf"
          accept="application/pdf"
          required
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
        />
        <p className="mt-2 text-xs text-slate-500">
          Adjunta en un solo PDF la carta de renuncia, finiquito y cualquier soporte requerido
          para que Nomina cierre la baja institucional.
        </p>
      </div>
      <SubmitButton idleLabel="Enviar baja a Nomina" pendingLabel="Enviando..." variant="danger" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function CerrarBajaEmpleadoNominaForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(cerrarBajaEmpleadoNomina, ESTADO_EMPLEADO_INICIAL)
  const [rejectState, rejectAction] = useActionState(
    rechazarBajaEmpleadoNomina,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="space-y-4"
        onSubmit={(event) => {
          if (!window.confirm(`Cerrar baja institucional de ${empleado.nombreCompleto}?`)) {
            event.preventDefault()
          }
        }}
      >
        <input type="hidden" name="empleado_id" value={empleado.id} />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Expediente pendiente de baja IMSS</p>
          <p className="mt-2">
            Administracion ya capturo la solicitud de baja y subio el expediente documental. Nomina
            debe subir aqui el comprobante institucional de baja IMSS para convertir el estatus final
            del empleado a <span className="font-semibold">BAJA</span>.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Fecha efectiva de baja"
            name="fecha_baja"
            type="date"
            defaultValue={empleado.fechaBaja ?? ''}
            required
          />
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Comprobante baja IMSS (PDF)
            </label>
            <input
              type="file"
              name="baja_imss_pdf"
              accept="application/pdf"
              required
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
            />
          </div>
        </div>
        <TextareaField
          label="Observaciones de Nomina"
          name="baja_observaciones_nomina"
          defaultValue={empleado.imssObservaciones ?? ''}
          placeholder="Folio, incidencia o notas del cierre institucional"
        />
        <SubmitButton
          idleLabel="Cerrar baja institucional"
          pendingLabel="Cerrando..."
          variant="danger"
        />
        {state.message && (
          <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {state.message}
          </p>
        )}
      </form>

      <form action={rejectAction} className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <input type="hidden" name="empleado_id" value={empleado.id} />
        <p className="text-sm font-semibold text-rose-900">Rechazar solicitud de baja</p>
        <TextareaField
          label="Motivo del rechazo"
          name="motivo_rechazo_nomina"
          placeholder="Explica que soporte o dato debe corregirse."
          required
        />
        <SubmitButton idleLabel="Rechazar y regresar a Reclutamiento" pendingLabel="Rechazando..." variant="danger" />
        {rejectState.message && (
          <p className={`text-sm ${rejectState.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {rejectState.message}
          </p>
        )}
      </form>
    </div>
  )
}

export function DocumentosList({ documentos }: { documentos: DocumentoExpedienteItem[] }) {
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
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill label={documento.categoria} className="bg-slate-100 text-slate-700" />
                <StatusPill
                  label={formatTipoDocumentoLabel(documento.tipoDocumento, documento.sourceDocument)}
                  className="bg-sky-100 text-sky-700"
                />
                <StatusPill label={documento.estadoDocumento} className="bg-emerald-100 text-emerald-700" />
                <StatusPill
                  label={`OCR ${documento.ocrResultado.status ?? 'sin estado'}`}
                  className={getOcrTone(documento.ocrResultado.status)}
                />
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
              <p className="mt-3 font-medium text-slate-900">{documento.nombreArchivo}</p>
              <div className="mt-2 grid gap-1 text-xs text-slate-500">
                <span>subido: {formatDate(documento.createdAt)}</span>
                <span>tamano: {formatBytes(documento.tamanoBytes)}</span>
                <span>mime: {documento.mimeType ?? 'sin mime type'}</span>
                <span>sha256: {documento.sha256 ?? 'sin hash'}</span>
                <span>ocr provider: {documento.ocrProvider ?? 'sin proveedor'}</span>
                <span>modelo: {documento.ocrResultado.model ?? 'sin modelo'}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TextareaField(
  {
    label,
    name,
    defaultValue,
    value,
    onChange,
    placeholder,
    required,
  }: {
    label: string
    name: string
    defaultValue?: string
    value?: string
    onChange?: TextareaHTMLAttributes<HTMLTextAreaElement>['onChange']
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
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={4}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  )
}

export function DetailCard({
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

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
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

function MetricCard({
  label,
  value,
  accentClass = '',
  emphasized = false,
  tinted = false,
}: {
  label: string
  value: string
  accentClass?: string
  emphasized?: boolean
  tinted?: boolean
}) {
  const tone =
    accentClass.includes('emerald')
      ? 'emerald'
      : accentClass.includes('sky')
        ? 'sky'
        : accentClass.includes('amber')
          ? 'amber'
          : accentClass.includes('rose')
            ? 'rose'
            : 'module'

  return (
    <SharedMetricCard
      label={label}
      value={value}
      tone={tone}
      className={emphasized ? 'min-h-[118px]' : tinted ? 'min-h-[102px]' : undefined}
      labelClassName={
        emphasized
          ? 'max-w-[16rem] text-[15px] font-medium leading-6 text-slate-700'
          : tinted
            ? 'max-w-[16rem] text-[14px] font-medium leading-5 text-slate-700'
            : 'max-w-[16rem] text-sm text-slate-500'
      }
      valueClassName={
        emphasized ? 'text-[40px] leading-none' : tinted ? 'text-[32px] leading-none' : 'text-3xl'
      }
    />
  )
}

export function StatusPill({ label, className }: { label: ReactNode; className: string }) {
  return (
    <span className={`inline-flex shrink-0 self-start rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
