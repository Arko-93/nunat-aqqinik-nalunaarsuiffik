import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Schema } from "effect";
import {
  PlacenameScope,
  placenamesToFeatureCollection,
  type PlacenameScope as Scope,
} from "../src/domain/placename.ts";
import { FileWriteError } from "../src/services/errors.ts";
import { NunagisPlacenames } from "../src/services/nunagis-placenames.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");

const scopeArg = process.argv[2] ?? "all";
const scope = Schema.decodeUnknownSync(PlacenameScope)(scopeArg) as Scope;
const outputName =
  scope === "localities" ? "localities.geojson" : "placenames.geojson";
const outputPath = join(dataDir, outputName);

const program = Effect.gen(function* () {
  const nunagis = yield* NunagisPlacenames.Service;
  const places = yield* nunagis.fetchPlacenames(scope);
  const collection = placenamesToFeatureCollection(places);
  // Compact JSON keeps the full register downloadable.
  const json = JSON.stringify(collection) + "\n";

  yield* Effect.tryPromise({
    try: async () => {
      await mkdir(dataDir, { recursive: true });
      await writeFile(outputPath, json, "utf8");
    },
    catch: (cause) =>
      new FileWriteError({
        path: outputPath,
        message: `Failed to write ${outputName}`,
        cause,
      }),
  });

  yield* Effect.logInfo(`Wrote ${places.length} placenames to ${outputPath}`);
  return places.length;
});

const exitCode = await program.pipe(
  Effect.provide(NunagisPlacenames.layerLive),
  Effect.matchCauseEffect({
    onFailure: (cause) =>
      Effect.sync(() => {
        console.error(String(cause));
        return 1 as const;
      }),
    onSuccess: (count) =>
      Effect.sync(() => {
        console.log(`OK — ${count} placenames (${scope})`);
        return 0 as const;
      }),
  }),
  Effect.runPromise,
);

process.exit(exitCode);
