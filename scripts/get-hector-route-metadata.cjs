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

  const supervisorId = '23e6f53f-7fed-40be-8a75-db89d99158f1'
  const weekStart = '2026-04-20'
  
  console.log(`--- Buscando fucha de ruta para supervisor ${supervisorId} semana ${weekStart} ---`)
  const { data: rutas, error } = await supabase
    .from('ruta_semanal')
    .select('id, estatus, metadata')
    .eq('supervisor_empleado_id', supervisorId)
    .eq('semana_inicio', weekStart)
  
  if (error) console.error('Error:', error)
  console.log('Rutas:', rutas)
}

main().catch(console.error)
