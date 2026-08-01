import { Schema } from "effect";
import {
  rankForType,
  typeLabel,
  zoomBandFor,
  type ZoomBand,
} from "./importance.ts";
import { isLocalityNameShadow } from "./near-duplicate.ts";

export const LOCALITY_TYPE_CODES = [21, 23] as const;

export const ZoomBandSchema = Schema.Literals([
  "locality",
  "major",
  "regional",
  "local",
  "detail",
]).annotate({ identifier: "ZoomBand" });

export const FeatureKind = Schema.Literals([
  "town",
  "settlement",
  "other",
]).annotate({
  identifier: "FeatureKind",
});
export type FeatureKind = typeof FeatureKind.Type;

export const PlacenameScope = Schema.Literals(["localities", "all"]).annotate({
  identifier: "PlacenameScope",
});
export type PlacenameScope = typeof PlacenameScope.Type;

/** Real Greenland municipalities (for filters and responsibility). */
export const MUNICIPALITY_BY_CODE: Readonly<Record<number, string>> = {
  955: "Kommune Kujalleq",
  956: "Kommuneqarfik Sermersooq",
  957: "Qeqqata kommunia",
  959: "Kommune Qeqertalik",
  960: "Avannaata kommunia",
};

/** NunaGIS area codes that are not municipalities. */
export const NON_MUNICIPALITY_CODES: ReadonlySet<number> = new Set([961, 999]);

export const AREA_LABEL_BY_CODE: Readonly<Record<number, string>> = {
  ...MUNICIPALITY_BY_CODE,
  961: "National park / other area",
  999: "National park",
};

export const isMunicipalityCode = (code: number | null): boolean =>
  code != null && code in MUNICIPALITY_BY_CODE;

export const responsibilityLabel = (
  municipalityCode: number | null,
  municipalityName: string | null,
): string | null => {
  if (municipalityCode != null && municipalityCode in AREA_LABEL_BY_CODE) {
    return AREA_LABEL_BY_CODE[municipalityCode] ?? null;
  }
  return municipalityName;
};

export const isLocalityType = (typeCode: number): boolean =>
  typeCode === 21 || typeCode === 23;

export const featureKindFromType = (typeCode: number): FeatureKind => {
  if (typeCode === 21) return "town";
  if (typeCode === 23) return "settlement";
  return "other";
};

export const stripGlobalId = (value: string): string =>
  value.trim().replace(/^\{|\}$/g, "");

export const cleanOptionalName = (
  value: string | null | undefined,
): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/** Normalized placename used by the map product. */
export const Placename = Schema.Struct({
  globalId: Schema.String,
  recordId: Schema.Number,
  officialName: Schema.String,
  danishName: Schema.NullOr(Schema.String),
  oldOfficialName: Schema.NullOr(Schema.String),
  featureKind: FeatureKind,
  typeCode: Schema.Number,
  typeLabel: Schema.String,
  isLocality: Schema.Boolean,
  /** Geographic name that only duplicates a nearby locality (hide from UI). */
  isLocalityShadow: Schema.Boolean,
  importance: Schema.Number,
  minZoom: Schema.Number,
  zoomBand: ZoomBandSchema,
  municipalityCode: Schema.NullOr(Schema.Number),
  municipalityName: Schema.NullOr(Schema.String),
  localityCode: Schema.NullOr(Schema.String),
  longitude: Schema.Number,
  latitude: Schema.Number,
}).annotate({ identifier: "Placename" });
export interface Placename extends Schema.Schema.Type<typeof Placename> {}

export const withMapRank = <
  T extends {
    typeCode: number;
    isLocality: boolean;
  },
>(
  place: T,
): T & {
  typeLabel: string;
  importance: number;
  minZoom: number;
  zoomBand: ZoomBand;
} => {
  const rank = rankForType(place.typeCode);
  return {
    ...place,
    typeLabel: typeLabel(place.typeCode),
    importance: rank.importance,
    minZoom: rank.minZoom,
    zoomBand: zoomBandFor(rank.importance, place.isLocality),
  };
};

/** ArcGIS attribute payload for the midpoint layer. */
export const ArcGisPlacenameAttributes = Schema.Struct({
  OBJECTID: Schema.NullOr(Schema.Number),
  GlobalID: Schema.NullOr(Schema.String),
  ID: Schema.NullOr(Schema.Number),
  // Register has rare null fields; filtered before product use.
  PlacenameOfficial: Schema.NullOr(Schema.String),
  PlacenameOfficialOld: Schema.NullOr(Schema.String),
  PlacenameDanish: Schema.NullOr(Schema.String),
  Type: Schema.NullOr(Schema.Number),
  MunicipalityCode: Schema.NullOr(Schema.Number),
  LokalityCode: Schema.NullOr(Schema.String),
}).annotate({ identifier: "ArcGisPlacenameAttributes" });
export interface ArcGisPlacenameAttributes
  extends Schema.Schema.Type<typeof ArcGisPlacenameAttributes> {}

export const ArcGisPointGeometry = Schema.Struct({
  x: Schema.NullOr(Schema.Number),
  y: Schema.NullOr(Schema.Number),
}).annotate({ identifier: "ArcGisPointGeometry" });

export const ArcGisPlacenameFeature = Schema.Struct({
  attributes: ArcGisPlacenameAttributes,
  geometry: Schema.optionalKey(ArcGisPointGeometry),
}).annotate({ identifier: "ArcGisPlacenameFeature" });
export interface ArcGisPlacenameFeature
  extends Schema.Schema.Type<typeof ArcGisPlacenameFeature> {}

