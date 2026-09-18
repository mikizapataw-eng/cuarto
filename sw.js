const CACHE_NAME = 'kardex-v2';
const ARCHIVOS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ARCHIVOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Nunca cachear las llamadas al backend (Apps Script): siempre ir a la red.
  if (url.hostname.includes('script.google.com')) return;
  if (event.request.method !== 'GET') return;

  // Estrategia "red primero": si hay internet, siempre trae la versión más
  // nueva de index.html/app.js/etc. (importante porque app.js tiene la URL
  // de Apps Script y puede cambiar). Si no hay internet, usa la copia guardada.
  event.respondWith(
    fetch(event.request)
      .then(resp => {
        if (resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
