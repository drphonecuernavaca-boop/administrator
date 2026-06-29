// ═══════════════════════════════════════════════════════════
// Dr. Phone — Service Worker v1
// Estrategia: Cache-First para el shell de la app (HTML + fuentes)
//             Network-Only para Firebase Firestore (datos en tiempo real)
//
// Cache names — cambiar SW_VERSION invalida la caché anterior
// ═══════════════════════════════════════════════════════════

const SW_VERSION   = 'v1';
const SHELL_CACHE  = `drphone-shell-${SW_VERSION}`;

// Recursos que se cachean en install — el "app shell"
// Solo activos estáticos que no cambian entre sesiones.
const SHELL_ASSETS = [
  './dr_phone_v14.html',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap',
  'https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_0.woff2',
  'https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZOIHQ.woff2'
];

// ── Install ──────────────────────────────────────────────
// Precachea el shell. skipWaiting() activa el SW nuevo sin esperar
// a que el usuario cierre todas las pestañas.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => {
      // addAll falla si ALGÚN recurso falla — usamos add individual
      // con fallback silencioso para no romper la instalación por las fuentes.
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(() => {
          console.warn('[SW] No se pudo cachear:', url);
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────
// Limpia cachés de versiones anteriores.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('drphone-') && k !== SHELL_CACHE)
          .map(k => {
            console.log('[SW] Eliminando caché antigua:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // NETWORK-ONLY: Firebase Firestore y Auth — siempre frescos
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com')
  ) {
    // Deja pasar sin intervenir — el hilo principal maneja errores de red
    return;
  }

  // NETWORK-ONLY: requests que no sean GET (POST, PATCH, DELETE)
  if (event.request.method !== 'GET') return;

  // CACHE-FIRST para el shell y las fuentes
  // 1. Busca en caché
  // 2. Si no está, fetch de red y guarda en caché
  // 3. Si la red falla y tampoco está en caché, deja que el navegador maneje el error
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(networkResponse => {
        // Solo cachea respuestas válidas (status 200)
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type !== 'opaque'
        ) {
          // Clona la respuesta (solo se puede leer una vez)
          const clone = networkResponse.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Sin caché y sin red — devuelve el HTML principal como fallback
        // (el usuario verá la app con datos locales del localStorage)
        if (event.request.destination === 'document') {
          return caches.match('./dr_phone_v14.html');
        }
        // Para otros recursos (fuentes, etc.) simplemente deja fallar
        return new Response('', { status: 503, statusText: 'Sin conexión' });
      });
    })
  );
});
