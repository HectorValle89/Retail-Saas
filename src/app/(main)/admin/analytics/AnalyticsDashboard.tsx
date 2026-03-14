'use client'

import { Card } from '@/components/ui/card'

interface LawyerMetric {
  id: string
  name: string
  appointments: number
  completed: number
  revenue: number
  hoursWorked: number
  utilizationRate: number
  hourlyRate: number
}

interface AnalyticsStats {
  revenue: {
    current: number
    previous: number
    change: number
  }
  appointments: {
    current: number
    previous: number
    change: number
  }
  clients: {
    new: number
    previousNew: number
  }
  conversionRate: number
  accountsReceivable: number
  lawyerMetrics: LawyerMetric[]
}

export function AnalyticsDashboard({ stats }: { stats: AnalyticsStats }) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount)

  const formatPercent = (value: number) =>
    `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-foreground-secondary mt-1">
          Métricas de rendimiento del bufete
        </p>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ingresos */}
        <Card className="p-6 border-l-4 border-secondary-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-foreground-secondary">Ingresos del Mes</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {formatCurrency(stats.revenue.current)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-secondary-100 flex items-center justify-center">
              <CurrencyIcon className="w-6 h-6 text-secondary-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className={`text-sm font-medium ${stats.revenue.change >= 0 ? 'text-success-600' : 'text-error-600'}`}>
              {formatPercent(stats.revenue.change)}
            </span>
            <span className="text-sm text-foreground-secondary">vs mes anterior</span>
          </div>
        </Card>

        {/* Citas */}
        <Card className="p-6 border-l-4 border-accent-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-foreground-secondary">Citas del Mes</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {stats.appointments.current}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-accent-100 flex items-center justify-center">
              <CalendarIcon className="w-6 h-6 text-accent-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className={`text-sm font-medium ${stats.appointments.change >= 0 ? 'text-success-600' : 'text-error-600'}`}>
              {formatPercent(stats.appointments.change)}
            </span>
            <span className="text-sm text-foreground-secondary">vs mes anterior</span>
          </div>
        </Card>

        {/* Nuevos Clientes */}
        <Card className="p-6 border-l-4 border-success-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-foreground-secondary">Nuevos Clientes</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {stats.clients.new}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-success-100 flex items-center justify-center">
              <UsersIcon className="w-6 h-6 text-success-600" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-sm text-foreground-secondary">
              {stats.clients.previousNew} el mes pasado
            </span>
          </div>
        </Card>

        {/* Tasa de Conversión */}
        <Card className="p-6 border-l-4 border-purple-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-foreground-secondary">Tasa de Conversión</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {stats.conversionRate.toFixed(1)}%
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <ChartIcon className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-sm text-foreground-secondary">
              Citas completadas/total
            </span>
          </div>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cuentas por Cobrar */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Salud Financiera</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-warning-50 rounded-xl">
              <div>
                <p className="text-sm text-foreground-secondary">Cuentas por Cobrar</p>
                <p className="text-xl font-bold text-warning-700">{formatCurrency(stats.accountsReceivable)}</p>
              </div>
              <AlertIcon className="w-8 h-8 text-warning-500" />
            </div>

            <div className="flex items-center justify-between p-4 bg-success-50 rounded-xl">
              <div>
                <p className="text-sm text-foreground-secondary">Tasa de Cobranza</p>
                <p className="text-xl font-bold text-success-700">
                  {stats.revenue.current > 0
                    ? ((stats.revenue.current - stats.accountsReceivable) / stats.revenue.current * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
              <CheckIcon className="w-8 h-8 text-success-500" />
            </div>
          </div>
        </Card>

        {/* Rendimiento por Abogado */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-foreground mb-4">Rendimiento por Abogado</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 text-sm font-medium text-foreground-secondary">Abogado</th>
                  <th className="text-center py-3 text-sm font-medium text-foreground-secondary">Citas</th>
                  <th className="text-center py-3 text-sm font-medium text-foreground-secondary">Completadas</th>
                  <th className="text-right py-3 text-sm font-medium text-foreground-secondary">Ingresos</th>
                  <th className="text-right py-3 text-sm font-medium text-foreground-secondary">Utilización</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.lawyerMetrics.map(lawyer => (
                  <tr key={lawyer.id} className="hover:bg-gray-50/50">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary-600">
                            {lawyer.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">{lawyer.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-center text-foreground-secondary">{lawyer.appointments}</td>
                    <td className="py-3 text-center">
                      <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-success-100 text-success-700">
                        {lawyer.completed}
                      </span>
                    </td>
                    <td className="py-3 text-right font-semibold text-secondary-600">
                      {formatCurrency(lawyer.revenue)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-500 rounded-full"
                            style={{ width: `${Math.min(lawyer.utilizationRate, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-foreground-secondary">{lawyer.utilizationRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {stats.lawyerMetrics.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-foreground-secondary">
                      No hay datos de abogados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Alertas */}
      {stats.accountsReceivable > 0 && (
        <Card className="p-4 bg-warning-50 border border-warning-200">
          <div className="flex items-center gap-3">
            <AlertIcon className="w-6 h-6 text-warning-600" />
            <div>
              <p className="font-medium text-warning-800">Cuentas Pendientes de Cobro</p>
              <p className="text-sm text-warning-700">
                Tienes {formatCurrency(stats.accountsReceivable)} en citas completadas pendientes de pago.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// Icons
function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
