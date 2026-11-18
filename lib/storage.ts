/**
 * Web Storage throws when it is blocked or full, and it can hold anything.
 * These helpers never throw and leave validation to the caller.
 */
type Area = 'localStorage' | 'sessionStorage'

export function load(area: Area, key: string): unknown {
  try {
    return JSON.parse(globalThis[area].getItem(key) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

export function save(area: Area, key: string, value: unknown): void {
  try {
    globalThis[area].setItem(key, JSON.stringify(value))
  } catch {
    // Persistence is a convenience
  }
}

export function remove(area: Area, isTarget: (key: string) => boolean): void {
  try {
    const storage = globalThis[area]
    for (const key of Object.keys(storage).filter(isTarget)) {
      storage.removeItem(key)
    }
  } catch {
    // Nothing could have been stored either
  }
}
