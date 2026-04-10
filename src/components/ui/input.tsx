'use client'

import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { compressImageForUpload } from '@/lib/storage/clientImageCompression'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, onChange, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const [isCompressing, setIsCompressing] = useState(false)

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      // Activar compresión transparente si es archivo y hay contenido
      if (props.type === 'file' && e.target.files?.length) {
        setIsCompressing(true)
        try {
          const dataTransfer = new DataTransfer()
          for (const file of Array.from(e.target.files)) {
            if (file.type.startsWith('image/')) {
              const compressed = await compressImageForUpload(file)
              dataTransfer.items.add(compressed)
            } else {
              dataTransfer.items.add(file)
            }
          }
          // Reinyección del archivo encogido al input antes de que el formulario lo lea
          e.target.files = dataTransfer.files
        } catch (err) {
          console.error('Error de compresión transparente:', err)
        } finally {
          setIsCompressing(false)
        }
      }
      // Llamar al onChange original si existía
      if (onChange) onChange(e)
    }

    const combinedStyle = props.type === 'file' && isCompressing 
      ? { opacity: 0.5, pointerEvents: 'none' as const, ...props.style } 
      : props.style

    const dynamicHint = isCompressing ? 'Optimizando archivo en el equipo...' : hint

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
          onChange={handleChange}
          style={combinedStyle}
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
        {dynamicHint && !error && <p className="mt-1.5 text-sm text-foreground-muted">{dynamicHint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
