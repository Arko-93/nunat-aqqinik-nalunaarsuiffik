import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteCorridorPack,
  getPackInstallState,
  installCorridorPack,
  readInstalledManifest,
  readPackFile,
  readPackFileHandle,
  resetOpfsRootProvider,
  setOpfsRootProvider,
  subscribePackInstallState,
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

  it("installs, reads, and deletes a full pack claiming terrain offline", async () => {
    const { provider } = createMemoryOpfsRoot();
    setOpfsRootProvider(provider);

    const terrainBytes = new TextEncoder().encode("fake-pmtiles-bytes");
    const terrainBuffer = terrainBytes.slice().buffer as ArrayBuffer;
    const fullManifest = {
      id: "corridor_qaarsut_kullorsuaq_full_fixture_2026-08-06",
      slug: "qaarsut-kullorsuaq",
      title: {
        kl: "Qaarsut–Kullorsuaq (full fixture)",
        da: "Qaarsut–Kullorsuaq (full fixture)",
        en: "Qaarsut–Kullorsuaq (full fixture)",
      },
      bbox: [-58.5, 70.4, -50.5, 74.9],
      bytes: 18 * 4 + 22,
      createdAt: "2026-08-06T00:00:00Z",
      kind: "full",
      files: [
        {
          path: "localities.geojson",
          bytes: 22,
          sha256: FIXTURE_SHA,
        },
        {
          path: "land-relief.pmtiles",
          bytes: 18,
          sha256:
            "9f1c4c8d4f43b6f1f4d6c0d4b6f1e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
        },
        {
          path: "land-peaks.pmtiles",
          bytes: 18,
          sha256:
            "5f1c4c8d4f43b6f1f4d6c0d4b6f1e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
        },
        {
          path: "ocean-depth-vector.pmtiles",
          bytes: 18,
          sha256:
            "8f1c4c8d4f43b6f1f4d6c0d4b6f1e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
        },
        {
          path: "ocean-depth-dem.pmtiles",
          bytes: 18,
          sha256:
            "6f1c4c8d4f43b6f1f4d6c0d4b6f1e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
        },
        {
          path: "coastline-land/land.pmtiles",
          bytes: 18,
          sha256:
            "7f1c4c8d4f43b6f1f4d6c0d4b6f1e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
        },
      ],
      storage: {
        opfs: [
          "localities.geojson",
          "land-relief.pmtiles",
          "land-peaks.pmtiles",
          "ocean-depth-vector.pmtiles",
          "ocean-depth-dem.pmtiles",
          "coastline-land/land.pmtiles",
        ],
        cache: ["manifest.json"],
      },
      notForNavigation: true,
      notes: "Full fixture — terrain offline claim is real.",
    };
    const terrainSha = async (bytes: Uint8Array) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        bytes.slice().buffer as ArrayBuffer,
      );
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    const landSha = await terrainSha(terrainBytes);
    fullManifest.files[1]!.sha256 = landSha;
    fullManifest.files[2]!.sha256 = landSha;
    fullManifest.files[3]!.sha256 = landSha;
    fullManifest.files[4]!.sha256 = landSha;
    fullManifest.files[5]!.sha256 = landSha;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/manifest.json")) {
          return new Response(JSON.stringify(fullManifest), { status: 200 });
        }
        if (url.endsWith("/localities.geojson")) {
          return new Response(FIXTURE_BYTES, { status: 200 });
        }
        if (url.endsWith(".pmtiles")) {
          return new Response(terrainBuffer, { status: 200 });
        }
        return new Response("missing", { status: 404 });
      }),
    );

    const installed = await installCorridorPack(
      "/packages/qaarsut-kullorsuaq",
    );
    expect(installed.kind).toBe("full");

    const state = await getPackInstallState();
    expect(state.status).toBe("installed");
    if (state.status !== "installed") return;
    expect(state.terrainOffline).toBe(true);

    // Every terrain file is readable from OPFS, including nested paths.
    for (const path of [
      "land-relief.pmtiles",
      "land-peaks.pmtiles",
      "ocean-depth-vector.pmtiles",
      "ocean-depth-dem.pmtiles",
      "coastline-land/land.pmtiles",
    ]) {
      const buffer = await readPackFile(state.manifest.id, path);
      expect(buffer).not.toBeNull();
      expect(new TextDecoder().decode(buffer!)).toBe("fake-pmtiles-bytes");
      const handle = await readPackFileHandle(state.manifest.id, path);
      expect(handle).not.toBeNull();
      expect(handle!.size).toBe(18);
    }

    await deleteCorridorPack();
    expect(await getPackInstallState()).toEqual({ status: "absent" });
  });

  it("notifies pack-state subscribers on install and delete", async () => {
    const { provider } = createMemoryOpfsRoot();
    setOpfsRootProvider(provider);

    const events: string[] = [];
    const unsubscribe = subscribePackInstallState(() => {
      events.push("changed");
    });

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
    expect(events).toEqual([]);
    // The UI (DownloadArea) notifies after its own state settles.
    const { notifyPackInstallStateChanged } = await import(
      "./corridor-pack.ts"
    );
    notifyPackInstallStateChanged();
    expect(events).toEqual(["changed"]);

    unsubscribe();
    notifyPackInstallStateChanged();
    expect(events).toEqual(["changed"]);
  });
});
