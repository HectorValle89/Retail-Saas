import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  calculateLedgerTotals,
  calculateOperationalPayroll,
  calculatePayrollNet,
  type PayrollLedgerMovement,
} from './payrollMath'
import { calculateQuotaProgress, distributeTeamQuota, redistributeQuotaForAbsence } from './quotaMath'

describe('payroll math properties', () => {
  it('keeps ledger buckets non-negative and idempotent for non-negative movements', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            tipo: fc.constantFrom<'PERCEPCION' | 'DEDUCCION' | 'AJUSTE'>(
              'PERCEPCION',
              'DEDUCCION',
              'AJUSTE'
            ),
            monto: fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          }),
          { maxLength: 100 }
        ),
        (movements) => {
          const totals = calculateLedgerTotals(movements as PayrollLedgerMovement[])

          expect(totals.percepciones).toBeGreaterThanOrEqual(0)
          expect(totals.deducciones).toBeGreaterThanOrEqual(0)
          expect(totals.ajustes).toBeGreaterThanOrEqual(0)
          expect(calculateLedgerTotals(movements as PayrollLedgerMovement[])).toEqual(totals)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('computes payroll net deterministically from the same totals', () => {
    fc.assert(
      fc.property(
        fc.record({
          percepciones: fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          deducciones: fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          ajustes: fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
          bonoEstimado: fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
        }),
        (input) => {
          expect(calculatePayrollNet(input)).toBe(calculatePayrollNet(input))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('derives explicit payroll breakdown with sueldo base, comision y deducciones fiscales', () => {
    const breakdown = calculateOperationalPayroll({
      sueldoBaseMensual: 18000,
      jornadasValidadas: 10,
      montoConfirmado: 12000,
      aplicaBonoCumplimiento: true,
      bonoCumplimientoPct: 10,
      bonoCuota: 500,
      retardos: 2,
      deduccionFaltas: 1200,
      deduccionRetardoPct: 10,
      imssPct: 2.5,
      isrPct: 10,
      ledgerPercepciones: 300,
      ledgerDeducciones: 50,
      ledgerAjustes: 100,
    })

    expect(breakdown).toMatchObject({
      sueldoBaseDiario: 600,
      sueldoBaseDevengado: 6000,
      comisionVentas: 1200,
      bonoCuotaAplicado: 500,
      percepciones: 8000,
      deduccionFaltas: 1200,
      deduccionRetardos: 120,
      deduccionImss: 202.5,
      deduccionIsr: 789.75,
      deducciones: 2362.25,
      ajustes: 100,
      neto: 5737.75,
    })
  })
})

describe('quota distribution properties', () => {
  it('distributes quota proportionally without losing total amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
        fc.uniqueArray(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 12 }),
            factor: fc.float({ min: 0, max: 100, noNaN: true }),
          }),
          {
            selector: (participant) => participant.id,
            minLength: 1,
            maxLength: 20,
          }
        ),
        (totalAmount, participants) => {
          const allocations = distributeTeamQuota(totalAmount, participants)
          const allocatedTotal = allocations.reduce((sum, allocation) => sum + allocation.share, 0)

          expect(Math.round(allocatedTotal * 100)).toBe(Math.round(Math.max(0, totalAmount) * 100))
          allocations.forEach((allocation) => {
            expect(allocation.share).toBeGreaterThanOrEqual(0)
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('keeps progress indicators bounded while preserving overachievement in the raw metric', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
        (targetAmount, achievedAmount) => {
          const progress = calculateQuotaProgress(targetAmount, achievedAmount)

          expect(progress.cappedPercentage).toBeGreaterThanOrEqual(0)
          expect(progress.cappedPercentage).toBeLessThanOrEqual(100)
          expect(progress.rawPercentage).toBeGreaterThanOrEqual(0)
          expect(progress.cappedPercentage).toBeLessThanOrEqual(progress.rawPercentage)

          if (achievedAmount <= targetAmount) {
            expect(progress.rawPercentage).toBeLessThanOrEqual(100)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('redistributes absent quota without shrinking the total quota assigned to the PDV', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
        fc.uniqueArray(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 12 }),
            factor: fc.float({ min: 0, max: 100, noNaN: true }),
          }),
          {
            selector: (participant) => participant.id,
            minLength: 1,
            maxLength: 20,
          }
        ),
        fc.uniqueArray(fc.nat({ max: 19 }), { maxLength: 20 }),
        (totalAmount, participants, absentIndexes) => {
          const absentParticipantIds = absentIndexes
            .map((index) => participants[index]?.id)
            .filter((value): value is string => Boolean(value))
          const allocations = redistributeQuotaForAbsence(totalAmount, participants, absentParticipantIds)
          const allocatedTotal = allocations.reduce((sum, allocation) => sum + allocation.share, 0)
          const presentIds = new Set(participants.map((participant) => participant.id))

          absentParticipantIds.forEach((id) => {
            presentIds.delete(id)
          })

          expect(Math.round(allocatedTotal * 100)).toBe(
            presentIds.size > 0 ? Math.round(Math.max(0, totalAmount) * 100) : 0
          )
          allocations.forEach((allocation) => {
            expect(absentParticipantIds).not.toContain(allocation.id)
            expect(allocation.share).toBeGreaterThanOrEqual(0)
          })
        }
      ),
      { numRuns: 100 }
    )
  })
})