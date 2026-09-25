/**
 * Adapter registry: provider id -> UsageAdapter.
 *
 * Resolution order for an account (keyed by its BASE provider id):
 *   1. explicit usage.json adapter attachment  -> generic adapter
 *   2. any `ollama-*` id                       -> ollama-cloud adapter
 *   3. known provider                          -> specialized adapter
 *   4. anything else (local/custom)            -> fallback (session usage only)
 */
import type { UsageAdapter } from "./types.ts";
import type { GenericAdapterSpec } from "../config.ts";
import type { UsageConfig } from "../config.ts";
import { createGenericAdapter } from "./generic.ts";
import { fallbackAdapter } from "./fallback.ts";
import { ollamaCloudAdapter } from "./ollama-cloud.ts";
import { isOllamaProviderId } from "../accounts/registry.ts";
import { commandCodeCloudAdapter } from "./commandcode-cloud.ts";
import { opencodeAdapter, opencodeGoAdapter } from "./opencode.ts";
import { claudeAdapter } from "./claude.ts";
import { codexAdapter } from "./codex.ts";
import { zaiAdapter, zaiCnAdapter } from "./zai.ts";
import { kimiAdapter } from "./kimi.ts";
import { minimaxAdapter, minimaxCnAdapter } from "./minimax.ts";
import { openrouterAdapter } from "./openrouter.ts";
import { deepseekAdapter } from "./deepseek.ts";
import { moonshotAdapter, moonshotCnAdapter } from "./moonshot.ts";
import { basetenAdapter } from "./baseten.ts";

const KNOWN: Record<string, UsageAdapter> = {
  anthropic: claudeAdapter,
  "openai-codex": codexAdapter,
  zai: zaiAdapter,
  "zai-coding-cn": zaiCnAdapter,
  "kimi-coding": kimiAdapter,
  minimax: minimaxAdapter,
  "minimax-cn": minimaxCnAdapter,
  openrouter: openrouterAdapter,
  deepseek: deepseekAdapter,
  moonshotai: moonshotAdapter,
  "moonshotai-cn": moonshotCnAdapter,
  baseten: basetenAdapter,
  "commandcode-cloud": commandCodeCloudAdapter,
  "opencode-go": opencodeGoAdapter,
  opencode: opencodeAdapter,
};

export function resolveAdapter(baseProviderId: string, config: UsageConfig): UsageAdapter {
  const attached = config.adapters[baseProviderId] as GenericAdapterSpec | undefined;
  if (attached) return createGenericAdapter(baseProviderId, attached);
  // Ollama Cloud is a namespace: every `ollama-*` id draws on the same quota
  // adapter. `ollama-cloud` is covered by this rule (it is not in KNOWN).
  if (isOllamaProviderId(baseProviderId)) return ollamaCloudAdapter;
  return KNOWN[baseProviderId] ?? fallbackAdapter;
}
