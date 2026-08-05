import {
  coastalMetaForType,
  NUNAGIS_MIDPOINT_PROVENANCE,
} from "../domain/coastal-features.ts";
import { typeLabel, type ZoomBand } from "../domain/importance.ts";
import type { FeatureKind, Placename } from "../domain/placename.ts";
import type { Messages } from "../i18n/messages.ts";

/** Exact source provenance shown in PlaceDossier Sources. */
export type PlaceProvenance = {
  sourceKind: typeof NUNAGIS_MIDPOINT_PROVENANCE.sourceKind;
  registerName: string;
  layerUrl: string;
  geometryKind: typeof NUNAGIS_MIDPOINT_PROVENANCE.geometryKind;
  globalId: string;
  typeCode: number;
  registerTypeLabel: string;
};

const readString = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  return String(value);
};

const readNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const readBoolean = (value: unknown): boolean =>
  value === true || value === "true" || value === 1;

const readZoomBand = (value: unknown): ZoomBand => {
  if (
    value === "town" ||
    value === "settlement" ||
    value === "major" ||
    value === "regional" ||
    value === "local" ||
    value === "detail"
  ) {
    return value;
  }
  return "detail";
};

const readFeatureKind = (value: unknown): FeatureKind => {
  if (value === "town" || value === "settlement") return value;
  return "other";
};

const readIdentityStatus = (
  value: unknown,
): Placename["identityStatus"] => {
  if (
    value === "canonical" ||
    value === "candidate" ||
    value === "upstream_only"
  ) {
    return value;
  }
  return "upstream_only";
};

export const localizedCoastalTypeLabel = (
  typeCode: number,
  t: Messages,
): string | null => {
  const meta = coastalMetaForType(typeCode);
  if (!meta) return null;
  return t[meta.typeLabelKey];
};

export const displayTypeLabel = (place: Placename, t: Messages): string =>
  localizedCoastalTypeLabel(place.typeCode, t) ??
  place.typeLabel ??
  typeLabel(place.typeCode);

export const placeProvenance = (place: Placename): PlaceProvenance => {
  const meta = coastalMetaForType(place.typeCode);
  return {
    sourceKind: NUNAGIS_MIDPOINT_PROVENANCE.sourceKind,
    registerName: NUNAGIS_MIDPOINT_PROVENANCE.registerName,
    layerUrl: NUNAGIS_MIDPOINT_PROVENANCE.layerUrl,
    geometryKind: NUNAGIS_MIDPOINT_PROVENANCE.geometryKind,
    globalId: place.globalId,
    typeCode: place.typeCode,
    registerTypeLabel: meta?.registerLabelDa ?? typeLabel(place.typeCode),
  };
};

/**
 * Production map-click selection helper.
 * MapLibre feature properties → Placename for App selection / PlaceDossier.
 */
export function selectPlaceFromMapClick(
  props: GeoJSON.GeoJsonProperties,
): Placename | null {
  if (props == null) return null;

  const globalId = readString(props.globalId);
  const officialName = readString(props.officialName);
  const recordId = readNumber(props.recordId);
  const typeCode = readNumber(props.typeCode);
  const longitude = readNumber(props.longitude);
  const latitude = readNumber(props.latitude);
  const importance = readNumber(props.importance);
  const minZoom = readNumber(props.minZoom);
  if (
    globalId == null ||
    officialName == null ||
    recordId == null ||
    typeCode == null ||
    longitude == null ||
    latitude == null ||
    importance == null ||
    minZoom == null
  ) {
    return null;
  }

  const featureId = readString(props.featureId) ?? `nunagis:${globalId}`;
  const place: Placename = {
    featureId,
    placeId: readString(props.placeId),
    identityStatus: readIdentityStatus(props.identityStatus),
    globalId,
    recordId,
    officialName,
    danishName: readString(props.danishName),
    oldOfficialName: readString(props.oldOfficialName),
    featureKind: readFeatureKind(props.featureKind),
    typeCode,
    typeLabel: readString(props.typeLabel) ?? typeLabel(typeCode),
    isLocality: readBoolean(props.isLocality),
    isLocalityShadow: readBoolean(props.isLocalityShadow),
    importance,
    minZoom,
    zoomBand: readZoomBand(props.zoomBand),
    municipalityCode: readNumber(props.municipalityCode),
    municipalityName: readString(props.municipalityName),
    localityCode: readString(props.localityCode),
    longitude,
    latitude,
  };
  return place;
}
