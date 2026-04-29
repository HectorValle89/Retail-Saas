import fs from 'node:fs'
import path from 'node:path'

const openNextRoot = path.resolve('.open-next')
const handlerPath = path.resolve('.open-next/server-functions/default/handler.mjs')

const readUtf8 = (filePath) => fs.readFileSync(filePath, 'utf8')
const writeUtf8 = (filePath, content) =>
  fs.writeFileSync(filePath, content, 'utf8')

const walkFiles = (startDir, predicate, results = []) => {
  if (!fs.existsSync(startDir)) {
    return results
  }

  for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
    const fullPath = path.join(startDir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, results)
      continue
    }

    if (predicate(fullPath, entry.name)) {
      results.push(fullPath)
    }
  }

  return results
}

const fixHandlerImports = () => {
  if (!fs.existsSync(handlerPath)) {
    console.log('[fix-opennext-windows-paths] handler.mjs not found, skipping')
    return 0
  }

  const handlerDir = path.dirname(handlerPath)
  const original = readUtf8(handlerPath)

  const normalizeSpecifier = (rawSpecifier) => {
    const [targetPath, query = ''] = rawSpecifier.split('?')
    if (!/^[A-Za-z]:\//.test(targetPath)) {
      return rawSpecifier
    }

    const relativePath = path.win32
      .relative(handlerDir, targetPath)
      .replace(/\\/g, '/')

    const specifier =
      relativePath.startsWith('.') || relativePath.startsWith('/')
        ? relativePath
        : `./${relativePath}`

    return query ? `${specifier}?${query}` : specifier
  }

  const replacements = new Map()

  for (const match of original.matchAll(/from(["'])([A-Za-z]:\/[^"']+)\1/g)) {
    replacements.set(match[2], normalizeSpecifier(match[2]))
  }

  for (const match of original.matchAll(/import\((["'])([A-Za-z]:\/[^"']+)\1\)/g)) {
    replacements.set(match[2], normalizeSpecifier(match[2]))
  }

  if (replacements.size === 0) {
    console.log('[fix-opennext-windows-paths] no Windows absolute imports found')
    return 0
  }

  let patched = original
  for (const [from, to] of replacements) {
    patched = patched.split(from).join(to)
  }

  if (patched === original) {
    console.log('[fix-opennext-windows-paths] replacement pass made no changes')
    return 0
  }

  writeUtf8(handlerPath, patched)
  console.log(
    `[fix-opennext-windows-paths] patched ${replacements.size} import specifier(s) in ${path.relative(process.cwd(), handlerPath)}`,
  )

  return replacements.size
}

const patchTurbopackRuntime = (runtimePath) => {
  const chunkDir = path.dirname(runtimePath)
  const runtimeContent = readUtf8(runtimePath)
  const chunkKeyPrefix = runtimePath.includes(
    `${path.sep}chunks${path.sep}ssr${path.sep}[turbopack]_runtime.js`,
  )
    ? 'server/chunks/ssr'
    : 'server/chunks'
  const chunkFiles = fs
    .readdirSync(chunkDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.js') &&
        entry.name !== '[turbopack]_runtime.js',
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const requireChunkPattern =
    /function requireChunk\(chunkPath\) \{\s*switch\(chunkPath\) \{[\s\S]*?\n\s*\}\s*\}/

  if (!requireChunkPattern.test(runtimeContent)) {
    console.log(
      `[fix-opennext-windows-paths] runtime chunk loader pattern not found in ${path.relative(process.cwd(), runtimePath)}`,
    )
    return false
  }

  const switchCases = chunkFiles
    .map((fileName) => {
      const chunkKey = `${chunkKeyPrefix}/${fileName}`
      return `      case ${JSON.stringify(chunkKey)}:\n        return require(${JSON.stringify(`./${fileName}`)});`
    })
    .join('\n\n')

  const replacement = `function requireChunk(chunkPath) {\n    switch(chunkPath) {\n${switchCases ? `${switchCases}\n\n` : ''}      default:\n        throw new Error(\`Not found \${chunkPath}\`);\n    }\n  }`

  const patchedRuntime = runtimeContent.replace(requireChunkPattern, replacement)

  if (patchedRuntime === runtimeContent) {
    console.log(
      `[fix-opennext-windows-paths] runtime chunk loader already up to date in ${path.relative(process.cwd(), runtimePath)}`,
    )
    return false
  }

  writeUtf8(runtimePath, patchedRuntime)
  console.log(
    `[fix-opennext-windows-paths] rebuilt runtime chunk loader with ${chunkFiles.length} chunk case(s) in ${path.relative(process.cwd(), runtimePath)}`,
  )
  return true
}

const patchedImportCount = fixHandlerImports()
const runtimeFiles = walkFiles(
  openNextRoot,
  (_fullPath, fileName) => fileName === '[turbopack]_runtime.js',
)

let patchedRuntimeCount = 0
for (const runtimePath of runtimeFiles) {
  if (patchTurbopackRuntime(runtimePath)) {
    patchedRuntimeCount += 1
  }
}

if (patchedImportCount === 0 && patchedRuntimeCount === 0) {
  console.log('[fix-opennext-windows-paths] no post-build fixes were required')
}