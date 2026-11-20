/** Offline support. `build/service-worker.ts` fills in the two constants. */
declare const self: ServiceWorkerGlobalScope
declare const VERSION: string
declare const FILES: string[]

const PREFIX = 'files-'
const CURRENT = PREFIX + VERSION
const NAVIGATION_TIMEOUT_MS = 4000

async function download(url: string): Promise<[string, Response]> {
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  // The copy forgets redirects: Safari refuses to show such cached pages
  return [url, new Response(await response.blob(), response)]
}

async function install(): Promise<void> {
  // Never leave a half-filled cache behind
  const files = await Promise.all(FILES.map(download))
  const cache = await caches.open(CURRENT)
  await Promise.all(files.map(file => cache.put(...file)))
  await self.skipWaiting()
}

async function activate(): Promise<void> {
  const names = await caches.keys()
  // Tabs opened before a deploy may still lazy load the previous version
  const previous = names.findLast(i => i.startsWith(PREFIX) && i !== CURRENT)
  await Promise.all(
    names
      .filter(i => i !== CURRENT && i !== previous)
      .map(i => caches.delete(i))
  )
  await self.clients.claim()

  // The worker of the 2026 site has just shown its cached, outdated page
  if (names.some(i => i.startsWith('workbox-'))) {
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      // With the hash of that site it would only be a jump within the page
      client.navigate(client.url.split('#')[0]!).catch(console.error)
    }
  }
}

/** Pages come from the network first, so fixes reach people right away. */
async function loadPage(request: Request): Promise<Response> {
  const network = fetch(request)
  const cached = await caches.match(request, {
    cacheName: CURRENT,
    ignoreSearch: true,
    ignoreVary: true
  })
  if (!cached) return network
  const timeout = new Promise<Response>(resolve => {
    setTimeout(resolve, NAVIGATION_TIMEOUT_MS, cached)
  })
  const usable = network.then(
    response => (response.status < 500 ? response : cached),
    () => cached
  )
  return Promise.race([usable, timeout])
}

async function loadFile(request: Request): Promise<Response> {
  // Module scripts send `Origin`, unlike the requests which filled the cache
  const ignoreVary = true
  return (
    (await caches.match(request, { cacheName: CURRENT, ignoreVary })) ??
    (await caches.match(request, { ignoreVary })) ??
    fetch(request)
  )
}

self.addEventListener('install', e => {
  e.waitUntil(install())
})

self.addEventListener('activate', e => {
  e.waitUntil(activate())
})

self.addEventListener('fetch', e => {
  const { request } = e
  const { origin } = new URL(request.url)
  if (request.method !== 'GET' || origin !== self.location.origin) return
  const load = request.mode === 'navigate' ? loadPage : loadFile
  e.respondWith(load(request))
})
