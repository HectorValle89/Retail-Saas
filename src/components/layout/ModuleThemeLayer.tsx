'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { getModuleTheme, moduleThemeToStyle, resolveModuleThemeKey } from '@/lib/ui/moduleThemes'

export function ModuleThemeLayer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const theme = getModuleTheme(resolveModuleThemeKey(pathname))

  return (
    <div
      style={moduleThemeToStyle(theme)}
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,_var(--module-soft-bg),_transparent_20%),linear-gradient(180deg,#f8fafc_0%,#f8fafc_100%)]"
    >
      {children}
    </div>
  )
}
