import { type ReadonlySignal, signal } from '@preact/signals-core'

import type { CanvasSpace } from './paint.ts'

export interface Surface {
  draw(pixels: Uint8ClampedArray<ArrayBuffer>, width: number): void
  /** In device pixels. Zero while the canvas is hidden. */
  size: ReadonlySignal<{ height: number; width: number }>
  space: CanvasSpace
}

/** Denser screens cost more to paint without looking any better. */
const MAX_PIXEL_RATIO = 2

export function createSurface(canvas: HTMLCanvasElement): Surface {
  // Chrome without GPU shows P3 canvases unconverted, so only ask when useful
  const isP3 = matchMedia('(color-gamut: p3)').matches
  const ctx = canvas.getContext('2d', {
    colorSpace: isP3 ? 'display-p3' : 'srgb'
  })!
  // Browsers without wide gamut canvas silently fall back to sRGB
  const space =
    ctx.createImageData(1, 1).colorSpace === 'display-p3'
      ? 'display-p3'
      : 'srgb'

  const size = signal({ height: 0, width: 0 })
  function measure(): void {
    const ratio = Math.min(devicePixelRatio, MAX_PIXEL_RATIO)
    const height = Math.round(canvas.clientHeight * ratio)
    const width = Math.round(canvas.clientWidth * ratio)
    if (width !== size.peek().width || height !== size.peek().height) {
      size.value = { height, width }
    }
  }
  new ResizeObserver(measure).observe(canvas)
  // Zooming changes the pixel ratio, but not the CSS size
  addEventListener('resize', measure)

  // Pixels are lost when the GPU restarts. Safari does not announce that.
  function repaint(): void {
    size.value = { ...size.peek() }
  }
  canvas.addEventListener('contextrestored', repaint)
  document.addEventListener('visibilitychange', repaint)

  return {
    draw(pixels, width) {
      const height = pixels.length / 4 / width
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      const image = new ImageData(pixels, width, height, { colorSpace: space })
      ctx.putImageData(image, 0, 0)
    },
    size,
    space
  }
}
