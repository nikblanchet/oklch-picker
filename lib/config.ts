/** The year being guessed. See “Next year” in the README. */
export const CONTEST_YEAR = 2027

export const NAME_MAX_LENGTH = 100
export const CONTACT_MAX_LENGTH = 200

/** Upper bounds of the sliders, number fields and charts. */
export const AXIS_MAX = { c: 0.37, h: 360, l: 1 } as const

/** Pasted colors may exceed the chroma slider, but nothing real exceeds this. */
export const CHROMA_LIMIT = 0.5

export type Axis = keyof typeof AXIS_MAX

export const AXES = ['l', 'c', 'h'] as const satisfies Axis[]

/** What one press of an arrow key adds. */
export const AXIS_STEP = { c: 0.01, h: 1, l: 0.01 } as const

export const SLIDER_STEP = { c: 0.0001, h: 0.01, l: 0.0001 } as const
