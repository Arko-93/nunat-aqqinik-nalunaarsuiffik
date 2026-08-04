import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256HexSync } from "./sha256.ts";

describe("sha256HexSync", () => {
  it("matches Node crypto for package bytes", () => {
    const data = new TextEncoder().encode("nunat-marine-poc");
    const expected = createHash("sha256").update(data).digest("hex");
    expect(sha256HexSync(data.buffer)).toBe(expected);
  });
});
