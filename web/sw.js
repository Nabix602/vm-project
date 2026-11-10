// Garde en cache les fichiers de la machine (noms = empreintes, donc immuables) :
// les démarrages et les ouvertures d'applications suivants n'attendent plus le réseau.
const CACHE = "vm-files-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (!/\/images\/alpine-rootfs-flat\/|\/build\/|\/bios\//.test(u.pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request);
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok && r.status === 200) c.put(e.request, r.clone()).catch(() => {});
    return r;
  })());
});
