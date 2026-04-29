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

  console.log('--- Verificando estado de la ruta de Hector para el 20 de Abril ---')
  const { data: rutas } = await supabase
    .from('ruta_semanal')
    .select('id, estatus, approval_state, semana_inicio, supervisor_empleado_id')
    .eq('semana_inicio', '2026-04-20')

  console.log('Rutas:', rutas)

  if (rutas) {
    for (const r of rutas) {
      const { data: count } = await supabase
        .from('ruta_semanal_visita')
        .select('id', { count: 'exact', head: true })
        .eq('ruta_semanal_id', r.id)
      
      console.log(`Ruta ${r.id}: Estatus=${r.estatus}, Aprobacion=${r.approval_state}, Visitas=${count}`)
    }
  }
}

main().catch(console.error)
