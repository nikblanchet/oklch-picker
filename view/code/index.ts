import {
  computed,
  effect,
  type ReadonlySignal,
  signal
} from '@preact/signals-core'

import { formatOklch, type Hint, isHex, parseColor } from '../../lib/color.ts'
import { $ } from '../../lib/dom.ts'
import {
  type Format,
  FORMATS,
  isFormat,
  SRGB_FORMATS
} from '../../lib/formats.ts'
import { current, setColor } from '../../stores/current.ts'
import { gamut } from '../../stores/visible.ts'
import { setError } from '../field/index.ts'

const PREFIXES: Partial<Record<Format, string>> = {
  figmaP3: 'Figma P3 ',
  lrgb: 'Linear RGB '
}
const SPACE_FORMATS: Partial<Record<string, Format>> = {
  'srgb': 'rgb',
  'srgb-linear': 'lrgb'
}

const HINTS: Partial<Record<Format, Hint>> = { figmaP3: 'p3', numbers: 'oklch' }

const format = signal<Format>('hex')

const select = $<HTMLSelectElement>('.field_select')
const otherInput = $<HTMLInputElement>('.code.is-other input')

/** Two-way binding which never rewrites the text while it is being typed. */
function bind(
  input: HTMLInputElement,
  text: ReadonlySignal<string>,
  hint: () => Hint | undefined,
  onCommit?: (code: string) => void
): void {
  let isEdited = false
  let isApplying = false

  function show(): void {
    input.value = text.peek()
    setError(input, '')
  }

  text.subscribe(() => {
    if (isApplying) return
    isEdited = false
    show()
  })

  input.addEventListener('input', () => {
    isEdited = true
    const parsed = parseColor(input.value, hint())
    setError(input, parsed ? '' : 'Use valid CSS color format')
    isApplying = true
    if (parsed) setColor(parsed.color)
    isApplying = false
  })
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur()
  })
  input.addEventListener('blur', () => {
    if (isEdited) onCommit?.(input.value)
    isEdited = false
    show()
  })
}

bind(
  $<HTMLInputElement>('.code.is-oklch input'),
  computed(() => formatOklch(current.value)),
  () => 'oklch'
)

bind(
  otherInput,
  computed(() => FORMATS[format.value](current.value)),
  () => HINTS[format.peek()],
  // Keep showing the notation which was typed in
  code => {
    if (format.peek() === 'figmaP3') return
    const space = code.includes('(') && parseColor(code)?.space
    const typed = isHex(code.trim())
      ? 'hex'
      : space && (SPACE_FORMATS[space] ?? space)
    if (isFormat(typed)) format.value = typed
  }
)

const options = Object.keys(FORMATS)
  .filter(isFormat)
  .map(type => [type, new Option('', type)] as const)
select.append(...options.map(([, option]) => option))

effect(() => {
  for (const [type, option] of options) {
    option.text = (PREFIXES[type] ?? '') + FORMATS[type](current.value)
  }
})

select.addEventListener('change', () => {
  if (isFormat(select.value)) format.value = select.value
})

effect(() => {
  const type = format.value
  const isFigma = type === 'figmaP3'
  const isFallback = gamut.value !== 'srgb' && SRGB_FORMATS.has(type)
  select.value = type
  otherInput.setAttribute('aria-label', `${PREFIXES[type] ?? `${type} `}code`)
  otherInput.classList.toggle('is-warning', isFigma)
  $('.code_note.is-figma').hidden = !isFigma
  $('.code_note.is-fallback').hidden = !isFallback
  $('.code_note.is-paste').hidden = isFigma || isFallback
})
