const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const defaultBucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'beteele-media-prod';
const workerBindingName = process.env.CLOUDFLARE_R2_BUCKET_BINDING || 'R2_MEDIA';
const proxyRoutePath = '/api/storage/r2';

type S3Client = import('@aws-sdk/client-s3').S3Client;
type R2ObjectBody = {
  body: ReadableStream | null;
  httpEtag: string;
  checksums?: {
    toJSON?: () => Record<string, string>;
  };
  writeHttpMetadata(headers: Headers): void;
};
type R2BucketBinding = {
  get(key: string): Promise<R2ObjectBody | null>;
};

let s3Client: S3Client | null = null;

export function buildR2ProxyUrl(r2ObjectKey: string) {
  const key = normalizeR2ObjectKey(r2ObjectKey);
  return `${proxyRoutePath}?key=${encodeURIComponent(key)}`;
}

export function isR2ProxyUrl(value: string) {
  const url = value.trim();
  return url.startsWith(`${proxyRoutePath}?`) || url.startsWith(`${proxyRoutePath}/`);
}

function normalizeR2ObjectKey(r2ObjectKey: string) {
  const key = r2ObjectKey.trim();

  if (!key || key.includes('..') || key.startsWith('/')) {
    throw new Error('La llave de R2 no es valida.');
  }

  return key;
}

async function getR2BucketBinding(): Promise<R2BucketBinding | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const binding = (env as unknown as Record<string, unknown>)[workerBindingName];

    if (binding && typeof binding === 'object' && 'get' in binding) {
      return binding as R2BucketBinding;
    }
  } catch {
    return null;
  }

  return null;
}

async function getR2Client(): Promise<S3Client> {
  if (!s3Client) {
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('Faltan credenciales de Cloudflare R2 en el entorno o .env.local.');
    }
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3Client;
}

export async function getR2Object(r2ObjectKey: string) {
  const key = normalizeR2ObjectKey(r2ObjectKey);
  const bucket = await getR2BucketBinding();

  if (!bucket) {
    return null;
  }

  return bucket.get(key);
}

export async function buildR2ObjectResponse(r2ObjectKey: string) {
  const object = await getR2Object(r2ObjectKey);

  if (!object?.body) {
    return null;
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', buildR2CacheControl(r2ObjectKey));

  return new Response(object.body, {
    headers,
  });
}

function buildR2CacheControl(r2ObjectKey: string) {
  const key = r2ObjectKey.toLowerCase();
  const isThumbnail =
    key.includes('thumb') ||
    key.includes('thumbnail') ||
    key.endsWith('-thumb.jpg') ||
    key.endsWith('-thumb.jpeg') ||
    key.endsWith('-thumb.webp');

  return isThumbnail ? 'private, max-age=604800' : 'private, max-age=900';
}

/**
 * Genera una URL de subida temporal directa hacia R2 (Presigned Upload URL).
 * Ideal para mandar fotos de exhibiciones o recibos sin ahorcar la transferencia de Vercel/Supabase.
 */
export async function generateR2UploadUrl(
  fileName: string,
  contentType: string,
  modulo: string,
  expiresInSeconds = 300
) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = await getR2Client();

  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase();
  const r2Key = `${modulo.toLowerCase()}/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: defaultBucket,
    Key: r2Key,
    ContentType: contentType,
  });

  // Firma criptografica con vigencia temporal (ej. 5 min default)
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

  return {
    uploadUrl,
    r2ObjectKey: r2Key,
    bucket: defaultBucket,
  };
}

async function generateR2PresignedDownloadUrl(r2ObjectKey: string, expiresInSeconds = 900) {
  const key = normalizeR2ObjectKey(r2ObjectKey);
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = await getR2Client();

  const command = new GetObjectCommand({
    Bucket: defaultBucket,
    Key: key,
  });

  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Genera una URL temporal de lectura/descarga desde R2.
 */
export async function generateR2DownloadUrl(r2ObjectKey: string, expiresInSeconds = 900) {
  const key = normalizeR2ObjectKey(r2ObjectKey);

  if (await getR2BucketBinding()) {
    return buildR2ProxyUrl(key);
  }

  return generateR2PresignedDownloadUrl(key, expiresInSeconds);
}
