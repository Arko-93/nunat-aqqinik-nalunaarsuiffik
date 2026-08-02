export type ReleasePointer = {
  release_id: string;
};

export type ReleaseManifest = {
  release_id: string;
  created_at: string;
  data_as_of: string;
  publication_blockers?: ReadonlyArray<{
    code: string;
    message: string;
    severity?: string;
  }>;
};

export type LoadedRelease = {
  releaseId: string;
  dataAsOf: string;
  createdAt: string;
  blockerCount: number;
  publishReady: boolean;
  basePath: string;
};

export const releaseBasePath = (releaseId: string): string =>
  `/releases/${releaseId}`;

export const loadSelectedRelease = async (): Promise<LoadedRelease> => {
  const pointerResponse = await fetch("/releases/CURRENT");
  if (!pointerResponse.ok) {
    throw new Error(
      `Failed to load release pointer (${pointerResponse.status})`,
    );
  }
  const pointer = (await pointerResponse.json()) as ReleasePointer;
  const releaseId = pointer.release_id;
  if (!releaseId) {
    throw new Error("Release pointer missing release_id");
  }

  const basePath = releaseBasePath(releaseId);
  const manifestResponse = await fetch(`${basePath}/manifest.json`);
  if (!manifestResponse.ok) {
    throw new Error(
      `Failed to load release manifest (${manifestResponse.status})`,
    );
  }
  const manifest = (await manifestResponse.json()) as ReleaseManifest;
  const blockers = manifest.publication_blockers ?? [];
  return {
    releaseId,
    dataAsOf: manifest.data_as_of,
    createdAt: manifest.created_at,
    blockerCount: blockers.length,
    publishReady: blockers.length === 0,
    basePath,
  };
};
