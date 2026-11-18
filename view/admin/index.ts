import { batch, computed, effect, signal } from '@preact/signals-core'

import { formatOklch, type Lch, toHex } from '../../lib/color.ts'
import { CONTEST_YEAR } from '../../lib/config.ts'
import { contactKey } from '../../lib/contest.ts'
import { importPrivateKey, type PrivateKey } from '../../lib/crypto.ts'
import { describe } from '../../lib/describe.ts'
import {
  $,
  closeOnBackdropClick,
  idleTimer,
  setCssVar,
  setText
} from '../../lib/dom.ts'
import {
  type Entry,
  LEGACY_YEAR,
  type Overview,
  readOverview
} from '../../lib/overview.ts'
import { parseColor } from '../../lib/parse.ts'
import { rank, type Ranked } from '../../lib/score.ts'
import { ApiError } from '../../lib/supabase.ts'
import { explainError, publicKey, supabase } from '../../stores/backend.ts'
import { reset } from '../entry/index.ts'

const IDLE_TIMEOUT_MS = 10 * 60 * 1000
const LOGOUT_WAIT_MS = 3000
const EMPTY: Overview = { contests: [], entries: [], skipped: 0 }

interface Session {
  key: PrivateKey
  token: string
}

// Secrets and personal data live in memory only, until the panel is closed
let session: Session | undefined
const overview = signal(EMPTY)
const year = signal(CONTEST_YEAR as number)
const contest = computed(() =>
  overview.value.contests.find(i => i.year === year.value)
)
/** The 2026 site did not track edits, so nobody can be called late. */
const cutoff = computed(() =>
  year.value === LEGACY_YEAR ? undefined : contest.value?.closesAt
)
const ranking = computed(() =>
  rank(overview.value.entries, contest.value?.answer, cutoff.value)
)
const entriesPerContact = computed(() => {
  const counts = new Map<string | undefined, number>()
  for (const { person } of overview.value.entries) {
    const contact = person && contactKey(person)
    counts.set(contact, (counts.get(contact) ?? 0) + 1)
  }
  return counts
})

const dialog = $<HTMLDialogElement>('#admin')
const body = $('.dialog_body', dialog)
const error = $('[role=alert]', dialog)
const years = $<HTMLSelectElement>('#admin-year')
const answerInput = $<HTMLInputElement>('#admin-answer input')
const deadlineInput = $<HTMLInputElement>('#admin-deadline input')
const template = $<HTMLTemplateElement>('#admin-entry')

async function fetchOverview(
  { key, token }: Session,
  contestYear: number
): Promise<Overview> {
  const args = { contest_year: contestYear }
  return readOverview(await supabase.rpc('admin_overview', args, token), key)
}

/** Optionally change something on the server, then show the fresh state. */
async function update(
  change?: { args: object; name: string },
  nextYear = year.peek()
): Promise<void> {
  // Timers do not fire while a confirmation is waiting for an answer
  if (Date.now() >= abandoned.deadline) leave()
  const active = session
  if (!active) return
  const focused = document.activeElement
  // One request at a time, so that actions always apply to what is displayed
  body.inert = true
  error.textContent = ''
  let isSaved = false
  try {
    if (change) {
      const args = { ...change.args, contest_year: nextYear }
      await supabase.rpc(change.name, args, active.token)
      isSaved = true
    }
    const fresh = await fetchOverview(active, nextYear)
    if (session !== active) return
    batch(() => {
      overview.value = fresh
      year.value = nextYear
    })
  } catch (cause) {
    years.value = String(year.peek())
    error.textContent = explainError(
      cause,
      cause instanceof ApiError && cause.status === 401
        ? 'The session has expired. Log in again.'
        : 'Something went wrong. Try again.'
    )
    if (isSaved) error.prepend('Saved, but this page is outdated. ')
  } finally {
    body.inert = false
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
    if (error.textContent) error.scrollIntoView({ block: 'center' })
  }
}

