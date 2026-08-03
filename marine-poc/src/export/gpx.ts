import { ExportError } from "../domain/errors.ts";
import type { TrackPoint, Waypoint } from "../domain/types.ts";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const tripToGpx = (
  tripName: string,
  points: ReadonlyArray<TrackPoint>,
  waypoints: ReadonlyArray<Waypoint>,
): string => {
  if (points.length === 0 && waypoints.length === 0) {
    throw new ExportError("Cannot export empty trip");
  }

  const wptXml = waypoints
    .map(
      (waypoint) => `  <wpt lat="${waypoint.latitude}" lon="${waypoint.longitude}">
    <time>${escapeXml(waypoint.recordedAt)}</time>
    <name>${escapeXml(waypoint.category)}</name>
    <desc>${escapeXml(waypoint.note)}</desc>
    <type>${escapeXml(waypoint.category)}</type>
  </wpt>`,
    )
    .join("\n");

  const trkptXml = points
    .filter((point) => point.quality !== "rejected")
    .map((point) => {
      const elev =
        point.altitudeM === null
          ? ""
          : `\n      <ele>${point.altitudeM}</ele>`;
      return `      <trkpt lat="${point.latitude}" lon="${point.longitude}">${elev}
        <time>${escapeXml(point.recordedAt)}</time>
      </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="nunat-marine-poc" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(tripName)}</name>
    <desc>Private trip export — companion data, not a nautical chart</desc>
  </metadata>
${wptXml}
  <trk>
    <name>${escapeXml(tripName)}</name>
    <trkseg>
${trkptXml}
    </trkseg>
  </trk>
</gpx>
`;
};
