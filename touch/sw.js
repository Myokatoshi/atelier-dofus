// Service worker : rend l'appli installable et utilisable hors connexion.
// Change VERSION à chaque mise en ligne pour que tout le monde reçoive la mise à jour.
// Même domaine que l'Atelier Dofus 3 : on ne touche qu'aux caches « touch-… ».
const VERSION = "touch-v1";
const SHELL = ["./", "index.html", "css/app.css", "js/core.js", "js/ency.js", "js/market.js", "js/prod.js", "js/adventure.js", "js/build.js", "js/home.js",
  "manifest.webmanifest", "icons/logo.png", "icons/icon-192.png", "data/core.json", "data/almanax.json"];
const IMG_CACHE = "touch-img"; // images du jeu (CDN officiel de Dofus Touch), gardées d'une version à l'autre

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("touch-") && k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const same = url.origin === location.origin;
  // Images du jeu : cache d'abord (elles ne changent pas)
  if (url.hostname === "static.ankama.com" || url.hostname === "dofustouch.cdn.ankama.com") {
    e.respondWith(caches.open(IMG_CACHE).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; })));
    return;
  }
  const isFont = url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com");
  if (!same && !isFont) return; // Papycha et autres : toujours en direct
  // Données du jeu : cache d'abord (elles changent avec VERSION)
  if (same && url.pathname.includes("/data/")) {
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // Appli et polices : réponse du cache tout de suite, mise à jour en arrière-plan
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, same ? { cache: "no-cache" } : undefined).then(r => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
