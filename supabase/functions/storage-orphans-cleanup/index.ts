/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.49.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const retentionDays = Number(Deno.env.get('STORAGE_ORPHAN_RETENTION_DAYS') ?? '30')
const managedBuckets = (Deno.env.get('STORAGE_ORPHAN_BUCKETS') ?? 'operacion-evidencias,empleados-expediente')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const ORPHANS_PREFIX = '_orphans'
const PAGE_SIZE = 1000

function getIsoDayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function normalizeStorageKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\/+/, '')
}

function buildStorageKey(bucket, path) {
  const normalizedPath = normalizeStorageKey(path)
  return normalizedPath ? `${bucket}/${normalizedPath}` : ''
}

function parseJsonBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {}
  }

  return body
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  }

  return fallback
}

function buildOrphanPath(sourcePath, dayStamp) {
  return `${ORPHANS_PREFIX}/${dayStamp}/${normalizeStorageKey(sourcePath)}`
}

function parseOrphanMetadata(path) {
  const normalized = normalizeStorageKey(path)
  const match = normalized.match(/^_orphans\/(\d{4}-\d{2}-\d{2})\/(.+)$/)

  if (!match) {
    return null
  }

  return {
    quarantinedOn: match[1],
    originalPath: match[2],
  }
}

function inferCuentaClienteId(bucket, path) {
  const normalized = normalizeStorageKey(path)
  const orphan = parseOrphanMetadata(normalized)
  const effectivePath = orphan?.originalPath ?? normalized
  const parts = effectivePath.split('/').filter(Boolean)

  if (bucket === 'operacion-evidencias' && parts.length >= 2) {
    return parts[1]
  }

  return null
}

async function fetchAllRows(supabase, table, select, applyFilters) {
  const rows = []
  let from = 0

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1)
    if (applyFilters) {
      query = applyFilters(query)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }

    const batch = data ?? []
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows
}

async function listAllObjectsInBucket(supabase, bucket, prefix = '') {
  const objects = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
      throw error
    }

    const batch = data ?? []
    for (const entry of batch) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) {
        objects.push({
          bucket,
          path: entryPath,
          name: entry.name,
          created_at: entry.created_at ?? null,
          updated_at: entry.updated_at ?? null,
          metadata: entry.metadata ?? {},
        })
      } else {
        objects.push(...(await listAllObjectsInBucket(supabase, bucket, entryPath)))
      }
    }

    if (batch.length < 100) {
      break
    }

    offset += 100
  }

  return objects
}

async function buildReferenceIndex(supabase) {
  const archivoRows = await fetchAllRows(
    supabase,
    'archivo_hash',
    'id, sha256, bucket, ruta_archivo',
    (query) => query.in('bucket', managedBuckets)
  )

  const archivoByKey = new Map()
  const archivoById = new Map()
  const archivoByHash = new Map()

  for (const row of archivoRows) {
    const storageKey = buildStorageKey(row.bucket, row.ruta_archivo)
    archivoByKey.set(storageKey, row)
    archivoById.set(row.id, row)
    if (row.sha256 && !archivoByHash.has(row.sha256)) {
      archivoByHash.set(row.sha256, row)
    }
  }

  const referencedArchivoIds = new Set()
  const referencedHashes = new Set()
  const referencedKeys = new Set()

  const empleadoDocumentos = await fetchAllRows(supabase, 'empleado_documento', 'archivo_hash_id')
  for (const row of empleadoDocumentos) {
    if (!row.archivo_hash_id) {
      continue
    }

    referencedArchivoIds.add(row.archivo_hash_id)
    const archivo = archivoById.get(row.archivo_hash_id)
    if (archivo) {
      referencedHashes.add(archivo.sha256)
      referencedKeys.add(buildStorageKey(archivo.bucket, archivo.ruta_archivo))
    }
  }

  const hashAndUrlSources = [
    { table: 'love_isdin', hashColumns: ['evidencia_hash'], urlColumns: ['evidencia_url'] },
    { table: 'gasto', hashColumns: ['comprobante_hash'], urlColumns: ['comprobante_url'] },
    {
      table: 'entrega_material',
      hashColumns: ['evidencia_entrega_hash', 'evidencia_devolucion_hash'],
      urlColumns: ['evidencia_entrega_url', 'evidencia_devolucion_url'],
    },
    { table: 'solicitud', hashColumns: ['justificante_hash'], urlColumns: ['justificante_url'] },
    {
      table: 'asistencia',
      hashColumns: ['selfie_check_in_hash', 'selfie_check_out_hash'],
      urlColumns: ['selfie_check_in_url', 'selfie_check_out_url'],
    },
    {
      table: 'ruta_semanal_visita',
      hashColumns: ['selfie_hash', 'evidencia_hash'],
      urlColumns: ['selfie_url', 'evidencia_url'],
    },
  ]

  for (const source of hashAndUrlSources) {
    const select = [...source.hashColumns, ...source.urlColumns].join(', ')
    const rows = await fetchAllRows(supabase, source.table, select)

    for (const row of rows) {
      for (const hashColumn of source.hashColumns) {
        const hash = String(row[hashColumn] ?? '').trim()
        if (hash) {
          referencedHashes.add(hash)
          const archivo = archivoByHash.get(hash)
          if (archivo) {
            referencedArchivoIds.add(archivo.id)
            referencedKeys.add(buildStorageKey(archivo.bucket, archivo.ruta_archivo))
          }
        }
      }

      for (const urlColumn of source.urlColumns) {
        const key = normalizeStorageKey(row[urlColumn])
        if (key) {
          referencedKeys.add(key)
        }
      }
    }
  }

  return {
    archivoByKey,
    referencedArchivoIds,
    referencedHashes,
    referencedKeys,
  }
}

