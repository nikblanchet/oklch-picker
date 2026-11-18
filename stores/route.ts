import { type ReadonlySignal, signal } from '@preact/signals-core'

import { load, remove, save } from '../lib/storage.ts'

export const ROUTES = ['start', 'past', 'pick', 'sign', 'done'] as const

export type Route = (typeof ROUTES)[number]

const PARTY = 'party'

export function readParty(): boolean {
  return (
    new URLSearchParams(location.search).has(PARTY) ||
    load('localStorage', PARTY) === true
  )
}

function readRoute(): Route {
  return ROUTES.find(i => `#${i}` === location.hash) ?? 'start'
}

const state = signal(readRoute())

export const route: ReadonlySignal<Route> = state

/** A phone which is passed around must not remember anybody. */
export const isParty = readParty()

/** It has to last, or the Back button would lead to the owner’s entry. */
export function setParty(isOn: boolean): void {
  if (isOn) {
    save('localStorage', PARTY, true)
  } else {
    remove('localStorage', key => key === PARTY)
  }
}

if (isParty) setParty(true)

/** Go to another screen without a way back to this one. */
export function redirect(to: Route): void {
  history.replaceState(null, '', `#${to}`)
  state.value = to
}

addEventListener('hashchange', () => {
  state.value = readRoute()
})
