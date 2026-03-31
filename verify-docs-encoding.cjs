/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = process.cwd()
const RAW_ARGS = process.argv.slice(2)
const CHECK_STAGED = RAW_ARGS.includes('--staged')
const INPUT_PATHS = RAW_ARGS.filter((arg) => arg !== '--staged')
const EXCLUDED_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'test-results',
  'tmp',
])

const TARGET_EXTENSIONS = new Set([
  '.md',
  '.sql',
  '.toml',
  '.json',
  '.yml',
  '.yaml',
  '.ts',
  '.tsx',
  '.js',
  '.cjs',
  '.mjs',
  '.css',
])

const EXTRA_FILENAMES = new Set([
  '.env.local.example',
  '.env.example',
  '.env',
  '.gitattributes',
  '.editorconfig',
])

function shouldScan(fileName) {
  return TARGET_EXTENSIONS.has(path.extname(fileName)) || EXTRA_FILENAMES.has(path.basename(fileName))
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), files)
      }
      continue
    }

    if (shouldScan(entry.name)) {
      files.push(path.join(dir, entry.name))
    }
  }
}

function hasForbiddenControlChars(text) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    const isAllowed = code === 9 || code === 10 || code === 13
    if (code < 32 && !isAllowed) {
      return { index, code }
    }
  }
  return null
}

const files = []

function collectFilesFromArgs() {
  return INPUT_PATHS
    .map((inputPath) => path.resolve(ROOT, inputPath))
    .filter((filePath) => fs.existsSync(filePath) && shouldScan(filePath))
}

function collectFilesFromGitStatus() {
  try {
    const output = execSync('git status --porcelain', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    return output
      .split(/\r?\n/)
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((file) => path.join(ROOT, file))
      .filter((file) => fs.existsSync(file) && shouldScan(file))
  } catch {
    return []
  }
}

function collectFilesFromGitStaged() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((file) => path.join(ROOT, file))
      .filter((file) => fs.existsSync(file) && shouldScan(file))
  } catch {
    return []
  }
}

const argFiles = collectFilesFromArgs()
if (argFiles.length > 0) {
  files.push(...argFiles)
} else if (CHECK_STAGED) {
  files.push(...collectFilesFromGitStaged())
} else {
  const gitFiles = collectFilesFromGitStatus()
  if (gitFiles.length > 0) {
    files.push(...gitFiles)
  } else {
    walk(ROOT, files)
  }
}

const errors = []

for (const filePath of files) {
  const buffer = fs.readFileSync(filePath)
  const relativePath = path.relative(ROOT, filePath)

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    errors.push(`${relativePath}: contiene BOM UTF-8; debe guardarse como UTF-8 sin BOM`)
  }

  const text = buffer.toString('utf8')
  const controlChar = hasForbiddenControlChars(text)
  if (controlChar) {
    errors.push(
      `${relativePath}: contiene caracter de control 0x${controlChar.code.toString(16).padStart(2, '0')} en posicion ${controlChar.index}`,
    )
  }

  if (text.includes('\uFFFD')) {
    errors.push(`${relativePath}: contiene el caracter de reemplazo U+FFFD, senal de decoding roto`)
  }
}

if (errors.length > 0) {
  console.error('Fallo la verificacion de codificacion UTF-8:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

if (files.length === 0) {
  console.log('No hay archivos sensibles para verificar.')
  process.exit(0)
}

console.log(`Verificacion UTF-8 correcta en ${files.length} archivos.`)
