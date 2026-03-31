interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'module'
  className?: string
}

const variantStyles = {
  default: 'bg-slate-100 text-slate-700',
  pending: 'bg-warning-100 text-warning-700',
  confirmed: 'bg-success-100 text-success-700',
  cancelled: 'bg-error-100 text-error-700',
  completed: 'bg-primary-100 text-primary-700',
  module: 'bg-[var(--module-soft-bg)] text-[var(--module-text)] shadow-[inset_0_0_0_1px_var(--module-border)]',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.04em] ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  )
}
