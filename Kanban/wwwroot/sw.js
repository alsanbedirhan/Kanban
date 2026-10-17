'use strict';

// Bump to drop every cached file on the next activation.
const CACHE = 'kanflow-static-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/favicon.svg'];

// Only static files are cached. Pages, API calls, SignalR and auth always go to the network.
const VERSIONED_PREFIXES = ['/lib/', '/css/', '/js/'];
const STATIC_PREFIXES = ['/icons/', '/avatars/'];
const STATIC_FILES = ['/favicon.svg', '/favicon.ico', '/logo.png', '/manifest.json'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
        return;
    }

    const isVersioned = url.pathname.startsWith('/lib/') || (url.search.includes('v=') && VERSIONED_PREFIXES.some(p => url.pathname.startsWith(p)));
    if (isVersioned) {
        event.respondWith(cacheFirst(request, url));
        return;
    }

    if (VERSIONED_PREFIXES.some(p => url.pathname.startsWith(p))
        || STATIC_PREFIXES.some(p => url.pathname.startsWith(p))
        || STATIC_FILES.includes(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

// /lib/ folders and asp-append-version URLs change whenever the content changes.
async function cacheFirst(request, url) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
        await removeOtherVersions(cache, url);
        await cache.put(request, response.clone());
    }
    return response;
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => cached || Response.error());
    return cached || network;
}

// Keeps one copy per file: site.js?v=A is dropped once site.js?v=B is cached.
async function removeOtherVersions(cache, url) {
    if (!url.search) return;
    const keys = await cache.keys();
    await Promise.all(keys
        .filter(key => {
            const keyUrl = new URL(key.url);
            return keyUrl.pathname === url.pathname && keyUrl.search !== url.search;
        })
        .map(key => cache.delete(key)));
}