async function endSession({ token }: Session): Promise<void> {
  await supabase.logOut(token).catch(console.error)
}

const abandoned = idleTimer(leave)

export async function logIn(
  email: string,
  password: string,
  privateKey: string,
  cancelled: AbortSignal
): Promise<void> {
  const key = await importPrivateKey(privateKey).catch(() => {
    throw new Error('invalid_key')
  })
  const candidate = { key, token: await supabase.logIn(email, password) }
  try {
    const fresh = await fetchOverview(candidate, CONTEST_YEAR)
    if (cancelled.aborted) throw new Error('Cancelled')
    overview.value = fresh
  } catch (cause) {
    void endSession(candidate)
    throw cause
  }
  session = candidate
  $('#admin-mismatch').hidden = key.publicKey === publicKey
  dialog.showModal()
  abandoned.start(IDLE_TIMEOUT_MS)
}

async function logOut(): Promise<void> {
  const ended = session
  session = undefined
  overview.value = EMPTY
  if (ended) await endSession(ended)
}

function leave(): void {
  if (!session) return
  const patience = new Promise(resolve => setTimeout(resolve, LOGOUT_WAIT_MS))
  reset(Promise.race([logOut(), patience]))
}

closeOnBackdropClick(dialog)
dialog.addEventListener('close', leave)
addEventListener('pagehide', () => {
  void logOut()
})

