/** Ported from @hk_net/pi-usage-bars (MIT, hk_net).
 *
 * OpenRouter adapter: account balance from /api/v1/credits
 * (total_credits - total_usage) plus per-key spend from /api/v1/key
 * (usage_daily/usage_weekly/usage_monthly/usage), with a "Key limit" lane
 * when the key exposes limit/limit_remaining.
 *
 * Source: extensions/usage-bars/core.ts — extractOpenRouterUsageFromPayloads,
 * fetchOpenRouterUsage. Endpoints overridable via PI_OPENROUTER_CREDITS_ENDPOINT
 * and PI_OPENROUTER_KEY_ENDPOINT.
 */
import { requestJson } from "./http.ts";
import type { AdapterContext, UsageAdapter } from "./types.ts";
import type { MoneyAmount, ProviderUsage, Spend, UsageLane } from "../types.ts";

const CREDITS_ENDPOINT_ENV = "PI_OPENROUTER_CREDITS_ENDPOINT";
const KEY_ENDPOINT_ENV = "PI_OPENROUTER_KEY_ENDPOINT";
const DEFAULT_CREDITS_ENDPOINT = "https://openrouter.ai/api/v1/credits";
const DEFAULT_KEY_ENDPOINT = "https://openrouter.ai/api/v1/key";

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
 * Parse the /credits and /key payloads (each optionally wrapped in `data`).
 * Pure and defensive: returns null when neither balance, spend, nor limit
 * data is present.
 */
export function extractOpenRouterUsage(credits: unknown, key: unknown): ProviderUsage | null {
  const creditsObj = asObject(asObject(credits)?.data) ?? asObject(credits);
  const keyObj = asObject(asObject(key)?.data) ?? asObject(key);

  const totalCredits = readNumber(creditsObj?.total_credits ?? creditsObj?.totalCredits);
  const totalUsage = readNumber(creditsObj?.total_usage ?? creditsObj?.totalUsage);
  let balance: MoneyAmount[] | undefined;
  if (totalCredits !== null && totalUsage !== null) {
    balance = [{ amount: Number((totalCredits - totalUsage).toFixed(6)), unit: "USD", label: "Balance" }];
  }

  const daily = readNumber(keyObj?.usage_daily ?? keyObj?.usageDaily);
  const weekly = readNumber(keyObj?.usage_weekly ?? keyObj?.usageWeekly);
  const monthly = readNumber(keyObj?.usage_monthly ?? keyObj?.usageMonthly);
  const lifetime = readNumber(keyObj?.usage);
  let spend: Spend | undefined;
  if (daily !== null || weekly !== null || monthly !== null || lifetime !== null) {
    spend = { unit: "USD" };
    if (daily !== null) spend.daily = daily;
    if (weekly !== null) spend.weekly = weekly;
    if (monthly !== null) spend.monthly = monthly;
    if (lifetime !== null) spend.lifetime = lifetime;
  }

  const limit = readNumber(keyObj?.limit);
  const remaining = readNumber(keyObj?.limit_remaining ?? keyObj?.limitRemaining);
  let lane: UsageLane | undefined;
  if (limit !== null && limit > 0 && remaining !== null) {
    const used = Math.max(0, Math.min(limit, limit - remaining));
    lane = { label: "Key limit", percent: Number(((used / limit) * 100).toFixed(2)) };
  }

  if (!balance && !spend && !lane) return null;

  const usage: ProviderUsage = {};
  if (balance) usage.balance = balance;
  if (spend) usage.spend = spend;
  if (lane) usage.lanes = [lane];
  return usage;
}

export const openrouterAdapter: UsageAdapter = {
  id: "openrouter",
  async fetch(token, ctx) {
    const headers = {
      ...ctx.headers,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    const config = { fetchFn: ctx.fetchFn, signal: ctx.signal };
    const [creditsResult, keyResult] = await Promise.all([
      requestJson(resolveEndpoint(ctx.env, CREDITS_ENDPOINT_ENV, DEFAULT_CREDITS_ENDPOINT), { headers }, config),
      requestJson(resolveEndpoint(ctx.env, KEY_ENDPOINT_ENV, DEFAULT_KEY_ENDPOINT), { headers }, config),
    ]);
    const usage = extractOpenRouterUsage(
      creditsResult.ok ? creditsResult.data : undefined,
      keyResult.ok ? keyResult.data : undefined,
    );
    if (usage) {
      const status = [creditsResult, keyResult]
        .map((r) => (r.ok ? r.status : null))
        .find((s): s is number => s !== null);
      return status === undefined ? { usage } : { usage, status };
    }
    const failures = [
      creditsResult.ok ? undefined : `credits: ${creditsResult.error}`,
      keyResult.ok ? undefined : `key: ${keyResult.error}`,
    ].filter((value): value is string => value !== undefined);
    const status = [creditsResult, keyResult]
      .map((r) => (r.ok ? null : r.status))
      .find((s): s is number => s !== null);
    const error = failures.length > 0 ? failures.join("; ") : "unrecognized response shape";
    return status === undefined ? { usage: { error } } : { usage: { error }, status };
  },
};
