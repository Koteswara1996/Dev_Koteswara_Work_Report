/* Banking Work Tracker — Hardened Service Worker
   
   Cache Version: btw-v61
   - Bumps cache version to force client-side cache refresh
   - Pre-caches local xlsx.full.min.js for complete offline Excel reporting
   - Preserves offline fallback page and runtime cache limits
*/

const CACHE_VERSION = 'btw-v61';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';
const RUNTIME_LIMIT = 60;
const NAV_TIMEOUT = 4000;

const SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './xlsx.full.min.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png',
  './favicon.svg'
];

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline — Banking Work Tracker</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f2f2f7;color:#1c1c1e;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;padding:24px}
h1{font-size:1.25rem;margin:0 0 8px}p{color:#636366;font-size:.95rem;margin:0 0 20px}
button{padding:12px 22px;border:0;border-radius:14px;background:#007aff;color:#fff;font-weight:700;font-size:.95rem;cursor:pointer}
@media(prefers-color-scheme:dark){body{background:#000;color:#fff}p{color:#8e8e93}}</style>
</head><body><div><h1>You are offline</h1>
<p>The app could not be loaded from this device's cache.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

/* ---------- Helpers ---------- */

function isShellPath(url) {
  return SHELL.some((entry) => {
    const name = entry.replace('./', '');
    return name === '' ? url.pathname.endsWith('/') : url.pathname.endsWith('/' + name);
  });
}

function isAsset(request, url) {
  if (request.destination === 'image' || request.destination === 'font') return true;
  return /\.(png|svg|jpg|jpeg|webp|gif|ico|woff2?|ttf)$/i.test(url.pathname);
}

function cacheable(res) {
  return res && res.status === 200 && (res.type === 'basic' || res.type === 'default');
}

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

async function putSafe(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    if (cacheName === RUNTIME_CACHE) await trim(RUNTIME_CACHE, RUNTIME_LIMIT);
  } catch (e) {}
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((c) => c.postMessage(message));
}

/* ---------- Install ---------- */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(async (path) => {
      try {
        const res = await fetch(new Request(path, { cache: 'reload' }));
        if (res && res.ok) await cache.put(path, res.clone());
      } catch (e) {}
    }));
  })());
});

/* ---------- Activate ---------- */

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    const keep = [SHELL_CACHE, RUNTIME_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => keep.indexOf(k) === -1).map((k) => caches.delete(k)));
    await self.clients.claim();
    broadcast({ type: 'SW_ACTIVATED', version: CACHE_VERSION });
  })());
});

/* ---------- Messages from Client ---------- */

self.addEventListener('message', (event) => {
  const data = event.data;
  const type = typeof data === 'string' ? data : (data && data.type);
  const reply = (payload) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
    else broadcast(payload);
  };

  if (type === 'skipWaiting' || type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'GET_VERSION') {
    reply({ type: 'VERSION', version: CACHE_VERSION });
    return;
  }

  if (type === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      reply({ type: 'CACHES_CLEARED' });
    })());
  }
});

/* ---------- Fetch Strategies ---------- */

async function navigationHandler(event) {
  const cached = await caches.match('./index.html', { ignoreSearch: true });

  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    if (preload) {
      putSafe(SHELL_CACHE, './index.html', preload.clone());
      return preload;
    }

    const res = await Promise.race([
      fetch(event.request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT))
    ]);
    if (cacheable(res)) putSafe(SHELL_CACHE, './index.html', res.clone());
    return res;
  } catch (e) {
    if (cached) return cached;
    const root = await caches.match('./');
    if (root) return root;
    return new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((res) => {
      if (cacheable(res)) putSafe(cacheName, request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) return cached;
  const res = await network;
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    fetch(request)
      .then((res) => { if (cacheable(res)) putSafe(cacheName, request, res.clone()); })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (cacheable(res)) putSafe(cacheName, request, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Apps Script sync, Gmail pulls, and cross-origin APIs must hit network directly
  if (url.origin !== self.location.origin) return;
  if (req.headers.get('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(event));
    return;
  }

  if (isShellPath(url)) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  if (isAsset(req, url)) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

/* ---------- Notifications ---------- */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if ('focus' in client) {
        client.postMessage({ type: 'NOTIFICATION_CLICK', tag: event.notification.tag });
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
