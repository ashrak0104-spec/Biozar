/* ═══════════════════════════════════════════════════════════════
   BIOZAR — Service Worker
   ─────────────────────────────────────────────────────────────────
   Stratégie par type de ressource :

     • Navigation / index.html ......... network-first (timeout 3 s) + cache
     • version.json, manifest.json ..... network-only (jamais servis périmés)
     • fonts/, vendor/, chart.js, icons  cache-first (assets immuables)
     • *.supabase.co (données métier) .. network-only, JAMAIS mis en cache
     • /api/* (config Cloudflare) ...... network-only

   Le shell était en cache-first auparavant : l'app déployée ne recevait
   plus aucune mise à jour. C'est corrigé.
   ═══════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'biozar-v5';
const CACHE_SHELL = `${CACHE_VERSION}-shell`;
const CACHE_ASSETS = `${CACHE_VERSION}-assets`;

const NAVIGATION_TIMEOUT_MS = 3000;

// Pré-cache complet : une première ouverture hors-ligne doit fonctionner.
const PRECACHE_ASSETS = [
  'chart.js',
  'supabase-init.js',
  'vendor/html2canvas.min.js',
  'vendor/jspdf.umd.min.js',
  'fonts/inter-300.woff2',
  'fonts/inter-400.woff2',
  'fonts/inter-500.woff2',
  'fonts/inter-600.woff2',
  'fonts/inter-700.woff2',
  'fonts/inter-800.woff2',
  'fonts/playfair-700.woff2',
  'icons/icon-192x192.png',
  'icons/icon-512x512.png',
  'icons/icon-512x512-maskable.png',
  'icons/icon-192x192-maskable.png',
  'icons/logo-biozar.png',
  'icons/logo-biozar-alt.png',
  // Socle semi-offline : indispensable au démarrage, même sans réseau.
  'core/index.js',
  'core/schema.js',
  'core/db.js',
  'core/sync-engine.js',
  'core/net.js',
  'core/transport-supabase.js',
  'core/migration.js',
  'core/bridge.js',
  'core/sync-status.js',
  'core/wiring.js'
];

// ─── INSTALLATION ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const [shell, assets] = await Promise.all([
        caches.open(CACHE_SHELL),
        caches.open(CACHE_ASSETS)
      ]);

      // Le shell doit absolument être en cache : c'est le repli hors-ligne.
      await shell.add(new Request('index.html', { cache: 'reload' }));

      // Les assets sont ajoutés un par un : un échec ne doit pas
      // faire échouer toute l'installation (ex. logo manquant).
      await Promise.all(
        PRECACHE_ASSETS.map(async (path) => {
          try {
            const res = await fetch(path, { cache: 'reload' });
            if (res && res.ok) await assets.put(path, res);
          } catch (e) {
            console.warn(`[SW] pré-cache ignoré : ${path}`);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

// ─── ACTIVATION — purge des caches obsolètes ──────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const valid = new Set([CACHE_SHELL, CACHE_ASSETS]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !valid.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// ─── MESSAGES (depuis la page) ──────────────────────────────────
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data === 'SKIP_WAITING' || data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, icon, incidentId } = data.payload || {};
    self.registration.showNotification(title || 'BIOZAR', {
      body: body || '',
      icon: icon || 'icons/icon-192x192.png',
      badge: 'icons/icon-192x192.png',
      tag: tag || 'biozar-incident',
      data: { incidentId: incidentId || null, url: data.url || './' },
      vibrate: [200, 100, 200],
      requireInteraction: true
    });
  }
});

// ─── PUSH ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'BIOZAR', body: 'Nouvelle alerte BIOZAR' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'BIOZAR — Alerte', {
      body: data.body || 'Un incident nécessite votre attention',
      icon: data.icon || 'icons/icon-192x192.png',
      badge: 'icons/icon-192x192.png',
      tag: data.tag || 'biozar-push',
      data: { incidentId: data.incidentId || null, url: data.url || './' },
      vibrate: [200, 100, 200, 100, 300],
      requireInteraction: true,
      actions: [
        { action: 'open', title: 'Voir' },
        { action: 'close', title: 'Fermer' }
      ]
    })
  );
});

// ─── CLIC SUR NOTIFICATION ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const urlToOpen = (event.notification.data && event.notification.data.url) || './';
  const incidentId = event.notification.data && event.notification.data.incidentId;

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          if (incidentId) client.postMessage({ type: 'FOCUS_INCIDENT', incidentId });
          return;
        }
      }
      await clients.openWindow(urlToOpen);
    })()
  );
});

// ─── HELPERS ────────────────────────────────────────────────────

/** Network-first avec plafond de temps : hors-ligne, on ne bloque pas l'UI. */
async function networkFirst(request, cacheName) {
  const cached = caches.match(request);

  const timedOut = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('navigation-timeout')), NAVIGATION_TIMEOUT_MS)
  );

  try {
    const response = await Promise.race([fetch(request), timedOut]);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    if (cached) return cached;
    // Le repli sur index.html ne vaut que pour une navigation : renvoyer du
    // HTML en réponse à une requête de module provoque une erreur de type
    // MIME opaque, bien plus difficile à diagnostiquer qu'un 503 explicite.
    if (request.mode === 'navigate') return caches.match('index.html');
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/** Cache-first : réservé aux assets immuables, jamais aux données. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/** Network-only : les données métier ne passent JAMAIS par le cache. */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ─── ROUTAGE ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ── Données métier Supabase : jamais de cache. Une donnée périmée
  //    affichée comme fraîche est pire qu'une erreur explicite.
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // ── Origines tierces restantes : on ne s'en occupe pas.
  if (url.origin !== self.location.origin) return;

  // ── Configuration Cloudflare : toujours fraîche.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // ── Métadonnées de version : toujours fraîches (détection de MAJ).
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/manifest.json')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // ── Assets immuables : cache-first.
  if (
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/vendor/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('/chart.js')
  ) {
    event.respondWith(cacheFirst(request, CACHE_ASSETS));
    return;
  }

  // ── Navigation : network-first pour que les mises à jour passent.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CACHE_SHELL));
    return;
  }

  // ── Le reste (css/js inline éventuels) : network-first.
  event.respondWith(networkFirst(request, CACHE_SHELL));
});
