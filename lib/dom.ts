/** Find an element which the page cannot work without. */
export function $<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): E {
  const element = root.querySelector<E>(selector)
  if (!element) throw new Error(`${selector} is missing`)
  return element
}

export function setText(root: ParentNode, texts: Record<string, string>): void {
  for (const [selector, text] of Object.entries(texts)) {
    $(selector, root).textContent = text
  }
}

export function setCssVar(
  name: `--${string}`,
  value: string,
  element: HTMLElement = document.documentElement
): void {
  element.style.setProperty(name, value)
}

/** Close a modal by clicking outside, until Safari supports `closedby`. */
export function closeOnBackdropClick(dialog: HTMLDialogElement): void {
  function isOutside({ clientX: x, clientY: y, target }: MouseEvent): boolean {
    const { bottom, left, right, top } = dialog.getBoundingClientRect()
    return target === dialog && (x < left || x > right || y < top || y > bottom)
  }
  let startedOutside = false
  dialog.addEventListener('pointerdown', e => {
    startedOutside = isOutside(e)
  })
  dialog.addEventListener('click', e => {
    if (startedOutside && isOutside(e)) dialog.close()
  })
}

/** Disable a button and show progress on it while the task is running. */
export async function whileBusy(
  button: HTMLButtonElement,
  label: string,
  task: () => Promise<void>
): Promise<void> {
  const origin = button.textContent
  const wasFocused = button === document.activeElement
  button.disabled = true
  button.textContent = label
  try {
    await task()
  } finally {
    button.disabled = false
    button.textContent = origin
    if (wasFocused && document.activeElement === document.body) button.focus()
  }
}

export interface IdleTimer {
  /** `Infinity` while it is stopped. */
  readonly deadline: number
  /** The first deadline may be carried over from another page. */
  start(timeoutMs: number, until?: number): void
  stop(): void
}

/**
 * Calls back once nobody has touched the page for a while. Timers are paused
 * while a device sleeps, so the clock is checked again when it wakes up.
 */
export function idleTimer(callback: () => void): IdleTimer {
  let timeout = 0
  let deadline = Infinity
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop(): void {
    clearTimeout(timer)
    deadline = Infinity
  }

  function start(timeoutMs: number, until = Date.now() + timeoutMs): void {
    clearTimeout(timer)
    timeout = timeoutMs
    deadline = until
    timer = setTimeout(expire, until - Date.now())
  }

  function expire(): void {
    stop()
    callback()
  }

  document.addEventListener('visibilitychange', () => {
    if (Date.now() >= deadline) expire()
  })
  for (const type of ['pointerdown', 'keydown', 'wheel']) {
    addEventListener(
      type,
      e => {
        if (Date.now() >= deadline) {
          // Enter must not press a button which is about to disappear
          if (type === 'keydown') e.preventDefault()
          expire()
        } else if (deadline !== Infinity) {
          start(timeout)
        }
      },
      { capture: true, passive: type !== 'keydown' }
    )
  }
  return {
    get deadline() {
      return deadline
    },
    start,
    stop
  }
}
