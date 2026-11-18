/**
 * Public-key encryption of entrants’ contact details.
 *
 * The site only ships the public key. Every message uses a fresh ephemeral
 * ECDH P-256 key, HKDF-SHA-256 and AES-256-GCM, so only the holder of the
 * private key can read it: not other visitors and not the database host.
 */
import { fromBase64, toBase64Url } from './base64.ts'

const VERSION = 'v2'
const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const
const POINT_BYTES = 65
const IV_BYTES = 12
/** Messages are padded so that their size does not reveal name lengths. */
const PADDING_BYTES = 128

const encoder = new TextEncoder()

export interface PrivateKey {
  key: CryptoKey
  /** The matching public key, in the `VITE_CONTEST_PUBLIC_KEY` format. */
  publicKey: string
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(parts.flatMap(part => [...part]))
}

async function deriveKey(
  privateKey: CryptoKey,
  peer: Uint8Array<ArrayBuffer>,
  ephemeral: Uint8Array,
  recipient: Uint8Array
): Promise<CryptoKey> {
  const peerKey = await crypto.subtle.importKey('raw', peer, CURVE, false, [])
  const secret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerKey },
    privateKey,
    256
  )
  return crypto.subtle.deriveKey(
    {
      hash: 'SHA-256',
      info: encoder.encode(`oklch-contest/${VERSION}`),
      name: 'HKDF',
      salt: concat(ephemeral, recipient)
    },
    await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']),
    { length: 256, name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function generateKeyPair(): Promise<{
  privateKey: string
  publicKey: string
}> {
  const pair = await crypto.subtle.generateKey(CURVE, true, ['deriveBits'])
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
    crypto.subtle.exportKey('raw', pair.publicKey)
  ])
  return {
    privateKey: toBase64Url(new Uint8Array(privateKey)),
    publicKey: toBase64Url(new Uint8Array(publicKey))
  }
}

/** The returned key cannot be exported again, even by scripts on the page. */
export async function importPrivateKey(encoded: string): Promise<PrivateKey> {
  const pkcs8 = fromBase64(encoded.trim())
  const load = (extractable: boolean) =>
    crypto.subtle.importKey('pkcs8', pkcs8, CURVE, extractable, ['deriveBits'])
  const { x = '', y = '' } = await crypto.subtle.exportKey(
    'jwk',
    await load(true)
  )
  const point = concat(Uint8Array.of(4), fromBase64(x), fromBase64(y))
  return { key: await load(false), publicKey: toBase64Url(point) }
}

/**
 * Encrypt a JSON value. The `context` is authenticated but not secret:
 * the message can only be opened with the very same context.
 */
export async function seal(
  publicKey: string,
  context: string,
  value: unknown
): Promise<string> {
  const recipient = fromBase64(publicKey)
  // Compressed keys can be imported, but `unseal()` would salt differently
  if (recipient.length !== POINT_BYTES) throw new Error('Invalid public key')
  const pair = await crypto.subtle.generateKey(CURVE, false, ['deriveBits'])
  const ephemeral = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey)
  )
  const json = encoder.encode(JSON.stringify(value))
  const padded = new Uint8Array(
    Math.ceil(json.length / PADDING_BYTES) * PADDING_BYTES
  ).fill(0x20)
  padded.set(json)

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { additionalData: encoder.encode(context), iv, name: 'AES-GCM' },
    await deriveKey(pair.privateKey, recipient, ephemeral, recipient),
    padded
  )
  const message = concat(ephemeral, iv, new Uint8Array(ciphertext))
  return `${VERSION}.${toBase64Url(message)}`
}

export async function unseal(
  { key, publicKey }: PrivateKey,
  context: string,
  sealed: string
): Promise<unknown> {
  const [version, body = ''] = sealed.split('.')
  if (version !== VERSION) throw new Error(`Unknown format ${version}`)
  const message = fromBase64(body)
  const ephemeral = message.slice(0, POINT_BYTES)
  const plaintext = await crypto.subtle.decrypt(
    {
      additionalData: encoder.encode(context),
      iv: message.slice(POINT_BYTES, POINT_BYTES + IV_BYTES),
      name: 'AES-GCM'
    },
    await deriveKey(key, ephemeral, ephemeral, fromBase64(publicKey)),
    message.slice(POINT_BYTES + IV_BYTES)
  )
  return JSON.parse(new TextDecoder().decode(plaintext))
}
