'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { MetricCard } from '@/components/ui/metric-card'
import { ScrollablePipelineBoard } from './PipelineBoard'
import Link from 'next/link'
import { getRecruitingStageMeta, getRecruitingBajaStageMeta } from '../lib/recruitingUI'
import { VacantesFuturasBoard } from '@/features/asignaciones/components/VacantesFuturasBoard'
import { 
  resolveRecruitingAltaPipelineStage, 
  resolveRecruitingBajaPipelineStage,
  isRecruitingAltaPipelineEmployee,
  isRecruitingBajaPipelineEmployee
} from '../lib/recruitingPipeline'
import type { 
  RecruitingAltaPipelineStageKey, 
  RecruitingBajaPipelineStageKey,
  RecruitingCandidateContext,
  RecruitingBajaCandidateContext
} from '../types'
import type { EmpleadosPanelData, EmpleadoListadoItem } from '@/features/empleados/services/empleadoService'

interface RecruitmentDashboardProps {
  data: EmpleadosPanelData
  onOpen: (empleado: EmpleadoListadoItem) => void
  onCreateCandidate: () => void
}

export function RecruitmentDashboard({
  data,
  onOpen,
  onCreateCandidate,
}: RecruitmentDashboardProps) {
  const [search, setSearch] = useState('')
  const [coordinatorFilter, setCoordinatorFilter] = useState('ALL')
  const [cadenaFilter, setCadenaFilter] = useState('ALL')
  const [ciudadFilter, setCiudadFilter] = useState('ALL')

  const pdvMap = new Map(data.pdvs.map((pdv) => [pdv.id, pdv]))

  const altaCandidates = data.empleados
    .filter((empleado) => isRecruitingAltaPipelineEmployee(empleado))
    .map((empleado): RecruitingCandidateContext | null => {
      const pdvSugeridoId = empleado.onboarding.pdvSugeridoId ?? empleado.onboarding.pdvObjetivoId ?? null
      const pdvDefinitivoId = empleado.onboarding.pdvDefinitivoId ?? null
      const pdvSugerido = pdvSugeridoId ? pdvMap.get(pdvSugeridoId) ?? null : null
      const pdvDefinitivo = pdvDefinitivoId ? pdvMap.get(pdvDefinitivoId) ?? null : null
      const stageKey = resolveRecruitingAltaPipelineStage(empleado)

      if (!stageKey) {
        return null
      }

      return {
        empleado,
        id: empleado.id,
        nombreCompleto: empleado.nombreCompleto,
        curp: empleado.curp,
        nss: empleado.nss,
        puesto: empleado.puesto,
        zona: empleado.zona,
        supervisor: empleado.supervisor,
        submittedAt: empleado.fechaAlta,
        stageKey,
        documentationProgress: 0, // Should be calculated
        hasImssAlta: empleado.imssEstado === 'ALTA_IMSS',
        hasSignedContract: empleado.onboarding.contratoStatus === 'FIRMADO',
        hasCompleteExpediente: empleado.onboarding.expedienteCompletoRecibido,
        adminAccessPending: empleado.adminAccessPending,
        readyForAdmin: false, // Should be calculated
        coordinadorLabel: empleado.onboarding.coordinadorNombre ?? 'Sin coordinador',
        cadena: pdvDefinitivo?.cadena ?? pdvSugerido?.cadena ?? null,
        ciudad: pdvDefinitivo?.ciudad ?? pdvSugerido?.ciudad ?? null,
      } satisfies RecruitingCandidateContext
    })
    .filter((item): item is RecruitingCandidateContext => item !== null)

  const bajaCandidates = data.empleados
    .filter((empleado) => isRecruitingBajaPipelineEmployee(empleado))
    .map((empleado): RecruitingBajaCandidateContext | null => {
      const pdvSugeridoId = empleado.onboarding.pdvSugeridoId ?? empleado.onboarding.pdvObjetivoId ?? null
      const pdvDefinitivoId = empleado.onboarding.pdvDefinitivoId ?? null
      const pdvSugerido = pdvSugeridoId ? pdvMap.get(pdvSugeridoId) ?? null : null
      const pdvDefinitivo = pdvDefinitivoId ? pdvMap.get(pdvDefinitivoId) ?? null : null
      const stageKey = resolveRecruitingBajaPipelineStage(empleado)

      if (!stageKey) {
        return null
      }

      return {
        empleado,
        id: empleado.id,
        nombreCompleto: empleado.nombreCompleto,
        stageKey,
        coordinadorLabel: empleado.onboarding.coordinadorNombre ?? 'Sin coordinador',
        cadena: pdvDefinitivo?.cadena ?? pdvSugerido?.cadena ?? null,
        ciudad: pdvDefinitivo?.ciudad ?? pdvSugerido?.ciudad ?? null,
      } satisfies RecruitingBajaCandidateContext
    })
    .filter((item): item is RecruitingBajaCandidateContext => item !== null)

  const searchNormalized = search.trim().toLocaleLowerCase('es-MX')
  const matchesFilters = (item: {
    empleado: EmpleadoListadoItem
    cadena: string | null
    ciudad: string | null
    coordinadorLabel: string
  }) => {
    const matchesSearch =
      searchNormalized.length === 0 ||
      [
        item.empleado.nombreCompleto,
        item.empleado.idNomina,
        item.empleado.curp,
        item.empleado.nss,
        item.cadena,
        item.ciudad,
        item.coordinadorLabel,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('es-MX').includes(searchNormalized))

    const matchesCoordinator =
      coordinatorFilter === 'ALL' || item.empleado.onboarding.coordinadorEmpleadoId === coordinatorFilter
    const matchesCadena = cadenaFilter === 'ALL' || item.cadena === cadenaFilter
    const matchesCiudad = ciudadFilter === 'ALL' || item.ciudad === ciudadFilter

    return matchesSearch && matchesCoordinator && matchesCadena && matchesCiudad
  }

  const filteredAltaCandidates = altaCandidates.filter(matchesFilters)
  const filteredBajaCandidates = bajaCandidates.filter(matchesFilters)

  const pipelineOrder: RecruitingAltaPipelineStageKey[] = [
    'NUEVOS',
    'EXPEDIENTE',
    'EN_GESTION',
    'ONBOARDING',
    'CANCELADOS',
  ]
  const bajaPipelineOrder: RecruitingBajaPipelineStageKey[] = [
    'BAJAS_SOLICITADAS',
    'BAJAS_DEVUELTAS',
  ]

  const cadenas = Array.from(
    new Set([...altaCandidates, ...bajaCandidates].map((item) => item.cadena).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, 'es-MX'))
  const ciudades = Array.from(
    new Set([...altaCandidates, ...bajaCandidates].map((item) => item.ciudad).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, 'es-MX'))

  function formatDate(value: string | null) {
    if (!value) return 'Sin registro'
    return new Intl.DateTimeFormat('es-MX', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(new Date(value))
  }

  return (
    <div className="space-y-6">
      {/* Metrics Section */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Candidatos en Pipeline"
          value={data.resumenReclutamiento.candidatosEnPipeline}
          tone="violet"
        />
        <MetricCard
          label="Pendientes Coordinación"
          value={data.resumenReclutamiento.pendientesCoordinacion}
          tone="sky"
        />
        <MetricCard
          label="Listos para Alta"
          value={data.resumenReclutamiento.listosAdministracion}
          tone="emerald"
        />
        <MetricCard
          label="Próximas Isdinizaciones"
          value={data.resumenReclutamiento.proximasIsdinizaciones}
          tone="amber"
        />
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Embudo de Contratación</h2>
          <p className="text-sm text-slate-500">Gestión visual del ciclo de vida del candidato.</p>
        </div>
        <button
          onClick={onCreateCandidate}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--module-primary)] px-6 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-95"
        >
          Nuevo Candidato
        </button>
      </div>

      <Card className="border-slate-200/60 bg-white/50 p-4 backdrop-blur-sm">
        <div className="grid gap-4 lg:grid-cols-4">
          <Input
            label="Buscar candidato"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, CURP, NSS..."
            className="bg-white"
          />
          <Select
            label="Coordinador"
            value={coordinatorFilter}
            onChange={(e) => setCoordinatorFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              ...data.coordinators.map(c => ({ value: c.id, label: c.nombreCompleto }))
            ]}
          />
          <Select
            label="Cadena"
            value={cadenaFilter}
            onChange={(e) => setCadenaFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'Todas' },
              ...cadenas.map(c => ({ value: c, label: c }))
            ]}
          />
          <Select
            label="Ciudad"
            value={ciudadFilter}
            onChange={(e) => setCiudadFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'Todas' },
              ...ciudades.map(c => ({ value: c, label: c }))
            ]}
          />
        </div>
      </Card>

      {/* Kanban Board */}
      <ScrollablePipelineBoard
        title="Pipeline de Candidatos"
        subtitle="Flujo desde CV filtrado hasta Onboarding final."
        stageOrder={pipelineOrder}
        items={filteredAltaCandidates.map(item => ({
          id: item.id,
          stageKey: item.stageKey,
          title: item.nombreCompleto,
          line1: item.empleado.onboarding.pdvObjetivoLabel ?? 'Sin PDV asignado',
          line2: `Alta: ${formatDate(item.empleado.fechaAlta)}`,
          empleado: item.empleado
        }))}
        getStageMeta={getRecruitingStageMeta}
        onOpen={onOpen}
        emptyFooterLabel="Sin candidatos en esta etapa"
      />

      <ScrollablePipelineBoard
        title="Pipeline de Bajas"
        subtitle="Seguimiento de salidas y cierres institucionales."
        stageOrder={bajaPipelineOrder}
        items={filteredBajaCandidates.map(item => ({
          id: item.id,
          stageKey: item.stageKey,
          title: item.nombreCompleto,
          line1: item.empleado.motivoBaja ?? 'Motivo no registrado',
          line2: `Baja: ${formatDate(item.empleado.fechaBaja)}`,
          empleado: item.empleado
        }))}
        getStageMeta={getRecruitingBajaStageMeta}
        onOpen={onOpen}
        emptyFooterLabel="Sin bajas en esta etapa"
      />

      <Card className="border-slate-200/90 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Vacantes futuras ligadas a bajas</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Espejo operativo de la bandeja principal de Asignaciones. Reclutamiento ve aquí el impacto para coordinar cobertura sin mantener una lógica paralela.
            </p>
          </div>
          <Link
            href="/asignaciones/vacantes-futuras"
            className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Abrir bandeja principal
          </Link>
        </div>

        <div className="mt-5">
          <VacantesFuturasBoard
            data={data.futureVacancies}
            showAssignmentsShortcut
            detailHrefBuilder={(item) => `/asignaciones/vacantes-futuras?vacante_id=${item.id}`}
            reassignmentHrefBuilder={(item) =>
              `/asignaciones/asignaciones?modal=manual&vacante_id=${item.id}&prefill_pdv_id=${encodeURIComponent(item.pdvId)}&prefill_fecha_inicio=${encodeURIComponent(item.fechaVacanteDesde)}&prefill_tipo=COBERTURA&prefill_naturaleza=COBERTURA_TEMPORAL&prefill_motivo=${encodeURIComponent(`Cobertura ${item.tipoVacante === 'VACANTE_ACTUAL_POR_BAJA' ? 'inmediata' : 'futura'} por baja de ${item.empleadoOrigenNombre ?? 'empleado'}`)}&prefill_observaciones=${encodeURIComponent(`Vacante vinculada a baja ${item.fechaBajaEfectiva}. PDV ${item.pdvClaveBtl ?? item.pdvId}.`)}`
            }
          />
        </div>
      </Card>
    </div>
  )
}
