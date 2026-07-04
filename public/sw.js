// Minimal service worker - just enough to make the app installable as a PWA.
// Deliberately does NOT cache anything: every request still goes straight to
// the network, so the dashboard, signing links, and document data always
// stay fresh (this app is not meant to work offline).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
