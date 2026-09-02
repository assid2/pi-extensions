/** Ported from @hk_net/pi-usage-bars (MIT, hk_net).
 *
 * Baseten adapter: credits used in the current calendar month from
 * /v1/billing/usage_summary (start_date = first of month, end_date = now;
 * ctx.nowMs drives the range in tests). Reported as spend with a notice.
 *
 * Source: extensions/usage-bars/core.ts — extractBasetenUsageFromPayload,
 * fetchBasetenUsage. Endpoint overridable via PI_BASETEN_USAGE_ENDPOINT.
 */
import { requestJson } from "./http.ts";
import type { AdapterContext, UsageAdapter } from "./types.ts";
import type { ProviderUsage } from "../types.ts";

const USAGE_ENDPOINT_ENV = "PI_BASETEN_USAGE_ENDPOINT";
const DEFAULT_USAGE_ENDPOINT = "https://api.baseten.co/v1/billing/usage_summary";

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveEndpoint(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const trimmed = env[name]?.trim();
  return trimmed || fallback;
}

/**
 * Parse the /v1/billing/usage_summary payload. Pure and defensive: sums
 * credits_used over the dedicated/training/model-apis usage sections.
 */
export function extractBasetenUsage(payload: unknown): ProviderUsage | null {
  const root = asObject(payload);
  if (!root) return null;
  const sections = [root.dedicated_usage, root.training_usage, root.model_apis_usage].map(asObject);
  const creditsUsed = sections
    .map((section) => readNumber(section?.credits_used))
    .filter((value): value is number => value !== null);
  if (creditsUsed.length === 0) return null;

  return {
    spend: { unit: "credits", monthly: Number(creditsUsed.reduce((sum, value) => sum + value, 0).toFixed(6)) },
    notice: "Credits used this month",
  };
}

function monthRange(nowMs: number): { startDate: string; endDate: string } {
  const now = new Date(nowMs);
  return {
    startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    endDate: now.toISOString(),
  };
}

export const basetenAdapter: UsageAdapter = {
  id: "baseten",
  async fetch(token, ctx) {
    const endpoint = resolveEndpoint(ctx.env, USAGE_ENDPOINT_ENV, DEFAULT_USAGE_ENDPOINT);
    const nowMs = ctx.nowMs ?? Date.now();
    const { startDate, endDate } = monthRange(nowMs);
    let url: string;
    try {
      const parsed = new URL(endpoint);
      parsed.searchParams.set("start_date", startDate);
      parsed.searchParams.set("end_date", endDate);
      url = parsed.toString();
    } catch {
      return { usage: { error: "invalid Baseten usage endpoint" } };
    }
    const result = await requestJson(
      url,
      {
        headers: {
          ...ctx.headers,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      { fetchFn: ctx.fetchFn, signal: ctx.signal },
    );
    const status = result.status === null ? undefined : result.status;
    if (!result.ok) return { usage: { error: result.error }, status };
    const usage = extractBasetenUsage(result.data);
    if (!usage) return { usage: { error: "unrecognized response shape" }, status };
    return { usage, status };
  },
};
