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

  console.log('--- Buscando empleados por nombre y rutas de Abril ---')
  const { data: emps } = await supabase
    .from('empleado')
    .select('id, nombre_completo, puesto, usuario_id')
    .ilike('nombre_completo', '%Hector%')

  console.log('Empleados encontrados:', emps)

  if (emps && emps.length > 0) {
    for (const emp of emps) {
      const { data: rutas } = await supabase
        .from('ruta_semanal')
        .select('id, estatus, semana_inicio')
        .eq('supervisor_empleado_id', emp.id)
        .gte('semana_inicio', '2026-04-01')
      
      console.log(`Rutas para ${emp.nombre_completo}:`, rutas)
      
      if (rutas) {
        for (const r of rutas) {
          const { data: visitas } = await supabase
            .from('ruta_semanal_visita')
            .select('id, dia_semana, orden, estatus, pdv_id')
            .eq('ruta_semanal_id', r.id)
          
          console.log(`Visitas para ruta ${r.id}:`, visitas)
        }
      }
    }
  }
}

main().catch(console.error)
