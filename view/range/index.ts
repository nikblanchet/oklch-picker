import { effect } from '@preact/signals-core'

import { createSurface } from '../../lib/canvas.ts'
import { AXES } from '../../lib/config.ts'
import { $ } from '../../lib/dom.ts'
import { paintRange } from '../../lib/paint.ts'
import { axes, setAxes } from '../../stores/current.ts'
import { gamut } from '../../stores/visible.ts'

for (const axis of AXES) {
  const range = $(`.range.is-${axis}`)
  const input = $<HTMLInputElement>('input', range)
  const list = $('datalist', range)
  const surface = createSurface($<HTMLCanvasElement>('canvas', range))

  input.addEventListener('input', () => {
    setAxes({ [axis]: input.valueAsNumber })
  })

  effect(() => {
    input.value = String(axes[axis].value)
  })

  effect(() => {
    const { width } = surface.size.value
    // Do not subscribe to own axis: the background does not depend on it
    const read = (other: typeof axis) =>
      other === axis ? 0 : axes[other].value
    const color = { c: read('c'), h: read('h'), l: read('l') }
    if (width === 0) return

    const { space } = surface
    const { pixels, stops } = paintRange({ axis, color, space, width })
    surface.draw(pixels, width)
    list.replaceChildren(...stops.map(stop => new Option('', String(stop))))
  })

  effect(() => {
    const isPainted = gamut.value === 'srgb' || gamut.value === 'p3'
    range.classList.toggle('is-invisible', !isPainted)
  })
}
