// Service worker : rend l'appli installable et utilisable hors connexion.
// Pense à changer VERSION à chaque mise en ligne pour que tout le monde reçoive la mise à jour.
const VERSION = "atelier-v70";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "config.js", "vendor/supabase.js", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/dofus-ocre.png", "data/core.json", "data/farm.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
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
  // Prix Kamamaster (mis à jour chaque jour) : réseau d'abord, cache si hors connexion
  if (sameOrigin && url.pathname.includes("/data/km/")) {
    e.respondWith(caches.open(VERSION).then(c => fetch(e.request, { cache: "no-cache" }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => c.match(e.request, { ignoreSearch: true }))));
    return;
  }
  // Données du jeu et icônes : cache d'abord (elles changent seulement avec VERSION)
  if (sameOrigin && url.pathname.includes("/data/")) {
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // Reste de l'appli et polices : réponse du cache tout de suite, mise à jour en arrière-plan
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, sameOrigin ? { cache: "no-cache" } : undefined).then(r => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// Notifications push envoyées par la fonction serveur « alertes » (appli fermée)
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Atelier Dofus 3", {
    body: d.body || "", tag: d.tag, renotify: !!d.tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "./#alertes" },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./#alertes";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
