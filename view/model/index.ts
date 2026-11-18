import { effect } from '@preact/signals-core'

import { $ } from '../../lib/dom.ts'
import type { Model } from '../../lib/model.ts'
import { current } from '../../stores/current.ts'
import { navigate, route } from '../../stores/route.ts'

/** three.js is big, so it is only loaded once a model is really on screen. */
function lazyModel(
  block: HTMLElement,
  isFullControl: boolean,
  onReady?: (model: Model) => void
): void {
  const canvas = $<HTMLCanvasElement>('canvas', block)
  const status = $('.model_status', block)
  let loading: Promise<Model | undefined> | undefined

  async function load(): Promise<Model | undefined> {
    status.textContent = 'Loading…'
    let createModel
    try {
      ;({ createModel } = await import('../../lib/model.ts'))
    } catch {
      status.textContent = 'Network error. Reload the page to try again.'
      return undefined
    }
    try {
      const model = createModel(canvas, isFullControl)
      status.textContent = ''
      onReady?.(model)
      return model
    } catch {
      status.textContent = '3D is not supported by this browser'
      return undefined
    }
  }

  new IntersectionObserver(entries => {
    if (entries.at(-1)?.isIntersecting) {
      void (loading ??= load()).then(model => model?.sync())
    }
  }).observe(canvas)

  route.subscribe(() => {
    void loading?.then(model => model?.sync())
  })
}

lazyModel($('.model.is-mini'), false, model => {
  effect(() => {
    model.highlight(current.value)
  })
})

const fullscreen = $<HTMLDialogElement>('.model.is-full')
lazyModel(fullscreen, true)

route.subscribe(value => {
  if (value === '3d') {
    fullscreen.showModal()
  } else {
    fullscreen.close()
  }
})

$('#open-3d').addEventListener('click', () => {
  navigate('3d')
})
fullscreen.addEventListener('close', () => {
  navigate('main')
})
