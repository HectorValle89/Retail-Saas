import { describe, expect, it } from 'vitest'
import {
  expandCampaignRotationCascadePreview,
  type CampaignRotationImpactPreview,
  type CampaignRotationResolvedDecision,
} from './campaignRotationImpact'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function applyFilters(
  rows: unknown[],
  eqFilters: Array<{ column: string; value: unknown }>,
  inFilters: Array<{ column: string; values: string[] }>,
  lteFilters: Array<{ column: string; value: string }>
) {
  return rows.filter((row) => {
    const record = row as Record<string, unknown>
    const eqOk = eqFilters.every((filter) => record[filter.column] === filter.value)
    const inOk = inFilters.every((filter) => filter.values.includes(String(record[filter.column] ?? '')))
    const lteOk = lteFilters.every((filter) => String(record[filter.column] ?? '') <= filter.value)
    return eqOk && inOk && lteOk
  })
}

function createFakeSupabase(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const eqFilters: Array<{ column: string; value: unknown }> = []
      const inFilters: Array<{ column: string; values: string[] }> = []
      const lteFilters: Array<{ column: string; value: string }> = []

      const builder = {
        select() {
          return builder
        },
        eq(column: string, value: unknown) {
          eqFilters.push({ column, value })
          return builder
        },
        in(column: string, values: string[]) {
          inFilters.push({ column, values })
          return builder
        },
        lte(column: string, value: string) {
          lteFilters.push({ column, value })
          return builder
        },
        or() {
          return builder
        },
        limit() {
          return builder
        },
        then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
          try {
            const result = results[table] ?? { data: [], error: null }
            if (result.error || !Array.isArray(result.data)) {
              return Promise.resolve(resolve(result))
            }

            return Promise.resolve(
              resolve({
                data: applyFilters(result.data, eqFilters, inFilters, lteFilters),
                error: null,
              })
            )
          } catch (error) {
            if (reject) {
              return Promise.resolve(reject(error))
            }

            throw error
          }
        },
      }

      return builder
    },
  }
}

