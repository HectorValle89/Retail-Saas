'use client'

interface ToastBannerProps {
  tone?: 'success' | 'error' | 'info'
  message: string
}

export function ToastBanner({ tone = 'success', message }: ToastBannerProps) {
  const toneClasses =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-sky-200 bg-sky-50 text-sky-900'

  return (
    <div className={`fixed inset-x-4 bottom-5 z-[95] rounded-[18px] border px-4 py-3 text-sm font-medium shadow-[0_12px_26px_rgba(15,23,42,0.12)] sm:inset-x-auto sm:right-6 sm:w-[360px] ${toneClasses}`}>
      {message}
    </div>
  )
}
