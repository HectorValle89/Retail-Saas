export interface AttendanceMissionCatalogItem {
  id: string
  codigo: string | null
  instruccion: string
  orden: number | null
  peso: number
}

export interface AttendanceMissionSelectionInput {
  empleadoId: string
  pdvId: string
  fechaOperacion: string
  previousMissionId?: string | null
  missions: AttendanceMissionCatalogItem[]
}

export interface AttendanceMissionSelectionResult {
  mission: AttendanceMissionCatalogItem | null
  avoidedImmediateRepeat: boolean
}

function stableHash(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash
}

function sortMissions(missions: AttendanceMissionCatalogItem[]) {
  return [...missions].sort((left, right) => {
    const leftOrder = left.orden ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.orden ?? Number.MAX_SAFE_INTEGER

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    if (left.peso !== right.peso) {
      return right.peso - left.peso
    }

    return left.id.localeCompare(right.id)
  })
}

export function selectAttendanceMission(
  input: AttendanceMissionSelectionInput
): AttendanceMissionSelectionResult {
  const sortedMissions = sortMissions(input.missions)

  if (sortedMissions.length === 0) {
    return {
      mission: null,
      avoidedImmediateRepeat: false,
    }
  }

  const seed = `${input.empleadoId}|${input.pdvId}|${input.fechaOperacion}`
  const preferredIndex = stableHash(seed) % sortedMissions.length
  const preferredMission = sortedMissions[preferredIndex] ?? sortedMissions[0]

  if (
    input.previousMissionId &&
    preferredMission &&
    preferredMission.id === input.previousMissionId &&
    sortedMissions.length > 1
  ) {
    const fallbackMission = sortedMissions.find((mission) => mission.id !== input.previousMissionId)

    return {
      mission: fallbackMission ?? preferredMission,
      avoidedImmediateRepeat: true,
    }
  }

  return {
    mission: preferredMission,
    avoidedImmediateRepeat: false,
  }
}
