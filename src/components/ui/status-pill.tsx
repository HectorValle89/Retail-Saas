import { type ReactNode } from 'react'

export function StatusPill({ label, className }: { label: ReactNode; className: string }) {
  return (
    <span className={`inline-flex shrink-0 self-start rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
