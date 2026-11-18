import { randomColor } from '../../lib/color.ts'
import { CONTEST_YEAR } from '../../lib/config.ts'
import {
  cleanPerson,
  countMatches,
  createTicket,
  isBlank,
  type Person,
  submitEntry
} from '../../lib/contest.ts'
import { $, idleTimer, setText, whileBusy } from '../../lib/dom.ts'
import {
  clearDraft,
  type Draft,
  getIdleTimeout,
  loadDraft,
  saveDraft,
  type Submitted
} from '../../lib/draft.ts'
import { explainError, publicKey, supabase } from '../../stores/backend.ts'
import { colorHistory, current, setColor } from '../../stores/current.ts'

const REQUIRED = 'Please fill this in'

const layout = $('.layout')
const form = $<HTMLFormElement>('#entry')
const name = $<HTMLInputElement>('#entry-name')
const contact = $<HTMLInputElement>('#entry-contact')
const submit = $<HTMLButtonElement>('#entry-submit')
const submitLabel = submit.textContent
const error = $('#entry-error')
const success = $<HTMLDialogElement>('#success')

const draft = loadDraft()
let primer = draft?.primer ?? current.peek()
let { attempted, submitted }: Partial<Draft> = draft ?? {}
let isWiped = false

function readPerson(): Person {
  return cleanPerson({ contact: contact.value, name: name.value })
}

/** The entry which the details in the form seem to belong to. */
function findEdited(): Submitted | undefined {
  const count = (i?: Submitted) =>
    i ? countMatches(i.person, readPerson()) : 0
  const best = count(attempted) > count(submitted) ? attempted : submitted
  return count(best) > 0 ? best : undefined
}

/** Make it obvious whose entry is about to be replaced. */
function showMode(): void {
  const edited = findEdited()
  submit.textContent =
    submitted && edited?.ticket.id === submitted.ticket.id
      ? `Update the guess of ${submitted.person.name}`
      : submitLabel
  $('#entry-restart').hidden = !submitted && !attempted
}

function validate(): void {
  const person = readPerson()
  name.setCustomValidity(isBlank(person.name) ? REQUIRED : '')
  contact.setCustomValidity(isBlank(person.contact) ? REQUIRED : '')
}

function wipe(): void {
  isWiped = true
  attempted = submitted = undefined
  form.reset()
  showMode()
  setText(success, { '.is-contact': '', '.is-name': '' })
}

/**
 * Leave no trace of the previous entrant. Only a new page drops everything,
 * such as the text undo history which could type their name back in.
 */
export function reset(cleanup?: Promise<unknown>): void {
  wipe()
  clearDraft()
  setColor(randomColor())
  document.body.hidden = true
  void Promise.resolve(cleanup).finally(() => {
    location.replace('/')
  })
}

/** Somebody walked away from a shared device. */
const abandoned = idleTimer(reset)

function watchIdle(): void {
  abandoned.start(getIdleTimeout(submitted))
}

if (draft) {
  name.value = draft.person.name
  contact.value = draft.person.contact
  setColor(draft.color)
  colorHistory.clear()
  clearDraft()
  showMode()
  validate()
  abandoned.start(getIdleTimeout(submitted), draft.expiresAt)
}
addEventListener('pointerdown', watchIdle, { once: true })
// Otherwise the letters of a name would trigger hotkeys
name.focus({ preventScroll: true })

function save(): void {
  if (isWiped) return
  const [color, person] = [current.peek(), readPerson()]
  const latest = Date.now() + getIdleTimeout(submitted)
  const expiresAt = Math.min(abandoned.deadline, latest)
  saveDraft({ attempted, color, expiresAt, person, primer, submitted })
}

// Phones close background tabs without a warning
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save()
  } else if (!isWiped) {
    clearDraft()
  }
})
// Survive reloads and visits to the gallery, but never in the browser’s
// back-forward cache, where nothing would expire.
addEventListener('pagehide', () => {
  save()
  wipe()
  abandoned.stop()
})
addEventListener('pageshow', e => {
  if (e.persisted) location.reload()
})

form.addEventListener('input', () => {
  watchIdle()
  showMode()
  validate()
})

// People fill in the form first: Enter must not submit an untouched color
form.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return
  e.preventDefault()
  if (e.target === name) {
    contact.focus()
  } else {
    contact.blur()
  }
})

/** On a shared device somebody may press “edit” and walk away. */
function mayReplace({ person }: Submitted): boolean {
  return (
    countMatches(person, readPerson()) === 2 ||
    confirm(
      `Are you ${person.name}, ${person.contact}? OK replaces that guess, Cancel adds a new one.`
    )
  )
}

async function send(): Promise<void> {
  const edited = findEdited()
  const guess = current.peek()
  // Reusing the ticket makes this an edit, or a safe retry after an error
  attempted = {
    ...(edited && mayReplace(edited)
      ? edited
      : { primer, ticket: createTicket() }),
    person: readPerson()
  }
  // Whoever takes over the device starts from here
  primer = guess
  await submitEntry(supabase, publicKey, {
    ...attempted,
    guess,
    year: CONTEST_YEAR
  })
  if (isWiped) return
  submitted = attempted
  watchIdle()
  setColor(guess)
  const { person } = submitted
  setText(success, { '.is-contact': person.contact, '.is-name': person.name })
}

async function onSubmit(): Promise<void> {
  error.textContent = ''
  layout.inert = true
  try {
    await whileBusy(submit, 'Submitting…', send)
    success.returnValue = ''
    success.showModal()
  } catch (cause) {
    error.textContent = explainError(
      cause,
      isSecureContext
        ? 'There was an error submitting your entry. Please try again.'
        : 'Entries can only be encrypted when the site is opened via HTTPS.'
    )
  } finally {
    layout.inert = false
    showMode()
  }
}

form.addEventListener('submit', e => {
  e.preventDefault()
  void onSubmit()
})

// One of the two buttons has to be chosen, as `closedby` says in new browsers
success.addEventListener('cancel', e => {
  e.preventDefault()
})
success.addEventListener('close', () => {
  if (success.returnValue !== 'edit') reset()
})

$('#entry-restart').addEventListener('click', () => {
  reset()
})
