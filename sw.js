// Garden Guide service worker: lets the site install as an app and open offline.
// App files are served fresh when online (so updates show straight away) and from
// the cache when offline. Account and garden data always go to the server.
const CACHE = "garden-guide-v2";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "api.js", "calendar.js", "config.json",
  "supabase/functions/garden/guide.js", "icon.svg", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "starter/plants.json", "starter/overview.md", "library/plants.json", "library/region-plants.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // Supabase, fonts, maps: straight to the network
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))),
  );
});
