import { effect } from '@preact/signals-core'

import { clamp } from '../../lib/color.ts'
import { AXES, AXIS_MAX, AXIS_STEP } from '../../lib/config.ts'
import { $ } from '../../lib/dom.ts'
import { evaluate } from '../../lib/expression.ts'
import { hasModifier } from '../../lib/hotkeys.ts'
import { axes, setAxes } from '../../stores/current.ts'
import { focusByHotkey, setError } from '../field/index.ts'

const REPEAT_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 50

/** Call back on click, or repeatedly for as long as the button is held. */
function onPress(button: HTMLElement, callback: (e: MouseEvent) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let isRepeating = false
  button.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
    // Touches are captured by default, which postpones `pointerleave`
    button.releasePointerCapture(e.pointerId)
    isRepeating = false
    const repeat = (): void => {
      isRepeating = true
      callback(e)
      timer = setTimeout(repeat, REPEAT_INTERVAL_MS)
    }
    clearTimeout(timer)
    timer = setTimeout(repeat, REPEAT_DELAY_MS)
  })
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
    button.addEventListener(type, () => {
      clearTimeout(timer)
    })
  }
  button.addEventListener('click', e => {
    if (!isRepeating) callback(e)
  })
  // Keep the focus where it is
  button.addEventListener('mousedown', e => {
    e.preventDefault()
  })
}

for (const axis of AXES) {
  const card = $(`.card.is-${axis}`)
  const input = $<HTMLInputElement>('[role=spinbutton]', card)

  function show(): void {
    input.value = String(axes[axis].value)
    input.setAttribute('aria-valuenow', input.value)
    setError(input, '')
  }

  function apply(steps: number): void {
    const typed = evaluate(input.value)
    if (typed === undefined) {
      setError(input, 'Invalid number')
      return
    }
    const value = typed + steps * AXIS_STEP[axis]
    // Pasted colors may be off the chart
    const max = Math.max(AXIS_MAX[axis], axes[axis].peek())
    // Hue is an angle, so it wraps around instead
    setAxes({ [axis]: axis === 'h' ? value : clamp(0, value, max) })
    show()
  }

  function spin(direction: number, e: { shiftKey: boolean }): void {
    apply(direction * (e.shiftKey ? 0.1 : 1))
  }

  effect(show)

  input.addEventListener('input', () => {
    setError(input, '')
  })
  input.addEventListener('change', () => {
    apply(0)
  })
  input.addEventListener('blur', show)
  input.addEventListener('keydown', e => {
    if (hasModifier(e)) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      spin(e.key === 'ArrowUp' ? 1 : -1, e)
    } else {
      focusByHotkey(e)
    }
  })

  onPress($('.is-increase', card), e => {
    spin(1, e)
  })
  onPress($('.is-decrease', card), e => {
    spin(-1, e)
  })
}
