export function toBase64Url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

/** Accepts both the standard and the URL-safe alphabet. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}
