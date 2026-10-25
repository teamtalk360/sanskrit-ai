/* Sanskrit AI Workspace – service worker.
   App shell: cache-first. Google Fonts: stale-while-revalidate, cached at runtime.
   If fonts cannot be fetched, the CSS falls back to system fonts, so the app still works offline. */
const VERSION = 'v1.0.0';
const SHELL_CACHE = `sanskrit-ai-shell-${VERSION}`;
const FONT_CACHE = `sanskrit-ai-fonts-${VERSION}`;
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];
const FONTS_CSS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600&family=Noto+Sans+Telugu:wght@400;600&family=Inter:wght@400;500;600&display=swap';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_ASSETS);
    // Best effort: pre-cache the fonts stylesheet. Never fail install if offline/blocked.
    try {
      const fontCache = await caches.open(FONT_CACHE);
      const res = await fetch(FONTS_CSS_URL, { mode: 'cors' });
      if (res.ok) await fontCache.put(FONTS_CSS_URL, res);
    } catch (_) { /* ignore */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, FONT_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('sanskrit-ai-') && !keep.includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isFontRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const res = await network;
      // Offline and nothing cached: return an empty stylesheet/font so the page falls back to system fonts.
      return res || new Response('', { status: 200, headers: { 'Content-Type': url.hostname === 'fonts.googleapis.com' ? 'text/css' : 'font/woff2' } });
    })());
    return;
  }

  if (url.origin !== self.location.origin) return; // never touch other third-party requests

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Navigations: serve the cached shell (index.html) cache-first.
    if (req.mode === 'navigate') {
      const cached = await cache.match(req, { ignoreSearch: true }) || await cache.match('./index.html') || await cache.match('./');
      if (cached) return cached;
      try { return await fetch(req); } catch (_) { return new Response('Offline', { status: 503 }); }
    }
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (_) {
      return new Response('', { status: 504 });
    }
  })());
});
