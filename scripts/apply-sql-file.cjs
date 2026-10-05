const fs = require('node:fs');
const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve('.env.local'), quiet: true });
  require('dotenv').config({ path: path.resolve('.env'), quiet: true });
} catch {
  // El script también funciona en CI cuando la conexión llega por variables del proceso.
}
const { Client } = require('pg');

function parseArgs(argv) {
  const args = [...argv];
  const sqlFile = args.shift();
  let dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null;
  let rollback = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--db-url') {
      dbUrl = args.shift() ?? null;
    } else if (arg === '--rollback') {
      rollback = true;
    }
  }

  if (!sqlFile) {
    throw new Error('Usage: node scripts/apply-sql-file.cjs <sql-file> [--db-url <postgres-url>]');
  }

  if (!dbUrl) {
    throw new Error('A Postgres connection string is required via --db-url or DATABASE_URL.');
  }

  return {
    sqlFile: path.resolve(sqlFile),
    dbUrl,
    rollback,
  };
}

async function main() {
  const { sqlFile, dbUrl, rollback } = parseArgs(process.argv.slice(2));
  const sql = fs.readFileSync(sqlFile, 'utf8');

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  const startedAt = Date.now();
  await client.connect();

  try {
    if (rollback) {
      await client.query('begin');
    }
    await client.query(sql);
    if (rollback) {
      await client.query('rollback');
    }
    const elapsedMs = Date.now() - startedAt;
    console.log(`Applied SQL file: ${sqlFile}`);
    console.log(`Elapsed: ${elapsedMs}ms`);
    if (rollback) {
      console.log('Transaction rolled back after validation.');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error && typeof error === 'object' && 'position' in error) {
    console.error(`SQL position: ${String(error.position)}`);
  }
  if (error && typeof error === 'object' && 'where' in error && error.where) {
    console.error(String(error.where));
  }
  process.exit(1);
});
