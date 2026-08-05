import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  collectShellPrecacheUrls,
  injectPrecacheUrls,
} from "../../scripts/shell-sw-precache.ts";

const swPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../public/sw.js",
);

describe("app-shell service worker contracts", () => {
  const source = readFileSync(swPath, "utf8");

  it("caches JS/CSS shell assets, not only HTML navigations", () => {
    expect(source).toMatch(/\/assets\//);
    expect(source).toMatch(/\(\?:js\|css\|mjs/);
    expect(source).toMatch(/isAppShellRequest/);
  });

  it("awaits shell cache writes", () => {
    expect(source).toMatch(/await putInShellCache/);
    expect(source).toMatch(/await cache\.put/);
  });

  it("deletes only obsolete nunat-shell-* caches it owns", () => {
    expect(source).toMatch(/SHELL_PREFIX\s*=\s*"nunat-shell-"/);
    expect(source).toMatch(/startsWith\(SHELL_PREFIX\)/);
    expect(source).not.toMatch(
      /filter\(\(key\)\s*=>\s*key\s*!==\s*SHELL_CACHE\)/,
    );
  });

  it("never intercepts package or PMTiles traffic", () => {
    expect(source).toMatch(/\.pmtiles/);
    expect(source).toMatch(/\/packages\//);
  });

  it("injects hashed production assets into PRECACHE_URLS", () => {
    const urls = collectShellPrecacheUrls([
      "assets/index-abc123.js",
      "assets/index-def456.css",
      "assets/font.woff2",
      "packages/ignored.pmtiles",
    ]);
    expect(urls).toEqual([
      "/",
      "/assets/font.woff2",
      "/assets/index-abc123.js",
      "/assets/index-def456.css",
      "/index.html",
    ]);
    const injected = injectPrecacheUrls(source, urls);
    expect(injected).toContain("/assets/index-abc123.js");
    expect(injected).toContain("/assets/index-def456.css");
    expect(injected).toContain("/assets/font.woff2");
  });
});
