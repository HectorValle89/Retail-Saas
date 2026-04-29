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

  const rutaId = '5273d02f-0174-45e2-979e-0923425f56cb'
  
  console.log('--- Buscando visitas para la ruta ---')
  const { data: visitas, error } = await supabase
    .from('ruta_semanal_visita')
    .select('id, pdv_id, dia_semana, orden')
    .eq('ruta_semanal_id', rutaId)
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Visitas encontradas:', visitas.length)
    console.log('Detalle:', visitas)
  }
}

main().catch(console.error)
