'use server'

import { generateR2UploadUrl } from '@/lib/storage/r2Service'
import { requerirPuestosActivos } from '@/lib/auth/session'

/**
 * Server Action para solicitar a la Boveda un ticket temporal (Presigned URL)
 * que le permitira a la aplicacion web (PWA) mandar archivos director a Cloudflare R2
 * sin colapsar la transferencia de Vercel/Supabase.
 */
export async function crearBoletoSubidaR2(
  fileName: string,
  contentType: string,
  modulo: string
) {
  // Aseguramos que solo el rol operativo valído puede pedir urls de subida
  await requerirPuestosActivos([
    'ADMINISTRADOR',
    'COORDINADOR',
    'SUPERVISOR',
    'DERMOCONSEJERO',
    'RECLUTAMIENTO',
    'NOMINA',
  ])

  // Retornamos de forma segura la llave de entrada temporal 
  const result = await generateR2UploadUrl(fileName, contentType, modulo, 300) // 5 minutos util
  return result
}
