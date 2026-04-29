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

function parseArgs(argv) {
  const args = [...argv]
  const options = {
    apply: false,
    includeBajas: false,
  }

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--apply') {
      options.apply = true
      continue
    }
    if (arg === '--include-bajas') {
      options.includeBajas = true
      continue
    }
  }

  return options
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeMetadata(value) {
  return isPlainObject(value) ? value : {}
}

function summarizeRows(rows) {
  const counts = new Map()
  for (const row of rows) {
    const metadata = normalizeMetadata(row.metadata)
    const workflowStage = String(metadata.workflow_stage ?? 'SIN_ETAPA').trim() || 'SIN_ETAPA'
    const key = `${row.estatus_laboral} | ${workflowStage}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => `${count} x ${key}`)
}

function chunk(items, size) {
  const result = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

async function main() {
  const { apply, includeBajas } = parseArgs(process.argv.slice(2))

  loadEnvFile(path.resolve('.env.local'))
  loadEnvFile(path.resolve('.dev.vars'), { override: true })

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const allowedStatuses = includeBajas ? ['ACTIVO', 'SUSPENDIDO', 'BAJA'] : ['ACTIVO', 'SUSPENDIDO']
  const now = new Date().toISOString()

  const { data: rows, error } = await supabase
    .from('empleado')
    .select('id, nombre_completo, estatus_laboral, expediente_estado, expediente_validado_en, metadata, created_at, updated_at')
    .in('estatus_laboral', allowedStatuses)
    .order('nombre_completo', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const employees = rows ?? []
  const total = employees.length
  const summary = summarizeRows(employees)

  console.log(`Total de expedientes objetivo: ${total}`)
  if (summary.length > 0) {
    console.log('Distribucion actual:')
    for (const line of summary) {
      console.log(`- ${line}`)
    }
  }

  if (!apply) {
    console.log('Modo dry-run. Repite con --apply para ejecutar la actualizacion.')
    console.log('Se conservaran los registros de BAJA salvo que uses --include-bajas.')
    return
  }

  if (employees.length === 0) {
    console.log('No hay expedientes que actualizar.')
    return
  }

  const batches = chunk(employees, 100)
  let updated = 0

  for (const [index, batch] of batches.entries()) {
    await Promise.all(
      batch.map(async (row) => {
        const metadata = normalizeMetadata(row.metadata)
        const { error: batchError } = await supabase
          .from('empleado')
          .update({
            expediente_estado: 'VALIDADO',
            expediente_validado_en: now,
            expediente_validado_por_usuario_id: null,
            updated_at: now,
            metadata: {
              ...metadata,
              workflow_stage: 'ALTA_IMSS_CERRADA',
              admin_access_pending: false,
              admin_access_cerrado_at: now,
            },
          })
          .eq('id', row.id)

        if (batchError) {
          throw new Error(batchError.message)
        }
      })
    )

    updated += batch.length
    console.log(`Actualizados ${updated}/${total} expedientes (${index + 1}/${batches.length})`)
  }

  console.log('Actualizacion masiva completada con exito.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