function hasValidReference(objectRecord, referenceIndex) {
  const storageKey = buildStorageKey(objectRecord.bucket, objectRecord.path)
  if (referenceIndex.referencedKeys.has(storageKey)) {
    return true
  }

  const archivo = referenceIndex.archivoByKey.get(storageKey)
  if (!archivo) {
    return false
  }

  return (
    referenceIndex.referencedArchivoIds.has(archivo.id) ||
    referenceIndex.referencedHashes.has(archivo.sha256) ||
    referenceIndex.referencedKeys.has(buildStorageKey(archivo.bucket, archivo.ruta_archivo))
  )
}

async function insertAuditLog(supabase, payload) {
  await supabase.from('audit_log').insert({
    tabla: 'archivo_hash',
    registro_id: payload.registro_id,
    accion: 'EVENTO',
    payload: payload.payload,
    cuenta_cliente_id: payload.cuenta_cliente_id ?? null,
  })
}

Deno.serve(async (request) => {
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: 'Storage cleanup environment is not configured.' }, { status: 500 })
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }

  const url = new URL(request.url)
  const body = request.method === 'POST' ? parseJsonBody(await request.json().catch(() => ({}))) : {}
  const dryRun = parseBoolean(body.dryRun ?? url.searchParams.get('dryRun'), true)
  const deleteExpiredOrphans = parseBoolean(body.deleteExpiredOrphans ?? url.searchParams.get('deleteExpiredOrphans'), true)
  const dayStamp = getIsoDayStamp()
  const now = new Date()

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const referenceIndex = await buildReferenceIndex(supabase)
    const objects = []
    for (const bucket of managedBuckets) {
      objects.push(...(await listAllObjectsInBucket(supabase, bucket)))
    }

    const summary = {
      dryRun,
      buckets: managedBuckets,
      scanned: objects.length,
      referenced: 0,
      quarantined: 0,
      pendingTtl: 0,
      deleted: 0,
      errors: [],
      affected: [],
    }

    for (const objectRecord of objects) {
      const orphanInfo = parseOrphanMetadata(objectRecord.path)
      const storageKey = buildStorageKey(objectRecord.bucket, objectRecord.path)
      const cuentaClienteId = inferCuentaClienteId(objectRecord.bucket, objectRecord.path)
      const archivo = referenceIndex.archivoByKey.get(storageKey)

      if (orphanInfo) {
        const quarantinedAt = new Date(`${orphanInfo.quarantinedOn}T00:00:00.000Z`)
        const ageMs = now.getTime() - quarantinedAt.getTime()
        const expired = ageMs >= retentionDays * 24 * 60 * 60 * 1000

        if (!expired || !deleteExpiredOrphans) {
          summary.pendingTtl += 1
          continue
        }

        if (dryRun) {
          summary.deleted += 1
          summary.affected.push({
            action: 'delete',
            bucket: objectRecord.bucket,
            path: objectRecord.path,
            cuentaClienteId,
          })
          continue
        }

        const { error: removeError } = await supabase.storage.from(objectRecord.bucket).remove([objectRecord.path])
        if (removeError) {
          summary.errors.push({
            action: 'delete',
            bucket: objectRecord.bucket,
            path: objectRecord.path,
            error: removeError.message,
          })
          continue
        }

        if (archivo) {
          await supabase.from('archivo_hash').delete().eq('id', archivo.id)
        }

        await insertAuditLog(supabase, {
          registro_id: objectRecord.path,
          cuenta_cliente_id: cuentaClienteId,
          payload: {
            accion: 'storage_orphan_deleted',
            bucket: objectRecord.bucket,
            path: objectRecord.path,
            original_path: orphanInfo.originalPath,
            retention_days: retentionDays,
          },
        })

        summary.deleted += 1
        summary.affected.push({
          action: 'delete',
          bucket: objectRecord.bucket,
          path: objectRecord.path,
          cuentaClienteId,
        })
        continue
      }

      if (hasValidReference(objectRecord, referenceIndex)) {
        summary.referenced += 1
        continue
      }

      const targetPath = buildOrphanPath(objectRecord.path, dayStamp)
      if (dryRun) {
        summary.quarantined += 1
        summary.affected.push({
          action: 'quarantine',
          bucket: objectRecord.bucket,
          path: objectRecord.path,
          targetPath,
          cuentaClienteId,
        })
        continue
      }

      const { error: moveError } = await supabase.storage.from(objectRecord.bucket).move(objectRecord.path, targetPath)
      if (moveError) {
        summary.errors.push({
          action: 'quarantine',
          bucket: objectRecord.bucket,
          path: objectRecord.path,
          error: moveError.message,
        })
        continue
      }

      if (archivo) {
        await supabase.from('archivo_hash').delete().eq('id', archivo.id)
      }

      await insertAuditLog(supabase, {
        registro_id: objectRecord.path,
        cuenta_cliente_id: cuentaClienteId,
        payload: {
          accion: 'storage_orphan_quarantined',
          bucket: objectRecord.bucket,
          source_path: objectRecord.path,
          target_path: targetPath,
          retention_days: retentionDays,
          delete_after: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
          archivo_hash_id: archivo?.id ?? null,
          sha256: archivo?.sha256 ?? null,
        },
      })

      summary.quarantined += 1
      summary.affected.push({
        action: 'quarantine',
        bucket: objectRecord.bucket,
        path: objectRecord.path,
        targetPath,
        cuentaClienteId,
      })
    }

    return Response.json({ ok: true, ...summary })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown storage cleanup error.' },
      { status: 500 }
    )
  }
})
