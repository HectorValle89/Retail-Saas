import type { Icon, IconProps } from '@phosphor-icons/react'
import {
  Bell,
  Buildings,
  CalendarBlank,
  CalendarCheck,
  ChartBar,
  ClipboardText,
  Clock,
  EnvelopeSimple,
  FileText,
  GearSix,
  Gift,
  GraduationCap,
  Heartbeat,
  HeartStraight,
  MapPin,
  MapTrifold,
  MegaphoneSimple,
  Package,
  Receipt,
  Scales,
  SealCheck,
  ShoppingBagOpen,
  SquaresFour,
  Storefront,
  TreePalm,
  UserCircleGear,
  UserGear,
  UsersThree,
  Wallet,
  WarningCircle,
  WifiSlash,
} from '@phosphor-icons/react'

export type PremiumIconName =
  | 'arrival'
  | 'assignments'
  | 'attendance'
  | 'calendar'
  | 'campaigns'
  | 'clients'
  | 'clock'
  | 'cumple'
  | 'dashboard'
  | 'employees'
  | 'entrada'
  | 'expenses'
  | 'heart'
  | 'incapacidad'
  | 'mail'
  | 'materials'
  | 'messages'
  | 'module'
  | 'notification'
  | 'offline'
  | 'payroll'
  | 'profile'
  | 'reports'
  | 'requests'
  | 'route'
  | 'rules'
  | 'sales'
  | 'settings'
  | 'store-pin'
  | 'stores'
  | 'training'
  | 'users'
  | 'vacaciones'
  | 'ventas'
  | 'love'
  | 'warning'

type PremiumLineIconProps = {
  name: PremiumIconName
  className?: string
  stroke?: string
  strokeWidth?: number
}

const ICON_MAP: Record<PremiumIconName, Icon> = {
  arrival: MapPin,
  assignments: ClipboardText,
  attendance: CalendarCheck,
  calendar: CalendarBlank,
  campaigns: MegaphoneSimple,
  clients: Buildings,
  clock: Clock,
  cumple: Gift,
  dashboard: SquaresFour,
  employees: UsersThree,
  entrada: SealCheck,
  expenses: Receipt,
  heart: HeartStraight,
  incapacidad: Heartbeat,
  love: HeartStraight,
  mail: EnvelopeSimple,
  materials: Package,
  messages: EnvelopeSimple,
  module: SquaresFour,
  notification: Bell,
  offline: WifiSlash,
  payroll: Wallet,
  profile: UserCircleGear,
  reports: ChartBar,
  requests: FileText,
  route: MapTrifold,
  rules: Scales,
  sales: ShoppingBagOpen,
  settings: GearSix,
  'store-pin': MapPin,
  stores: Storefront,
  training: GraduationCap,
  users: UserGear,
  vacaciones: TreePalm,
  ventas: ShoppingBagOpen,
  warning: WarningCircle,
}

export function PremiumLineIcon({
  name,
  className = 'h-6 w-6',
  stroke = 'currentColor',
  strokeWidth,
}: PremiumLineIconProps) {
  const IconComponent = ICON_MAP[name] ?? SquaresFour

  const props: IconProps = {
    className,
    color: stroke,
    weight: strokeWidth && strokeWidth >= 2 ? 'bold' : 'regular',
    'aria-hidden': true,
  }

  return <IconComponent {...props} />
}
