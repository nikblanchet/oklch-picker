/** The few Supabase REST calls this site needs, without the 200 KB SDK. */
import { isRecord } from './validate.ts'

const TIMEOUT_MS = 20_000

export class ApiError extends Error {
  override name = 'ApiError'
  /** 0 when the server could not be reached. */
  readonly status: number

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options)
    this.status = status
  }
}

export interface Supabase {
  /** Resolves to an access token, which callers must only keep in memory. */
  logIn(email: string, password: string): Promise<string>
  logOut(accessToken: string): Promise<void>
  rpc(name: string, args: object, accessToken?: string): Promise<unknown>
}

function errorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  // The database and the auth server name this field differently
  const { error_description, message, msg } = body
  return [message, msg, error_description].find(i => typeof i === 'string')
}

export function createSupabase(url: string, apiKey: string): Supabase {
  async function post(
    path: string,
    body: object,
    accessToken?: string,
    keepalive = false
  ): Promise<unknown> {
    const timeout = new AbortController()
    const timer = setTimeout(() => {
      timeout.abort()
    }, TIMEOUT_MS)
    let response: Response
    let text: string
    try {
      response = await fetch(new URL(path, url), {
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` })
        },
        keepalive,
        method: 'POST',
        signal: timeout.signal
      })
      text = await response.text()
    } catch (cause) {
      throw new ApiError(0, 'network_error', { cause })
    } finally {
      clearTimeout(timer)
    }

    let result: unknown
    try {
      result = text ? JSON.parse(text) : undefined
    } catch (cause) {
      throw new ApiError(response.status, 'invalid_response', { cause })
    }
    if (!response.ok) {
      throw new ApiError(
        response.status,
        errorMessage(result) ?? response.statusText
      )
    }
    return result
  }

  return {
    async logIn(email, password) {
      const session = await post('/auth/v1/token?grant_type=password', {
        email,
        password
      })
      const token = isRecord(session) && session['access_token']
      if (typeof token !== 'string') {
        throw new ApiError(200, 'invalid_response')
      }
      return token
    },
    async logOut(accessToken) {
      // It has to finish even while the page is being closed
      await post('/auth/v1/logout?scope=local', {}, accessToken, true)
    },
    rpc: (name, args, accessToken) =>
      post(`/rest/v1/rpc/${name}`, args, accessToken)
  }
}
