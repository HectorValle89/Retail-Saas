/* eslint-disable no-console */
// Applies the migration for adding direccion_envio column in Production.
// Loads .env.local and forces a PostgREST schema reload.

const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing (expected in .env.local or process env).');
    process.exit(1);
  }

  const migrationPath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260617010000_agregar_direccion_envio_uniforme.sql'
  );

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    // Force PostgREST to reload schema cache so the new column appears immediately.
    await client.query("NOTIFY pgrst, 'reload schema'");
    await client.query('commit');
    console.log('migration:ok');
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {}
    console.error('migration:fail', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
