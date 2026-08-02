import { describe, expect, it } from "vitest";
import { disclosureMinZoom } from "./disclosure.ts";
import { BAND_MIN_ZOOM } from "./importance.ts";

describe("disclosureMinZoom", () => {
  it("uses the same progressive bands for inhabited and geography", () => {
    expect(disclosureMinZoom("inhabited")).toEqual(BAND_MIN_ZOOM);
    expect(disclosureMinZoom("geography")).toEqual(BAND_MIN_ZOOM);
  });

  it("keeps towns earlier than settlements and geography", () => {
    const bands = disclosureMinZoom("geography");
    expect(bands.town).toBeLessThan(bands.settlement);
    expect(bands.settlement).toBeLessThanOrEqual(bands.major);
    expect(bands.major).toBeLessThan(bands.regional);
    expect(bands.regional).toBeLessThan(bands.local);
    expect(bands.local).toBeLessThanOrEqual(bands.detail);
  });
});
