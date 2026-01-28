/* Ultimate Sudoku PWA - Service Worker (GitHub Pages safe)
   - App Shell cached for offline
   - Navigation requests return cached index.html
   - Cache-first for static assets
*/

const CACHE_NAME = "ultimate-sudoku-v1";
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.webmanifest",
    "./icon.svg",
    "./icon-192.png",
    "./icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((keys) =>
                Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
            ),
            self.clients.claim()
        ])
    );
});

// Helper: detect navigation (HTML page loads)
function isNavigationRequest(request) {
    return request.mode === "navigate" ||
        (request.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Only handle same-origin requests (your GH pages)
    if (url.origin !== self.location.origin) return;

    // Always serve index.html for navigations (offline-safe routing)
    if (isNavigationRequest(req)) {
        event.respondWith(
            (async () => {
                try {
                    // Try network first so updates come through when online
                    const fresh = await fetch(req);
                    const cache = await caches.open(CACHE_NAME);
                    cache.put("./index.html", fresh.clone());
                    return fresh;
                } catch {
                    const cache = await caches.open(CACHE_NAME);
                    return (await cache.match("./index.html")) || Response.error();
                }
            })()
        );
        return;
    }

    // Cache-first for assets
    event.respondWith(
        (async () => {
            const cached = await caches.match(req);
            if (cached) return cached;

            try {
                const res = await fetch(req);
                // Cache successful basic responses
                if (res && res.ok && res.type === "basic") {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(req, res.clone());
                }
                return res;
            } catch (e) {
                // If offline and not cached
                return cached || Response.error();
            }
        })()
    );
});
