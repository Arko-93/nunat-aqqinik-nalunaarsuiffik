/* App-shell Service Worker only — large corridor PMTiles stay in OPFS.
 * PRECACHE_URLS is replaced at production build with hashed Vite assets. */
const SHELL_CACHE = "nunat-shell-v1";
const SHELL_PREFIX = "nunat-shell-";
const PRECACHE_URLS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Only delete obsolete caches this worker owns.
            .filter((key) => key.startsWith(SHELL_PREFIX) && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPackageOrTiles(url) {
  return (
    url.pathname.includes(".pmtiles") || url.pathname.startsWith("/packages/")
  );
}

/** HTML + hashed Vite assets + same-origin JS/CSS needed to boot offline. */
function isAppShellRequest(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (isPackageOrTiles(url)) return false;
  if (request.mode === "navigate") return true;
  if (url.pathname.startsWith("/assets/")) return true;
  return /\.(?:js|css|mjs|woff2?|ttf|otf|svg|ico|webp|png)$/i.test(
    url.pathname,
  );
}

async function putInShellCache(request, response) {
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(request, response);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (isPackageOrTiles(url)) return;
  if (!isAppShellRequest(event.request, url)) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          // Await the write so install/fetch completion includes the cache entry.
          await putInShellCache(event.request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return (
            (await caches.match("/index.html")) ||
            (await caches.match("/")) ||
            Response.error()
          );
        }
        return Response.error();
      }
    })(),
  );
});
