const fs = require('node:fs')
const path = require('node:path')

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const entries = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    entries[key] = value
  }

  return entries
}

async function main() {
  const cwd = process.cwd()
  const env = {
    ...readEnvFile(path.join(cwd, '.env.local')),
    ...process.env,
  }

  const provider = String(env.PDF_COMPRESSION_PROVIDER || 'local').trim().toLowerCase()
  const baseUrl = String(env.STIRLING_PDF_BASE_URL || '').trim().replace(/\/+$/g, '')
  const apiKey = String(env.STIRLING_PDF_API_KEY || '').trim()

  if (provider !== 'stirling') {
    console.log('PDF provider activo: local')
    process.exit(0)
  }

  if (!baseUrl) {
    console.error('Stirling PDF esta seleccionado, pero falta STIRLING_PDF_BASE_URL.')
    process.exit(1)
  }

  const headers = {}
  if (apiKey) {
    headers['X-API-KEY'] = apiKey
  }

  const endpoints = ['/api/v1/info/status', '/api/v1/health', '/swagger-ui/index.html']

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(2000),
      })

      if (response.ok) {
        console.log(`Stirling PDF disponible en ${baseUrl}${endpoint}`)
        process.exit(0)
      }

      if (response.status === 401 || response.status === 403) {
        console.error(`Stirling PDF responde en ${endpoint}, pero requiere API key valida.`)
        process.exit(1)
      }
    } catch {
      // sigue con el siguiente endpoint
    }
  }

  console.error(`No fue posible alcanzar Stirling PDF en ${baseUrl}.`)
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
