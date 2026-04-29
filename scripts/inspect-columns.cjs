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

  console.log('--- Inspeccionando columnas de ruta_semanal ---')
  const { data, error } = await supabase.rpc('get_table_columns', { p_table_name: 'ruta_semanal' })
  
  if (error) {
    // If RPC doesn't exist, try query
    const { data: cols, error: err2 } = await supabase.from('ruta_semanal').select().limit(1)
    if (err2) console.error('Error:', err2)
    else console.log('Columnas encontradas via select:', Object.keys(cols[0]))
  } else {
    console.log('Columnas:', data)
  }
}

main().catch(console.error)
