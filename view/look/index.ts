import { effect } from '@preact/signals-core'

import { setCssVar } from '../../lib/dom.ts'
import { look } from '../../stores/current.ts'

/** Download sketches only once they are about to be seen. */
export function observeLooks(
  root: Element | null
): (sketch: HTMLElement, name: string) => void {
  const names = new WeakMap<Element, string>()
  const observer = new IntersectionObserver(
    entries => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue
        target.setAttribute('data-look', names.get(target)!)
        observer.unobserve(target)
      }
    },
    { root, rootMargin: '50%' }
  )
  return (sketch, name) => {
    names.set(sketch, name)
    observer.observe(sketch)
  }
}

// The zigzag which pinking shears leave on fabric samples
const TEETH = 9
const edge = Array.from(
  { length: 2 * TEETH + 1 },
  (_, i) => [(50 * i) / TEETH, i % 2 ? 0 : 4] as const
)
const outline = [
  ...edge.map(([x, y]) => `${x}% ${y}%`),
  ...edge.map(([x, y]) => `${100 - x}% ${100 - y}%`)
]
setCssVar('--pinked', `polygon(${outline.join()})`)

effect(() => {
  const { name, x, y } = look.value
  setCssVar('--pin-x', String(x))
  setCssVar('--pin-y', String(y))
  setCssVar('--pin-turn', x < 0 ? '-3deg' : '3deg')
  for (const sketch of document.querySelectorAll('.look.is-chosen')) {
    sketch.setAttribute('data-look', name)
  }
})