export const ArcGisQueryResponse = Schema.Struct({
  features: Schema.Array(ArcGisPlacenameFeature),
  exceededTransferLimit: Schema.optionalKey(Schema.Boolean),
  error: Schema.optionalKey(
    Schema.Struct({
      code: Schema.optionalKey(Schema.Number),
      message: Schema.optionalKey(Schema.String),
    }),
  ),
}).annotate({ identifier: "ArcGisQueryResponse" });
export interface ArcGisQueryResponse
  extends Schema.Schema.Type<typeof ArcGisQueryResponse> {}

export const toPlacename = (
  feature: ArcGisPlacenameFeature,
): Placename | null => {
  const { attributes, geometry } = feature;
  const officialName = cleanOptionalName(attributes.PlacenameOfficial);
  const globalIdRaw = cleanOptionalName(attributes.GlobalID);
  const recordId = attributes.ID;
  const typeCode = attributes.Type;
  if (
    officialName == null ||
    globalIdRaw == null ||
    recordId == null ||
    typeCode == null ||
    geometry == null ||
    geometry.x == null ||
    geometry.y == null ||
    !Number.isFinite(geometry.x) ||
    !Number.isFinite(geometry.y) ||
    !Number.isFinite(recordId) ||
    !Number.isFinite(typeCode)
  ) {
    return null;
  }
  const municipalityCode = attributes.MunicipalityCode;
  const isLocality = isLocalityType(typeCode);
  const ranked = withMapRank({ typeCode, isLocality });
  return Schema.decodeUnknownSync(Placename)({
    globalId: stripGlobalId(globalIdRaw),
    recordId,
    officialName,
    danishName: cleanOptionalName(attributes.PlacenameDanish),
    oldOfficialName: cleanOptionalName(attributes.PlacenameOfficialOld),
    featureKind: featureKindFromType(typeCode),
    typeCode,
    typeLabel: ranked.typeLabel,
    isLocality,
    isLocalityShadow: false,
    importance: ranked.importance,
    minZoom: ranked.minZoom,
    zoomBand: ranked.zoomBand,
    municipalityCode,
    municipalityName:
      municipalityCode == null
        ? null
        : (AREA_LABEL_BY_CODE[municipalityCode] ?? null),
    localityCode: cleanOptionalName(attributes.LokalityCode),
    longitude: geometry.x,
    latitude: geometry.y,
  });
};

/** Enrich a loaded GeoJSON property bag that may predate ranking fields. */
export const enrichPlacename = (raw: Placename | Record<string, unknown>): Placename => {
  const typeCode = Number(raw.typeCode);
  const isLocality =
    raw.isLocality === true ||
    raw.isLocality === "true" ||
    isLocalityType(typeCode);
  const ranked = withMapRank({ typeCode, isLocality });
  const municipalityCode =
    raw.municipalityCode == null || raw.municipalityCode === ""
      ? null
      : Number(raw.municipalityCode);
  return Schema.decodeUnknownSync(Placename)({
    globalId: String(raw.globalId),
    recordId: Number(raw.recordId),
    officialName: String(raw.officialName),
    danishName: cleanOptionalName(raw.danishName as string | null | undefined),
    oldOfficialName: cleanOptionalName(
      raw.oldOfficialName as string | null | undefined,
    ),
    featureKind: featureKindFromType(typeCode),
    typeCode,
    typeLabel: ranked.typeLabel,
    isLocality,
    isLocalityShadow: false,
    importance: ranked.importance,
    minZoom: ranked.minZoom,
    zoomBand: ranked.zoomBand,
    municipalityCode,
    municipalityName:
      municipalityCode == null
        ? cleanOptionalName(raw.municipalityName as string | null | undefined)
        : (AREA_LABEL_BY_CODE[municipalityCode] ??
          cleanOptionalName(raw.municipalityName as string | null | undefined)),
    localityCode: cleanOptionalName(
      raw.localityCode as string | null | undefined,
    ),
    longitude: Number(raw.longitude),
    latitude: Number(raw.latitude),
  });
};

export const placenameToGeoJsonFeature = (
  place: Placename,
): GeoJSON.Feature<GeoJSON.Point, Placename> => ({
  type: "Feature",
  id: place.recordId,
  geometry: {
    type: "Point",
    coordinates: [place.longitude, place.latitude],
  },
  properties: place,
});

export const placenamesToFeatureCollection = (
  places: ReadonlyArray<Placename>,
): GeoJSON.FeatureCollection<GeoJSON.Point, Placename> => ({
  type: "FeatureCollection",
  features: places.map(placenameToGeoJsonFeature),
});

export const enrichCollection = (
  collection: GeoJSON.FeatureCollection<GeoJSON.Point, Placename>,
): GeoJSON.FeatureCollection<GeoJSON.Point, Placename> => {
  const enriched = collection.features.map((feature) =>
    enrichPlacename(feature.properties),
  );
  const localities = enriched.filter((place) => place.isLocality);

  const features = enriched
    .map((place) =>
      placenameToGeoJsonFeature({
        ...place,
        isLocalityShadow: isLocalityNameShadow(place, localities),
      }),
    )
    // Draw order: low importance first; high importance placed last → wins collisions
    .sort((a, b) => a.properties.importance - b.properties.importance);
  return { type: "FeatureCollection", features };
};

export const whereClauseForScope = (scope: PlacenameScope): string =>
  scope === "localities" ? "Type IN (21,23)" : "1=1";