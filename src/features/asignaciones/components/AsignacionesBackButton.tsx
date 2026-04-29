import Link from 'next/link'

interface AsignacionesBackButtonProps {
  href?: string
  label?: string
  className?: string
}

export function AsignacionesBackButton({
  href = '/asignaciones',
  label = 'Volver',
  className = '',
}: AsignacionesBackButtonProps) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 px-4 text-sm font-semibold text-slate-700 shadow-[0_8px_18px_rgba(148,163,184,0.08)] transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 ${className}`}
    >
      ← {label}
    </Link>
  )
}
