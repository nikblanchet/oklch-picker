import { deepStrictEqual, equal, notEqual, rejects } from 'node:assert/strict'
import { test } from 'node:test'

import { sealContext } from '../lib/contest.ts'
import {
  generateKeyPair,
  importPrivateKey,
  seal,
  unseal
} from '../lib/crypto.ts'
import { decryptLegacy } from '../lib/legacy-crypto.ts'
import { LEGACY, SEALED } from './ciphertexts.ts'

const pair = await generateKeyPair()
const key = await importPrivateKey(pair.privateKey)
const SECRET = { contact: 'zoë@example.com', name: '🌈 Zoë' }

test('opens what was sealed', async () => {
  const sealed = await seal(pair.publicKey, 'a', SECRET)
  deepStrictEqual(await unseal(key, 'a', sealed), SECRET)
})

test('derives the public key and hides the private one', () => {
  equal(key.publicKey, pair.publicKey)
  equal(key.key.extractable, false)
})

test('never repeats a ciphertext', async () => {
  notEqual(
    await seal(pair.publicKey, 'a', SECRET),
    await seal(pair.publicKey, 'a', SECRET)
  )
})

test('hides the length', async () => {
  const short = await seal(pair.publicKey, 'a', 'a')
  const long = await seal(pair.publicKey, 'a', 'a'.repeat(100))
  equal(short.length, long.length)
})

test('refuses another key, another context or tampering', async () => {
  const sealed = await seal(pair.publicKey, 'a', SECRET)
  const other = await importPrivateKey((await generateKeyPair()).privateKey)
  await rejects(unseal(other, 'a', sealed))
  await rejects(unseal(key, 'b', sealed))
  for (const position of [10, 95, 150, sealed.length - 3]) {
    const flipped = sealed[position] === 'A' ? 'B' : 'A'
    const changed =
      sealed.slice(0, position) + flipped + sealed.slice(position + 1)
    await rejects(unseal(key, 'a', changed))
  }
  await rejects(unseal(key, 'a', sealed.replace('v2', 'v1')))
  await rejects(unseal(key, 'a', 'v2.'))
})

test('refuses invalid keys', async () => {
  await rejects(importPrivateKey('nope'))
  await rejects(importPrivateKey(pair.publicKey))
  await rejects(seal(pair.privateKey, 'a', SECRET))
})

test('reads entries which are already stored', async () => {
  deepStrictEqual(
    await unseal(
      await importPrivateKey(SEALED.privateKey),
      sealContext(2027, SEALED.id),
      SEALED.sealed
    ),
    { contact: 'zoe@example.com', name: 'Zoë' }
  )
})

test('reads entries encrypted by the 2026 site', async () => {
  deepStrictEqual(
    await decryptLegacy(LEGACY.salt, [
      LEGACY.encrypted_name,
      LEGACY.encrypted_contact
    ]),
    ['Zoë', 'zoe@example.com']
  )
})
