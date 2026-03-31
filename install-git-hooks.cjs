/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const hookContent = `#!/bin/sh

echo "Verificando encoding UTF-8 en archivos sensibles staged..."
npm run docs:check-encoding -- --staged
status=$?

if [ $status -ne 0 ]; then
  echo "Pre-commit bloqueado: corrige los problemas de encoding antes de hacer commit."
  exit $status
fi

echo "Verificando reconciliacion conservadora de tasks.md..."
npm run backlog:check-reconciliation
status=$?

if [ $status -ne 0 ]; then
  echo "Pre-commit bloqueado: no cierres backlog canonico sin trabajo real staged."
  exit $status
fi

exit 0
`

try {
  const hookDir = path.join(process.cwd(), '.githooks')
  const hookPath = path.join(hookDir, 'pre-commit')

  fs.mkdirSync(hookDir, { recursive: true })
  fs.writeFileSync(hookPath, hookContent, 'utf8')
  execSync('git config core.hooksPath .githooks', {
    stdio: 'inherit',
  })
  console.log('Git hooks instalados: core.hooksPath -> .githooks')
} catch (error) {
  console.error('No se pudo configurar core.hooksPath hacia .githooks.')
  process.exit(error.status || 1)
}
