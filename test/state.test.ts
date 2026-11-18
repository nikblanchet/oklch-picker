import { signal } from '@preact/signals-core'
import { deepStrictEqual, equal } from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

import { loadDraft, saveDraft } from '../lib/draft.ts'
import { trackHistory } from '../lib/history.ts'
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
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: new MemoryStorage()
  })
  mock.timers.reset()
})

const COLOR = { c: 0.1, h: 20, l: 0.5 }
const PERSON = { contact: 'a@example.com', name: 'A' }
const DRAFT = {
  attempted: undefined,
  color: COLOR,
  expiresAt: 300_000,
  person: PERSON,
  primer: { ...COLOR, h: 200 },
  submitted: {
    person: PERSON,
    primer: COLOR,
    ticket: { id: 'id', token: 'token' }
  }
}

test('restores drafts until they expire', () => {
  saveDraft(DRAFT)
  deepStrictEqual(loadDraft(299_000), DRAFT)
  equal(loadDraft(301_000), undefined)
  deepStrictEqual(Object.keys(sessionStorage), [])
})

test('ignores broken drafts', () => {
  for (const value of [
    '{',
    '1',
    'null',
    JSON.stringify({ ...DRAFT, color: { ...COLOR, l: null } }),
    JSON.stringify({ ...DRAFT, person: { name: 1 } }),
    JSON.stringify({ ...DRAFT, expiresAt: Infinity }),
    JSON.stringify({ ...DRAFT, expiresAt: 901_000 })
  ]) {
    sessionStorage.setItem('draft', value)
    equal(loadDraft(0), undefined)
  }
})

test('undoes and redoes', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const state = signal(0)
  const history = trackHistory(state)
  function change(...values: number[]): void {
    for (const value of values) state.value = value
    mock.timers.tick(100)
  }

  change(1, 2, 3)
  change(4)
  history.undo()
  equal(state.value, 3)
  history.undo()
  history.undo()
  equal(state.value, 0)
  history.redo()
  equal(state.value, 3)

  // A change right after an undo is neither lost nor merged
  state.value = 5
  history.redo()
  equal(state.value, 5)
  history.undo()
  equal(state.value, 3)

  history.clear()
  history.undo()
  history.redo()
  equal(state.value, 3)
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
