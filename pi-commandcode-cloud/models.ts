/**
 * Command Code model catalog: live fetch, static metadata merge, and the pi
 * `refreshModels` callback.
 *
 * The catalog endpoint (`GET /provider/v1/models`) is public - it needs only
 * `accept: application/json`, no credential - so a refresh never depends on
 * `/login`. It returns only identity/context/endpoint fields; pricing,
 * capabilities, max-output and reasoning efforts come from the checked-in
 * `catalog.metadata.ts` snapshot and are merged in below.
 *
 * Routing: a model is Anthropic-wire iff its `supported_endpoints` is exactly
 * `["/messages"]`, otherwise OpenAI-wire (`/chat/completions`). When the field
 * is absent (e.g. a hand-written entry) the `claude-` id prefix is the
 * fallback. The Anthropic base URL intentionally omits the trailing `/v1` so
 * pi's Anthropic SDK appends `/v1/messages`.
 */

import type { RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { type CatalogModelMetadata, metadataForModel } from "./catalog.metadata.ts";
import {
  ANTHROPIC_BASE,
  DEFAULT_MAX_OUTPUT_TOKENS,
  ENV_MODELS_TIMEOUT_MS,
  ENV_MODELS_URL,
  MODELS_TIMEOUT_MS,
  PROVIDER_API_BASE,
  PROVIDER_ID,
  REFRESH_COOLDOWN_MS,
} from "./constants.ts";
import { GENERATED_MODELS } from "./models.generated.ts";
import { buildThinkingLevelMap, type CommandCodeApi } from "./thinking-levels.ts";
import { envInt, fetchJsonWithTimeout, httpError, redactCommandCodeErrorText } from "./utils.ts";

// --- Raw catalog types ---

/** One entry of the public `/provider/v1/models` response, trimmed to the fields we consume. */
export interface RawCommandCodeModel {
  id: string;
  name?: string;
  context_length?: number;
  supported_endpoints?: string[];
}

/** A model plus the requested api/baseUrl, ready for registration or persistence. */
export type RehydratedModel = ProviderModelConfig & {
  provider: string;
  api: CommandCodeApi;
  baseUrl: string;
};

// --- Catalog parsing ---

/**
 * Validate a catalog payload and normalize it to {@link RawCommandCodeModel}s,
 * also reporting how many entries were unusable (a non-object entry or one
 * with no id). Throws when the envelope is not `{ object: "list", data: [...] }`
 * or contains no entry with a valid id. The skipped count feeds
 * `refreshCommandCodeCatalog`'s partial-failure policy.
 */
export function parseCommandCodeCatalogDetailed(payload: unknown): {
  models: RawCommandCodeModel[];
  skipped: number;
} {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Command Code model catalog: malformed response (expected a JSON object)");
  }
  const envelope = payload as Record<string, unknown>;
  if (envelope.object !== "list") {
    throw new Error(
      `Command Code model catalog: unexpected object ${JSON.stringify(envelope.object)} (expected "list")`,
    );
  }
  if (!Array.isArray(envelope.data) || envelope.data.length === 0) {
    throw new Error("Command Code model catalog: empty data list");
  }

  const models: RawCommandCodeModel[] = [];
  let skipped = 0;
  for (const entry of envelope.data) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      skipped++;
      continue;
    }
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || raw.id.trim() === "") {
      skipped++;
      continue;
    }
    models.push({
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : undefined,
      context_length:
        typeof raw.context_length === "number" && Number.isFinite(raw.context_length) ? raw.context_length : undefined,
      supported_endpoints: Array.isArray(raw.supported_endpoints)
        ? raw.supported_endpoints.filter((endpoint): endpoint is string => typeof endpoint === "string")
        : undefined,
    });
  }
  if (models.length === 0) {
    throw new Error("Command Code model catalog: no entries with a valid id");
  }
  return { models, skipped };
}

/**
 * Validate a catalog payload and normalize it to {@link RawCommandCodeModel}s.
 * Throws when the envelope is not `{ object: "list", data: [...] }` with at
 * least one valid entry.
 */
export function parseCommandCodeCatalog(payload: unknown): RawCommandCodeModel[] {
  return parseCommandCodeCatalogDetailed(payload).models;
}

/** Catalog URL, honoring `COMMANDCODE_MODELS_URL` (default `PROVIDER_API_BASE/models`). */
export function commandCodeModelsUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[ENV_MODELS_URL]?.trim();
  return override ? override : `${PROVIDER_API_BASE}/models`;
}