describe('campaignRotationImpact cascade preview', () => {
  it('preserves the selected decision and adds a chained node when the chosen candidate breaks another rotation', async () => {
    const preview: CampaignRotationImpactPreview = {
      campanaId: 'camp-1',
      accountId: 'account-1',
      fechaInicio: '2026-04-01',
      fechaFin: '2026-04-10',
      totalGroups: 1,
      totalNodes: 1,
      nodes: [
        {
          nodeId: 'pdv-impactado',
          grupoRotacionCodigo: 'ROT-ORIGEN-001',
          primaryPdvId: 'pdv-principal',
          primaryPdv: 'PDV principal',
          primaryPdvClave: 'BTL-PRI-001',
          primaryEmpleadoId: 'dc-base',
          primaryEmpleado: 'DC Base',
          impactedPdvId: 'pdv-impactado',
          impactedPdv: 'PDV Impactado',
          impactedPdvClave: 'BTL-IMP-001',
          impactedCampanaPdvId: null,
          reservedEmployeeId: 'dc-base',
          reservedEmployee: 'DC Base',
          suggestedCandidates: [
            {
              empleadoId: 'dc-cobertura',
              empleado: 'DC Cobertura',
              currentPdvId: 'pdv-rot-a',
              currentPdv: 'PDV Rotativo A',
              currentPdvClave: 'BTL-ROT-A',
              rankingBucket: 'MISMA_CADENA_MISMO_SUPERVISOR',
              issues: [
                {
                  severity: 'ALERTA',
                  code: 'ROTACION_MAESTRA_SIN_COBERTURA',
                  label: 'Rotacion sin cobertura',
                  message: 'Mover esta DC deja otro PDV rotativo descubierto.',
                },
              ],
            },
          ],
          selectedDecision: null,
          selectedEmployeeId: null,
        },
      ],
    }

    const decisions: CampaignRotationResolvedDecision[] = [
      {
        nodeId: 'pdv-impactado',
        decision: 'ASIGNAR',
        empleadoId: 'dc-cobertura',
        node: preview.nodes[0]!,
      },
    ]

    const supabase = createFakeSupabase({
      pdv_rotacion_maestra: {
        data: [
          {
            cuenta_cliente_id: 'account-1',
            vigente: true,
            pdv_id: 'pdv-rot-a',
            clasificacion_maestra: 'ROTATIVO',
            grupo_rotacion_codigo: 'ROT-CASCADA-001',
            grupo_tamano: 2,
            slot_rotacion: 'A',
          },
          {
            cuenta_cliente_id: 'account-1',
            vigente: true,
            pdv_id: 'pdv-rot-b',
            clasificacion_maestra: 'ROTATIVO',
            grupo_rotacion_codigo: 'ROT-CASCADA-001',
            grupo_tamano: 2,
            slot_rotacion: 'B',
          },
        ],
        error: null,
      },
      pdv: {
        data: [
          { id: 'pdv-rot-a', clave_btl: 'BTL-ROT-A', nombre: 'PDV Rotativo A', cadena_id: 'cadena-1' },
          { id: 'pdv-rot-b', clave_btl: 'BTL-ROT-B', nombre: 'PDV Rotativo B', cadena_id: 'cadena-1' },
          { id: 'pdv-impactado', clave_btl: 'BTL-IMP-001', nombre: 'PDV Impactado', cadena_id: 'cadena-1' },
        ],
        error: null,
      },
      asignacion: {
        data: [
          {
            id: 'asg-rot-a',
            empleado_id: 'dc-cobertura',
            pdv_id: 'pdv-rot-a',
            supervisor_empleado_id: 'sup-1',
            cuenta_cliente_id: 'account-1',
            tipo: 'ROTATIVA',
            factor_tiempo: 0.5,
            dias_laborales: 'LUN,MAR,MIE',
            dia_descanso: 'DOM',
            horario_referencia: null,
            fecha_inicio: '2026-04-01',
            fecha_fin: '2026-04-30',
            naturaleza: 'BASE',
            retorna_a_base: false,
            asignacion_base_id: null,
            asignacion_origen_id: null,
            prioridad: 100,
            motivo_movimiento: null,
            observaciones: null,
            estado_publicacion: 'PUBLICADA',
            created_at: '2026-04-01T10:00:00.000Z',
          },
          {
            id: 'asg-rot-b',
            empleado_id: 'dc-reserva',
            pdv_id: 'pdv-rot-b',
            supervisor_empleado_id: 'sup-1',
            cuenta_cliente_id: 'account-1',
            tipo: 'ROTATIVA',
            factor_tiempo: 0.5,
            dias_laborales: 'JUE,VIE,SAB',
            dia_descanso: 'DOM',
            horario_referencia: null,
            fecha_inicio: '2026-04-01',
            fecha_fin: '2026-04-30',
            naturaleza: 'BASE',
            retorna_a_base: false,
            asignacion_base_id: null,
            asignacion_origen_id: null,
            prioridad: 100,
            motivo_movimiento: null,
            observaciones: null,
            estado_publicacion: 'PUBLICADA',
            created_at: '2026-04-01T10:00:00.000Z',
          },
        ],
        error: null,
      },
      empleado: {
        data: [
          { id: 'dc-cobertura', nombre_completo: 'DC Cobertura' },
          { id: 'dc-reserva', nombre_completo: 'DC Reserva' },
        ],
        error: null,
      },
    })

    const expanded = await expandCampaignRotationCascadePreview(supabase as never, {
      accountId: 'account-1',
      fechaInicio: '2026-04-01',
      fechaFin: '2026-04-10',
      preview,
      decisions,
    })

    expect(expanded.nodes).toHaveLength(2)
    expect(expanded.nodes[0]?.selectedDecision).toBe('ASIGNAR')
    expect(expanded.nodes[0]?.selectedEmployeeId).toBe('dc-cobertura')
    expect(expanded.nodes[1]?.nodeId).toBe('pdv-rot-a')
    expect(expanded.nodes[1]?.grupoRotacionCodigo).toBe('ROT-CASCADA-001')
  })
})
