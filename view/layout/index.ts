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

// Admin button password protection
let adminButton = document.querySelector<HTMLButtonElement>('#admin-button')
if (adminButton) {
  adminButton.addEventListener('click', () => {
    let password = prompt('Enter admin password:')
    if (password === 'spiceknows') {
      showAdminPanel.set(true)
    } else if (password !== null) {
      alert('Incorrect password')
    }
  })
}
