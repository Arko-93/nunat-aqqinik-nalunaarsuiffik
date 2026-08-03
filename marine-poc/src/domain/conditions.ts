import type { ConditionSnapshot } from "./types.ts";

export const withStaleFlag = (
  snapshot: Omit<ConditionSnapshot, "stale">,
  now: Date = new Date(),
): ConditionSnapshot => {
  const validTo = Date.parse(snapshot.validTo);
  const stale = !Number.isFinite(validTo) || now.getTime() > validTo;
  return { ...snapshot, stale };
};

export const loadConditionFixture = async (
  path: string,
  now?: Date,
): Promise<ConditionSnapshot> => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load condition fixture ${path}`);
  }
  const raw = (await response.json()) as Omit<ConditionSnapshot, "stale">;
  return withStaleFlag(raw, now);
};
