import { forwardRef, type SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string; label: string }>
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')
    
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground-tertiary">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            w-full rounded-[12px] border px-4 py-3
            bg-surface-subtle text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]
            transition-all duration-200
            focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] focus:border-[var(--module-primary)]
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-error-400 focus:ring-error-100 focus:border-error-400' : 'border-border hover:border-primary-200'}
            ${className}
          `}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1.5 text-sm text-error-500">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'
