import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { buildFtsMatchQuery } from "./repository/sqlite-repository.js";

const NUUK_ID = "plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80";
const QAQORTOQ_ID = "plc_ebf06a92-e8e1-42e8-b45b-eedbc7843722";
const NARSAQ_ID = "plc_a0c38659-994b-4e7e-8ba6-9a8e1f86653f";
const NANORTALIK_ID = "plc_8bfd9c7b-25f3-4363-9c8c-27f1ce551864";
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
    // Structural edges always listed; August is off-season for settlement helis.
    expect(body.connections.length).toBe(14);
    expect(body.connections.some((c) => c.mode === "air")).toBe(true);
    expect(body.connections.filter((c) => c.mode === "helicopter")).toHaveLength(
      13,
    );
    expect(
      body.connections.every(
        (c) =>
          c.connection_id.startsWith("con_") &&
          c.peer_place_id.startsWith("plc_"),
      ),
    ).toBe(true);
    const active = body.connections.filter((c) => c.services.length >= 1);
    expect(active.length).toBe(3);
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

    expect(body.connections.length).toBe(14);
    expect(body.connections.every((c) => c.services.length === 0)).toBe(true);
  });

  it("filters connections by mode, capability, and operator", async () => {
    const byMode = await app.request(
      `/v1/places/${QAQORTOQ_ID}/connections?at=2026-08-01&mode=helicopter`,
    );
    expect(byMode.status).toBe(200);
    const modeBody = (await byMode.json()) as {
      connections: Array<{ mode: string; services: unknown[] }>;
      filters: {
        mode: string | null;
        capability: string | null;
        operator: string | null;
      };
    };
    expect(modeBody.filters.mode).toBe("helicopter");
    expect(modeBody.connections.length).toBe(13);
    expect(modeBody.connections.every((c) => c.mode === "helicopter")).toBe(
      true,
    );

    const wrongMode = await app.request(
      `/v1/places/${QAQORTOQ_ID}/connections?at=2026-08-01&mode=sea`,
    );
    expect(wrongMode.status).toBe(200);
    const wrongModeBody = (await wrongMode.json()) as {
      connections: unknown[];
    };
    expect(wrongModeBody.connections).toHaveLength(0);

    const byCapability = await app.request(
      `/v1/places/${QAQORTOQ_ID}/connections?at=2026-08-01&capability=passenger`,
    );
    expect(byCapability.status).toBe(200);
    const capBody = (await byCapability.json()) as {
      connections: Array<{ services: Array<{ capabilities: string[] }> }>;
    };
    expect(capBody.connections.length).toBe(3);
    expect(
      capBody.connections.every((c) =>
        c.services.every((s) => s.capabilities.includes("passenger")),
      ),
    ).toBe(true);

    const freight = await app.request(
      `/v1/places/${QAQORTOQ_ID}/connections?at=2026-08-01&capability=freight`,
    );
    expect(freight.status).toBe(200);
    const freightBody = (await freight.json()) as { connections: unknown[] };
    expect(freightBody.connections).toHaveLength(0);

    const byOperator = await app.request(
      `/v1/places/${QAQORTOQ_ID}/connections?at=2026-08-01&operator=Air%20Greenland`,
    );
    expect(byOperator.status).toBe(200);
    const opBody = (await byOperator.json()) as {
      connections: Array<{ services: Array<{ operator: string | null }> }>;
    };
    expect(opBody.connections.length).toBe(3);
    expect(
      opBody.connections.every((c) =>
        c.services.every((s) => s.operator === "Air Greenland"),
      ),
    ).toBe(true);

    const wrongOp = await app.request(
      `/v1/places/${QAQORTOQ_ID}/connections?at=2026-08-01&operator=Other`,
    );
    expect(wrongOp.status).toBe(200);
    const wrongOpBody = (await wrongOp.json()) as { connections: unknown[] };
    expect(wrongOpBody.connections).toHaveLength(0);
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
    expect(afterBody.report.counts.connected).toBeGreaterThanOrEqual(4);
    expect(afterBody.report.connected_place_ids).toContain(QAQORTOQ_ID);
    expect(afterBody.report.connected_place_ids).toContain(NUUK_ID);
    expect(afterBody.report.isolated_place_ids).not.toContain(QAQORTOQ_ID);
  });

  it("reports freight and emergency capability gaps", async () => {
    for (const capability of ["freight", "emergency"] as const) {
      const response = await app.request(
        `/v1/reports/capability-gap?at=2026-08-01&capability=${capability}`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        report: {
          capability: string;
          counts: { places: number; connected: number; isolated: number };
          connected_place_ids: string[];
        };
      };
      expect(body.report.capability).toBe(capability);
      expect(body.report.counts.connected).toBe(0);
      expect(body.report.connected_place_ids).toHaveLength(0);
      expect(body.report.counts.isolated).toBe(body.report.counts.places);
    }
  });

  it("reports single-dependency places for an effective date", async () => {
    const response = await app.request(
      "/v1/reports/single-dependency?at=2026-08-01",
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      report: {
        effective_date: string;
        capability: string;
        single_connection: Array<{ place_id: string; connection_id: string }>;
        single_mode: Array<{ place_id: string; mode: string }>;
        single_operator: Array<{ place_id: string; operator: string }>;
        counts: {
          single_connection: number;
          single_mode: number;
          single_operator: number;
        };
      };
    };

    expect(body.report.effective_date).toBe("2026-08-01");
    expect(body.report.capability).toBe("passenger");
    expect(
      body.report.single_connection.some((r) => r.place_id === NANORTALIK_ID),
    ).toBe(true);
    expect(
      body.report.single_connection.some((r) => r.place_id === NARSAQ_ID),
    ).toBe(true);
    expect(
      body.report.single_connection.some((r) => r.place_id === QAQORTOQ_ID),
    ).toBe(false);
    expect(
      body.report.single_mode.some((r) => r.place_id === QAQORTOQ_ID),
    ).toBe(false);
    expect(
      body.report.single_operator.some(
        (r) =>
          r.place_id === QAQORTOQ_ID && r.operator === "Air Greenland",
      ),
    ).toBe(true);
    expect(body.report.counts.single_connection).toBeGreaterThanOrEqual(2);
    expect(body.report.counts.single_mode).toBeGreaterThanOrEqual(3);
  });

  it("reports seasonal-loss when validity windows leave months isolated", async () => {
    const response = await app.request("/v1/reports/seasonal-loss?year=2026");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      report: {
        year: number;
        capability: string;
        losses: Array<{
          place_id: string;
          connected_months: number[];
          isolated_months: number[];
        }>;
        counts: { places_with_seasonal_loss: number };
      };
    };

    expect(body.report.year).toBe(2026);
    expect(body.report.capability).toBe("passenger");
    // Year-round hubs: valid_from gap Jan–Apr. Settlements: seasonal months only.
    expect(body.report.counts.places_with_seasonal_loss).toBe(15);
    const qaq = body.report.losses.find((r) => r.place_id === QAQORTOQ_ID);
    expect(qaq).toBeDefined();
    expect(qaq!.isolated_months).toEqual([1, 2, 3, 4]);
    expect(qaq!.connected_months).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(body.report.losses.some((r) => r.place_id === NUUK_ID)).toBe(true);
  });

  it("finds a structural passenger path between places", async () => {
    const direct = await app.request(
      `/v1/reachability?from=${QAQORTOQ_ID}&to=${NANORTALIK_ID}&at=2026-08-01`,
    );
    expect(direct.status).toBe(200);
    const directBody = (await direct.json()) as {
      from_place_id: string;
      to_place_id: string;
      effective_date: string;
      capability: string;
      max_transfers: number | null;
      reachable: boolean;
      hops: number;
      path: string[];
      connections: string[];
    };
    expect(directBody.reachable).toBe(true);
    expect(directBody.max_transfers).toBeNull();
    expect(directBody.hops).toBe(1);
    expect(directBody.path).toEqual([QAQORTOQ_ID, NANORTALIK_ID]);
    expect(directBody.connections).toHaveLength(1);

    const viaHub = await app.request(
      `/v1/reachability?from=${NANORTALIK_ID}&to=${NARSAQ_ID}&at=2026-08-01`,
    );
    expect(viaHub.status).toBe(200);
    const viaBody = (await viaHub.json()) as {
      reachable: boolean;
      hops: number;
      path: string[];
    };
    expect(viaBody.reachable).toBe(true);
    expect(viaBody.hops).toBe(2);
    expect(viaBody.path[0]).toBe(NANORTALIK_ID);
    expect(viaBody.path[viaBody.path.length - 1]).toBe(NARSAQ_ID);
    expect(viaBody.path).toContain(QAQORTOQ_ID);

    const blocked = await app.request(
      `/v1/reachability?from=${NANORTALIK_ID}&to=${NARSAQ_ID}&at=2026-08-01&max_transfers=0`,
    );
    expect(blocked.status).toBe(200);
    const blockedBody = (await blocked.json()) as {
      reachable: boolean;
      max_transfers: number | null;
      hops: number | null;
    };
    expect(blockedBody.max_transfers).toBe(0);
    expect(blockedBody.reachable).toBe(false);
    expect(blockedBody.hops).toBeNull();

    const nuukLink = await app.request(
      `/v1/reachability?from=${NUUK_ID}&to=${QAQORTOQ_ID}&at=2026-08-01`,
    );
    expect(nuukLink.status).toBe(200);
    const nuukBody = (await nuukLink.json()) as {
      reachable: boolean;
      hops: number | null;
      path: string[];
    };
    expect(nuukBody.reachable).toBe(true);
    expect(nuukBody.hops).toBe(1);
    expect(nuukBody.path).toEqual([NUUK_ID, QAQORTOQ_ID]);

    const beforeService = await app.request(
      `/v1/reachability?from=${QAQORTOQ_ID}&to=${NANORTALIK_ID}&at=2026-04-15`,
    );
    expect(beforeService.status).toBe(200);
    const beforeBody = (await beforeService.json()) as {
      reachable: boolean;
    };
    expect(beforeBody.reachable).toBe(false);
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
