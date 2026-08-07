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
        services: Array<{ id: string; status: string }>;
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
          c.peer_place_id.startsWith("plc_") &&
          c.services.length >= 1,
      ),
    ).toBe(true);
  });

  it("keeps structural edges before service valid_from with empty services", async () => {
    const response = await app.request(
      `/v1/places/${QAQORTOQ_ID}/connections?at=2026-04-15`,
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      connections: Array<{
        connection_id: string;
        services: unknown[];
      }>;
    };

    expect(body.connections.length).toBe(2);
    expect(body.connections.every((c) => c.services.length === 0)).toBe(true);
  });

  it("reports passenger isolation for an effective date", async () => {
    const before = await app.request("/v1/reports/isolation?at=2026-04-15");
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as {
      report: {
        counts: { places: number; connected: number; isolated: number };
        connected_place_ids: string[];
        isolated_place_ids: string[];
      };
    };
    expect(beforeBody.report.counts.connected).toBe(0);
    expect(beforeBody.report.isolated_place_ids).toContain(QAQORTOQ_ID);
    expect(beforeBody.report.isolated_place_ids).toContain(NUUK_ID);

    const after = await app.request("/v1/reports/isolation?at=2026-08-01");
    expect(after.status).toBe(200);
    const afterBody = (await after.json()) as {
      report: {
        counts: { places: number; connected: number; isolated: number };
        connected_place_ids: string[];
        isolated_place_ids: string[];
      };
    };
    expect(afterBody.report.counts.connected).toBeGreaterThanOrEqual(3);
    expect(afterBody.report.connected_place_ids).toContain(QAQORTOQ_ID);
    expect(afterBody.report.isolated_place_ids).toContain(NUUK_ID);
    expect(afterBody.report.isolated_place_ids).not.toContain(QAQORTOQ_ID);
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
