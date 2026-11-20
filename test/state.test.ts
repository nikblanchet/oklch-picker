import { deepStrictEqual, equal } from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { CONTEST_YEAR } from '../lib/config.ts'
import { loadOwn, saveGuest, saveOwn, takeGuest } from '../lib/draft.ts'
import { getHotkey } from '../lib/hotkeys.ts'

class MemoryStorage {
  [key: string]: unknown
  getItem(key: string): unknown {
    return this[key] ?? null
  }
  removeItem(key: string): void {
    Reflect.deleteProperty(this, key)
  }
  setItem(key: string, value: string): void {
    this[key] = value
  }
}

beforeEach(() => {
  for (const area of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, area, {
      configurable: true,
      value: new MemoryStorage()
    })
  }
})

const KEY = `entry-${CONTEST_YEAR}`
const COLOR = { c: 0.1, h: 20, l: 0.5 }
const PERSON = { colorName: 'B', contact: 'a@example.com', name: 'A' }
const PICK = { h: 20, l: 0.5, s: 0.5 }
const DRAFT = {
  attempted: undefined,
  look: 'gown',
  person: PERSON,
  pick: PICK,
  primer: COLOR,
  submitted: {
    person: PERSON,
    pick: PICK,
    primer: COLOR,
    ticket: { id: 'a', token: 'b' }
  }
}

test('keeps the own entry of this year only', () => {
  localStorage.setItem(`entry-${CONTEST_YEAR - 1}`, '{}')
  saveOwn(DRAFT)
  deepStrictEqual(loadOwn(), DRAFT)
  deepStrictEqual(Object.keys(localStorage), [KEY])
})

test('restores drafts of guests once, until they expire', () => {
  saveGuest(DRAFT, 300_000)
  deepStrictEqual(takeGuest(299_000), { ...DRAFT, expiresAt: 300_000 })
  equal(takeGuest(299_000), undefined)
  for (const expiresAt of [-1, Infinity, 901_000]) {
    saveGuest(DRAFT, expiresAt)
    equal(takeGuest(0), undefined)
    deepStrictEqual(Object.keys(sessionStorage), [])
  }
})

test('ignores broken drafts', () => {
  for (const value of [
    '{',
    '1',
    'null',
    JSON.stringify({ ...DRAFT, pick: { ...DRAFT.pick, l: null } }),
    JSON.stringify({ ...DRAFT, pick: { ...DRAFT.pick, s: 2 } }),
    JSON.stringify({ ...DRAFT, person: { name: 1 } }),
    JSON.stringify({ ...DRAFT, person: { ...PERSON, colorName: {} } })
  ]) {
    localStorage.setItem(KEY, value)
    equal(loadOwn(), undefined)
  }
  localStorage.setItem(KEY, JSON.stringify({ ...DRAFT, look: 3 }))
  equal(loadOwn()?.look, '')
})

test('reads hotkeys', () => {
  const none = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false
  }
  equal(
    getHotkey({ ...none, ctrlKey: true, key: 'Z', shiftKey: true }),
    'ctrl+shift+z'
  )
  equal(getHotkey({ ...none, code: 'KeyZ', key: 'я', metaKey: true }), 'meta+z')
  equal(getHotkey(none), '')
})