function summarize(color: Lch): string {
  return `${toHex(color)} - ${describe(color)}, ${formatOklch(color)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: 'short' })
}

/** Such as `2026-12-01T09:00`, in the time zone of this device. */
function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const local = date.getTime() - date.getTimezoneOffset() * 60_000
  return Number.isNaN(local) ? '' : new Date(local).toISOString().slice(0, 16)
}

function renderEntry({ deltaE, entry, isLate, isWinner }: Ranked<Entry>): Node {
  const { createdAt, guess, guessedAt, id, person, primer, updatedAt } = entry
  const copies = entriesPerContact.value.get(person && contactKey(person))!
  const row = template.content.cloneNode(true) as DocumentFragment
  $('.entry', row).classList.toggle('is-winner', isWinner)
  setCssVar('--paint', toHex(primer), $('.sample.is-primer', row))
  setCssVar('--paint', toHex(guess), $('.sample.is-guess', row))
  setText(row, {
    '.entry_color_name': person?.colorName ?? '',
    '.entry_contact': person?.contact ?? '',
    '.entry_copies': person && copies > 1 ? `⚠️ ${copies} entries` : '',
    '.entry_date': [
      formatDate(createdAt),
      guessedAt !== createdAt && `color changed ${formatDate(guessedAt)}`,
      updatedAt !== guessedAt && `details edited ${formatDate(updatedAt)}`
    ]
      .filter(Boolean)
      .join(', '),
    '.entry_delta': deltaE === undefined ? '' : `Delta-E: ${deltaE.toFixed(2)}`,
    '.entry_guess': summarize(guess),
    '.entry_name': person?.name ?? '🔒 No readable contact details',
    '.entry_primer': summarize(primer)
  })
  $('.entry_named', row).hidden = !person?.colorName
  $('.entry_winner', row).hidden = !isWinner
  $('.entry_late', row).hidden = !isLate
  // An entry can change hands this way
  $('.entry_edited', row).hidden =
    isLate || !(Date.parse(updatedAt) > Date.parse(cutoff.value ?? ''))
  $('.entry_delete', row).addEventListener('click', () => {
    if (confirm(`Delete the entry of ${person?.name ?? id} forever?`)) {
      void update({ args: { entry_id: id }, name: 'admin_delete_entries' })
    }
  })
  return row
}

effect(() => {
  $('#admin-entries').replaceChildren(...ranking.value.map(renderEntry))
  $('#admin-empty').hidden = ranking.value.length > 0
  const { skipped } = overview.value
  const late = ranking.value.filter(i => i.isLate).length
  $('#admin-count').textContent =
    ranking.value.length +
    (late ? `, ${late} late` : '') +
    (skipped ? `, ${skipped} malformed skipped` : '')
})

effect(() => {
  const { answer, closesAt, isOpen = false } = contest.value ?? {}
  const all = new Set([year.value, ...overview.value.contests.map(i => i.year)])
  years.replaceChildren(
    ...[...all].sort((a, b) => b - a).map(i => new Option(String(i)))
  )
  years.value = String(year.value)
  setCssVar(
    '--paint',
    answer ? toHex(answer) : 'transparent',
    $('#admin-answer .sample')
  )
  $('#admin-deadline').hidden = year.value === LEGACY_YEAR
  deadlineInput.value = closesAt ? toLocalInput(closesAt) : ''
  $('#admin-clear-answer').hidden = !answer
  $('#admin-toggle').hidden = Boolean(answer)
  setText(dialog, {
    '#admin-answer p': answer ? summarize(answer) : 'Not set',
    '#admin-set-answer': `Set as Pantone ${year.value}`,
    '#admin-status': !isOpen
      ? `Submissions are closed${closesAt ? ` as of ${formatDate(closesAt)}` : ''}`
      : closesAt
        ? `Submissions are open until ${formatDate(closesAt)}`
        : 'Submissions are open, no deadline is set',
    '#admin-toggle': isOpen ? 'Close submissions' : 'Open submissions'
  })
})

function onClick(id: string, task: () => Promise<void>): void {
  $(id).addEventListener('click', () => {
    void task()
  })
}

years.addEventListener('change', () => {
  void update(undefined, Number(years.value))
})

onClick('#admin-refresh', update)

answerInput.addEventListener('input', () => {
  answerInput.setCustomValidity(
    parseColor(answerInput.value) ? '' : 'Use valid CSS color format'
  )
})

$('#admin-answer').addEventListener('submit', e => {
  e.preventDefault()
  const color = parseColor(answerInput.value)!
  const { c, h, l } = color
  if (confirm(`Set ${summarize(color)} and close submissions?`)) {
    void update({ args: { c, h, l }, name: 'admin_set_answer' })
  }
})

$('#admin-deadline').addEventListener('submit', e => {
  e.preventDefault()
  const deadline = new Date(deadlineInput.value)
  const { answer, closesAt, isOpen } = contest.peek() ?? {}
  // The field has no seconds, so this would move the deadline
  if (closesAt && deadlineInput.value === toLocalInput(closesAt)) return
  const isReopening = !isOpen && !answer && deadline.getTime() > Date.now()
  if (isReopening && !confirm('This opens submissions again. Continue?')) return
  void update({
    args: { deadline: deadline.toISOString() },
    name: 'admin_set_deadline'
  })
})

onClick('#admin-clear-answer', () =>
  update({ args: { c: null, h: null, l: null }, name: 'admin_set_answer' })
)

onClick('#admin-toggle', async () => {
  const isOpen = contest.peek()?.isOpen
  if (isOpen || confirm('Open submissions without a deadline?')) {
    await update({ args: { is_open: !isOpen }, name: 'admin_set_open' })
  }
})

onClick('#admin-delete', async () => {
  const expected = String(year.peek())
  const typed = prompt(
    `This deletes ALL ${expected} entries from the server and cannot be undone. Type ${expected} to confirm.`
  )
  if (typed?.trim() === expected) {
    await update({ args: { entry_id: null }, name: 'admin_delete_entries' })
  }
})

$('#admin-export').addEventListener('click', () => {
  const rows = ranking.peek().map(({ entry, ...score }) => ({
    ...entry,
    ...score
  }))
  const link = document.createElement('a')
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  )
  link.download = `pantone-contest-entries-${year.peek()}.json`
  link.click()
  // Safari starts the download asynchronously
  setTimeout(() => {
    URL.revokeObjectURL(link.href)
  }, 10_000)
})
