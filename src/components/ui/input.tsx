import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground-tertiary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full rounded-[12px] border px-4 py-3
            bg-surface-subtle text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]
            placeholder:text-foreground-muted
            transition-all duration-200
            focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] focus:border-[var(--module-primary)]
            disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-muted
            ${error ? 'border-error-400 focus:ring-error-100 focus:border-error-400' : 'border-border hover:border-primary-200'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-error-500">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-sm text-foreground-muted">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
