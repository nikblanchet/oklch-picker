import { $, closeOnBackdropClick, idleTimer, whileBusy } from '../../lib/dom.ts'
import { getHotkey } from '../../lib/hotkeys.ts'
import { ApiError } from '../../lib/supabase.ts'
import { explainError } from '../../stores/backend.ts'

const IDLE_MS = 2 * 60 * 1000

const dialog = $<HTMLDialogElement>('#login')
const form = $<HTMLFormElement>('form', dialog)
const error = $('[role=alert]', dialog)

let attempt = new AbortController()

function close(): void {
  dialog.close()
}

const abandoned = idleTimer(close)

function open(): void {
  if (document.querySelector('dialog[open]')) return
  attempt = new AbortController()
  dialog.showModal()
  abandoned.start(IDLE_MS)
}

function input(id: string): HTMLInputElement {
  return $<HTMLInputElement>(`#login-${id}`)
}

/** Text undo could bring the value back into a field which was just emptied. */
function replaceInput(id: string): void {
  input(id).value = ''
  input(id).replaceWith(input(id).cloneNode())
}

function forget(): void {
  attempt.abort()
  abandoned.stop()
  error.textContent = ''
  for (const id of ['email', 'password', 'key']) replaceInput(id)
}

function explain(cause: unknown): string {
  return explainError(
    cause,
    cause instanceof ApiError && cause.status === 400
      ? 'Wrong email or password.'
      : 'Login failed. Reload the page and try again.'
  )
}

async function send(): Promise<void> {
  const { signal } = attempt
  error.textContent = ''
  try {
    const read = (id: string) => input(id).value
    const credentials = [read('email'), read('password'), read('key')] as const
    const { logIn } = await import('../admin/index.ts')
    await logIn(...credentials, signal)
    if (!signal.aborted) close()
  } catch (cause) {
    if (signal.aborted) return
    replaceInput('password')
    error.textContent = explain(cause)
  }
}

form.addEventListener('submit', e => {
  e.preventDefault()
  void whileBusy($('#login-submit'), 'Logging in…', send)
})

closeOnBackdropClick(dialog)
dialog.addEventListener('close', forget)
addEventListener('pagehide', forget)
$('#login-cancel').addEventListener('click', close)

addEventListener('keydown', e => {
  if (getHotkey(e) !== 'ctrl+shift+a') return
  e.preventDefault()
  open()
})

if (new URLSearchParams(location.search).has('admin')) open()
