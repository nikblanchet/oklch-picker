import { effect } from '@preact/signals-core'

import { CONTEST_YEAR } from '../../lib/config.ts'
import {
  cleanPerson,
  countMatches,
  createTicket,
  isBlank,
  type Person,
  submitEntry
} from '../../lib/contest.ts'
import { $, idleTimer, whileBusy } from '../../lib/dom.ts'
import {
  clearGuest,
  clearOwn,
  type Draft,
  getIdleTimeout,
  loadOwn,
  saveGuest,
  saveOwn,
  type Submitted,
  takeGuest
} from '../../lib/draft.ts'
import { explainError, publicKey, supabase } from '../../stores/backend.ts'
import { color, look, pick, setPick } from '../../stores/current.ts'
import {
  isParty,
  readParty,
  redirect,
  route,
  setParty
} from '../../stores/route.ts'

const PARTY_URL = '/?party'

const main = $('main')
const form = $<HTMLFormElement>('#entry')
const name = $<HTMLInputElement>('#entry-name')
const contact = $<HTMLInputElement>('#entry-contact')
const colorName = $<HTMLInputElement>('#entry-color')
const submit = $<HTMLButtonElement>('#entry-submit')
const submitLabel = submit.textContent
const error = $('#entry-error')

const leftover = takeGuest()
const guest = isParty ? leftover : undefined
const draft = isParty ? guest : loadOwn()
let primer = draft?.primer ?? color.peek()
let { attempted, submitted }: Partial<Draft> = draft ?? {}
let isWiped = false
let stored = JSON.stringify(draft)

/** Another tab may hold the ticket by now. */
function isOutdated(): boolean {
  return !isParty && (readParty() || stored !== JSON.stringify(loadOwn()))
}

function readPerson(): Person {
  return cleanPerson({
    colorName: colorName.value,
    contact: contact.value,
    name: name.value
  })
}

/** The entry which the details in the form seem to belong to. */
function findEdited(): Submitted | undefined {
  const count = (i?: Submitted) =>
    i ? countMatches(i.person, readPerson()) : 0
  const best = count(attempted) > count(submitted) ? attempted : submitted
  if (count(best) > 0) return best
  // On the own phone, it is rather the owner who is fixing both fields
  return isParty ? undefined : submitted
}

/** Make it obvious whose entry is about to be replaced. */
function show(): void {
  submit.textContent =
    submitted && findEdited()?.ticket.id === submitted.ticket.id
      ? `Update the guess of ${submitted.person.name}`
      : submitLabel
  $('#entry-restart').hidden = !submitted && !attempted
  const title = submitted?.person.colorName
  $('#done-name').textContent = submitted?.person.name ?? ''
  $('#done-title').textContent = title ?? 'Your guess is in'
  $('#done-title').classList.toggle('is-named', Boolean(title))
}

function wipe(): void {
  isWiped = true
  attempted = submitted = undefined
  form.reset()
  show()
}

function leave(url: string, cleanup?: Promise<unknown>): void {
  wipe()
  clearGuest()
  document.body.hidden = true
  void Promise.resolve(cleanup).finally(() => {
    location.replace(url)
  })
}

/**
 * Leave no trace of a guest. Only a new page drops everything, such as the
 * text undo history which could type their name back in.
 */
export function reset(cleanup?: Promise<unknown>): void {
  if (!isParty) save()
  leave(isParty ? PARTY_URL : '/', cleanup)
}

/** Somebody walked away from a shared device. */
const abandoned = idleTimer(reset)

function watchIdle(): void {
  if (isParty) abandoned.start(getIdleTimeout(submitted))
}

function save(): void {
  if (isWiped || isOutdated()) return
  const state = {
    attempted,
    look: look.peek(),
    person: readPerson(),
    pick: pick.peek(),
    primer,
    submitted
  }
  if (isParty) {
    const latest = Date.now() + getIdleTimeout(submitted)
    saveGuest(state, Math.min(abandoned.deadline, latest))
  } else {
    saveOwn(state)
    stored = JSON.stringify(loadOwn())
  }
}

