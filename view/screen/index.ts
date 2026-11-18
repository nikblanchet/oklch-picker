import { effect } from '@preact/signals-core'

import { $ } from '../../lib/dom.ts'
import {
  isParty,
  redirect,
  type Route,
  route,
  ROUTES
} from '../../stores/route.ts'

let [previous, shown]: (Route | undefined)[] = []

effect(() => {
  const current = route.value
  for (const id of ROUTES) $(`#${id}`).hidden = id !== current
  if (shown) {
    scrollTo(0, 0)
    $(`#${current} [tabindex="-1"]`).focus({ preventScroll: true })
  }
  previous = shown
  shown = current
})

$('#past-back').addEventListener('click', () => {
  redirect(previous ?? 'start')
})

$('#party').hidden = !isParty
