import createClient, { type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/schema.js";

export type { paths } from "./generated/schema.js";
export type DecisionGeographyClient = ReturnType<
  typeof createClient<paths>
>;

/** Default local server from `make api-dev`. */
export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

/**
 * Typed OpenAPI client for the Decision Geography read API.
 *
 * Regenerate types after editing `openapi/openapi.yaml`:
 * `pnpm --dir api generate:client`
 */
export const createDecisionGeographyClient = (
  options: ClientOptions = {},
): DecisionGeographyClient =>
  createClient<paths>({
    baseUrl: DEFAULT_API_BASE_URL,
    ...options,
  });
