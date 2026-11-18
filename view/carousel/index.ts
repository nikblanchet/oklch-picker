import { effect } from '@preact/signals-core'

import { $, create, setCssVar } from '../../lib/dom.ts'
import { getLook, LOOKS } from '../../lib/looks.ts'
import { look } from '../../stores/current.ts'

/** Copies on both ends make it endless. */
const CLONES = 4
const SETTLE_MS = 140
const DRAG_THRESHOLD = 4

const rail = $('#looks')
const slides = Array.from({ length: LOOKS.length + 2 * CLONES }, (_, i) => {
  const slide = create('div', 'carousel_slide', rail)
  // Nothing is downloaded until the screen is shown
  create('div', 'look', slide).dataset['look'] = getLook(i - CLONES).name
  return slide
})

let pitch = 0
let target: number | undefined
let drag: { isMoved: boolean; left: number; x: number } | undefined
let wasDragged = false
let isTouched = false
let timer: ReturnType<typeof setTimeout> | undefined

function toScroll(index: number): number {
  return (index + 0.5) * pitch - rail.clientWidth / 2
}

function getPosition(): number {
  return (rail.scrollLeft + rail.clientWidth / 2) / pitch - 0.5
}

function highlight(): void {
  const position = getPosition()
  for (const [i, slide] of slides.entries()) {
    setCssVar('--away', Math.min(1, Math.abs(i - position)).toFixed(2), slide)
  }
  look.value = (Math.round(position) - CLONES + LOOKS.length) % LOOKS.length
}

function jumpToCurrent(): void {
  rail.scrollLeft = toScroll(CLONES + (look.peek() % LOOKS.length))
}

function slideTo(index: number): void {
  target = index
  // The next scroll event starts it again
  clearTimeout(timer)
  const isCalm = matchMedia('(prefers-reduced-motion: reduce)').matches
  rail.scrollTo({
    behavior: isCalm ? 'auto' : 'smooth',
    left: toScroll(index)
  })
}

/** Move from a copy to the original, which looks exactly the same. */
function leaveClones(index: number): number {
  const shift =
    index < CLONES
      ? LOOKS.length
      : index >= CLONES + LOOKS.length
        ? -LOOKS.length
        : 0
  if (shift) rail.scrollLeft = toScroll(index + shift)
  return index + shift
}

function settle(): void {
  if (drag || isTouched || !rail.clientWidth) return
  target = undefined
  rail.classList.remove('is-held')
  leaveClones(Math.round(getPosition()))
}

function settleLater(): void {
  clearTimeout(timer)
  timer = setTimeout(settle, SETTLE_MS)
}

new ResizeObserver(() => {
  const { clientHeight, clientWidth } = rail
  if (!clientWidth) return
  // Both neighbors have to be in sight, but cut off
  const height = Math.min(clientHeight, 0.8 * clientWidth)
  pitch = Math.max(
    0.52 * height,
    Math.min(0.42 * clientWidth, 0.6 * height),
    clientWidth / (2 * CLONES - 1)
  )
  setCssVar('--height', `${height}px`, rail.parentElement!)
  setCssVar('--pitch', `${pitch}px`, rail)
  jumpToCurrent()
  highlight()
}).observe(rail)

new ResizeObserver(([entry]) => {
  const stage = entry!.target as HTMLElement
  setCssVar(
    '--height',
    `${Math.min(stage.clientHeight, 1.2 * stage.clientWidth)}px`,
    stage
  )
}).observe($('#done .stage'))

rail.addEventListener(
  'scroll',
  () => {
    if (!rail.clientWidth || !pitch) return
    highlight()
    settleLater()
  },
  { passive: true }
)

for (const type of ['pointerdown', 'keydown', 'wheel']) {
  rail.parentElement!.addEventListener(
    type,
    () => {
      rail.classList.remove('is-hinting')
    },
    { once: true, passive: true }
  )
}

for (const type of ['touchstart', 'touchend', 'touchcancel']) {
  rail.addEventListener(
    type,
    () => {
      isTouched = type === 'touchstart'
      settleLater()
    },
    { passive: true }
  )
}

// Fingers and trackpads scroll on their own
rail.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  drag = { isMoved: false, left: rail.scrollLeft, x: e.clientX }
})
addEventListener('pointermove', e => {
  if (!drag) return
  drag.isMoved ||= Math.abs(e.clientX - drag.x) > DRAG_THRESHOLD
  if (!drag.isMoved) return
  rail.classList.add('is-held')
  rail.scrollLeft = drag.left - (e.clientX - drag.x)
})
for (const type of ['pointerup', 'pointercancel']) {
  addEventListener(type, () => {
    wasDragged = drag?.isMoved ?? false
    drag = undefined
    if (!wasDragged) return
    slideTo(Math.round(getPosition()))
    settleLater()
  })
}
rail.addEventListener('click', e => {
  const index = slides.findIndex(i => i.contains(e.target as Node))
  if (index !== -1 && !wasDragged) slideTo(index)
})

for (const [id, step] of [
  ['#look-previous', -1],
  ['#look-next', 1]
] as const) {
  $(id).addEventListener('click', () => {
    slideTo(leaveClones(target ?? Math.round(getPosition())) + step)
  })
}

effect(() => {
  $('#look-number').textContent =
    `${(look.value % LOOKS.length) + 1} of ${LOOKS.length}`
})
