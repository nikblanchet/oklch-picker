import { getColorDescription } from '../../lib/color-names.ts'
import { buildForCSS } from '../../lib/colors.ts'
import { $, $$ } from '../../lib/dom.ts'
import { current } from '../../stores/current.ts'
import { showContestForm, submitEntry } from '../../stores/contest.ts'

let modal = $<HTMLDivElement>('#contest-modal')
let colorPreview = $<HTMLDivElement>('#contest-color-preview')
let colorNameEl = $<HTMLDivElement>('#contest-color-name')
let colorFamilyEl = $<HTMLDivElement>('#contest-color-family')
let form = $<HTMLFormElement>('#contest-form')
let nameInput = $<HTMLInputElement>('#contest-name-input')
let cancelBtn = $<HTMLButtonElement>('#contest-cancel')
let successDiv = $<HTMLDivElement>('#contest-success')
let contentDiv = $<HTMLDivElement>('.contest-content')
let submittedInfo = $<HTMLDivElement>('#submitted-info')
let closeBtn = $<HTMLButtonElement>('#contest-close')

function updateColorDisplay(): void {
  let color = current.get()
  let { description, family, name } = getColorDescription(color)

  if (colorPreview) {
    colorPreview.style.background = buildForCSS(color.l, color.c, color.h, color.alpha)
  }
  if (colorNameEl) {
    colorNameEl.textContent = name
  }
  if (colorFamilyEl) {
    colorFamilyEl.textContent = `${description} (${family} family)`
  }
}

showContestForm.subscribe(visible => {
  if (visible) {
    modal?.classList.add('is-visible')
    updateColorDisplay()
    nameInput?.focus()
  } else {
    modal?.classList.remove('is-visible')
    contentDiv?.classList.remove('is-hidden')
    successDiv?.classList.remove('is-visible')
    if (form) form.reset()
  }
})

current.subscribe(() => {
  if (showContestForm.get()) {
    updateColorDisplay()
  }
})

form?.addEventListener('submit', e => {
  e.preventDefault()
  let name = nameInput?.value.trim() || ''
  if (name) {
    let color = current.get()
    submitEntry(name, color)

    let { description, family, name: colorName } = getColorDescription(color)
    if (submittedInfo) {
      submittedInfo.innerHTML = `
        <p><strong>Your name:</strong> ${name}</p>
        <p><strong>Your color:</strong> ${colorName}</p>
        <p><strong>Description:</strong> ${description}</p>
        <p><strong>Family:</strong> ${family}</p>
        <p><strong>OKLCH:</strong> oklch(${color.l.toFixed(2)} ${color.c.toFixed(3)} ${color.h.toFixed(1)})</p>
      `
    }

    contentDiv?.classList.add('is-hidden')
    successDiv?.classList.add('is-visible')
  }
})

cancelBtn?.addEventListener('click', () => {
  showContestForm.set(false)
})

closeBtn?.addEventListener('click', () => {
  showContestForm.set(false)
})

$$('.contest-overlay').forEach(overlay => {
  overlay.addEventListener('click', () => {
    showContestForm.set(false)
  })
})
