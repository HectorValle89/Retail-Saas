/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process')

const ROOT = process.cwd()
const CANONICAL_TASKS = '.kiro/specs/field-force-platform/tasks.md'
const IMPLEMENTATION_PREFIXES = [
  'src/',
  'supabase/migrations/',
  'supabase/seed.sql',
  'scripts/',
  'tests/',
  'e2e/',
  'public/',
  'tools/',
]

function run(command) {
  try {
    return execSync(command, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function getStagedFiles() {
  const output = run('git diff --cached --name-only --diff-filter=ACMR')
  if (!output) {
    return []
  }

  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function getStagedTasksDiff() {
  return run(`git diff --cached --unified=0 -- "${CANONICAL_TASKS}"`)
}

function marksTasksAsCompleted(diff) {
  if (!diff) {
    return false
  }

  const lines = diff.split(/\r?\n/)
  let hasUncheckedRemoval = false

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      continue
    }

    if (line.startsWith('-') && /- \[ \]/.test(line)) {
      hasUncheckedRemoval = true
      continue
    }

    if (hasUncheckedRemoval && line.startsWith('+') && /\+.*- \[x\]/i.test(line)) {
      return true
    }
  }

  return false
}

function hasImplementationWork(files) {
  return files.some((file) =>
    IMPLEMENTATION_PREFIXES.some((prefix) => file === prefix || file.startsWith(prefix)),
  )
}

const stagedFiles = getStagedFiles()
const tasksChanged = stagedFiles.includes(CANONICAL_TASKS)

if (!tasksChanged) {
  console.log('No hay cambios staged en tasks.md; verificacion de reconciliacion omitida.')
  process.exit(0)
}

const diff = getStagedTasksDiff()
const completesTasks = marksTasksAsCompleted(diff)

if (!completesTasks) {
  console.log('tasks.md staged sin nuevos items marcados como completos; verificacion conservadora superada.')
  process.exit(0)
}

if (hasImplementationWork(stagedFiles)) {
  console.log('tasks.md marca trabajo completado y existen cambios staged de implementacion; verificacion superada.')
  process.exit(0)
}

console.error('Pre-commit bloqueado: tasks.md marca items como completados sin cambios reales staged en implementacion.')
console.error('Se esperan cambios staged en src/, supabase/migrations/, supabase/seed.sql, scripts/, tests/, e2e/, public/ o tools/.')
process.exit(1)
