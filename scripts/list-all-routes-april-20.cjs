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

  console.log('--- Listando todas las rutas de la semana 2026-04-20 ---')
  const { data: rutas } = await supabase
    .from('ruta_semanal')
    .select('id, supervisor_empleado_id, estatus, semana_inicio')
    .eq('semana_inicio', '2026-04-20')

  console.log('Rutas:', rutas)

  if (rutas && rutas.length > 0) {
    for (const r of rutas) {
      const { data: emp } = await supabase
        .from('empleado')
        .select('id, nombre_completo, puesto')
        .eq('id', r.supervisor_empleado_id)
        .single()
      
      console.log(`Ruta ${r.id} es de: ${emp?.nombre_completo ?? 'Desconocido'} (${r.supervisor_empleado_id})`)
      
      const { data: visitas } = await supabase
        .from('ruta_semanal_visita')
        .select('id, dia_semana, orden, estatus, pdv_id')
        .eq('ruta_semanal_id', r.id)
      
      console.log(`Visitas (${visitas?.length ?? 0}):`, visitas)
      
      // Check for duplicates in the data itself
      const seen = new Set()
      const dups = []
      visitas?.forEach(v => {
        const key = `${v.dia_semana}:${v.orden}`
        if (seen.has(key)) dups.push(v)
        seen.add(key)
      })
      if (dups.length > 0) console.log('¡DUPLICADOS EN DB!', dups)
    }
  }
}

main().catch(console.error)
