const fs = require('node:fs');
const crypto = require('node:crypto');
const { Client } = require('pg');
const sharp = require('sharp');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const R2_PROXY_PATH = '/api/storage/r2';
const TARGET_MAX_BYTES = 20 * 1024;
const DEFAULT_LIMIT = 500;
const DEFAULT_CONCURRENCY = 2;

function loadEnvFile(path) {
  if (!fs.existsSync(path)) {
    return;
  }

  const content = fs.readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator < 1) {
      continue;
    }

    const key = trimmed.slice(0, separator);
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readArgs() {
  const args = new Map();
  for (const item of process.argv.slice(2)) {
    if (item === '--dry-run') {
      args.set('dryRun', true);
      continue;
    }

    const match = item.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1], match[2]);
    }
  }

  return {
    dryRun: args.get('dryRun') === true,
    limit: Number(args.get('limit') ?? DEFAULT_LIMIT),
    concurrency: Number(args.get('concurrency') ?? DEFAULT_CONCURRENCY),
  };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta ${name} en el entorno.`);
  }

  return value;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizeReference(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildR2ProxyUrl(objectKey) {
  return `${R2_PROXY_PATH}?key=${encodeURIComponent(objectKey)}`;
}

function isR2ProxyUrl(reference) {
  return reference.startsWith(`${R2_PROXY_PATH}?`) || reference.startsWith(`${R2_PROXY_PATH}/`);
}

function extractR2ProxyKey(reference) {
  if (!isR2ProxyUrl(reference)) {
    return null;
  }

  const url = new URL(reference, 'https://local.invalid');
  return url.searchParams.get('key');
}

function parseStorageReference(reference) {
  const r2ProxyKey = extractR2ProxyKey(reference);
  if (r2ProxyKey) {
    return { bucket: 'CF_R2', path: r2ProxyKey };
  }

  if (/^https?:\/\//i.test(reference)) {
    return null;
  }

  const segments = reference.split('/').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const [bucket, ...pathSegments] = segments;
  return {
    bucket,
    path: pathSegments.join('/'),
  };
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function downloadObject({ supabase, r2, r2Bucket, reference }) {
  const parsed = parseStorageReference(reference);
  if (!parsed) {
    throw new Error(`Referencia no soportada: ${reference}`);
  }

  if (parsed.bucket === 'CF_R2') {
    const result = await r2.send(new GetObjectCommand({ Bucket: r2Bucket, Key: parsed.path }));
    return {
      buffer: await streamToBuffer(result.Body),
      contentType: result.ContentType ?? null,
      sourcePath: parsed.path,
      sourceBucket: parsed.bucket,
    };
  }

  const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
  if (error || !data) {
    throw new Error(error?.message ?? `No fue posible descargar ${reference}`);
  }

  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || null,
    sourcePath: parsed.path,
    sourceBucket: parsed.bucket,
  };
}

async function buildThumbnail(buffer) {
  const dimensions = [320, 280, 240, 200];
  const qualities = [76, 68, 60, 54, 48, 42];
  let best = null;

  for (const size of dimensions) {
    for (const quality of qualities) {
      const output = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({
          width: size,
          height: size,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality,
          mozjpeg: true,
        })
        .toBuffer();

      best = output;
      if (output.byteLength <= TARGET_MAX_BYTES) {
        return output;
      }
    }
  }

  return best;
}

function readMediaMetadata(row, kind) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const candidates = [metadata.checkOut, metadata.checkIn].filter(
    (value) => value && typeof value === 'object'
  );
  const urlKey = kind === 'selfie' ? 'selfieUrl' : 'evidenciaUrl';
  const hashKey = kind === 'selfie' ? 'selfieHash' : 'evidenciaHash';
  const reference = normalizeReference(kind === 'selfie' ? row.selfie_url : row.evidencia_url);

  const matched = candidates.find(
    (candidate) => normalizeReference(candidate[urlKey]) === reference
  );
  const fallback = candidates.find((candidate) => normalizeReference(candidate[hashKey]));
  const source = matched ?? fallback ?? null;

  return {
    sourceBlock:
      source === metadata.checkIn ? 'checkIn' : source === metadata.checkOut ? 'checkOut' : null,
    originalHash:
      normalizeReference(kind === 'selfie' ? row.selfie_hash : row.evidencia_hash) ??
      normalizeReference(source?.[hashKey]),
  };
}

function applyThumbnailToMetadata(metadata, kind, sourceBlock, thumbnailUrl, thumbnailHash) {
  if (!sourceBlock || !metadata || typeof metadata !== 'object') {
    return metadata ?? {};
  }

  const next = structuredClone(metadata);
  next[sourceBlock] =
    next[sourceBlock] && typeof next[sourceBlock] === 'object' ? next[sourceBlock] : {};

  if (kind === 'selfie') {
    next[sourceBlock].selfieThumbnailUrl = thumbnailUrl;
    next[sourceBlock].selfieThumbnailHash = thumbnailHash;
  } else {
    next[sourceBlock].evidenciaThumbnailUrl = thumbnailUrl;
    next[sourceBlock].evidenciaThumbnailHash = thumbnailHash;
  }

  return next;
}

async function upsertArchivoHash({ client, sha, bucket, path, mimeType, bytes }) {
  await client.query(
    `
      insert into archivo_hash (sha256, bucket, ruta_archivo, mime_type, tamano_bytes)
      values ($1, $2, $3, $4, $5)
      on conflict (sha256) do nothing
    `,
    [sha, bucket, path, mimeType, bytes]
  );
}

async function linkOriginalToThumbnail({
  client,
  originalHash,
  thumbnailHash,
  thumbnailKey,
  bytes,
}) {
  if (!originalHash) {
    return;
  }

  await client.query(
    `
      update archivo_hash
      set
        miniatura_sha256 = coalesce(miniatura_sha256, $2),
        miniatura_bucket = coalesce(miniatura_bucket, 'CF_R2'),
        miniatura_ruta_archivo = coalesce(miniatura_ruta_archivo, $3),
        miniatura_mime_type = coalesce(miniatura_mime_type, 'image/jpeg'),
        miniatura_tamano_bytes = coalesce(miniatura_tamano_bytes, $4)
      where sha256 = $1
    `,
    [originalHash, thumbnailHash, thumbnailKey, bytes]
  );
}

async function updateVisitThumbnail({
  client,
  row,
  kind,
  originalHash,
  thumbnailUrl,
  thumbnailHash,
  metadata,
}) {
  const params =
    kind === 'selfie'
      ? [thumbnailUrl, thumbnailHash, originalHash, metadata, row.id]
      : [thumbnailUrl, thumbnailHash, originalHash, metadata, row.id];

  const sql =
    kind === 'selfie'
      ? `
        update ruta_semanal_visita
        set
          selfie_thumbnail_url = $1,
          selfie_thumbnail_hash = $2,
          selfie_hash = coalesce(selfie_hash, $3),
          metadata = $4::jsonb,
          updated_at = now()
        where id = $5
      `
      : `
        update ruta_semanal_visita
        set
          evidencia_thumbnail_url = $1,
          evidencia_thumbnail_hash = $2,
          evidencia_hash = coalesce(evidencia_hash, $3),
          metadata = $4::jsonb,
          updated_at = now()
        where id = $5
      `;

  await client.query(sql, params);
}

async function processAsset({ client, supabase, r2, r2Bucket, row, kind, dryRun }) {
  const sourceUrl = normalizeReference(kind === 'selfie' ? row.selfie_url : row.evidencia_url);
  const currentThumbnailUrl = normalizeReference(
    kind === 'selfie' ? row.selfie_thumbnail_url : row.evidencia_thumbnail_url
  );
  const currentThumbnailHash = normalizeReference(
    kind === 'selfie' ? row.selfie_thumbnail_hash : row.evidencia_thumbnail_hash
  );

  if (!sourceUrl || (currentThumbnailUrl && currentThumbnailHash)) {
    return { status: 'skipped' };
  }

  const { sourceBlock, originalHash } = readMediaMetadata(row, kind);
  const downloaded = await downloadObject({ supabase, r2, r2Bucket, reference: sourceUrl });

  let thumbnail;
  try {
    thumbnail = await buildThumbnail(downloaded.buffer);
  } catch (error) {
    return {
      status: 'failed',
      reason: `No se pudo procesar imagen (${error instanceof Error ? error.message : 'error desconocido'})`,
    };
  }

  const thumbnailHash = sha256(thumbnail);
  const sourceBase = downloaded.sourcePath.replace(/\.[^.]+$/, '').replace(/\/+$/, '');
  const thumbnailKey = `${sourceBase}-thumb-${thumbnailHash.slice(0, 12)}.jpg`;
  const thumbnailUrl = buildR2ProxyUrl(thumbnailKey);
  const nextMetadata = applyThumbnailToMetadata(
    row.metadata,
    kind,
    sourceBlock,
    thumbnailUrl,
    thumbnailHash
  );

  if (dryRun) {
    return {
      status: 'dry-run',
      originalHash,
      thumbnailHash,
      thumbnailKey,
      bytes: thumbnail.byteLength,
    };
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: thumbnailKey,
      Body: thumbnail,
      ContentType: 'image/jpeg',
      Metadata: {
        source_bucket: downloaded.sourceBucket,
        source_path_sha256: sha256(Buffer.from(downloaded.sourcePath)),
        original_sha256: originalHash ?? '',
      },
    })
  );

  await client.query('begin');
  try {
    await upsertArchivoHash({
      client,
      sha: thumbnailHash,
      bucket: 'CF_R2',
      path: thumbnailKey,
      mimeType: 'image/jpeg',
      bytes: thumbnail.byteLength,
    });
    await linkOriginalToThumbnail({
      client,
      originalHash,
      thumbnailHash,
      thumbnailKey,
      bytes: thumbnail.byteLength,
    });
    await updateVisitThumbnail({
      client,
      row,
      kind,
      originalHash,
      thumbnailUrl,
      thumbnailHash,
      metadata: JSON.stringify(nextMetadata),
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }

  return {
    status: 'created',
    originalHash,
    thumbnailHash,
    thumbnailKey,
    bytes: thumbnail.byteLength,
  };
}

async function asyncPool(limit, items, worker) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const promise = Promise.resolve().then(() => worker(item));
    results.push(promise);
    executing.add(promise);

    const cleanup = () => executing.delete(promise);
    promise.then(cleanup, cleanup);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

async function main() {
  loadEnvFile('.env.local');
  loadEnvFile('.env');
  const options = readArgs();

  const client = new Client({
    connectionString: requireEnv('DATABASE_URL'),
    ssl: { rejectUnauthorized: false },
  });
  const supabase = createSupabaseClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'beteele-media-prod';
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    },
  });

  await client.connect();
  const { rows } = await client.query(
    `
      select
        id,
        selfie_url,
        selfie_hash,
        selfie_thumbnail_url,
        selfie_thumbnail_hash,
        evidencia_url,
        evidencia_hash,
        evidencia_thumbnail_url,
        evidencia_thumbnail_hash,
        metadata
      from ruta_semanal_visita
      where
        (
          selfie_url is not null
          and (selfie_thumbnail_url is null or selfie_thumbnail_hash is null)
        )
        or (
          evidencia_url is not null
          and (evidencia_thumbnail_url is null or evidencia_thumbnail_hash is null)
        )
      order by completada_en desc nulls last, id
      limit $1
    `,
    [options.limit]
  );

  const jobs = rows.flatMap((row) => [
    { row, kind: 'selfie' },
    { row, kind: 'evidencia' },
  ]);

  const summary = {
    dryRun: options.dryRun,
    rows: rows.length,
    jobs: jobs.length,
    created: 0,
    skipped: 0,
    failed: 0,
    totalBytes: 0,
    errors: [],
  };

  await asyncPool(options.concurrency, jobs, async (job) => {
    try {
      const result = await processAsset({
        client,
        supabase,
        r2,
        r2Bucket,
        row: job.row,
        kind: job.kind,
        dryRun: options.dryRun,
      });

      if (result.status === 'created' || result.status === 'dry-run') {
        summary.created += 1;
        summary.totalBytes += result.bytes ?? 0;
        console.log(
          `${options.dryRun ? '[dry-run]' : '[created]'} ${job.kind} ${job.row.id} ${result.thumbnailKey} ${result.bytes} bytes`
        );
      } else if (result.status === 'skipped') {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
        summary.errors.push({ visitId: job.row.id, kind: job.kind, reason: result.reason });
        console.warn(`[failed] ${job.kind} ${job.row.id}: ${result.reason}`);
      }

      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
      summary.errors.push({ visitId: job.row.id, kind: job.kind, reason });
      console.warn(`[failed] ${job.kind} ${job.row.id}: ${reason}`);
      return { status: 'failed', reason };
    }
  });

  await client.end();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
