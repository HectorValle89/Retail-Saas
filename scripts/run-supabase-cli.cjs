const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..')
const npxRoot = path.join(repoRoot, '.npm-cache', '_npx')
const packageSegments = ['node_modules', 'supabase']
const binaryName = process.platform === 'win32' ? 'supabase.exe' : 'supabase'

function getPackageDirCandidates() {
  if (!fs.existsSync(npxRoot)) {
    return []
  }

  return fs
    .readdirSync(npxRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(npxRoot, entry.name, ...packageSegments))
    .filter((candidate) => fs.existsSync(path.join(candidate, 'package.json')))
    .sort((left, right) => {
      const leftTime = fs.statSync(left).mtimeMs
      const rightTime = fs.statSync(right).mtimeMs
      return rightTime - leftTime
    })
}

function ensureBinary(packageDir) {
  const binaryPath = path.join(packageDir, 'bin', binaryName)

  if (fs.existsSync(binaryPath)) {
    return binaryPath
  }

  const installScript = path.join(packageDir, 'scripts', 'postinstall.js')
  if (!fs.existsSync(installScript)) {
    throw new Error('Supabase CLI package found, but postinstall.js is missing.')
  }

  const result = spawnSync(process.execPath, [installScript], {
    cwd: packageDir,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error(`Supabase CLI bootstrap failed with exit code ${result.status ?? 1}.`)
  }

  if (!fs.existsSync(binaryPath)) {
    throw new Error('Supabase CLI bootstrap finished, but the binary was not created.')
  }

  return binaryPath
}

function main() {
  const candidates = getPackageDirCandidates()
  if (candidates.length === 0) {
    throw new Error(
      'No cached Supabase CLI package was found under .npm-cache/_npx. Seed it once before using this wrapper.'
    )
  }

  const binaryPath = ensureBinary(candidates[0])
  const result = spawnSync(binaryPath, process.argv.slice(2), {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  process.exit(result.status ?? 0)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}