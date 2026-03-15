'use server'

import { revalidatePath } from 'next/cache'
import { requerirOperadorNomina } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

interface ActualizarEstadoPeriodoNominaState {
  ok: boolean
  message: string | null
}

export const ESTADO_PERIODO_NOMINA_INICIAL: ActualizarEstadoPeriodoNominaState = {
  ok: false,
  message: null,
}

interface PeriodoNominaEstadoRow {
  id: string
  clave: string
  estado: 'ABIERTO' | 'CERRADO'
}

export async function actualizarEstadoPeriodoNomina(
  _prevState: ActualizarEstadoPeriodoNominaState,
  formData: FormData
): Promise<ActualizarEstadoPeriodoNominaState> {
  await requerirOperadorNomina()

  const periodoId = String(formData.get('periodo_id') ?? '').trim()
  const estadoDestino = String(formData.get('estado_destino') ?? '').trim()

  if (!periodoId) {
    return { ok: false, message: 'El periodo es obligatorio.' }
  }

  if (estadoDestino !== 'ABIERTO' && estadoDestino !== 'CERRADO') {
    return { ok: false, message: 'El estado destino no es valido.' }
  }

  const supabase = await createClient()
  const { data: periodo, error: periodoError } = await supabase
    .from('nomina_periodo')
    .select('id, clave, estado')
    .eq('id', periodoId)
    .maybeSingle()

  if (periodoError || !periodo) {
    return {
      ok: false,
      message: periodoError?.message ?? 'No fue posible encontrar el periodo solicitado.',
    }
  }

  const periodoActual = periodo as PeriodoNominaEstadoRow

  if (periodoActual.estado === estadoDestino) {
    return { ok: true, message: 'El periodo ya tiene ese estado.' }
  }

  if (estadoDestino === 'ABIERTO') {
    const { data: abiertoExistente, error: abiertoError } = await supabase
      .from('nomina_periodo')
      .select('id, clave')
      .eq('estado', 'ABIERTO')
      .neq('id', periodoId)
      .maybeSingle()

    if (abiertoError) {
      return { ok: false, message: abiertoError.message }
    }

    if (abiertoExistente) {
      return {
        ok: false,
        message: `Ya existe un periodo abierto: ${abiertoExistente.clave}.`,
      }
    }
  }

  const updatePayload =
    estadoDestino === 'CERRADO'
      ? {
          estado: 'CERRADO',
          fecha_cierre: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          estado: 'ABIERTO',
          fecha_cierre: null,
          updated_at: new Date().toISOString(),
        }

  const { error: updateError } = await supabase
    .from('nomina_periodo')
    .update(updatePayload)
    .eq('id', periodoId)

  if (updateError) {
    return { ok: false, message: updateError.message }
  }

  revalidatePath('/nomina')
  revalidatePath('/dashboard')

  return {
    ok: true,
    message:
      estadoDestino === 'CERRADO'
        ? `Periodo ${periodoActual.clave} cerrado correctamente.`
        : `Periodo ${periodoActual.clave} reabierto correctamente.`,
  }
}
