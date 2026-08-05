import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteCorridorPack,
  getPackInstallState,
  installCorridorPack,
  readInstalledManifest,
  readPackFile,
  resetOpfsRootProvider,
  setOpfsRootProvider,
} from "./corridor-pack.ts";
import { createMemoryOpfsRoot } from "./opfs.ts";

const FIXTURE_BYTES = new TextEncoder().encode("tiny-corridor-fixture\n");
const FIXTURE_SHA =
  "e9f838dc5320ce31ce76ee05a451d634defa01f5e119d7041773a2fb8d4ba7c7";

const stubManifest = {
  id: "corridor_qaarsut_kullorsuaq_fixture_2026-08-05",
  slug: "qaarsut-kullorsuaq",
  title: {
    kl: "Qaarsut–Kullorsuaq (fixture)",
    da: "Qaarsut–Kullorsuaq (fixture)",
    en: "Qaarsut–Kullorsuaq (fixture)",
  },
  bbox: [-58.5, 70.4, -50.5, 74.9],
  bytes: 22,
  createdAt: "2026-08-05T00:00:00Z",
  kind: "stub",
  files: [
    {
      path: "localities.geojson",
      bytes: 22,
      sha256: FIXTURE_SHA,
    },
  ],
  storage: {
    opfs: ["localities.geojson"],
    cache: ["manifest.json"],
  },
  notForNavigation: true,
  notes: "Tiny Vitest fixture — not terrain-offline capable.",
};

afterEach(() => {
  resetOpfsRootProvider();
  vi.unstubAllGlobals();
});

describe("OPFS corridor pack behavior", () => {
  it("installs, reads, and deletes a stub pack without claiming terrain offline", async () => {
    const { provider } = createMemoryOpfsRoot();
    setOpfsRootProvider(provider);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/manifest.json")) {
          return new Response(JSON.stringify(stubManifest), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/localities.geojson")) {
          return new Response(FIXTURE_BYTES, { status: 200 });
        }
        return new Response("missing", { status: 404 });
      }),
    );

    const progress: Array<{ path: string; loaded: number }> = [];
    const installed = await installCorridorPack(
      "/packages/fixtures/tiny-corridor",
      (p) => {
        progress.push({ path: p.path, loaded: p.loaded });
      },
    );

    expect(installed.kind).toBe("stub");
    expect(progress.some((p) => p.path === "localities.geojson")).toBe(true);

    const active = await readInstalledManifest();
    expect(active?.id).toBe(stubManifest.id);

    const state = await getPackInstallState();
    expect(state).toEqual({
      status: "installed",
      manifest: active,
      terrainOffline: false,
    });

    const file = await readPackFile(stubManifest.id, "localities.geojson");
    expect(file).not.toBeNull();
    expect(new TextDecoder().decode(file!)).toBe("tiny-corridor-fixture\n");

    await deleteCorridorPack();
    expect(await readInstalledManifest()).toBeNull();
    expect(await getPackInstallState()).toEqual({ status: "absent" });
    expect(await readPackFile(stubManifest.id, "localities.geojson")).toBeNull();
  });

  it("rejects a corrupted download before writing the active manifest", async () => {
    const { provider } = createMemoryOpfsRoot();
    setOpfsRootProvider(provider);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/manifest.json")) {
          return new Response(JSON.stringify(stubManifest), { status: 200 });
        }
        return new Response("wrong-bytes!!!!!!!!!!!!!", { status: 200 });
      }),
    );

    await expect(
      installCorridorPack("/packages/fixtures/tiny-corridor"),
    ).rejects.toThrow(/Byte size mismatch|Checksum mismatch/);
    expect(await readInstalledManifest()).toBeNull();
  });

  it("surfaces OPFS deletion failures instead of swallowing them", async () => {
    const { provider, root } = createMemoryOpfsRoot();
    setOpfsRootProvider(provider);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/manifest.json")) {
          return new Response(JSON.stringify(stubManifest), { status: 200 });
        }
        if (url.endsWith("/localities.geojson")) {
          return new Response(FIXTURE_BYTES, { status: 200 });
        }
        return new Response("missing", { status: 404 });
      }),
    );

    await installCorridorPack("/packages/fixtures/tiny-corridor");
    const packs = await root.getDirectoryHandle("corridor-packs");
    const original = packs.removeEntry.bind(packs);
    packs.removeEntry = async (name: string) => {
      if (name === stubManifest.id) {
        throw Object.assign(new Error("QuotaExceededError"), {
          name: "QuotaExceededError",
        });
      }
      return original(name);
    };

    await expect(deleteCorridorPack()).rejects.toThrow(/Failed to delete/);
    expect(await readInstalledManifest()).not.toBeNull();
  });
});
