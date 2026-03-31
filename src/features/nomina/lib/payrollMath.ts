export type PayrollMovementType = 'PERCEPCION' | 'DEDUCCION' | 'AJUSTE'

export interface PayrollLedgerMovement {
  tipo: PayrollMovementType
  monto: number
}

export interface PayrollTotals {
  percepciones: number
  deducciones: number
  ajustes: number
}

export interface PayrollNetInput extends PayrollTotals {
  bonoEstimado: number
}

export interface PayrollOperationalInput {
  sueldoBaseMensual: number | null
  jornadasValidadas: number
  montoConfirmado: number
  aplicaBonoCumplimiento: boolean
  bonoCumplimientoPct: number
  bonoCuota: number
  retardos: number
  deduccionFaltas: number
  deduccionRetardoPct: number
  imssPct: number
  isrPct: number
  ledgerPercepciones: number
  ledgerDeducciones: number
  ledgerAjustes: number
}

export interface PayrollOperationalBreakdown {
  sueldoBaseDiario: number
  sueldoBaseDevengado: number
  comisionVentas: number
  bonoCuotaAplicado: number
  percepciones: number
  deduccionFaltas: number
  deduccionRetardos: number
  deduccionImss: number
  deduccionIsr: number
  deducciones: number
  ajustes: number
  neto: number
}

function normalizeAmount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2))
}

export function calculateLedgerTotals(movements: PayrollLedgerMovement[]): PayrollTotals {
  return movements.reduce<PayrollTotals>(
    (totals, movement) => {
      const amount = normalizeAmount(movement.monto)

      if (movement.tipo === 'PERCEPCION') {
        totals.percepciones += amount
      } else if (movement.tipo === 'DEDUCCION') {
        totals.deducciones += amount
      } else {
        totals.ajustes += amount
      }

      return totals
    },
    {
      percepciones: 0,
      deducciones: 0,
      ajustes: 0,
    }
  )
}

export function calculatePayrollNet(input: PayrollNetInput) {
  return (
    normalizeAmount(input.percepciones) +
    normalizeAmount(input.ajustes) +
    normalizeAmount(input.bonoEstimado) -
    normalizeAmount(input.deducciones)
  )
}

export function calculateOperationalPayroll(input: PayrollOperationalInput): PayrollOperationalBreakdown {
  const sueldoBaseDiario = roundCurrency(normalizeAmount(input.sueldoBaseMensual) / 30)
  const sueldoBaseDevengado = roundCurrency(sueldoBaseDiario * Math.max(0, input.jornadasValidadas))
  const comisionVentas = input.aplicaBonoCumplimiento
    ? roundCurrency(normalizeAmount(input.montoConfirmado) * (normalizeAmount(input.bonoCumplimientoPct) / 100))
    : 0
  const bonoCuotaAplicado = input.aplicaBonoCumplimiento ? roundCurrency(normalizeAmount(input.bonoCuota)) : 0
  const ledgerPercepciones = roundCurrency(normalizeAmount(input.ledgerPercepciones))
  const ledgerDeducciones = roundCurrency(normalizeAmount(input.ledgerDeducciones))
  const ledgerAjustes = roundCurrency(normalizeAmount(input.ledgerAjustes))
  const deduccionFaltas = roundCurrency(normalizeAmount(input.deduccionFaltas))
  const deduccionRetardos = roundCurrency(
    sueldoBaseDiario * Math.max(0, input.retardos) * (normalizeAmount(input.deduccionRetardoPct) / 100)
  )

  const percepciones = roundCurrency(
    sueldoBaseDevengado + comisionVentas + bonoCuotaAplicado + ledgerPercepciones
  )
  const baseGravable = roundCurrency(percepciones + ledgerAjustes)
  const deduccionImss = roundCurrency(baseGravable * (normalizeAmount(input.imssPct) / 100))
  const deduccionIsr = roundCurrency(
    Math.max(0, baseGravable - deduccionImss) * (normalizeAmount(input.isrPct) / 100)
  )
  const deducciones = roundCurrency(
    deduccionFaltas + deduccionRetardos + deduccionImss + deduccionIsr + ledgerDeducciones
  )
  const neto = roundCurrency(percepciones + ledgerAjustes - deducciones)

  return {
    sueldoBaseDiario,
    sueldoBaseDevengado,
    comisionVentas,
    bonoCuotaAplicado,
    percepciones,
    deduccionFaltas,
    deduccionRetardos,
    deduccionImss,
    deduccionIsr,
    deducciones,
    ajustes: ledgerAjustes,
    neto,
  }
}