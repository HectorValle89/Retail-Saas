import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-[var(--module-primary)] text-white
    hover:bg-[var(--module-hover)] active:bg-[var(--module-hover)]
    shadow-[0_4px_12px_var(--module-shadow)] hover:shadow-[0_8px_18px_var(--module-shadow)]
  `,
  secondary: `
    bg-surface-subtle text-foreground
    border border-border/80
    hover:bg-white hover:border-primary-200 active:bg-surface-muted
    shadow-none
  `,
  outline: `
    bg-white text-[var(--module-text)]
    border border-[var(--module-border)]
    hover:bg-[var(--module-soft-bg)] hover:border-[var(--module-border)] active:bg-[var(--module-soft-bg)]
    shadow-none
  `,
  ghost: `
    bg-transparent text-foreground
    hover:bg-surface-subtle active:bg-surface-muted
  `,
  danger: `
    bg-gradient-to-b from-error-500 to-error-600 text-white
    hover:from-error-600 hover:to-error-700 active:from-error-700 active:to-error-700
    shadow-[0_4px_12px_rgba(239,68,68,0.14)] hover:shadow-[0_8px_18px_rgba(239,68,68,0.18)]
  `,
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3.5 py-2 text-sm gap-1.5',
  md: 'min-h-11 px-4.5 py-2.5 text-sm gap-2',
  lg: 'min-h-12 px-6 py-3 text-base gap-2.5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center
          rounded-[14px] font-medium
          transition-all duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-focus-ring)] focus-visible:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {isLoading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
