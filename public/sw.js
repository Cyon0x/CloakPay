/* CloakPay service worker.
 *
 * Deliberately tiny. CloakPay handles money and serves authenticated pages, so
 * the safe default is to cache nothing that could carry a session: no HTML, no
 * API responses, no server-component payloads, nothing rendered for a signed-in
 * person. Only static brand assets and fonts are held.
 *
 * A fetch handler exists because browsers look for one when deciding whether an
 * app is installable. It never calls respondWith for anything outside the
 * allowlist, so for every other request the browser's own handling is unchanged
 * and no response is stored anywhere.
 */
const CACHE = "cloakpay-static-v1";

const ALLOWLIST = [
  /^\/brand\//,
  /^\/fonts\//,
  /^\/icons\//,
  /^\/icon\.png$/,
  /^\/apple-icon\.png$/,
  /^\/favicon\.ico$/,
  /^\/manifest\.webmanifest$/,
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!ALLOWLIST.some((pattern) => pattern.test(url.pathname))) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    })(),
  );
});
