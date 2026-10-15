/* Service worker — Configurateur Bennes Maupu
   Change CACHE_VERSION à chaque nouvelle version déposée pour vider l'ancien cache. */
const CACHE_VERSION = 'v6';
const CORE = `bm-config-core-${CACHE_VERSION}`;
const RUNTIME = `bm-config-runtime-${CACHE_VERSION}`;
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'jspdf.umd.min.js',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('bm-config-') && k !== CORE && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max){
  const c = await caches.open(cacheName), keys = await c.keys();
  for(let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

// Réseau d'abord (toujours la dernière version en ligne), cache en secours hors ligne
async function networkFirst(req, cacheName){
  try{
    const res = await fetch(req);
    if(res && res.ok){ const c = await caches.open(cacheName); c.put(req, res.clone()); }
    return res;
  }catch(err){
    const hit = await caches.match(req, { ignoreSearch: true });
    if(hit) return hit;
    throw err;
  }
}

// Cache d'abord, mise à jour en arrière-plan (polices, photos)
async function staleWhileRevalidate(req, cacheName, max){
  const c = await caches.open(cacheName), hit = await c.match(req);
  const refresh = fetch(req).then(res => {
    if(res && (res.ok || res.type === 'opaque')){ c.put(req, res.clone()).then(() => max && trim(cacheName, max)); }
    return res;
  }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(url.origin === self.location.origin){
    if(req.mode === 'navigate'){
      e.respondWith(networkFirst(req, CORE).catch(() => caches.match('index.html')));
    } else {
      e.respondWith(networkFirst(req, CORE));
    }
    return;
  }
  // Polices Google
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(staleWhileRevalidate(req, RUNTIME, 40));
    return;
  }
  // Photos des options (bucket public Supabase) : visibles aussi hors ligne
  if(url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/')){
    e.respondWith(staleWhileRevalidate(req, RUNTIME, 80));
    return;
  }
  // Tout le reste (API Supabase…) : on ne touche à rien
});
