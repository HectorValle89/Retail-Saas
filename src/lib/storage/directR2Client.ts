'use client'

import { crearBoletoSubidaR2 } from '@/lib/storage/r2Actions'

interface DirectR2FieldNames {
  objectKey: string
  sha256: string
  fileName: string
  contentType: string
  size: string
}

interface DirectR2UploadOptions {
  modulo: string
  removeFieldName?: string
  fieldNames?: Partial<DirectR2FieldNames>
}

export interface DirectR2UploadedFile {
  objectKey: string
  sha256: string
  fileName: string
  contentType: string
  size: number
}

export interface DirectR2ManifestEntry extends DirectR2UploadedFile {
  metadata?: Record<string, unknown> | null
}

const DEFAULT_FIELD_NAMES: DirectR2FieldNames = {
  objectKey: 'r2_object_key',
  sha256: 'r2_sha256',
  fileName: 'r2_file_name',
  contentType: 'r2_type',
  size: 'r2_size',
}

function resolveFieldNames(fieldNames?: Partial<DirectR2FieldNames>): DirectR2FieldNames {
  return {
    ...DEFAULT_FIELD_NAMES,
    ...fieldNames,
  }
}

function rightRotate(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount))
}

function computeSha256Fallback(bytes: Uint8Array) {
  const words: number[] = []
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] = (words[index >> 2] ?? 0) | (bytes[index] << (24 - (index % 4) * 8))
  }

  const bitLength = bytes.length * 8
  words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (24 - (bitLength % 32)))
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength

  const hash = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ]

  const schedule = new Array<number>(64)
  for (let offset = 0; offset < words.length; offset += 16) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = words[offset + index] ?? 0
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rightRotate(schedule[index - 15], 7) ^
        rightRotate(schedule[index - 15], 18) ^
        (schedule[index - 15] >>> 3)
      const s1 =
        rightRotate(schedule[index - 2], 17) ^
        rightRotate(schedule[index - 2], 19) ^
        (schedule[index - 2] >>> 10)
      schedule[index] = (((schedule[index - 16] + s0) | 0) + ((schedule[index - 7] + s1) | 0)) | 0
    }

    let [a, b, c, d, e, f, g, h] = hash

    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = ((((h + s1) | 0) + ((choice + constants[index]) | 0)) + schedule[index]) | 0
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + majority) | 0

      h = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }

    hash[0] = (hash[0] + a) | 0
    hash[1] = (hash[1] + b) | 0
    hash[2] = (hash[2] + c) | 0
    hash[3] = (hash[3] + d) | 0
    hash[4] = (hash[4] + e) | 0
    hash[5] = (hash[5] + f) | 0
    hash[6] = (hash[6] + g) | 0
    hash[7] = (hash[7] + h) | 0
  }

  return hash.map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('')
}

export async function computeFileSha256(file: File) {
  const buffer = await file.arrayBuffer()
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }

  return computeSha256Fallback(new Uint8Array(buffer))
}

export async function uploadFileDirectToR2(file: File, modulo: string) {
  const ticket = await crearBoletoSubidaR2(file.name, file.type, modulo)
  const response = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  })

  if (!response.ok) {
    throw new Error(`La subida directa a R2 fallo con estatus ${response.status}.`)
  }

  const sha256 = await computeFileSha256(file)

  return {
    objectKey: ticket.r2ObjectKey,
    sha256,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  } satisfies DirectR2UploadedFile
}

export async function injectDirectR2Upload(
  formData: FormData,
  file: File,
  options: DirectR2UploadOptions
) {
  const uploaded = await uploadFileDirectToR2(file, options.modulo)
  const fieldNames = resolveFieldNames(options.fieldNames)

  if (options.removeFieldName) {
    formData.delete(options.removeFieldName)
  }

  formData.set(fieldNames.objectKey, uploaded.objectKey)
  formData.set(fieldNames.sha256, uploaded.sha256)
  formData.set(fieldNames.fileName, uploaded.fileName)
  formData.set(fieldNames.contentType, uploaded.contentType)
  formData.set(fieldNames.size, String(uploaded.size))

  return uploaded
}

export async function uploadFilesDirectToR2(
  files: Array<File | { file: File; metadata?: Record<string, unknown> | null }>,
  modulo: string
) {
  const uploads = await Promise.all(
    files.map(async (entry) => {
      const file = entry instanceof File ? entry : entry.file
      const uploaded = await uploadFileDirectToR2(file, modulo)
      return {
        ...uploaded,
        metadata: entry instanceof File ? null : entry.metadata ?? null,
      } satisfies DirectR2ManifestEntry
    })
  )

  return uploads
}

export async function injectDirectR2Manifest(
  formData: FormData,
  entries: Array<File | { file: File; metadata?: Record<string, unknown> | null }>,
  {
    modulo,
    manifestFieldName,
    removeFieldName,
  }: {
    modulo: string
    manifestFieldName: string
    removeFieldName?: string
  }
) {
  const uploaded = await uploadFilesDirectToR2(entries, modulo)

  if (removeFieldName) {
    formData.delete(removeFieldName)
  }

  formData.set(manifestFieldName, JSON.stringify(uploaded))
  return uploaded
}
