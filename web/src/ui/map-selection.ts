import {
  coastalMetaForType,
  NUNAGIS_MIDPOINT_PROVENANCE,
} from "../domain/coastal-features.ts";
import { typeLabel } from "../domain/importance.ts";
import type { Placename } from "../domain/placename.ts";
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
 * MapLibre feature properties → Placename (map tap seam).
 * Kept free of React so tests can exercise the real click path.
 */
export function placenameFromMapFeature(
  props: GeoJSON.GeoJsonProperties,
): Placename | null {
  if (!props) return null;
  const isLocality =
    props.isLocality === true ||
    props.isLocality === "true" ||
    props.isLocality === 1;
  const globalId = String(props.globalId ?? "");
  if (!globalId) return null;
  const identityStatus =
    props.identityStatus === "canonical" ||
    props.identityStatus === "candidate" ||
    props.identityStatus === "upstream_only"
      ? props.identityStatus
      : "upstream_only";
  return {
    ...(props as Placename),
    featureId:
      typeof props.featureId === "string" && props.featureId.length > 0
        ? props.featureId
        : `nunagis:${globalId}`,
    placeId:
      props.placeId == null || props.placeId === ""
        ? null
        : String(props.placeId),
    identityStatus,
    globalId,
    isLocality,
    isLocalityShadow:
      props.isLocalityShadow === true ||
      props.isLocalityShadow === "true" ||
      props.isLocalityShadow === 1,
    typeCode: Number(props.typeCode),
    recordId: Number(props.recordId),
    importance: Number(props.importance),
    minZoom: Number(props.minZoom),
    longitude: Number(props.longitude),
    latitude: Number(props.latitude),
    typeLabel: String(props.typeLabel ?? ""),
    zoomBand: props.zoomBand as Placename["zoomBand"],
    municipalityCode:
      props.municipalityCode == null || props.municipalityCode === ""
        ? null
        : Number(props.municipalityCode),
    danishName:
      props.danishName == null || props.danishName === ""
        ? null
        : String(props.danishName),
    oldOfficialName:
      props.oldOfficialName == null || props.oldOfficialName === ""
        ? null
        : String(props.oldOfficialName),
    municipalityName:
      props.municipalityName == null || props.municipalityName === ""
        ? null
        : String(props.municipalityName),
    localityCode:
      props.localityCode == null || props.localityCode === ""
        ? null
        : String(props.localityCode),
    officialName: String(props.officialName ?? ""),
    featureKind:
      props.featureKind === "town" || props.featureKind === "settlement"
        ? props.featureKind
        : "other",
  };
}

/** Fields PlaceDossier renders after a map tap — tap → dossier seam. */
export type DossierFromTap = {
  officialName: string;
  typeLabel: string;
  alternateNames: ReadonlyArray<string>;
  provenance: PlaceProvenance;
  /** Markers never encode area or hazard class. */
  claimsPhysicalSize: false;
};

export const dossierFromMapTap = (
  props: GeoJSON.GeoJsonProperties,
  t: Messages,
): DossierFromTap | null => {
  const place = placenameFromMapFeature(props);
  if (!place || !place.officialName) return null;
  const alternateNames = [place.danishName, place.oldOfficialName].filter(
    (name): name is string => Boolean(name) && name !== place.officialName,
  );
  return {
    officialName: place.officialName,
    typeLabel: displayTypeLabel(place, t),
    alternateNames,
    provenance: placeProvenance(place),
    claimsPhysicalSize: false,
  };
};
