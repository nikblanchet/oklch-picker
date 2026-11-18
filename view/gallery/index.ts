import { isLight } from '../../lib/describe.ts'
import { $, idleTimer, setCssVar } from '../../lib/dom.ts'
import {
  clearDraft,
  getIdleTimeout,
  loadDraft,
  saveDraft
} from '../../lib/draft.ts'
import { toRgbCss } from '../../lib/gamut.ts'

const draft = loadDraft()
if (draft) {
  const abandoned = idleTimer(clearDraft)
  abandoned.start(getIdleTimeout(draft.submitted), draft.expiresAt)
  // Browsing is not idling
  addEventListener('pagehide', () => {
    const expiresAt = abandoned.deadline
    if (expiresAt !== Infinity) saveDraft({ ...draft, expiresAt })
    abandoned.stop()
  })
  const { c, h, l } = draft.color
  setCssVar('--current-color', toRgbCss(l, c, h))
  $('.gallery_return').classList.toggle('is-light', isLight(draft.color))
}

// The draft may be somebody else’s by now
addEventListener('pageshow', e => {
  if (e.persisted) location.reload()
})
