export interface QuotaParticipant {
  id: string
  factor: number
}

export interface QuotaAllocation {
  id: string
  factor: number
  share: number
}

export interface QuotaProgress {
  targetAmount: number
  achievedAmount: number
  rawPercentage: number
  cappedPercentage: number
}

function normalizeFactor(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function roundToCents(value: number) {
  return Math.round(value * 100)
}

function normalizeAmount(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function distributeTeamQuota(
  totalAmount: number,
  participants: QuotaParticipant[]
): QuotaAllocation[] {
  const totalCents = roundToCents(normalizeAmount(totalAmount))

  if (participants.length === 0) {
    return []
  }

  const normalized = participants.map((participant) => ({
    ...participant,
    factor: normalizeFactor(participant.factor),
  }))

  const totalFactor = normalized.reduce((sum, participant) => sum + participant.factor, 0)
  const fallbackWeight = totalFactor > 0 ? null : 1 / normalized.length

  const provisional = normalized.map((participant) => {
    const weight = totalFactor > 0 ? participant.factor / totalFactor : fallbackWeight ?? 0
    const rawShareCents = totalCents * weight
    const flooredShareCents = Math.floor(rawShareCents)

    return {
      id: participant.id,
      factor: participant.factor,
      flooredShareCents,
      remainder: rawShareCents - flooredShareCents,
    }
  })

  let remainderCents =
    totalCents - provisional.reduce((sum, participant) => sum + participant.flooredShareCents, 0)

  provisional
    .sort((left, right) => {
      if (right.remainder === left.remainder) {
        return left.id.localeCompare(right.id)
      }

      return right.remainder - left.remainder
    })
    .forEach((participant) => {
      if (remainderCents <= 0) {
        return
      }

      participant.flooredShareCents += 1
      remainderCents -= 1
    })

  return provisional
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((participant) => ({
      id: participant.id,
      factor: participant.factor,
      share: participant.flooredShareCents / 100,
    }))
}

export function calculateQuotaProgress(
  targetAmount: number,
  achievedAmount: number
): QuotaProgress {
  const normalizedTarget = normalizeAmount(targetAmount)
  const normalizedAchieved = normalizeAmount(achievedAmount)

  if (normalizedTarget <= 0) {
    return {
      targetAmount: normalizedTarget,
      achievedAmount: normalizedAchieved,
      rawPercentage: 0,
      cappedPercentage: 0,
    }
  }

  const rawPercentage = (normalizedAchieved / normalizedTarget) * 100

  return {
    targetAmount: normalizedTarget,
    achievedAmount: normalizedAchieved,
    rawPercentage,
    cappedPercentage: Math.min(rawPercentage, 100),
  }
}

export function redistributeQuotaForAbsence(
  totalAmount: number,
  participants: QuotaParticipant[],
  absentParticipantIds: string[]
): QuotaAllocation[] {
  const absentIds = new Set(absentParticipantIds)
  const presentParticipants = participants.filter((participant) => !absentIds.has(participant.id))

  return distributeTeamQuota(totalAmount, presentParticipants)
}