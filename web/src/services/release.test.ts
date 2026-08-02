import { describe, expect, it } from "vitest";
import { releaseBasePath } from "./release.ts";

describe("release paths", () => {
  it("builds release asset base path", () => {
    expect(releaseBasePath("2026.08.01.1")).toBe("/releases/2026.08.01.1");
  });
});
