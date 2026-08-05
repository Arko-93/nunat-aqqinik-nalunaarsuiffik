/** Pure helpers for app-shell Service Worker precache injection (build + tests). */

const SHELL_ASSET_RE = /\.(?:js|css|mjs|woff2?|ttf|otf)$/i;

export function collectShellPrecacheUrls(
  bundleFileNames: ReadonlyArray<string>,
): string[] {
  const assets = bundleFileNames
    .filter((name) => SHELL_ASSET_RE.test(name))
    .map((name) => (name.startsWith("/") ? name : `/${name}`));
  return ["/", "/index.html", ...new Set(assets)].sort();
}

/** Replace the PRECACHE_URLS array literal in sw.js source. */
export function injectPrecacheUrls(
  swSource: string,
  urls: ReadonlyArray<string>,
): string {
  const next = `const PRECACHE_URLS = ${JSON.stringify([...urls], null, 2)};`;
  if (!/const PRECACHE_URLS = \[[\s\S]*?\];/.test(swSource)) {
    throw new Error("sw.js missing PRECACHE_URLS declaration");
  }
  return swSource.replace(/const PRECACHE_URLS = \[[\s\S]*?\];/, next);
}
