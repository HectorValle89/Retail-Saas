const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) {
    return
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (override || !process.env[key]) {
      process.env[key] = value
    }
  }
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))
  loadEnvFile(path.resolve('.dev.vars'), { override: true })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Actor: Test COORDINADOR 01
  const actor = {
    empleadoId: '82cce7e9-bc77-4866-b185-f43fc9f285cd',
    cuentaClienteId: '95f8253c-035b-4ef6-af7a-07e9444f6995',
    puesto: 'COORDINADOR',
    permisos: []
  }

  const semanaActualInicio = '2026-04-13' // Semana de hoy
  const semanaHéctor = '2026-04-20' // Semana del tablero en la captura

  console.log('--- Simulando fetchRutasWithWorkflowSupport para el Coordinador ---')
  
  // Replicando la lógica de fetchRutasWithWorkflowSupport
  const queryLimit = 24
  const baseSelect = 'id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, estatus, metadata'

  // Run 1: Sin filtro de semana
  const { data: result1, error: err1 } = await supabase
    .from('ruta_semanal')
    .select(baseSelect)
    .order('semana_inicio', { ascending: false })
    .limit(queryLimit)

  // Run 2: Con filtro de semana de Héctor (Apr 20)
  const { data: result2, error: err2 } = await supabase
    .from('ruta_semanal')
    .select(baseSelect)
    .eq('semana_inicio', semanaHéctor)
    .order('updated_at', { ascending: false })
    .limit(160)

  const allRutas = [...(result1 || []), ...(result2 || [])]
  const merged = Array.from(new Map(allRutas.map(r => [r.id, r])).values())
    .filter(r => r.cuenta_cliente_id === actor.cuentaClienteId)

  console.log('Total rutas merged:', merged.length)
  merged.forEach(r => {
    console.log(`[${r.semana_inicio}] ID: ${r.id} Status: ${r.estatus} MetaState: ${r.metadata?.approval?.state}`)
  })
}

main().catch(console.error)
