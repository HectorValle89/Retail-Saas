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

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Faltan variables de entorno.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log('--- Verificando restriccion UNIQUE ---')
  const { data, error } = await supabase.rpc('execute_sql_internal', {
    sql_query: "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ruta_semanal_visita_ruta_semanal_id_dia_semana_orden_key'"
  })

  // If RPC is available, use it. Otherwise, assume we can't check directly via SDK unless we have a specialized table.
  // Actually, I can't call execute_sql unless there's an RPC for it.
  
  // Alternative: query the information_schema via standard select if permissions allow (usually they don't for public anon, but service role might)
  
  const { data: constraints, error: constError } = await supabase
    .from('pg_constraint')
    .select('*')
    .eq('conname', 'ruta_semanal_visita_ruta_semanal_id_dia_semana_orden_key')
  
  // pg_constraint is usually not exposed.
  
  console.log('Result:', { data, error, constraints, constError })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
