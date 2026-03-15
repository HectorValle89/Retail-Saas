const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

function parseArgs(argv) {
  const args = [...argv]
  let dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--db-url') {
      dbUrl = args.shift() ?? null
    }
  }

  if (!dbUrl) {
    throw new Error('A Postgres connection string is required via --db-url or DATABASE_URL.')
  }

  return {
    dbUrl,
    sqlFile: path.resolve('supabase/verification/rls_smoke_test.sql'),
  }
}

async function main() {
  const { dbUrl, sqlFile } = parseArgs(process.argv.slice(2))
  const sql = fs.readFileSync(sqlFile, 'utf8')
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    await client.query(sql)
    console.log('RLS smoke test passed.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
