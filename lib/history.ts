import { effect, type Signal } from '@preact/signals-core'

export interface History {
  clear(): void
  redo(): void
  undo(): void
}

const LIMIT = 200

/** Undo stack which treats a quick series of changes as a single step. */
export function trackHistory<T>(state: Signal<T>, settleMs = 100): History {
  let past: T[] = []
  let future: T[] = []
  let settled = state.peek()
  let timer: ReturnType<typeof setTimeout> | undefined

  function settle(): void {
    clearTimeout(timer)
    if (state.peek() === settled) return
    past = [...past, settled].slice(-LIMIT)
    future = []
    settled = state.peek()
  }

  function travel(from: T[], to: T[]): void {
    if (from.length === 0) return
    to.push(settled)
    settled = from.pop()!
    state.value = settled
  }

  effect(() => {
    clearTimeout(timer)
    if (state.value !== settled) timer = setTimeout(settle, settleMs)
  })

  return {
    clear() {
      clearTimeout(timer)
      past = []
      future = []
      settled = state.peek()
    },
    redo() {
      settle()
      travel(future, past)
    },
    undo() {
      settle()
      travel(past, future)
    }
  }
}
