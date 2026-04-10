'use client'

import { Input } from '@/components/ui/input'
import { compressImageForUpload, type CompressionOptions } from '@/lib/storage/clientImageCompression'
import { useRef, useState, type InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  compressionOptions?: CompressionOptions
  /** Si es true, usa un <input> nativo de HTML en lugar del componente <Input> de Diseño */
  useNativeInput?: boolean 
}

/**
 * Envoltorio inteligente para Inputs de Archivo.
 * Intercepta de forma automática cualquier foto que la usuaria haya seleccionado,
 * la encoge silenciosamente usando Web Workers, y la reinyecta a tiempo
 * para que cuando la usuaria toque "Subir", el archivo grande nunca salga del celular.
 */
export function ClientImageFileInput({ 
  onChange, 
  compressionOptions, 
  useNativeInput = false, 
...props 
}: Props) {
  const [isCompressing, setIsCompressing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) {
      if (onChange) onChange(e)
      return
    }

    setIsCompressing(true)
    try {
      const dataTransfer = new DataTransfer()
      
      // Comprimir cada archivo seleccionado (Soporta `multiple`)
      for (const file of Array.from(e.target.files)) {
        if (file.type.startsWith('image/')) {
          const compressed = await compressImageForUpload(file, compressionOptions)
          dataTransfer.items.add(compressed)
        } else {
          // Si suben un PDF o algo que no sea imagen, lo pasamos intacto
          dataTransfer.items.add(file)
        }
      }
      
      // Magia: Sobreescribimos la propiedad nativa de solo-lectura del Nodo DOM
      // De esta forma los FormData y ServerActions leerán los archivos compactados
      e.target.files = dataTransfer.files
    } catch (err) {
      console.error('Error en el pipeline de compresión de UI:', err)
    } finally {
      setIsCompressing(false)
      // Si el componente padre tenía su propio onChange, lo llamamos ahora con los archivos frescos
      if (onChange) onChange(e)
    }
  }

  // Prevenimos interacciones y bajamos la opacidad mientras comprimimos
  const styleStr = isCompressing ? { opacity: 0.5, pointerEvents: 'none' as const, ...props.style } : props.style

  const combinedProps = {
    ...props,
    type: 'file',
    onChange: handleChange,
    ref: inputRef,
    style: styleStr,
  }

  return useNativeInput ? (
    <input {...combinedProps} />
  ) : (
    <Input {...combinedProps as any} hint={isCompressing ? 'Optimizando archivo en el equipo...' : props.hint} />
  )
}
