import { describe, expect, it } from "vitest";
import {
  createDecisionGeographyClient,
  DEFAULT_API_BASE_URL,
} from "./client.js";

describe("OpenAPI client", () => {
  it("creates a typed client with the local default base URL", () => {
    const client = createDecisionGeographyClient();
    expect(client).toBeDefined();
    expect(typeof client.GET).toBe("function");
    expect(typeof client.POST).toBe("function");
  });

  it("accepts an override base URL", () => {
    const client = createDecisionGeographyClient({
      baseUrl: "http://example.test:9999",
    });
    expect(client).toBeDefined();
    expect(DEFAULT_API_BASE_URL).toBe("http://127.0.0.1:8787");
  });
});
