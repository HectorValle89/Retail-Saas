interface SectionHeadingProps {
  label?: string
  title: string
  subtitle?: string
  centered?: boolean
  light?: boolean
}

export function SectionHeading({ label, title, subtitle, centered = true, light = false }: SectionHeadingProps) {
  return (
    <div className={centered ? 'text-center' : ''}>
      {label && (
        <p className={`text-body-sm font-semibold uppercase tracking-widest mb-2 ${light ? 'text-teal-300' : 'text-teal-600'}`}>
          {label}
        </p>
      )}
      <h2 className={`font-heading text-display-md md:text-display-lg mb-4 ${light ? 'text-white' : 'text-gray-900'}`}>
        {title}
      </h2>
      {subtitle && (
        <p className={`text-body-lg max-w-2xl ${centered ? 'mx-auto' : ''} ${light ? 'text-gray-300' : 'text-foreground-secondary'}`}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
