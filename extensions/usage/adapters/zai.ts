/** Ported from @hk_net/pi-usage-bars (MIT, hk_net). ZAI (Zhipu/GLM) usage
 * adapters for the international region (`zai`) and the Chinese region
 * (`zai-coding-cn`). The provider reports quota windows as an array of
 * limits in which unit 3 is the five-hour window and unit 6 the weekly
 * window; both `TOKENS_LIMIT` and `CREDIT_LIMIT` entries carry the same
 * unit/percentage/nextResetTime shape (nextResetTime is epoch ms). */
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { ProviderUsage, UsageLane } from "../types.ts";

const DEFAULT_ZAI_USAGE_ENDPOINT = "https://api.z.ai/api/monitor/usage/quota/limit";
const DEFAULT_ZAI_CODING_CN_USAGE_ENDPOINT = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readPercentCandidate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return Number.isInteger(value) ? value : value * 100;
  return value >= 0 && value <= 100 ? value : null;
}

function cleanPercent(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function lane(label: string, percent: number, resetsAt?: string): UsageLane {
  return resetsAt === undefined ? { label, percent } : { label, percent, resetsAt };
}

/** Epoch ms (as reported in nextResetTime) to an ISO timestamp, or undefined. */
function epochMsToIso(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/**
 * Parse a ZAI quota payload. Returns the two quota windows as lanes
 * (unit 3 -> "5h", unit 6 -> "Weekly") or null for unrecognized shapes.
 * Pure: no I/O, no clock.
 */
export function extractZaiUsageFromPayload(payload: unknown): ProviderUsage | null {
  const data = asObject(payload);
  if (!data) return null;
  const candidates = [
    asObject(data.data)?.limits,
    data.limits,
    asObject(data.quota)?.limits,
    asObject(asObject(data.data)?.quota)?.limits,
  ];
  const limits = candidates.find((value): value is unknown[] => Array.isArray(value));
  if (!limits || limits.length === 0) return null;

  // CREDIT_LIMIT (credit-based tiers) reports the same unit/percentage/
  // nextResetTime shape as TOKENS_LIMIT, so treat both as quota windows.
  const tokenLimits = limits.filter((entry) => {
    const type = String(asObject(entry)?.type ?? "").toUpperCase();
    return type === "TOKENS_LIMIT" || type === "CREDIT_LIMIT";
  });
  const sessionEntry = asObject(tokenLimits.find((entry) => asObject(entry)?.unit === 3));
  const weeklyEntry = asObject(tokenLimits.find((entry) => asObject(entry)?.unit === 6));
  if (!sessionEntry || !weeklyEntry) return null;

  const session = readPercentCandidate(sessionEntry.percentage);
  const weekly = readPercentCandidate(weeklyEntry.percentage);
  if (session === null || weekly === null) return null;

  return {
    lanes: [
      lane("5h", cleanPercent(session), epochMsToIso(sessionEntry.nextResetTime)),
      lane("Weekly", cleanPercent(weekly), epochMsToIso(weeklyEntry.nextResetTime)),
    ],
  };
}

function resolveZaiEndpoints(env: NodeJS.ProcessEnv): Record<string, string> {
  const configured = (value: string | undefined, fallback: string): string => {
    const trimmed = value?.trim();
    return trimmed || fallback;
  };
  return {
    zai: configured(env.PI_ZAI_USAGE_ENDPOINT, DEFAULT_ZAI_USAGE_ENDPOINT),
    "zai-coding-cn": configured(env.PI_ZAI_CODING_CN_USAGE_ENDPOINT, DEFAULT_ZAI_CODING_CN_USAGE_ENDPOINT),
  };
}

/** Fetch ZAI usage for one region. Never throws: failures are an error usage. */
export async function fetchZaiUsage(
  token: string,
  region: "zai" | "zai-coding-cn",
  ctx: AdapterContext,
): Promise<AdapterAttempt> {
  const endpoint = resolveZaiEndpoints(ctx.env)[region];
  const result = await requestJson(
    endpoint,
    { headers: { Authorization: `Bearer ${token}` } },
    { fetchFn: ctx.fetchFn, signal: ctx.signal },
  );
  if (!result.ok) return { usage: { error: result.error }, status: result.status ?? undefined };
  const usage = extractZaiUsageFromPayload(result.data);
  return { usage: usage ?? { error: "unrecognized response shape" }, status: result.status ?? undefined };
}

export const zaiAdapter: UsageAdapter = {
  id: "zai",
  fetch: (token, ctx) => fetchZaiUsage(token, "zai", ctx),
};

export const zaiCnAdapter: UsageAdapter = {
  id: "zai-coding-cn",
  fetch: (token, ctx) => fetchZaiUsage(token, "zai-coding-cn", ctx),
};
