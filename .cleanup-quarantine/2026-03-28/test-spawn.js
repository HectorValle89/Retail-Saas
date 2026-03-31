/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('child_process')
const child = spawn('cmd.exe', ['/c', 'echo', 'ok'], { stdio: 'inherit' })
child.on('error', (e) => console.error(e.code, e.message))
