const CACHE_NAME = "ultimate-sudoku-v3";

const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.webmanifest",
    "./icon.svg",
    "./icon-192.png",
    "./icon-512.png"
    // NOTE: APK is intentionally NOT in precache to avoid install failures on some hosts.
    // It will still be cached on demand after the first download.
];

async function safePrecache(cache, urls) {
    await Promise.allSettled(urls.map((u) => cache.add(u)));
}

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await safePrecache(cache, APP_SHELL);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
        await self.clients.claim();
    })());
});

function isNavigationRequest(request) {
    return (
        request.mode === "navigate" ||
        (request.headers.get("accept") || "").includes("text/html")
    );
}

async function networkFirstHTML(req) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const fresh = await fetch(req);
        cache.put("./", fresh.clone());
        cache.put("./index.html", fresh.clone());
        return fresh;
    } catch {
        return (
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match("./", { ignoreSearch: true })) ||
            (await cache.match("./index.html", { ignoreSearch: true })) ||
            Response.error()
        );
    }
}

async function cacheFirstAssets(req) {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
        }
        return res;
    } catch {
        return cached || Response.error();
    }
}

self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);

    if (url.origin !== self.location.origin) return;

    if (isNavigationRequest(req)) {
        event.respondWith(networkFirstHTML(req));
        return;
    }

    event.respondWith(cacheFirstAssets(req));
});
