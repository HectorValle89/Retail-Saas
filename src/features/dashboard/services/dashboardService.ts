import { createClient } from '@/lib/supabase/client'

export interface DashboardStats {
  totalProjects: number
  pendingTasks: number
  completedTasks: number
  monthlyRevenue: number
}

export interface AdminDashboardStats {
  totalUsers: number
  activeProjects: number
  monthlyRevenue: number
}

export const dashboardService = {
  async getStats(userId: string, role: string): Promise<DashboardStats> {
    return {
      totalProjects: 0,
      pendingTasks: 0,
      completedTasks: 0,
      monthlyRevenue: 0
    }
  },

  async getAdminStats(): Promise<AdminDashboardStats> {
    return {
      totalUsers: 0,
      activeProjects: 0,
      monthlyRevenue: 0
    }
  },

  async getUpcomingActivities(userId: string, role: string, limit = 5): Promise<any[]> {
    return []
  },

  async getAllUpcomingActivities(limit = 10): Promise<any[]> {
    return []
  }
}
