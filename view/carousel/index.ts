import { $, create, setCssVar } from '../../lib/dom.ts'
import { lineup, look } from '../../stores/current.ts'

const DRAG_THRESHOLD = 6
const EASING_MS = 90
const WHEEL_IDLE_MS = 120
const WHEEL_THRESHOLD = 0.1
const QUICK_MS = 300
/** In pixels per millisecond, right before the finger is lifted. */
const FLICK_SPEED = 0.3
const FLICK_MS = 100

const rail = $('#looks')
const count = lineup.length
const slides = lineup.map(({ name }) => {
  const slide = create('div', 'look', rail)
  // Nothing is downloaded until the screen is shown
  slide.dataset['look'] = name
  return slide
})

// The sketches stand in a circle, so there is no end to run into
let position = Math.max(0, lineup.indexOf(look.peek()))
let target = position
let pitch = 1
let frame = 0
let wheelTimer: ReturnType<typeof setTimeout> | undefined

function wrap(value: number): number {
  return ((value % count) + count) % count
}

function render(): void {
  const reach = rail.clientWidth / pitch / 2 + 1.5
  for (const [i, slide] of slides.entries()) {
    const offset = wrap(i - position + count / 2) - count / 2
    const away = Math.min(1, Math.abs(offset))
    slide.classList.toggle('is-near', Math.abs(offset) < reach)
    slide.style.opacity = String(1 - 0.5 * away)
    slide.style.transform = `translateX(${offset * pitch}px) scale(${1 - 0.13 * away})`
  }
  look.value = lineup[wrap(Math.round(position))]!
}

function stop(): void {
  cancelAnimationFrame(frame)
  clearTimeout(wheelTimer)
}

function slideTo(index: number): void {
  stop()
  target = index
  let before = performance.now()
  const isCalm = matchMedia('(prefers-reduced-motion: reduce)').matches
  function step(now: number): void {
    const decay = Math.min(1, Math.exp((before - now) / EASING_MS))
    const left = (target - position) * decay
    const isDone = isCalm || Math.abs(left * pitch) < 0.3
    before = now
    position = isDone ? target : target - left
    render()
    if (!isDone) frame = requestAnimationFrame(step)
  }
  step(before)
}

new ResizeObserver(() => {
  const { clientHeight, clientWidth } = rail
  if (!clientWidth) return
  // Both neighbors have to be in sight, but cut off
  const height = Math.min(clientHeight, 0.8 * clientWidth)
  pitch = Math.max(
    0.52 * height,
    Math.min(0.42 * clientWidth, 0.6 * height),
    clientWidth / (count - 2)
  )
  setCssVar('--height', `${height}px`, rail.parentElement!)
  render()
}).observe(rail)

new ResizeObserver(([entry]) => {
  const stage = entry!.target as HTMLElement
  const height = Math.min(stage.clientHeight, 1.2 * stage.clientWidth)
  setCssVar('--height', `${height}px`, stage)
}).observe($('#done .stage'))

for (const type of ['pointerdown', 'keydown', 'wheel']) {
  rail.parentElement!.addEventListener(
    type,
    () => {
      rail.classList.remove('is-hinting')
    },
    { once: true, passive: true }
  )
}

interface Drag {
  from: number
  isMoved: boolean
  start: PointerEvent
  trail: PointerEvent[]
}

let drag: Drag | undefined

function findNext(direction: number, slack = 0): number {
  return direction * Math.ceil(direction * position - slack)
}

function findDestination({ from, start, trail }: Drag, end: PointerEvent) {
  const recent = trail.find(i => end.timeStamp - i.timeStamp < FLICK_MS) ?? end
  const speed =
    (recent.clientX - end.clientX) /
    Math.max(1, end.timeStamp - recent.timeStamp)
  if (Math.abs(speed) < FLICK_SPEED) return Math.round(position)
  const direction = Math.sign(speed)
  const next = findNext(direction)
  // Every flick counts, even if the previous one is still on its way
  return end.timeStamp - start.timeStamp < QUICK_MS &&
    direction === Math.sign(position - from)
    ? direction * Math.max(direction * next, direction * target + 1)
    : next
}

function cancel(): void {
  slideTo(drag?.isMoved ? Math.round(position) : target)
  drag = undefined
}

rail.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.ctrlKey) return
  if (drag && rail.hasPointerCapture(drag.start.pointerId)) return
  stop()
  rail.setPointerCapture(e.pointerId)
  drag = { from: position, isMoved: false, start: e, trail: [e] }
})

rail.addEventListener('pointermove', e => {
  if (e.pointerId !== drag?.start.pointerId) return
  // A menu may have swallowed the release
  if (!e.buttons) {
    cancel()
    return
  }
  const distance = e.clientX - drag.start.clientX
  drag.isMoved ||= Math.abs(distance) > DRAG_THRESHOLD
  if (!drag.isMoved) return
  drag.trail.push(e)
  position = drag.from - distance / pitch
  render()
})

rail.addEventListener('pointerup', e => {
  if (e.pointerId !== drag?.start.pointerId) return
  const { left, width } = rail.getBoundingClientRect()
  if (!width) {
    cancel()
    return
  }
  slideTo(
    drag.isMoved
      ? findDestination(drag, e)
      : Math.round(position + (e.clientX - left - width / 2) / pitch)
  )
  drag = undefined
})

rail.addEventListener('pointercancel', e => {
  if (e.pointerId === drag?.start.pointerId) cancel()
})

// Thumbs move in arcs, which must not turn into scrolling the page
rail.addEventListener(
  'touchmove',
  e => {
    if (drag?.isMoved && e.cancelable) e.preventDefault()
  },
  { passive: false }
)

rail.parentElement!.addEventListener(
  'wheel',
  e => {
    if (drag || e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    if (e.cancelable) e.preventDefault()
    stop()
    position += e.deltaX / pitch
    target = findNext(Math.sign(e.deltaX), WHEEL_THRESHOLD)
    render()
    wheelTimer = setTimeout(slideTo, WHEEL_IDLE_MS, target)
  },
  { passive: false }
)

$('#look-previous').addEventListener('click', () => {
  slideTo(target - 1)
})
$('#look-next').addEventListener('click', () => {
  slideTo(target + 1)
})
