import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
});
