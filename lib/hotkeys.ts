type KeyInfo = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
> & { code?: string; key?: string }

/** The Latin letter of a key, whatever keyboard layout is active. */
export function getKey({ code = '', key = '' }: KeyInfo): string {
  // Autofill dispatches key events which have no `key` at all
  return /^\P{ASCII}$/u.test(key) && /^Key.$/.test(code)
    ? code.slice(3).toLowerCase()
    : key.toLowerCase()
}

/** Such as `ctrl+shift+z`. */
export function getHotkey(e: KeyInfo): string {
  return [
    e.metaKey && 'meta',
    e.ctrlKey && 'ctrl',
    e.altKey && 'alt',
    e.shiftKey && 'shift',
    getKey(e)
  ]
    .filter(Boolean)
    .join('+')
}

export function hasModifier(e: KeyInfo): boolean {
  return e.ctrlKey || e.altKey || e.metaKey
}
