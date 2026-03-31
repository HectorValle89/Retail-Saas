import { createHash } from 'node:crypto'

export async function computeSHA256(input: Buffer | ArrayBuffer | Uint8Array) {
  const buffer =
    input instanceof Buffer
      ? input
      : input instanceof ArrayBuffer
        ? Buffer.from(input)
        : Buffer.from(input.buffer, input.byteOffset, input.byteLength)

  return createHash('sha256').update(buffer).digest('hex')
}
