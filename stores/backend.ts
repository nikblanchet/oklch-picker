import { createSupabase } from '../lib/supabase.ts'

export const supabase = createSupabase(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const publicKey = import.meta.env.VITE_CONTEST_PUBLIC_KEY

const MESSAGES = new Map([
  ['contest_closed', 'Sorry, the contest is closed.'],
  ['contest_full', 'Sorry, the contest is full.'],
  ['invalid_key', 'This is not a valid private key.'],
  ['network_error', 'Could not reach the server. Are you online?'],
  ['not_admin', 'This account is not a contest admin.'],
  ['rate_limited', 'Too many entries from this network. Try again later.'],
  ['session_expired', 'The session has expired. Log in again.'],
  ['unknown_year', 'Open submissions first to start this contest.']
])

export function explainError(error: unknown, fallback: string): string {
  console.error(error)
  return (error instanceof Error && MESSAGES.get(error.message)) || fallback
}
