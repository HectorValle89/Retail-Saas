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

  console.log('--- Buscando visitas de ruta recientes ---')
  const { data: visitas, error } = await supabase
    .from('ruta_semanal_visita')
    .select('id, ruta_semanal_id, dia_semana, pdv_id, estatus')
    .limit(10)
  
  if (error) console.error('Error:', error)
  console.log('Visitas recientes:', visitas)

  if (visitas && visitas.length > 0) {
    const routeId = visitas[0].ruta_semanal_id
    const { data: ruta } = await supabase
      .from('ruta_semanal')
      .select('*')
      .eq('id', routeId)
      .single()
    
    console.log('Ficha de la ruta encontrada:', ruta)
  }
}

main().catch(console.error)
