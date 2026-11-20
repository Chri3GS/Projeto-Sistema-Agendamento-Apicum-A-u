const CACHE_NAME = 'techagenda-shell-v1';
const STATIC_ASSETS = [
    '/style.css',
    '/script.js',
    '/admin.css',
    '/manifest.webmanifest',
    '/imagens/logo.png',
    '/imagens/pwa-icon-192.png',
    '/imagens/pwa-icon-512.png'
];
const STATIC_ASSET_PATHS = new Set(STATIC_ASSETS);

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) =>
                        cacheName.startsWith('techagenda-shell-') && cacheName !== CACHE_NAME
                    )
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' ||
        url.origin !== self.location.origin ||
        url.search ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/.netlify/functions/') ||
        !STATIC_ASSET_PATHS.has(url.pathname)) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                try {
                    const response = await fetch(request);
                    if (response.ok && response.type === 'basic' && !response.redirected) {
                        await cache.put(request, response.clone());
                    }
                    return response;
                } catch (error) {
                    const cachedResponse = await cache.match(request);
                    if (cachedResponse) return cachedResponse;
                    throw error;
                }
            })
    );
});
