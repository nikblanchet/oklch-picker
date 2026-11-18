/**
 * Reader for 2026 entries. Their password shipped in the public bundle, so
 * this is obfuscation only: those rows are protected by the database alone.
 */
import { fromBase64 } from './base64.ts'

const PASSWORD = 'contest-2026-oklch-picker'

export async function decryptLegacy(
  salt: string,
  fields: string[]
): Promise<string[]> {
  const key = await crypto.subtle.deriveKey(
    {
      hash: 'SHA-256',
      iterations: 100_000,
      name: 'PBKDF2',
      salt: fromBase64(salt)
    },
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(PASSWORD),
      'PBKDF2',
      false,
      ['deriveKey']
    ),
    { length: 256, name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  return Promise.all(
    fields.map(async field => {
      const bytes = fromBase64(field)
      const plaintext = await crypto.subtle.decrypt(
        { iv: bytes.slice(0, 12), name: 'AES-GCM' },
        key,
        bytes.slice(12)
      )
      return new TextDecoder().decode(plaintext)
    })
  )
}
