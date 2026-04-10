'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { publicarCampana } from '../actions'
import { ESTADO_CAMPANA_ADMIN_INICIAL } from '../state'

function formatCandidateLabel(candidate: {
  empleado: string
  currentPdvClave: string | null
  currentPdv: string | null
  issues: Array<{ label: string }>
}) {
  const current = candidate.currentPdvClave ?? candidate.currentPdv ?? 'Sin PDV visible'
  const issueSuffix = candidate.issues.length > 0 ? ` · alerta: ${candidate.issues.map((item) => item.label).join(', ')}` : ''
  return `${candidate.empleado} · ${current}${issueSuffix}`
}

export function CampanaPublishAction({
  campaignId,
  align = 'left',
}: {
  campaignId: string
  align?: 'left' | 'right'
}) {
  const [state, formAction, isPending] = useActionState(publicarCampana, ESTADO_CAMPANA_ADMIN_INICIAL)
  const hasPreview = Boolean(state.rotationImpactPreview && state.rotationImpactPreview.nodes.length > 0)

  return (
    <form action={formAction} className={`space-y-3 ${align === 'right' ? 'text-right' : ''}`}>
      <input type="hidden" name="campana_id" value={campaignId} />
      {hasPreview ? <input type="hidden" name="confirmar_rotacion" value="true" /> : null}

      {hasPreview ? (
        <div className="space-y-3 rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 text-left shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Impacto en rotativas</p>
            <p className="text-sm text-slate-700">
              Resolvamos los PDVs que quedarían descubiertos durante la ventana de la campaña antes de publicarla.
            </p>
          </div>

          <div className="space-y-3">
            {state.rotationImpactPreview?.nodes.map((node) => {
              const defaultCandidate = node.suggestedCandidates.find((item) => item.issues.length === 0) ?? node.suggestedCandidates[0] ?? null
              const defaultDecision = node.selectedDecision ?? (defaultCandidate ? 'ASIGNAR' : 'RESERVAR')
              const defaultEmployeeId = node.selectedEmployeeId ?? defaultCandidate?.empleadoId ?? ''

              return (
                <div key={node.nodeId} className="rounded-[20px] border border-white/80 bg-white/90 p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-950">{node.impactedPdvClave}</p>
                      <p className="text-xs text-slate-500">{node.impactedPdv}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      Grupo {node.grupoRotacionCodigo}
                    </span>
                  </div>

                  <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Con este movimiento, <span className="font-semibold text-slate-900">{node.primaryPdvClave}</span> se vuelve principal para{' '}
                    <span className="font-semibold text-slate-900">{node.primaryEmpleado ?? 'la DC actual'}</span> y {node.impactedPdvClave} quedaría sin cobertura.
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-left">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Decisión</span>
                      <select
                        name={`rotation_decision__${node.nodeId}`}
                        defaultValue={defaultDecision}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <option value="ASIGNAR">Asignar cobertura temporal</option>
                        <option value="RESERVAR">Reservar PDV durante campaña</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-left">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">DC sugerida</span>
                      <select
                        name={`rotation_employee__${node.nodeId}`}
                        defaultValue={defaultEmployeeId}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <option value="">Sin cobertura, reservar PDV</option>
                        {node.suggestedCandidates.map((candidate) => (
                          <option key={candidate.empleadoId} value={candidate.empleadoId}>
                            {formatCandidateLabel(candidate)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                    {node.selectedDecision === 'ASIGNAR' && node.selectedEmployeeId ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
                        Cobertura seleccionada en esta cascada
                      </span>
                    ) : null}
                    {node.reservedEmployee ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-700">
                        Regresa a este PDV: {node.reservedEmployee}
                      </span>
                    ) : null}
                    {node.impactedCampanaPdvId ? (
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 font-medium text-violet-700">
                        Este PDV también está dentro de la campaña
                      </span>
                    ) : null}
                    {node.suggestedCandidates.some((item) => item.issues.length > 0) ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                        Algunas coberturas sugeridas también rompen otra rotación
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <Button type="submit" size="sm" isLoading={isPending} className={hasPreview ? 'w-full sm:w-auto' : undefined}>
        {isPending ? 'Procesando...' : hasPreview ? 'Confirmar publicación y resolver impacto' : 'Publicar campaña'}
      </Button>

      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : state.requiresRotationReview ? 'text-amber-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
