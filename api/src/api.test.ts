import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { buildFtsMatchQuery } from "./repository/sqlite-repository.js";

const NUUK_ID = "plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80";
const QAQORTOQ_ID = "plc_ebf06a92-e8e1-42e8-b45b-eedbc7843722";
const UNKNOWN_ID = "plc_00000000-0000-4000-8000-000000000000";

describe("buildFtsMatchQuery", () => {
  it("builds quoted prefix tokens", () => {
    expect(buildFtsMatchQuery("  Nuuk ")).toBe('"Nuuk"*');
    expect(buildFtsMatchQuery('foo "bar')).toBe('"foo"* AND """bar"*');
    expect(buildFtsMatchQuery("   ")).toBeNull();
  });
});

describe("Decision Geography read API", () => {
  const { app, ctx } = createApp();

  afterAll(() => {
    ctx.repository.close();
  });

  it("returns a place by id with release metadata", async () => {
    const response = await app.request(`/v1/places/${NUUK_ID}`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      release_id: string;
      data_as_of: string;
      place: { place_id: string; canonical_name_kl: string | null };
      source_refs: unknown[];
    };

    expect(body.release_id).toBe(ctx.release.releaseId);
    expect(body.data_as_of).toBe(ctx.release.dataAsOf);
    expect(body.place.place_id).toBe(NUUK_ID);
    expect(body.place.canonical_name_kl).toBe("Nuuk");
    expect(Array.isArray(body.source_refs)).toBe(true);
  });

  it("returns 404 for an unknown place id", async () => {
    const response = await app.request(`/v1/places/${UNKNOWN_ID}`);
    expect(response.status).toBe(404);

    const body = (await response.json()) as { error: string; release_id: string };
    expect(body.error).toBe("place_not_found");
    expect(body.release_id).toBe(ctx.release.releaseId);
  });

  it("resolves by official name and returns candidates without auto-merge", async () => {
    const response = await app.request("/v1/places/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nuuk" }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      result: string;
      requires_confirmation: boolean;
      candidates: Array<{ place_id: string; reasons: string[] }>;
      release_id: string;
    };

    expect(body.release_id).toBe(ctx.release.releaseId);
    expect(body.result).toBe("candidate");
    expect(body.requires_confirmation).toBe(true);
    expect(body.candidates.some((c) => c.place_id === NUUK_ID)).toBe(true);
    expect(body.candidates[0]?.reasons).toContain("official_name_exact");
  });

  it("returns not_found when resolving an unknown identifier namespace", async () => {
    const response = await app.request("/v1/places/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifiers: [
          {
            namespace: "nunagis.global_id",
            value: "00000000-0000-4000-8000-000000000000",
          },
        ],
      }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      result: string;
      candidates: unknown[];
    };
    expect(body.result).toBe("not_found");
    expect(body.candidates).toHaveLength(0);
  });

  it("returns connections for a place by place_id at an effective date", async () => {
    const response = await app.request(
      `/v1/places/${QAQORTOQ_ID}/connections?at=2026-08-01`,
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      place_id: string;
      effective_date: string;
      connections: Array<{
        connection_id: string;
        peer_place_id: string;
        mode: string;
      }>;
      release_id: string;
    };

    expect(body.release_id).toBe(ctx.release.releaseId);
    expect(body.place_id).toBe(QAQORTOQ_ID);
    expect(body.effective_date).toBe("2026-08-01");
    expect(body.connections.length).toBe(2);
    expect(body.connections.every((c) => c.mode === "helicopter")).toBe(true);
    expect(
      body.connections.every(
        (c) =>
          c.connection_id.startsWith("con_") &&
          c.peer_place_id.startsWith("plc_"),
      ),
    ).toBe(true);
  });

  it("searches places by name fragment", async () => {
    const response = await app.request("/v1/places?q=Nuuk");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      places: Array<{ place_id: string }>;
    };
    expect(body.places.some((p) => p.place_id === NUUK_ID)).toBe(true);
  });

  it("searches places by name prefix via FTS", async () => {
    const response = await app.request("/v1/places?q=Nuu");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      places: Array<{ place_id: string }>;
    };
    expect(body.places.some((p) => p.place_id === NUUK_ID)).toBe(true);
  });

  it("exposes latest release metadata", async () => {
    const response = await app.request("/v1/releases/latest");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      release_id: string;
      data_as_of: string;
      publish_ready: boolean;
    };
    expect(body.release_id).toBe(ctx.release.releaseId);
    expect(body.data_as_of).toBe(ctx.release.dataAsOf);
    expect(body.publish_ready).toBe(false);
  });
});
