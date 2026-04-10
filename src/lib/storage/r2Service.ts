import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
const defaultBucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'beteele-media-prod'

let s3Client: S3Client | null = null

function getR2Client(): S3Client {
  if (!s3Client) {
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('Faltan credenciales de Cloudflare R2 en el entorno o .env.local.')
    }
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  }
  return s3Client
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
  const client = getR2Client()

  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase()
  const r2Key = `${modulo.toLowerCase()}/${Date.now()}-${safeName}`

  const command = new PutObjectCommand({
    Bucket: defaultBucket,
    Key: r2Key,
    ContentType: contentType,
  })

  // Firma criptografica con vigencia temporal (ej. 5 min default)
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds })

  return {
    uploadUrl,
    r2ObjectKey: r2Key,
    bucket: defaultBucket,
  }
}

/**
 * Genera una URL temporal de lectura/descarga desde R2.
 */
export async function generateR2DownloadUrl(
  r2ObjectKey: string,
  expiresInSeconds = 900
) {
  const client = getR2Client()

  const command = new GetObjectCommand({
    Bucket: defaultBucket,
    Key: r2ObjectKey,
  })

  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}
