/**
 * OpenCode Go provider registration.
 *
 * OpenCode Go is a $10/month subscription (opencode.ai/docs/go) served at
 * https://opencode.ai/zen/go/v1 — an OpenAI-compatible endpoint. Auth is a
 * Bearer API key from an OpenCode Zen account with a Go subscription
 * (env OPENCODE_API_KEY, or /login).
 *
 * The static catalog below mirrors the documented Go model list; when a
 * credential is configured, `refreshModels` fetches the live /v1/models
 * catalog (pi persists the snapshot, like other dynamic providers) so the
 * list stays current without manual edits.
 *
 * Costs are $0 here: Go is flat-rate subscription billing, so per-token
 * session cost legitimately reads $0; dollar-based quota windows are
 * shown by the usage adapter instead.
 */
import type { ProviderConfig } from "@earendil-works/pi-coding-agent";

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const REFRESH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_TOKENS = 32768;
const CONTEXT_WINDOW = 262144;

/** Minimal structural view of pi's RefreshModelsContext (not re-exported). */
interface RefreshModelsContext {
  stored?: { models?: readonly { id: string; name?: string }[]; checkedAt?: number };
  allowNetwork: boolean;
  force?: boolean;
  signal: AbortSignal;
}

interface CatalogModel {
  id: string;
  name?: string;
}

/** Documented Go model list (opencode.ai/docs/go, 2026-08). */
export const OPENCODE_GO_MODELS: CatalogModel[] = [
  { id: "grok-4.6" },
  { id: "glm-5.3-flash" },
  { id: "glm-5.3" },
  { id: "glm-5.2" },
  { id: "glm-5.1" },
  { id: "gpt-5.6-luna" },
  { id: "kimi-k3" },
  { id: "kimi-k2.7-code" },
  { id: "kimi-k2.6" },
  { id: "longcat-2.0" },
  { id: "mimo-v2.5" },
  { id: "mimo-v2.5-pro" },
  { id: "minimax-m3" },
  { id: "minimax-m2.7" },
  { id: "muse-spark-1.2" },
  { id: "qwen3.8-max" },
  { id: "qwen3.8-flash" },
  { id: "qwen3.7-max" },
  { id: "qwen3.7-plus" },
  { id: "qwen3.6-plus" },
  { id: "deepseek-v4-pro" },
  { id: "deepseek-v4-flash" },
  { id: "hy4" },
  { id: "hy3" },
];

function toProviderModel(m: CatalogModel) {
  return {
    id: m.id,
    name: m.name ?? m.id,
    reasoning: false,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: CONTEXT_WINDOW,
    maxTokens: MAX_TOKENS,
  };
}

async function refreshGoCatalog(context: RefreshModelsContext) {
  const fallback = context.stored?.models?.length
    ? context.stored.models.map((m) => ({ id: m.id, name: m.name }))
    : OPENCODE_GO_MODELS;
  if (!context.allowNetwork || context.signal.aborted) return fallback.map(toProviderModel);
  if (
    !context.force &&
    context.stored?.checkedAt !== undefined &&
    Date.now() - context.stored.checkedAt < REFRESH_COOLDOWN_MS
  ) {
    return fallback.map(toProviderModel);
  }
  try {
    const response = await fetch(`${OPENCODE_GO_BASE_URL}/models`, {
      signal: context.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return fallback.map(toProviderModel);
    const payload = (await response.json()) as { data?: CatalogModel[] } | CatalogModel[];
    const list = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(list) || list.length === 0) return fallback.map(toProviderModel);
    return list.map((m) => toProviderModel({ id: m.id, name: m.name }));
  } catch {
    return fallback.map(toProviderModel);
  }
}

export const opencodeGoProviderConfig: ProviderConfig = {
  name: "OpenCode Go",
  baseUrl: OPENCODE_GO_BASE_URL,
  apiKey: "$OPENCODE_API_KEY",
  api: "openai-completions",
  models: OPENCODE_GO_MODELS.map(toProviderModel),
  refreshModels: refreshGoCatalog,
};
