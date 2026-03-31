export interface DashboardFilterShape {
  periodo: string
  estado: string
  zona: string
  supervisorId: string
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFilterShape = {
  periodo: '',
  estado: '',
  zona: '',
  supervisorId: '',
}

export function buildDashboardHref(
  filters: DashboardFilterShape,
  overrides: Partial<DashboardFilterShape> = {}
) {
  const next = { ...filters, ...overrides }
  const params = new URLSearchParams()

  const entries: Array<[keyof DashboardFilterShape, string]> = [
    ['periodo', next.periodo],
    ['estado', next.estado],
    ['zona', next.zona],
    ['supervisorId', next.supervisorId],
  ]

  for (const [key, value] of entries) {
    if (value) {
      params.set(key, value)
    }
  }

  const query = params.toString()
  return query ? `/dashboard?${query}` : '/dashboard'
}
