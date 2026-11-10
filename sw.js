// Service worker : rend l'appli installable et utilisable hors connexion.
// Pense à changer VERSION à chaque mise en ligne pour que tout le monde reçoive la mise à jour.
const VERSION = "atelier-v4";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "config.js", "vendor/supabase.js", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "data/core.json", "data/farm.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Le serveur Supabase (prix, comptes) n'est jamais mis en cache
  if (url.hostname.endsWith("supabase.co") || url.pathname.includes("/auth/") || url.pathname.includes("/rest/")) return;
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com");
  if (!sameOrigin && !isFont) return;
  // Données du jeu et icônes : cache d'abord (elles changent seulement avec VERSION)
  if (sameOrigin && url.pathname.includes("/data/")) {
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // Reste de l'appli et polices : réponse du cache tout de suite, mise à jour en arrière-plan
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
