import { toggleVisibility } from '../../lib/dom.ts'
import { showAdminPanel } from '../../stores/contest.ts'
import { show3d } from '../../stores/settings.ts'
import { url } from '../../stores/url.ts'

let layout = document.querySelector<HTMLDivElement>('.layout')!
let card3d = document.querySelector<HTMLDivElement>('.layout_3d')!

show3d.subscribe(enabled => {
  card3d.classList.toggle('is-shown', enabled)
})

url.subscribe(value => {
  toggleVisibility(layout, value !== '3d')
})

// Admin button password protection with custom modal
let adminButton = document.querySelector<HTMLButtonElement>('#admin-button')
let passwordModal = document.querySelector<HTMLDivElement>('#password-modal')
let passwordInput = document.querySelector<HTMLInputElement>('#password-input')
let passwordSubmit = document.querySelector<HTMLButtonElement>('#password-submit')
let passwordCancel = document.querySelector<HTMLButtonElement>('#password-cancel')
let passwordOverlay = document.querySelector<HTMLDivElement>('.password-overlay')

function showPasswordModal(): void {
  passwordModal?.classList.add('is-visible')
  passwordInput?.focus()
  if (passwordInput) passwordInput.value = ''
}

function hidePasswordModal(): void {
  passwordModal?.classList.remove('is-visible')
  if (passwordInput) passwordInput.value = ''
}

function checkPassword(): void {
  let password = passwordInput?.value || ''
  if (password === 'spiceknows') {
    hidePasswordModal()
    showAdminPanel.set(true)
  } else {
    alert('Incorrect password')
    passwordInput?.focus()
  }
}

if (adminButton) {
  adminButton.addEventListener('click', showPasswordModal)
}

passwordSubmit?.addEventListener('click', checkPassword)
passwordCancel?.addEventListener('click', hidePasswordModal)
passwordOverlay?.addEventListener('click', hidePasswordModal)

passwordInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    checkPassword()
  } else if (e.key === 'Escape') {
    hidePasswordModal()
  }
})

// See Past button - navigate to pantone colors page
let seePastBtn = document.querySelector<HTMLButtonElement>('#see-past-btn')
if (seePastBtn) {
  seePastBtn.addEventListener('click', () => {
    window.location.href = '/reports/pantone-colors-of-the-year.html'
  })
}
