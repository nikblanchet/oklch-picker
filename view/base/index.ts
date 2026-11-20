import { effect } from '@preact/signals-core'

import { setCssVar } from '../../lib/dom.ts'
import { remove } from '../../lib/storage.ts'
import { hex } from '../../stores/current.ts'

// Earlier versions left decrypted entries and admin sessions on the device
remove('localStorage', key => /^(?:contest:|settings:|sb-)/.test(key))
remove('sessionStorage', key => key === 'savedFormState' || key === 'draft')

effect(() => {
  setCssVar('--guess', hex.value)
})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Caching all sketches must not compete with the first screen
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  })
}
