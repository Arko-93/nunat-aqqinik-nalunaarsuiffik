import {
  coastalMarkerKind,
  type CoastalMarkerKind,
} from "../domain/coastal-features.ts";
import { typeLabel } from "../domain/importance.ts";
import type { Placename } from "../domain/placename.ts";
import type { Messages } from "../i18n/messages.ts";

export type SelectionDisplay = {
  officialName: string;
  /** Exact NunaGIS feature type — never a physical-size claim. */
  typeLabel: string;
  typeCode: number;
  markerKind: CoastalMarkerKind | null;
  alternateNames: ReadonlyArray<string>;
  featureId: string;
  placeId: string | null;
  identityStatus: Placename["identityStatus"];
  /** Always false — markers do not encode area or hazard class. */
  claimsPhysicalSize: false;
  sourceKind: "nunagis_midpoint";
};

export const localizedCoastalTypeLabel = (
  typeCode: number,
  t: Messages,
): string | null => {
  const kind = coastalMarkerKind(typeCode);
  if (kind === "skerry") return t.typeLabelSkerry;
  if (kind === "island") return t.typeLabelIsland;
  if (kind === "island_part") return t.typeLabelIslandPart;
  if (kind === "island_group") return t.typeLabelIslandGroup;
  return null;
};

export const displayTypeLabel = (place: Placename, t: Messages): string =>
  localizedCoastalTypeLabel(place.typeCode, t) ??
  place.typeLabel ??
  typeLabel(place.typeCode);

export const selectionDisplay = (
  place: Placename,
  t: Messages,
): SelectionDisplay => {
  const alternateNames = [
    place.danishName,
    place.oldOfficialName,
  ].filter((name): name is string => Boolean(name) && name !== place.officialName);

  return {
    officialName: place.officialName,
    typeLabel: displayTypeLabel(place, t),
    typeCode: place.typeCode,
    markerKind: coastalMarkerKind(place.typeCode),
    alternateNames,
    featureId: place.featureId,
    placeId: place.placeId,
    identityStatus: place.identityStatus,
    claimsPhysicalSize: false,
    sourceKind: "nunagis_midpoint",
  };
};
