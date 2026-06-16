/* ═══════════════════════════════════════
   BIOZAR – Service Worker PWA
   Stratégie : Cache First (app shell)
   ═══════════════════════════════════════ */

const CACHE_NAME = 'biozar-v2';

// Ressources à pré-cacher au moment de l'installation
const PRE_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/chart.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-512x512-maskable.png'
];

// Fonts Google à mettre en cache (préchargement)
const FONT_CACHE = 'biozar-fonts-v1';
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Playfair+Display:wght@700&display=swap',
  'https://fonts.gstatic.com/'
];

// CDN Libraries (PDF export)
const CDN_CACHE = 'biozar-cdn-v2';
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js'
];

// ─── INSTALLATION ───
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRE_CACHE);
      // Pré-cache des CDN
      try {
        const cdnCache = await caches.open(CDN_CACHE);
        await cdnCache.addAll(CDN_URLS);
      } catch (e) {
        console.warn('[SW] CDN cache skipped (offline install)');
      }
      await self.skipWaiting();
    })()
  );
});

// ─── ACTIVATION (nettoyage des anciens caches) ───
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== FONT_CACHE && key !== CDN_CACHE)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// ─── MESSAGE (SKIP WAITING depuis la page) ───
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Afficher une notification depuis le Service Worker (lancée par la page)
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, icon, incidentId } = event.data.payload || {};
    self.registration.showNotification(title || 'BIOZAR', {
      body: body || '',
      icon: icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: tag || 'biozar-incident',
      data: { incidentId: incidentId || null, url: event.data.url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: true
    });
  }
});

// ─── NOTIFICATION PUSH (depuis un serveur ou FCM) ───
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'BIOZAR', body: 'Nouvelle alerte BIOZAR' };
  }

  const options = {
    body: data.body || 'Un incident nécessite votre attention sur BIOZAR',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: data.tag || 'biozar-push',
    data: { incidentId: data.incidentId || null, url: data.url || '/' },
    vibrate: [200, 100, 200, 100, 300],
    requireInteraction: true,
    actions: [
      { action: 'open', title: '🔍 Voir' },
      { action: 'close', title: '✕ Fermer' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '⚠️ BIOZAR - Alerte', options)
  );
});

// ─── CLIC SUR NOTIFICATION ───
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'close') return;

  // Ouvrir ou focaliser la page BIOZAR
  const urlToOpen = event.notification.data?.url || '/';
  const incidentId = event.notification.data?.incidentId;

  event.waitUntil(
    (async () => {
      // Chercher une fenêtre BIOZAR déjà ouverte
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      // Si une fenêtre existe, la focaliser
      for (const client of allClients) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          // Envoyer un message pour naviguer vers la page production
          if (incidentId) {
            client.postMessage({ type: 'FOCUS_INCIDENT', incidentId });
          }
          return;
        }
      }

      // Sinon, ouvrir une nouvelle fenêtre
      await clients.openWindow(urlToOpen);
    })()
  );
});

// ─── STRATÉGIE DE CACHE ───
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ═══ FONTS GOOGLE : Cache First ───
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // ═══ APP SHELL (HTML, JS, CSS, images locales) : Cache First ───
  if (
    url.origin === self.location.origin &&
    (request.mode === 'navigate' ||
     request.destination === 'style' ||
     request.destination === 'script' ||
     request.destination === 'font' ||
     request.destination === 'image' ||
     url.pathname.endsWith('.json'))
  ) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // ═══ TOUT LE RESTE : Network First avec fallback cache ───
  event.respondWith(networkFirst(request));
});

// ─── HELPER : Cache First ───
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // Offline : retourne une réponse de fallback pour les navigations
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

// ─── HELPER : Network First ───
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback pour les requêtes navigate
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}
