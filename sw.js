const CACHE_NAME = "ultimate-sudoku-v2";
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.webmanifest",
    "./icon.svg",
    "./icon-192.png",
    "./icon-512.png",
    "./Ultimate_Sudoku.apk"
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

function isNavigationRequest(request) {
    return request.mode === "navigate" ||
        (request.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);

    if (url.origin !== self.location.origin) return;

    if (isNavigationRequest(req)) {
        event.respondWith(
            (async () => {
                try {
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

    event.respondWith(
        (async () => {
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
        })()
    );
});
