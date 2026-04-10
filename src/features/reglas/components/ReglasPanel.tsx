'use client'

import { useActionState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Select } from '@/components/ui/select'
import {
  guardarFlujoAprobacion,
  guardarReglaHorario,
  guardarReglaInventario,
  guardarReglaSupervisor,
} from '../actions'
import { ESTADO_REGLA_ADMIN_INICIAL } from '../state'
import {
  type ApprovalFlowDefinition,
  APPROVAL_ACTOR_OPTIONS,
  APPROVAL_FLOW_RULE_CODES,
  SCHEDULE_LEVEL_OPTIONS,
  SCHEDULE_PRIORITY_RULE_CODE,
  SOLICITUD_TIPO_OPTIONS,
  SUPERVISOR_INHERITANCE_RULE_CODE,
  SUPERVISOR_SOURCE_OPTIONS,
} from '../lib/businessRules'
import type { ReglasPanelData, ReglaInventarioItem } from '../services/reglaService'

function buildBooleanOptions(activeLabel = 'Activa', inactiveLabel = 'Inactiva') {
  return [
    { value: 'true', label: activeLabel },
    { value: 'false', label: inactiveLabel },
  ]
}

function formatSeverityTone(severity: string) {
  switch (severity) {
    case 'ERROR':
      return 'bg-rose-100 text-rose-700'
    case 'ALERTA':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function formatRuleStatusTone(active: boolean) {
  return active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
}

function joinList(values: readonly string[]) {
  return values.join(', ')
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

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>
}

function StateMessage({ state }: { state: { ok: boolean; message: string | null } }) {
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

function RuleCard({
  title,
  description,
  badges,
  children,
}: {
  title: string
  description: string
  badges?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader title={title} description={description} />
        {badges}
      </div>
      {children}
    </Card>
  )
}

export function ReglasPanel({ data }: { data: ReglasPanelData }) {
  const inventoryOperativeCodes = new Set<string>([
    SUPERVISOR_INHERITANCE_RULE_CODE,
    SCHEDULE_PRIORITY_RULE_CODE,
    ...Object.values(APPROVAL_FLOW_RULE_CODES),
  ])

  const inventoryExtras = data.inventory.filter((item) => !inventoryOperativeCodes.has(item.code))

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura parcial</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Reglas registradas" value={String(data.resumen.total)} />
        <MetricCard label="Activas" value={String(data.resumen.activas)} />
        <MetricCard label="Severidad ERROR" value={String(data.resumen.errores)} />
        <MetricCard label="Severidad ALERTA" value={String(data.resumen.alertas)} />
        <MetricCard label="Flujos de aprobacion" value={String(data.resumen.approvalFlows)} />
        <MetricCard label="Reglas operativas" value={String(data.resumen.operativas)} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <SupervisorRuleForm data={data} />
          <ScheduleRuleForm data={data} />
        </div>

        <Card className="space-y-4 p-6">
          <SectionHeader
            title="Inventario de reglas"
            description="Vista consolidada de todas las reglas cargadas en BD, incluyendo cambios avanzados sobre JSON."
          />
          <CreateInventoryRuleForm />
          <div className="space-y-4">
            {inventoryExtras.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No hay reglas adicionales fuera de supervisor, horarios y flujos de aprobacion.
              </p>
            ) : (
              inventoryExtras.map((item) => <InventoryRuleForm key={item.id} item={item} />)
            )}
          </div>
        </Card>
      </div>

      <Card className="space-y-5 p-6">
        <SectionHeader
          title="Flujos de aprobacion por tipo de solicitud"
          description="Base central para solicitudes futuras. Cada regla conserva SLA, orden de aprobacion y aviso minimo."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {data.approvalFlows.map((flow) => (
            <ApprovalFlowForm key={flow.code} flow={flow} />
          ))}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionHeader
          title="Inventario completo"
          description="Referencia rapida de codigos, modulos, severidad y estado activo."
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Codigo</th>
                <th className="px-4 py-3 font-medium">Modulo</th>
                <th className="px-4 py-3 font-medium">Severidad</th>
                <th className="px-4 py-3 font-medium">Prioridad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.inventory.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{item.code}</td>
                  <td className="px-4 py-3 text-slate-600">{item.module}</td>
                  <td className="px-4 py-3">
                    <StatusPill label={item.severity} tone={formatSeverityTone(item.severity)} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.priority}</td>
                  <td className="px-4 py-3">
                    <StatusPill
                      label={item.active ? 'ACTIVA' : 'INACTIVA'}
                      tone={formatRuleStatusTone(item.active)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function SupervisorRuleForm({ data }: { data: ReglasPanelData }) {
  const [state, formAction] = useActionState(
    guardarReglaSupervisor,
    ESTADO_REGLA_ADMIN_INICIAL
  )

  return (
    <RuleCard
      title="Herencia de supervisor"
      description="Ordena la resolucion del supervisor operativo entre PDV, empleado y valor previo de la asignacion."
      badges={
        <div className="flex flex-wrap gap-2">
          <StatusPill
            label={data.supervisorRule.active ? 'ACTIVA' : 'INACTIVA'}
            tone={formatRuleStatusTone(data.supervisorRule.active)}
          />
          <StatusPill label={data.supervisorRule.severity} tone={formatSeverityTone(data.supervisorRule.severity)} />
        </div>
      }
    >
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Prioridad"
            name="priority"
            type="number"
            min="1"
            defaultValue={String(data.supervisorRule.priority)}
          />
          <Select
            label="Estado"
            name="active"
            defaultValue={String(data.supervisorRule.active)}
            options={buildBooleanOptions()}
          />
        </div>
        <Input
          label="Fuentes ordenadas"
          name="sources"
          defaultValue={joinList(data.supervisorRule.sources)}
          placeholder="PDV, EMPLEADO, ASIGNACION"
          hint={`Valores permitidos: ${joinList(SUPERVISOR_SOURCE_OPTIONS.map((item) => item.value))}`}
        />
        <FieldTextarea
          label="Descripcion"
          name="description"
          defaultValue={data.supervisorRule.description}
          placeholder="Describe la politica de herencia."
        />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton label="Guardar regla" pendingLabel="Guardando..." />
          <StateMessage state={state} />
        </div>
      </form>
    </RuleCard>
  )
}

function ScheduleRuleForm({ data }: { data: ReglasPanelData }) {
  const [state, formAction] = useActionState(guardarReglaHorario, ESTADO_REGLA_ADMIN_INICIAL)
  const fallback = data.scheduleRule.globalFallback

  return (
    <RuleCard
      title="Prioridad de horarios"
      description="Resuelve el horario operativo del PDV por capas: configuracion puntual, base del punto, cadena y fallback global."
      badges={
        <div className="flex flex-wrap gap-2">
          <StatusPill
            label={data.scheduleRule.active ? 'ACTIVA' : 'INACTIVA'}
            tone={formatRuleStatusTone(data.scheduleRule.active)}
          />
          <StatusPill label={data.scheduleRule.severity} tone={formatSeverityTone(data.scheduleRule.severity)} />
        </div>
      }
    >
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Prioridad"
            name="priority"
            type="number"
            min="1"
            defaultValue={String(data.scheduleRule.priority)}
          />
          <Select
            label="Estado"
            name="active"
            defaultValue={String(data.scheduleRule.active)}
            options={buildBooleanOptions()}
          />
        </div>
        <Input
          label="Niveles ordenados"
          name="levels"
          defaultValue={joinList(data.scheduleRule.levels)}
          placeholder="PDV_BASE, CADENA_BASE, GLOBAL"
          hint={`Valores permitidos: ${joinList(SCHEDULE_LEVEL_OPTIONS.map((item) => item.value))}`}
        />
        <FieldTextarea
          label="Descripcion"
          name="description"
          defaultValue={data.scheduleRule.description}
          placeholder="Describe la jerarquia de horario."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="Etiqueta global"
            name="global_label"
            defaultValue={fallback?.label ?? ''}
            placeholder="Horario global agencia"
          />
          <Input
            label="Hora entrada global"
            name="global_hora_entrada"
            type="time"
            defaultValue={fallback?.horaEntrada?.slice(0, 5) ?? ''}
          />
          <Input
            label="Hora salida global"
            name="global_hora_salida"
            type="time"
            defaultValue={fallback?.horaSalida?.slice(0, 5) ?? ''}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton label="Guardar regla" pendingLabel="Guardando..." />
          <StateMessage state={state} />
        </div>
      </form>
    </RuleCard>
  )
}

function ApprovalFlowForm({ flow }: { flow: ApprovalFlowDefinition }) {
  const [state, formAction] = useActionState(
    guardarFlujoAprobacion,
    ESTADO_REGLA_ADMIN_INICIAL
  )

  return (
    <RuleCard
      title={`Flujo ${flow.solicitudTipo}`}
      description="Configura actores, estado destino y SLA por paso de aprobacion."
      badges={
        <div className="flex flex-wrap gap-2">
          <StatusPill label={flow.code} tone="bg-slate-100 text-slate-700" />
          <StatusPill
            label={flow.active ? 'ACTIVA' : 'INACTIVA'}
            tone={formatRuleStatusTone(flow.active)}
          />
        </div>
      }
    >
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Tipo solicitud"
            name="solicitud_tipo"
            defaultValue={flow.solicitudTipo}
            options={SOLICITUD_TIPO_OPTIONS}
          />
          <Input
            label="Prioridad"
            name="priority"
            type="number"
            min="1"
            defaultValue={String(flow.priority)}
          />
          <Select
            label="Estado"
            name="active"
            defaultValue={String(flow.active)}
            options={buildBooleanOptions()}
          />
        </div>
        <Input
          label="Aviso minimo (dias)"
          name="min_notice_days"
          type="number"
          min="0"
          defaultValue={flow.minNoticeDays === null ? '' : String(flow.minNoticeDays)}
          placeholder="Opcional"
        />
        <FieldTextarea
          label="Descripcion"
          name="description"
          defaultValue={flow.description}
          placeholder="Describe el flujo y su criterio."
        />
        <div className="space-y-3">
          {[0, 1, 2].map((index) => {
            const step = flow.steps[index]
            return (
              <div
                key={`${flow.code}-step-${index + 1}`}
                className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3"
              >
                <Select
                  label={`Actor paso ${index + 1}`}
                  name={`actor_${index + 1}`}
                  defaultValue={step?.actor ?? ''}
                  options={[
                    { value: '', label: 'Sin paso' },
                    ...APPROVAL_ACTOR_OPTIONS.map((item) => ({
                      value: item.value,
                      label: item.label,
                    })),
                  ]}
                />
                <Input
                  label="Estado destino"
                  name={`status_${index + 1}`}
                  defaultValue={step?.targetStatus ?? ''}
                  placeholder="VALIDADA_SUP"
                />
                <Input
                  label="SLA horas"
                  name={`sla_${index + 1}`}
                  type="number"
                  min="0"
                  defaultValue={step?.slaHours === null || step?.slaHours === undefined ? '' : String(step.slaHours)}
                  placeholder="Opcional"
                />
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitActionButton label="Guardar flujo" pendingLabel="Guardando..." />
          <StateMessage state={state} />
        </div>
      </form>
    </RuleCard>
  )
}

function CreateInventoryRuleForm() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
      <p className="text-sm font-semibold text-slate-950">Alta rapida de regla</p>
      <p className="mt-1 text-xs text-slate-500">
        Utiliza este bloque para registrar reglas adicionales no cubiertas por supervisor, horarios o aprobaciones.
      </p>
      <div className="mt-4">
        <InventoryRuleForm />
      </div>
    </div>
  )
}

function InventoryRuleForm({ item }: { item?: ReglaInventarioItem }) {
  const [state, formAction] = useActionState(
    guardarReglaInventario,
    ESTADO_REGLA_ADMIN_INICIAL
  )

  return (
    <form
      action={formAction}
      className={`space-y-4 rounded-2xl border ${item ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 bg-white'} p-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {item?.code ?? 'Nueva regla personalizada'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {item?.description ?? 'Codigo, severidad y payload JSON para reglas avanzadas.'}
          </p>
        </div>
        {item && (
          <div className="flex flex-wrap gap-2">
            <StatusPill label={item.severity} tone={formatSeverityTone(item.severity)} />
            <StatusPill
              label={item.active ? 'ACTIVA' : 'INACTIVA'}
              tone={formatRuleStatusTone(item.active)}
            />
          </div>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Codigo" name="code" defaultValue={item?.code} placeholder="REGLA_OPERATIVA_X" />
        <Input label="Modulo" name="module" defaultValue={item?.module} placeholder="operacion" />
        <Select
          label="Severidad"
          name="severity"
          defaultValue={item?.severity ?? 'AVISO'}
          options={[
            { value: 'ERROR', label: 'ERROR' },
            { value: 'ALERTA', label: 'ALERTA' },
            { value: 'AVISO', label: 'AVISO' },
          ]}
        />
        <Input
          label="Prioridad"
          name="priority"
          type="number"
          min="1"
          defaultValue={item ? String(item.priority) : '500'}
        />
      </div>
      <Select
        label="Estado"
        name="active"
        defaultValue={item ? String(item.active) : 'true'}
        options={buildBooleanOptions()}
      />
      <FieldTextarea
        label="Descripcion"
        name="description"
        defaultValue={item?.description}
        placeholder="Describe la regla."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <FieldTextarea
          label="Condicion JSON"
          name="condition_json"
          defaultValue={item?.conditionJson ?? '{\n  \n}'}
          placeholder='{"campo":"valor"}'
          rows={8}
        />
        <FieldTextarea
          label="Accion JSON"
          name="action_json"
          defaultValue={item?.actionJson ?? '{\n  \n}'}
          placeholder='{"accion":"valor"}'
          rows={8}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitActionButton
          label={item ? 'Actualizar regla' : 'Crear regla'}
          pendingLabel="Guardando..."
        />
        <StateMessage state={state} />
      </div>
    </form>
  )
}
