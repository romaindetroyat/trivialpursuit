// Remplace l'ancien service worker de …/trivialpursuit/ : les rappels déjà programmés s'affichent
// encore et ouvrent le jeu à sa nouvelle adresse. À la première visite de la nouvelle adresse,
// le jeu reprend l'abonnement et retire ce service worker.
const NOUVELLE_ADRESSE = 'https://romaindetroyat.github.io/culture-ge/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(cles => Promise.all(cles.map(c => caches.delete(c)))).then(() => self.clients.claim()));
});

self.addEventListener('push', event => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch { m = {}; }
  event.waitUntil(self.registration.showNotification(m.titre || 'Culture Gé', {
    body: m.corps || 'La carte du jour vous attend.',
    icon: NOUVELLE_ADRESSE + 'icons/icon-192.png',
    tag: m.tag || 'culturege',
    data: { url: NOUVELLE_ADRESSE + '?jour' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url));
});
