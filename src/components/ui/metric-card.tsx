import type { CSSProperties, ReactNode } from 'react'
import { Card } from './card'
import { resolveKpiSemantic, type KpiSemanticTone, withAlpha } from './kpi-semantics'
import { PremiumLineIcon } from './premium-icons'

export type MetricCardTone = KpiSemanticTone

interface MetricCardProps {
  label: string
  value: ReactNode
  tone?: MetricCardTone
  className?: string
  labelClassName?: string
  valueClassName?: string
  indicator?: ReactNode
  indicatorClassName?: string
  helper?: ReactNode
  helperClassName?: string
}

const FIXED_TONE_STYLES: Record<
  Exclude<MetricCardTone, 'module'>,
  {
    cardClassName: string
    overlayClassName: string
    indicatorClassName: string
  }
> = {
  emerald: {
    cardClassName: 'border-emerald-100/80',
    overlayClassName: 'bg-gradient-to-b from-emerald-100/95 via-emerald-50/55 to-white',
    indicatorClassName: 'border-emerald-200/80 bg-emerald-100 text-emerald-700',
  },
  rose: {
    cardClassName: 'border-rose-100/80',
    overlayClassName: 'bg-gradient-to-b from-rose-100/95 via-rose-50/55 to-white',
    indicatorClassName: 'border-rose-200/80 bg-rose-100 text-rose-700',
  },
  sky: {
    cardClassName: 'border-sky-100/80',
    overlayClassName: 'bg-gradient-to-b from-sky-100/95 via-sky-50/55 to-white',
    indicatorClassName: 'border-sky-200/80 bg-sky-100 text-sky-700',
  },
  amber: {
    cardClassName: 'border-amber-100/80',
    overlayClassName: 'bg-gradient-to-b from-amber-100/95 via-amber-50/55 to-white',
    indicatorClassName: 'border-amber-200/80 bg-amber-100 text-amber-700',
  },
  violet: {
    cardClassName: 'border-violet-100/80',
    overlayClassName: 'bg-gradient-to-b from-violet-100/95 via-violet-50/55 to-white',
    indicatorClassName: 'border-violet-200/80 bg-violet-100 text-violet-700',
  },
  slate: {
    cardClassName: 'border-slate-200/80',
    overlayClassName: 'bg-gradient-to-b from-slate-100/95 via-slate-50/60 to-white',
    indicatorClassName: 'border-slate-200/80 bg-slate-100 text-slate-600',
  },
}

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function MetricCard({
  label,
  value,
  tone,
  className,
  labelClassName,
  valueClassName,
  indicator,
  indicatorClassName,
  helper,
  helperClassName,
}: MetricCardProps) {
  const semantic = resolveKpiSemantic(label)
  const effectiveTone = tone ?? semantic.tone
  const isModuleTone = effectiveTone === 'module'

  const cardStyle = isModuleTone
    ? ({
        borderColor: 'var(--module-border)',
      } satisfies CSSProperties)
    : undefined

  const overlayStyle = isModuleTone
    ? ({
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--module-primary) 18%, white) 0%, var(--module-soft-bg) 42%, rgba(255, 255, 255, 0.94) 100%)',
      } satisfies CSSProperties)
    : undefined

  const fixedTone = !isModuleTone ? FIXED_TONE_STYLES[effectiveTone] : null
  const semanticIndicatorStyle = !indicator
    ? ({
        borderColor: withAlpha(semantic.color, 0.24),
        backgroundColor: withAlpha(semantic.color, 0.1),
        color: semantic.color,
      } satisfies CSSProperties)
    : undefined
  const resolvedIndicator =
    indicator ?? (
      <PremiumLineIcon
        name={semantic.icon}
        className="h-4 w-4"
        stroke={semantic.color}
        strokeWidth={1.95}
        variant={semantic.variant}
      />
    )

  return (
    <Card
      className={joinClasses(
        'relative min-h-[58px] overflow-hidden rounded-[16px] border bg-white/98 px-3 py-2.5 shadow-[0_8px_18px_rgba(148,163,184,0.1)] backdrop-blur-sm',
        fixedTone?.cardClassName,
        className
      )}
      style={cardStyle}
    >
      <div
        className={joinClasses('pointer-events-none absolute inset-x-0 top-0 h-[52%]', fixedTone?.overlayClassName)}
        style={overlayStyle}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={joinClasses(
              'truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500',
              labelClassName
            )}
          >
            {label}
          </p>
          {helper ? (
            <div className="mt-1 grid grid-cols-[auto,1fr] items-end gap-x-2 gap-y-0.5">
              <p
                className={joinClasses(
                  'min-w-[24px] text-[1.15rem] font-semibold leading-none tracking-[-0.03em] text-slate-950 sm:text-[1.25rem]',
                  valueClassName
                )}
              >
                {value}
              </p>
              <div
                className={joinClasses(
                  'min-w-0 line-clamp-2 text-[10px] leading-3.5 text-slate-500',
                  helperClassName
                )}
              >
                {helper}
              </div>
            </div>
          ) : (
            <p
              className={joinClasses(
                'mt-1 text-[1.15rem] font-semibold leading-none tracking-[-0.03em] text-slate-950 sm:text-[1.25rem]',
                valueClassName
              )}
            >
              {value}
            </p>
          )}
        </div>
        {resolvedIndicator ? (
          <span
            className={joinClasses(
              'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[8px]',
              indicator ? fixedTone?.indicatorClassName : undefined,
              indicatorClassName
            )}
            style={semanticIndicatorStyle}
          >
            {resolvedIndicator}
          </span>
        ) : null}
      </div>
    </Card>
  )
}
