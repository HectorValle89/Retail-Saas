const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  const envPath = path.join(__dirname, '..', '.env.local')
  const raw = fs.readFileSync(envPath, 'utf8')
  const line = raw
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('DATABASE_URL='))

  if (!line) {
    throw new Error('DATABASE_URL is required in process.env or .env.local')
  }

  return line.slice('DATABASE_URL='.length)
}

function collectPlanSummary(node, acc = []) {
  if (!node || typeof node !== 'object') {
    return acc
  }

  const relation = node['Relation Name'] || null
  const nodeType = node['Node Type'] || null
  const indexName = node['Index Name'] || null

  if (relation || nodeType) {
    acc.push({
      nodeType,
      relation,
      indexName,
      actualRows: node['Actual Rows'],
      actualTimeMs: node['Actual Total Time'],
    })
  }

  for (const child of node.Plans || []) {
    collectPlanSummary(child, acc)
  }

  return acc
}

function buildNextMonthStart(period) {
  const [yearRaw, monthRaw] = period.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

async function resolveSampleParams(client) {
  const result = await client.query(`
    select
      (select cuenta_cliente_id::text from dashboard_kpis order by fecha_corte desc limit 1) as dashboard_account,
      (select cuenta_cliente_id::text from asistencia order by fecha_operacion desc nulls last limit 1) as asistencia_account,
      (select supervisor_empleado_id::text from asistencia where supervisor_empleado_id is not null order by fecha_operacion desc nulls last limit 1) as supervisor_id,
      coalesce((select to_char(max(fecha_operacion), 'YYYY-MM') from asistencia), (select to_char(max(fecha_utc), 'YYYY-MM') from venta), to_char(now(), 'YYYY-MM')) as active_period
  `)

  return result.rows[0]
}

async function explainQuery(client, query) {
  const explain = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
    query.values
  )
  const plan = explain.rows[0]['QUERY PLAN'][0]
  return {
    name: query.name,
    executionTimeMs: plan['Execution Time'],
    planningTimeMs: plan['Planning Time'],
    sharedHitBlocks: plan.Plan['Shared Hit Blocks'],
    sharedReadBlocks: plan.Plan['Shared Read Blocks'],
    scans: collectPlanSummary(plan.Plan).filter((item) => item.relation),
  }
}

async function main() {
  const connectionString = loadDatabaseUrl()
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    const params = await resolveSampleParams(client)
    const monthStart = `${params.active_period}-01`
    const nextMonthStart = buildNextMonthStart(params.active_period)

    const queries = [
      {
        name: 'dashboard_kpis_by_account',
        sql: `
          select fecha_corte, cuenta_cliente_id, cuenta_cliente, promotores_activos, refreshed_at
          from dashboard_kpis
          where cuenta_cliente_id = $1
          order by fecha_corte desc
          limit 180
        `,
        values: [params.dashboard_account],
      },
      {
        name: 'dashboard_live_asistencia_by_account_supervisor',
        sql: `
          select id, cuenta_cliente_id, supervisor_empleado_id, fecha_operacion, estado_gps
          from asistencia
          where cuenta_cliente_id = $1
            and supervisor_empleado_id = $2
          order by fecha_operacion desc
          limit 250
        `,
        values: [params.asistencia_account, params.supervisor_id],
      },
      {
        name: 'reportes_asistencia_period',
        sql: `
          select id, cuenta_cliente_id, empleado_id, pdv_id, fecha_operacion, estatus
          from asistencia
          where fecha_operacion >= $1
            and fecha_operacion < $2
          order by created_at desc
          limit 400
        `,
        values: [monthStart, nextMonthStart],
      },
      {
        name: 'reportes_venta_period',
        sql: `
          select id, cuenta_cliente_id, empleado_id, pdv_id, fecha_utc, total_monto
          from venta
          where fecha_utc >= $1::timestamptz
            and fecha_utc < $2::timestamptz
          order by fecha_utc desc
          limit 400
        `,
        values: [`${monthStart}T00:00:00Z`, `${nextMonthStart}T00:00:00Z`],
      },
      {
        name: 'reportes_cuota_recent',
        sql: `
          select id, periodo_id, cuenta_cliente_id, empleado_id, cumplimiento_porcentaje, estado
          from cuota_empleado_periodo
          order by created_at desc
          limit 120
        `,
        values: [],
      },
      {
        name: 'reportes_nomina_ledger_recent',
        sql: `
          select id, periodo_id, cuenta_cliente_id, empleado_id, tipo_movimiento, monto
          from nomina_ledger
          order by created_at desc
          limit 300
        `,
        values: [],
      },
      {
        name: 'reportes_love_period',
        sql: `
          select id, cuenta_cliente_id, empleado_id, pdv_id, fecha_utc, estatus
          from love_isdin
          where fecha_utc >= $1::timestamptz
            and fecha_utc < $2::timestamptz
          order by fecha_utc desc
          limit 400
        `,
        values: [`${monthStart}T00:00:00Z`, `${nextMonthStart}T00:00:00Z`],
      },
      {
        name: 'reportes_audit_recent',
        sql: `
          select id, tabla, accion, created_at
          from audit_log
          order by created_at desc
          limit 60
        `,
        values: [],
      },
    ]

    const summaries = []
    for (const query of queries) {
      summaries.push(await explainQuery(client, query))
    }

    console.log(
      JSON.stringify(
        {
          sampledParameters: params,
          summaries,
        },
        null,
        2
      )
    )
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})