import { effect } from '@preact/signals-core'

import { createSurface, type Surface } from '../../lib/canvas.ts'
import { clamp } from '../../lib/color.ts'
import { type Axis, AXIS_MAX } from '../../lib/config.ts'
import { $, setCssVar } from '../../lib/dom.ts'
import { type ChartTask, paintChart } from '../../lib/paint.ts'
import { axes, current, setAxes, setColor } from '../../stores/current.ts'

/** Fingers wobble, so a touch is a drag only after moving sideways a bit. */
const TOUCH_SLOP_PX = 16

function createWorker(): undefined | Worker {
  try {
    return new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module'
    })
  } catch {
    return undefined
  }
}

/** Paints in a worker, skipping tasks which became stale while it was busy. */
function createPainter(surface: Surface): (task: ChartTask) => void {
  let worker = createWorker()
  let running: ChartTask | undefined
  let queued: ChartTask | undefined

  function paint(task: ChartTask): void {
    if (!worker) {
      surface.draw(paintChart(task), task.width)
    } else if (running) {
      queued = task
    } else {
      running = task
      worker.postMessage(task)
    }
  }

  function next(): void {
    const task = queued
    running = queued = undefined
    if (task) paint(task)
  }

  worker?.addEventListener(
    'message',
    ({ data }: MessageEvent<Uint8ClampedArray<ArrayBuffer>>) => {
      const done = running
      next()
      if (done) surface.draw(data, done.width)
    }
  )
  worker?.addEventListener('error', () => {
    worker?.terminate()
    worker = undefined
    queued ??= running
    next()
  })

  return paint
}

function initChart(fixed: Axis, x: ChartTask['x'], y: ChartTask['y']): void {
  const chart = $(`.chart.is-${fixed}`)
  const canvas = $<HTMLCanvasElement>('canvas', chart)
  const surface = createSurface(canvas)
  const paint = createPainter(surface)

  effect(() => {
    const { height, width } = surface.size.value
    const { value } = axes[fixed]
    if (width > 0 && height > 0) {
      paint({ height, space: surface.space, value, width, x, y })
    }
  })

  effect(() => {
    const percent = (axis: Axis) =>
      `${clamp(0, (100 * axes[axis].value) / AXIS_MAX[axis], 100)}%`
    setCssVar('--chart-x', percent(x), chart)
    setCssVar('--chart-y', percent(y), chart)
  })

  function pick({ clientX, clientY }: MouseEvent): void {
    const { bottom, height, left, width } = canvas.getBoundingClientRect()
    setAxes({
      [x]: AXIS_MAX[x] * clamp(0, (clientX - left) / width, 1),
      [y]: AXIS_MAX[y] * clamp(0, (bottom - clientY) / height, 1)
    })
  }

  let before = current.peek()
  let startX = 0
  let isDragging = false
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.isPrimary) return
    before = current.peek()
    startX = e.clientX
    isDragging = e.pointerType !== 'touch'
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', e => {
    if (!e.isPrimary || !canvas.hasPointerCapture(e.pointerId)) return
    isDragging ||= Math.abs(e.clientX - startX) > TOUCH_SLOP_PX
    if (isDragging) pick(e)
  })
  // Unlike `pointerup`, it does not fire for taps which stop a scroll
  canvas.addEventListener('click', pick)
  // The touch turned out to be a scroll or a zoom
  canvas.addEventListener('pointercancel', e => {
    if (e.isPrimary) setColor(before)
  })
}

initChart('h', 'l', 'c')
initChart('l', 'h', 'c')
initChart('c', 'h', 'l')
