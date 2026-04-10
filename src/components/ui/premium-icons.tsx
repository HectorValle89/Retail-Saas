'use client'

import type { CSSProperties } from 'react'

export type PremiumIconName =
  | 'absence'
  | 'alert'
  | 'arrival'
  | 'assignments'
  | 'attendance'
  | 'calendar'
  | 'campaigns'
  | 'checkin'
  | 'clients'
  | 'clock'
  | 'cumple'
  | 'dashboard'
  | 'draft'
  | 'employees'
  | 'entrada'
  | 'expenses'
  | 'geofence'
  | 'heart'
  | 'incapacidad'
  | 'mail'
  | 'map'
  | 'materials'
  | 'messages'
  | 'missing-visit'
  | 'module'
  | 'money'
  | 'notification'
  | 'offline'
  | 'payroll'
  | 'pending'
  | 'profile'
  | 'qr'
  | 'reports'
  | 'requests'
  | 'route'
  | 'rules'
  | 'sales'
  | 'settings'
  | 'store-pin'
  | 'stores'
  | 'sync'
  | 'target'
  | 'training'
  | 'users'
  | 'vacaciones'
  | 'ventas'
  | 'love'
  | 'warning'

export type PremiumIconVariant = 'outline' | 'fill'

type PremiumLineIconProps = {
  name: PremiumIconName
  className?: string
  stroke?: string
  strokeWidth?: number
  variant?: PremiumIconVariant
}

type IconDefinition = {
  outline: string
  fill?: string
}

const ICON_MAP: Record<PremiumIconName, IconDefinition> = {
  absence: { outline: 'person-x', fill: 'person-x-fill' },
  alert: { outline: 'bell', fill: 'bell-fill' },
  arrival: { outline: 'pin-angle-fill', fill: 'pin-angle-fill' },
  assignments: { outline: 'clipboard-check', fill: 'clipboard-check-fill' },
  attendance: { outline: 'person-check', fill: 'person-check-fill' },
  calendar: { outline: 'calendar3-range', fill: 'calendar3-range-fill' },
  campaigns: { outline: 'broadcast', fill: 'broadcast' },
  checkin: { outline: 'pin-angle-fill', fill: 'pin-angle-fill' },
  clients: { outline: 'buildings', fill: 'buildings-fill' },
  clock: { outline: 'hourglass-split', fill: 'hourglass-split' },
  cumple: { outline: 'bullseye', fill: 'bullseye' },
  dashboard: { outline: 'speedometer2', fill: 'speedometer2' },
  draft: { outline: 'pencil-square', fill: 'pencil-square' },
  employees: { outline: 'people', fill: 'people-fill' },
  entrada: { outline: 'person-check', fill: 'person-check-fill' },
  expenses: { outline: 'receipt', fill: 'receipt' },
  geofence: { outline: 'node-plus', fill: 'node-plus-fill' },
  heart: { outline: 'heart', fill: 'heart-fill' },
  incapacidad: { outline: 'bandaid', fill: 'bandaid-fill' },
  love: { outline: 'heart', fill: 'heart-fill' },
  mail: { outline: 'envelope', fill: 'envelope-fill' },
  map: { outline: 'map', fill: 'map-fill' },
  materials: { outline: 'box-seam', fill: 'box-seam-fill' },
  messages: { outline: 'chat-left-text', fill: 'chat-left-text-fill' },
  'missing-visit': { outline: 'geo-fill', fill: 'geo-fill' },
  module: { outline: 'grid-1x2', fill: 'grid-1x2-fill' },
  money: { outline: 'currency-dollar', fill: 'currency-dollar' },
  notification: { outline: 'bell', fill: 'bell-fill' },
  offline: { outline: 'wifi-off', fill: 'wifi-off' },
  payroll: { outline: 'wallet2', fill: 'wallet2' },
  pending: { outline: 'clipboard-pulse', fill: 'clipboard-pulse' },
  profile: { outline: 'person-badge', fill: 'person-badge-fill' },
  qr: { outline: 'qr-code-scan', fill: 'qr-code' },
  reports: { outline: 'bar-chart-line', fill: 'bar-chart-line-fill' },
  requests: { outline: 'clipboard-pulse', fill: 'clipboard-pulse' },
  route: { outline: 'signpost-split', fill: 'signpost-split-fill' },
  rules: { outline: 'sliders', fill: 'sliders' },
  sales: { outline: 'cart-check', fill: 'cart-check-fill' },
  settings: { outline: 'sliders', fill: 'sliders2' },
  'store-pin': { outline: 'geo-fill', fill: 'geo-fill' },
  stores: { outline: 'shop', fill: 'shop' },
  sync: { outline: 'cloud-arrow-up', fill: 'cloud-arrow-up-fill' },
  target: { outline: 'bullseye', fill: 'bullseye' },
  training: { outline: 'mortarboard', fill: 'mortarboard-fill' },
  users: { outline: 'person-gear', fill: 'person-gear' },
  vacaciones: { outline: 'sun', fill: 'sun-fill' },
  ventas: { outline: 'cart-check', fill: 'cart-check-fill' },
  warning: { outline: 'clipboard-pulse', fill: 'clipboard-pulse' },
}

export function PremiumLineIcon({
  name,
  className = 'h-6 w-6',
  stroke = 'currentColor',
  strokeWidth,
  variant = 'outline',
}: PremiumLineIconProps) {
  const icon = ICON_MAP[name] ?? ICON_MAP.module
  const iconName = variant === 'fill' && icon.fill ? icon.fill : icon.outline
  const style = {
    color: stroke,
    fontSize: strokeWidth && strokeWidth >= 2 ? '1.05em' : '1em',
  } satisfies CSSProperties

  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}>
      <i className={`bi bi-${iconName} leading-none`} style={style} />
    </span>
  )
}