/**
 * Fetch the public model catalog. No credential is sent: the endpoint only
 * needs `accept: application/json`. Throws on a transport error, a non-ok
 * status (mapped via {@link httpError}) or an invalid envelope.
 */
export async function fetchCommandCodeCatalog(
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<{ models: RawCommandCodeModel[]; skipped: number }> {
  const url = commandCodeModelsUrl();
  const timeout = timeoutMs ?? envInt(ENV_MODELS_TIMEOUT_MS, MODELS_TIMEOUT_MS);
  const response = await fetchJsonWithTimeout<unknown>(
    url,
    { headers: { accept: "application/json" } },
    timeout,
    signal,
  );
  if (!response.ok || response.data === null) {
    httpError("model catalog fetch", response.status, response.error);
  }
  try {
    return parseCommandCodeCatalogDetailed(response.data);
  } catch (error) {
    throw new Error(redactCommandCodeErrorText(error instanceof Error ? error.message : String(error)));
  }
}

/** Fetch the public model catalog (validated entries only). */
export async function fetchCommandCodeModels(signal?: AbortSignal, timeoutMs?: number): Promise<RawCommandCodeModel[]> {
  return (await fetchCommandCodeCatalog(signal, timeoutMs)).models;
}

// --- Routing ---

/** True when `supported_endpoints` is exactly `["/messages"]` (the Anthropic wire). */
export function isAnthropicEndpoints(endpoints?: readonly string[]): boolean {
  return Array.isArray(endpoints) && endpoints.length === 1 && endpoints[0] === "/messages";
}

/**
 * Provider API for a model: `anthropic-messages` iff it lists exactly
 * `["/messages"]`; when `supported_endpoints` is absent, fall back to the
 * `claude-` id prefix; otherwise `openai-completions`.
 */
export function apiForModel(id: string, endpoints?: readonly string[]): CommandCodeApi {
  if (endpoints && endpoints.length > 0) {
    return isAnthropicEndpoints(endpoints) ? "anthropic-messages" : "openai-completions";
  }
  return id.startsWith("claude-") ? "anthropic-messages" : "openai-completions";
}

/**
 * Base URL for a model. Anthropic models use `.../provider` (pi appends
 * `/v1/messages`); everything else uses `.../provider/v1` (pi appends
 * `/chat/completions`).
 */
export function baseUrlForModel(id: string, endpoints?: readonly string[]): string {
  return apiForModel(id, endpoints) === "anthropic-messages" ? ANTHROPIC_BASE : PROVIDER_API_BASE;
}

// --- Assembly ---

/**
 * Build the explicit `compat` block for a model. Every flag that matters is set
 * explicitly so a provider default can never flip behavior:
 * - OpenAI-wire: `supportsReasoningEffort` follows the presence of a
 *   per-model effort list; `openRouterRouting`/`vercelGatewayRouting` stay
 *   `undefined` (never `{}`), because pi truthiness-checks them.
 * - Anthropic-wire: adaptive thinking is forced when the model reasons.
 */
export function buildCompat(
  meta: CatalogModelMetadata,
  api: CommandCodeApi = "openai-completions",
): ProviderModelConfig["compat"] {
  if (api === "anthropic-messages") {
    return { forceAdaptiveThinking: meta.reasoning === true };
  }
  return {
    supportsStore: false,
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
    supportsReasoningEffort: meta.efforts !== undefined,
    thinkingFormat: "openai",
    requiresThinkingAsText: false,
    supportsStrictMode: false,
    supportsUsageInStreaming: true,
    openRouterRouting: undefined,
    vercelGatewayRouting: undefined,
  };
}

function contextWindowFor(contextLength: number | undefined): number {
  return typeof contextLength === "number" && Number.isFinite(contextLength) && contextLength > 0
    ? contextLength
    : DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Merge a raw catalog with the static metadata snapshot into pi model configs.
 * Unknown ids degrade to text-only, non-reasoning, zero-cost models. `maxTokens`
 * is clamped to `min(context_length, metadata.maxOutputTokens)`.
 */
export function assembleModels(raw: readonly RawCommandCodeModel[]): ProviderModelConfig[] {
  return assembleModelDetails(raw).models;
}

/** `assembleModels`, plus the count of entries skipped for a missing id. */
export function assembleModelDetails(raw: readonly RawCommandCodeModel[]): {
  models: ProviderModelConfig[];
  failed: number;
} {
  const models: ProviderModelConfig[] = [];
  let failed = 0;
  for (const entry of raw) {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) {
      failed++;
      continue;
    }
    const meta = metadataForModel(id);
    const api = apiForModel(id, entry.supported_endpoints);
    const contextWindow = contextWindowFor(entry.context_length);
    const maxTokens = Math.min(contextWindow, meta.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS);
    const thinkingLevelMap = buildThinkingLevelMap(meta.reasoning, meta.efforts, api);

    const model: ProviderModelConfig = {
      id,
      name: entry.name?.trim() || id,
      api,
      baseUrl: baseUrlForModel(id, entry.supported_endpoints),
      reasoning: meta.reasoning,
      input: meta.input,
      cost: meta.cost,
      contextWindow,
      maxTokens,
      compat: buildCompat(meta, api),
    };
    if (thinkingLevelMap) model.thinkingLevelMap = thinkingLevelMap;
    models.push(model);
  }
  return { models, failed };
}

/**
 * Add the provider identity and re-derive `api`/`baseUrl` for persistence.
 * The stored snapshot keeps its own `api`/`baseUrl`, so a reload preserves the
 * OpenAI/Anthropic split without a network round-trip.
 */
export function rehydrate(model: ProviderModelConfig): RehydratedModel {
  const rawApi = model.api;
  const api: CommandCodeApi =
    rawApi === "anthropic-messages" || rawApi === "openai-completions"
      ? (rawApi as CommandCodeApi)
      : apiForModel(model.id);
  return {
    ...model,
    provider: PROVIDER_ID,
    api,
    baseUrl: model.baseUrl ?? baseUrlForModel(model.id),
  };
}

// --- refreshModels callback ---

/**
 * `refreshModels` for the `commandcode-cloud` provider.
 *
 * Pi calls this twice per refresh: a restore phase (`allowNetwork: false`) and
 * a network phase (`allowNetwork: true`). The composer swaps the return value
 * in on every call, so this must never return `[]`.
 *
 * Policy:
 * - `allowNetwork: false` is a pure read (stored snapshot, else
 *   `GENERATED_MODELS`).
 * - A catalog checked within the cooldown is reused unless `force` is set.
 * - The fresh list is persisted only on full success; a partial refresh keeps
 *   the last-good stored list but advances `checkedAt` to apply the cooldown.
 * - A rejected/failed `publish()` is logged, and the in-memory list is still
 *   returned.
 */
export async function refreshCommandCodeCatalog(context: RefreshModelsContext): Promise<ProviderModelConfig[]> {
  // Mutable copy of the readonly stored snapshot; the baked list is already
  // mutable and may be returned by reference.
  const fallback: ProviderModelConfig[] = context.stored?.models.length
    ? context.stored.models.map(rehydrate)
    : GENERATED_MODELS;

  if (!context.allowNetwork || context.signal.aborted) {
    return fallback;
  }

  const checkedAt = context.stored?.checkedAt;
  if (!context.force && typeof checkedAt === "number" && Date.now() - checkedAt < REFRESH_COOLDOWN_MS) {
    return fallback;
  }

  let raw: RawCommandCodeModel[];
  let skipped: number;
  try {
    const fetched = await fetchCommandCodeCatalog(context.signal);
    raw = fetched.models;
    skipped = fetched.skipped;
  } catch (error) {
    // An abort mid-flight returns the baseline; any other error propagates and
    // pi keeps the last good catalog.
    if (context.signal.aborted) return fallback;
    throw error;
  }
  if (context.signal.aborted) return fallback;

  const { models, failed: assembleFailed } = assembleModelDetails(raw);
  const failed = skipped + assembleFailed;
  if (models.length === 0) return fallback;

  const persisted = models.map(rehydrate);

  if (failed === 0) {
    try {
      const published = await context.publish({ persist: { models: persisted, checkedAt: Date.now() } });
      if (!published) {
        console.warn("[pi-commandcode-cloud] Model catalog persist rejected; keeping the in-memory list.");
      }
    } catch (error) {
      console.warn(
        `[pi-commandcode-cloud] Model catalog persist failed: ${redactCommandCodeErrorText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
    }
  } else {
    if (context.stored?.models.length) {
      try {
        const published = await context.publish({ persist: { ...context.stored, checkedAt: Date.now() } });
        if (!published) {
          console.warn("[pi-commandcode-cloud] Partial-refresh persist rejected; checkedAt not advanced on disk.");
        }
      } catch (error) {
        console.warn(
          `[pi-commandcode-cloud] Partial-refresh persist failed: ${redactCommandCodeErrorText(
            error instanceof Error ? error.message : String(error),
          )}`,
        );
      }
    }
    console.warn(`[pi-commandcode-cloud] Model catalog refresh incomplete: ${failed} entries skipped.`);
  }

  return persisted;
}
