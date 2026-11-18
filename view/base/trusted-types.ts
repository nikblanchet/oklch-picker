/**
 * The CSP forbids passing strings to HTML and script sinks. The only
 * exception are URLs of our own workers.
 */
declare const trustedTypes:
  | undefined
  | {
      createPolicy(
        name: string,
        rules: { createScriptURL(url: string): string }
      ): void
    }

if (typeof trustedTypes !== 'undefined') {
  trustedTypes.createPolicy('default', {
    createScriptURL(url) {
      if (new URL(url, location.href).origin === location.origin) return url
      throw new TypeError(`Blocked script ${url}`)
    }
  })
}
