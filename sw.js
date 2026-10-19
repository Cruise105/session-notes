// Offline support. Bump VERSION whenever any app file changes.
const VERSION = 'session-notes-v18';
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js', 'calendar.js', 'ink.js', 'sync.js', 'weather.js', 'health.js', 'downtime.js', 'outbreaks.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'fonts/alegreya-latin-400-normal.woff2', 'fonts/alegreya-latin-400-italic.woff2', 'fonts/alegreya-latin-700-normal.woff2',
  'fonts/alegreya-sans-latin-400-normal.woff2', 'fonts/alegreya-sans-latin-400-italic.woff2',
  'fonts/alegreya-sans-latin-500-normal.woff2', 'fonts/alegreya-sans-latin-700-normal.woff2',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('session-notes-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
