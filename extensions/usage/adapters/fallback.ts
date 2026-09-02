/**
 * Fallback adapter for providers with no usage endpoint: local servers
 * (vLLM, llama.cpp), unknown providers, custom models.json entries.
 * Yields an empty ProviderUsage — the UI then shows session/agent usage only.
 */
import type { AdapterAttempt, UsageAdapter } from "./types.ts";

export const fallbackAdapter: UsageAdapter = {
  id: "fallback",
  async fetch(_token, ctx): Promise<AdapterAttempt> {
    return {
      usage: {
        notice: "no usage endpoint (session usage only)",
        fetchedAt: ctx.nowMs ?? Date.now(),
      },
    };
  },
};
