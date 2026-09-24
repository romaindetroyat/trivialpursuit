/* Service worker : tout le jeu est mis en cache pour fonctionner hors ligne. */
const VERSION = 'trivial1000-v2';
const FICHIERS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'cartes.json',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(c => c !== VERSION).map(c => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

// Réseau d'abord (pour recevoir les mises à jour), cache en secours hors ligne.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(rep => {
        if (rep.ok) {
          const copie = rep.clone();
          caches.open(VERSION).then(cache => cache.put(req, copie));
        }
        return rep;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});
