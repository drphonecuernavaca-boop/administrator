const SW_VERSION  = 'v3';
const SHELL_CACHE = `drphone-shell-${SW_VERSION}`;

const SHELL_ASSETS = [
  './index.html',
  './icono-192.png',
  './icono-512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(() =>
          console.warn('[SW] No se pudo cachear:', url)
        ))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('drphone-') && k !== SHELL_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-only: Firebase y Google APIs
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com')
  ) return;

  // Network-only: métodos que no sean GET
  if (event.request.method !== 'GET') return;

  // Cache-first para todo lo demás
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          caches.open(SHELL_CACHE).then(c => c.put(event.request, res.clone()));
        }
        return res;
      }).catch(() => {
        if (event.request.destination === 'document')
          return caches.match('./index.html');
        return new Response('', { status: 503 });
      });
    })
  );
});
