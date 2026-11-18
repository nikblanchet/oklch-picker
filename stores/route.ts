import { type ReadonlySignal, signal } from '@preact/signals-core'

export type Route = '3d' | 'main'

function readRoute(): Route {
  return new URLSearchParams(location.search).has('3d') ? '3d' : 'main'
}

const state = signal(readRoute())

export const route: ReadonlySignal<Route> = state

export function navigate(to: Route): void {
  if (to === state.peek()) return
  if (to === '3d') {
    history.pushState('opened', '', '?3d')
  } else if (history.state === 'opened') {
    history.back()
  } else {
    history.replaceState(null, '', location.pathname)
  }
  state.value = to
}

addEventListener('popstate', () => {
  state.value = readRoute()
})
