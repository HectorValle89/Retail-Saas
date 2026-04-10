export async function computeSHA256(input: Buffer | ArrayBuffer | Uint8Array) {
  const data = input instanceof Buffer || input instanceof Uint8Array ? input : new Uint8Array(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
