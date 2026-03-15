export interface DashboardStats {
  promotoresActivosHoy: number
  checkInsValidosHoy: number
  ventasConfirmadasHoy: number
  alertasOperativas: number
}

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    return {
      promotoresActivosHoy: 0,
      checkInsValidosHoy: 0,
      ventasConfirmadasHoy: 0,
      alertasOperativas: 0,
    }
  },
}
