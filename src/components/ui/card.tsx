import { forwardRef, type HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered' | 'gold-accent'
  clickable?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantStyles = {
  default: 'bg-surface shadow-card',
  elevated: 'bg-surface shadow-elevated',
  bordered: 'bg-surface border border-border/70 shadow-card',
  'gold-accent': 'bg-surface shadow-card gold-accent pl-6',
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', clickable = false, padding = 'md', className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-[20px] transition-all duration-200 ${variantStyles[variant]} ${paddingStyles[padding]} ${clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-card-hover' : ''} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={`mb-5 ${className}`} {...props}>{children}</div>
  )
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className = '', children, ...props }, ref) => (
    <h3 ref={ref} className={`font-heading text-xl font-semibold tracking-tight text-foreground ${className}`} {...props}>{children}</h3>
  )
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className = '', children, ...props }, ref) => (
    <p ref={ref} className={`mt-2 text-sm leading-6 text-foreground-secondary ${className}`} {...props}>{children}</p>
  )
)
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>{children}</div>
  )
)
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={`mt-5 flex items-center gap-3 border-t border-border/60 pt-5 ${className}`} {...props}>{children}</div>
  )
)
CardFooter.displayName = 'CardFooter'