if (draft) {
  name.value = draft.person.name
  contact.value = draft.person.contact
  colorName.value = draft.person.colorName ?? ''
  setPick(draft.pick)
  look.value = draft.look
  if (guest) abandoned.start(getIdleTimeout(submitted), guest.expiresAt)
  if (submitted && route.peek() === 'start') redirect('done')
}
show()

if (isParty) {
  for (const input of [name, contact]) input.autocomplete = 'off'
  $('#done-later').hidden = true
  addEventListener('pointerdown', watchIdle, { once: true })
}

// The final screen only ever shows the color which was submitted
effect(() => {
  if (route.value !== 'done') return
  if (submitted) {
    setPick(submitted.pick)
  } else {
    redirect('start')
  }
})

// Phones close background tabs without a warning
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save()
  } else if (isOutdated()) {
    reset()
  } else if (!isWiped) {
    clearGuest()
  }
})
// Survive reloads, but never in the browser’s back-forward cache, where
// nothing would expire.
addEventListener('pagehide', () => {
  save()
  wipe()
  abandoned.stop()
})
addEventListener('pageshow', e => {
  if (e.persisted) location.reload()
})

addEventListener('storage', () => {
  if (!document.hidden && !submit.disabled && isOutdated()) reset()
})

form.addEventListener('input', () => {
  watchIdle()
  show()
  error.textContent = ''
})

form.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return
  const next = new Map([
    [name, contact],
    [contact, colorName]
  ]).get(e.target as HTMLInputElement)
  if (!next) return
  e.preventDefault()
  next.focus()
})

/** On a shared device somebody may press “edit” and walk away. */
function mayReplace({ person }: Submitted): boolean {
  return (
    countMatches(person, readPerson()) === 2 ||
    confirm(
      `Are you ${person.name}, ${person.contact}? OK replaces that guess. Cancel adds a new one, and the earlier guess can no longer be changed.`
    )
  )
}

async function send(): Promise<void> {
  if (isOutdated()) {
    const fresh = loadOwn()
    attempted = fresh?.attempted ?? attempted
    submitted = fresh?.submitted ?? submitted
    stored = JSON.stringify(fresh)
  }
  const edited = findEdited()
  const guess = color.peek()
  // Reusing the ticket makes this an edit, or a safe retry after an error
  attempted = {
    ...(edited && mayReplace(edited)
      ? edited
      : { primer, ticket: createTicket() }),
    person: readPerson(),
    pick: pick.peek()
  }
  // Whoever takes over the device starts from here
  primer = guess
  if (!isParty) save()
  await submitEntry(supabase, publicKey, {
    ...attempted,
    guess,
    year: CONTEST_YEAR
  })
  if (isWiped) return
  submitted = attempted
  watchIdle()
  // Nothing another tab has saved meanwhile is more important
  stored = JSON.stringify(loadOwn())
  if (!isParty) save()
}

function validate(): boolean {
  const person = readPerson()
  const [missing, message] = isBlank(person.name)
    ? [name, 'Add your name.']
    : isBlank(person.contact)
      ? [contact, 'Add an email or phone number, so we can reach you.']
      : []
  for (const input of [name, contact]) {
    input.setAttribute('aria-invalid', String(input === missing))
  }
  error.textContent = message ?? ''
  missing?.focus()
  return !missing
}

async function onSubmit(): Promise<void> {
  if (submit.disabled || !validate()) return
  main.inert = true
  try {
    await whileBusy(submit, 'Submitting…', send)
    main.inert = false
    show()
    if (submitted) setPick(submitted.pick)
    redirect('done')
  } catch (cause) {
    error.textContent = explainError(
      cause,
      isSecureContext
        ? 'There was an error submitting your entry. Please try again.'
        : 'Entries can only be encrypted when the site is opened via HTTPS.'
    )
  } finally {
    main.inert = false
    show()
  }
}

form.addEventListener('submit', e => {
  e.preventDefault()
  void onSubmit()
})

// The owner’s entry stays on the phone for later
$('#done-next').addEventListener('click', () => {
  setParty(true)
  leave(PARTY_URL)
})

$('#party-exit').addEventListener('click', () => {
  setParty(false)
  leave('/')
})

$('#entry-restart').addEventListener('click', () => {
  if (isParty) {
    reset()
  } else if (confirm('You will not be able to change the earlier guess.')) {
    clearOwn()
    leave('/')
  }
})
