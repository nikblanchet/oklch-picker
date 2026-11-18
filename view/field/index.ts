import { getKey, hasModifier } from '../../lib/hotkeys.ts'

const inputs = document.querySelectorAll<HTMLInputElement>('.field_input')
const hotkeys = new Map(
  Array.from(inputs, input => [input.getAttribute('aria-keyshortcuts'), input])
)

export function setError(input: HTMLInputElement, message: string): void {
  input.setAttribute('aria-invalid', String(!!message))
  input.setCustomValidity(message)
}

/** Focus the field which has the pressed key as its shortcut. */
export function focusByHotkey(e: KeyboardEvent): void {
  const input = hasModifier(e) ? undefined : hotkeys.get(getKey(e))
  if (!input) return
  e.preventDefault()
  input.focus()
}

for (const input of inputs) {
  let isJustFocused = false
  input.addEventListener('focus', () => {
    input.select()
    isJustFocused = true
  })
  // The click which focused the field must not drop the selection again
  input.addEventListener('mouseup', e => {
    if (isJustFocused) e.preventDefault()
    isJustFocused = false
  })
  input.addEventListener('keydown', () => {
    isJustFocused = false
  })
}

addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return
  if (e.target === document.body) {
    focusByHotkey(e)
  } else if (e.key === 'Escape' && e.target instanceof HTMLInputElement) {
    e.target.blur()
  }
})
