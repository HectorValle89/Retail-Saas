import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  evaluarReglasAsignacion,
  evaluarValidacionesAsignacion,
  obtenerReferenciaValidacion,
  requiereConfirmacionAlertas,
  resumirIssuesAsignacion,
  type AsignacionValidable,
  type AsignacionValidationContext,
  type SupervisorAsignacionRow,
} from './assignmentValidation'

function buildSupervisores(
  pdvId: string,
  referencia: string,
  activo: boolean
): SupervisorAsignacionRow[] {
  if (!activo) {
    return [{ pdv_id: pdvId, activo: false, fecha_fin: referencia }]
  }

  return [{ pdv_id: pdvId, activo: true, fecha_fin: null, empleado_id: 'sup-1' }]
}

describe('assignment validation properties', () => {
  it('keeps blocking validations aligned with core invariants', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (hasAccount, hasGeofence, hasSupervisor, validRange, validQuota) => {
          const today = '2026-03-16'
          const asignacion: AsignacionValidable = {
            cuenta_cliente_id: hasAccount ? 'cliente-1' : null,
            empleado_id: 'emp-1',
            pdv_id: 'pdv-1',
            tipo: 'FIJA',
            fecha_inicio: today,
            fecha_fin: validRange ? today : '2026-03-15',
            dias_laborales: 'LUN,MAR,VIE',
            dia_descanso: 'DOM',
          }
          const referencia = obtenerReferenciaValidacion(asignacion.fecha_inicio, today)
          const validaciones = evaluarValidacionesAsignacion(asignacion, {
            employee: {
              id: 'emp-1',
              puesto: 'DERMOCONSEJERO',
              estatus_laboral: 'ACTIVO',
              telefono: '5555555555',
              correo_electronico: 'dc@example.com',
            },
            pdv: {
              id: 'pdv-1',
              estatus: 'ACTIVO',
              radio_tolerancia_metros: 150,
              cadena_codigo: 'GENERICA',
              factor_cuota_default: validQuota ? 1 : 0,
            },
            pdvsConGeocerca: hasGeofence ? new Set<string>(['pdv-1']) : new Set<string>(),
            supervisoresPorPdv: {
              'pdv-1': buildSupervisores('pdv-1', referencia, hasSupervisor),
            },
            comparableAssignments: [],
            historicalAssignmentsForPdv: [],
            horariosPorPdv: { 'pdv-1': 1 },
          })

          expect(validaciones.includes('Sin cuenta cliente')).toBe(!hasAccount)
          expect(validaciones.includes('PDV sin geocerca')).toBe(!hasGeofence)
          expect(validaciones.includes('PDV sin supervisor activo')).toBe(!hasSupervisor)
          expect(validaciones.includes('Vigencia invalida')).toBe(!validRange)
          expect(validaciones.includes('Cuota invalida')).toBe(!validQuota)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('separates alertas from avisos without converting them into blocking errors', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (missingContact, changeSupervisor) => {
        const asignacion: AsignacionValidable = {
          id: 'asig-1',
          cuenta_cliente_id: 'cliente-1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          supervisor_empleado_id: changeSupervisor ? 'sup-2' : 'sup-1',
          tipo: 'FIJA',
          fecha_inicio: '2026-03-16',
          fecha_fin: '2026-03-16',
          dias_laborales: 'LUN,MAR,VIE',
          dia_descanso: 'DOM',
        }

        const issues = evaluarReglasAsignacion(asignacion, {
          employee: {
            id: 'emp-1',
            puesto: 'DERMOCONSEJERO',
            estatus_laboral: 'ACTIVO',
            telefono: missingContact ? null : '5555555555',
            correo_electronico: missingContact ? null : 'dc@example.com',
          },
          pdv: {
            id: 'pdv-1',
            estatus: 'ACTIVO',
            radio_tolerancia_metros: 150,
            cadena_codigo: 'GENERICA',
            factor_cuota_default: 1,
          },
          pdvsConGeocerca: new Set<string>(['pdv-1']),
          supervisoresPorPdv: {
            'pdv-1': [{ pdv_id: 'pdv-1', activo: true, fecha_fin: null, empleado_id: 'sup-1' }],
          },
          comparableAssignments: [],
          historicalAssignmentsForPdv: [
            {
              id: 'asig-0',
              empleado_id: 'emp-2',
              pdv_id: 'pdv-1',
              supervisor_empleado_id: 'sup-1',
              tipo: 'FIJA',
              fecha_inicio: '2026-02-01',
              fecha_fin: '2026-02-28',
              dias_laborales: 'LUN,MAR,MIE,JUE,VIE',
            },
          ],
          horariosPorPdv: { 'pdv-1': 1 },
        } satisfies AsignacionValidationContext)

        const resumen = resumirIssuesAsignacion(issues)
        expect(resumen.errores).toHaveLength(0)
        expect(requiereConfirmacionAlertas(issues)).toBe(missingContact)
        expect(resumen.avisos.some((item) => item.code === 'CAMBIO_SUPERVISOR')).toBe(changeSupervisor)
      }),
      { numRuns: 100 }
    )
  })
})