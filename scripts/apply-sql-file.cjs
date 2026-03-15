const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

function parseArgs(argv) {
  const args = [...argv]
  const sqlFile = args.shift()
  let dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--db-url') {
      dbUrl = args.shift() ?? null
    }
  }

  if (!sqlFile) {
    throw new Error('Usage: node scripts/apply-sql-file.cjs <sql-file> [--db-url <postgres-url>]')
  }

  if (!dbUrl) {
    throw new Error('A Postgres connection string is required via --db-url or DATABASE_URL.')
  }

  return {
    sqlFile: path.resolve(sqlFile),
    dbUrl,
  }
}

async function main() {
  const { sqlFile, dbUrl } = parseArgs(process.argv.slice(2))
  const sql = fs.readFileSync(sqlFile, 'utf8')

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  const startedAt = Date.now()
  await client.connect()

  try {
    await client.query(sql)
    const elapsedMs = Date.now() - startedAt
    console.log(`Applied SQL file: ${sqlFile}`)
    console.log(`Elapsed: ${elapsedMs}ms`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
