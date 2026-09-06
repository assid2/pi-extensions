/** Ported from @hk_net/pi-usage-bars (MIT, hk_net). MiniMax usage adapters
 * for the international region (`minimax`) and the Chinese region
 * (`minimax-cn`). Each region tries the current token-plan endpoint first,
 * then the legacy coding-plan endpoint. Windows come from `services[]`
 * (window_type/percent/resets_at) or `model_remains[]` (current_/weekly_
 * remaining-percent and count fields); the credit balance and `base_resp`
 * errors are read from the same payload, and a 2062 status means no active
 * token plan. */
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { MoneyAmount, ProviderUsage, UsageLane } from "../types.ts";

const DEFAULT_MINIMAX_USAGE_ENDPOINT = "https://api.minimax.io/v1/token_plan/remains";
const DEFAULT_MINIMAX_LEGACY_USAGE_ENDPOINT = "https://api.minimax.io/v1/api/openplatform/coding_plan/remains";
const DEFAULT_MINIMAX_CN_USAGE_ENDPOINT = "https://api.minimaxi.com/v1/token_plan/remains";
const DEFAULT_MINIMAX_CN_LEGACY_USAGE_ENDPOINT = "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readPercentCandidate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return Number.isInteger(value) ? value : value * 100;
  return value >= 0 && value <= 100 ? value : null;
}

/** Used percent from remaining_percent, else from used/limit, else (total-remaining)/total. */
function usedPercentFromCounts(
  value: Record<string, unknown> | null,
  options: { remainingPercent?: string; used?: string; total?: string; remaining?: string } = {},
): number | null {
  if (!value) return null;
  const remainingPercent = readNumber(value[options.remainingPercent ?? "remaining_percent"]);
  if (remainingPercent !== null) return Math.max(0, Math.min(100, 100 - remainingPercent));

  const total = readNumber(value[options.total ?? "limit"]);
  const used = readNumber(value[options.used ?? "used"]);
  const remaining = readNumber(value[options.remaining ?? "remaining"]);
  if (total === null || total <= 0) return null;
  if (used !== null) return Math.max(0, Math.min(100, (used / total) * 100));
  if (remaining !== null) return Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
  return null;
}

/** Accept ISO-ish date strings; normalizes a >3-digit fractional part. */
function normalizeIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().replace(/(\.\d{3})\d+(?=Z|[+-]\d\d:\d\d$)/, "$1");
  return Number.isFinite(new Date(normalized).getTime()) ? normalized : undefined;
}

/** Epoch seconds or ms to an ISO timestamp, or undefined. */
function isoFromEpoch(value: unknown): string | undefined {
  const raw = readNumber(value);
  if (raw === null || raw <= 0) return undefined;
  const milliseconds = raw > 1_000_000_000_000 ? raw : raw * 1000;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/** A "time remaining until reset" (s or ms) to an ISO timestamp relative to now. */
function resetFromRemains(value: unknown, nowMs: number): string | undefined {
  const raw = readNumber(value);
  if (raw === null || raw <= 0) return undefined;
  const milliseconds = raw > 1_000_000 ? raw : raw * 1000;
  return new Date(nowMs + milliseconds).toISOString();
}

function cleanPercent(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function lane(label: string, percent: number, resetsAt?: string): UsageLane {
  return resetsAt === undefined ? { label, percent } : { label, percent, resetsAt };
}

interface MiniMaxWindow {
  percent: number;
  resetsAt?: string;
}

function pickHighestWindow(windows: MiniMaxWindow[]): MiniMaxWindow | undefined {
  return windows.reduce<MiniMaxWindow | undefined>(
    (highest, window) => (!highest || window.percent > highest.percent ? window : highest),
    undefined,
  );
}

function miniMaxResetAt(value: Record<string, unknown>, prefix: "current" | "weekly", nowMs: number): string | undefined {
  const end = prefix === "current"
    ? value.end_time ?? value.endTime
    : value.weekly_end_time ?? value.weeklyEndTime;
  const remains = prefix === "current"
    ? value.remains_time ?? value.remainsTime
    : value.weekly_remains_time ?? value.weeklyRemainsTime;
  const resetsAt = prefix === "current"
    ? value.current_resets_at ?? value.currentResetsAt
    : value.weekly_resets_at ?? value.weeklyResetsAt;
  return normalizeIsoDate(resetsAt) ?? isoFromEpoch(end) ?? resetFromRemains(remains, nowMs);
}

function extractMiniMaxCreditBalance(payload: unknown): MoneyAmount | undefined {
  const root = asObject(payload);
  const data = asObject(root?.data) ?? root;
  if (!data) return undefined;
  const amount = readNumber(
    data.points_balance ?? data.pointsBalance ??
    data.point_balance ?? data.pointBalance ??
    data.credits_balance ?? data.creditsBalance ??
    data.credit_balance ?? data.creditBalance,
  );
  return amount === null ? undefined : { amount, unit: "credits", label: "Credit balance" };
}

/**
 * Parse a MiniMax remains payload. Returns the interval and weekly windows
 * as lanes ("Interval"/"Weekly") plus the credit balance when present; a
 * payload with no usable interval window yields a balance-only usage (or
 * null when there is no balance either). Pure apart from the nowMs clock
 * used to turn "time remaining" fields into reset timestamps.
 */
export function extractMiniMaxUsageFromPayload(payload: unknown, nowMs = Date.now()): ProviderUsage | null {
  const root = asObject(payload);
  if (!root) return null;
  const data = asObject(root.data) ?? root;
  if (!data) return null;
  const accountBalance = extractMiniMaxCreditBalance(payload);

  const intervalWindows: MiniMaxWindow[] = [];
  const weeklyWindows: MiniMaxWindow[] = [];
  if (Array.isArray(data.services)) {
    for (const rawService of data.services as unknown[]) {
      const service = asObject(rawService);
      if (!service) continue;
      const directPercent = readPercentCandidate(readNumber(service.percent));
      const percent = directPercent ?? usedPercentFromCounts(service, { total: "limit", used: "usage" });
      if (percent === null) continue;
      const windowType = String(service.window_type ?? service.windowType ?? "").toLowerCase();
      const resetsAt = normalizeIsoDate(service.resets_at ?? service.reset_time ?? service.end_time);
      (windowType.includes("week") ? weeklyWindows : intervalWindows).push({ percent, resetsAt });
    }
  }

  if (Array.isArray(data.model_remains ?? data.modelRemains)) {
    for (const rawModel of (data.model_remains ?? data.modelRemains) as unknown[]) {
      const raw = asObject(rawModel);
      if (!raw) continue;
      const model: Record<string, unknown> = {
        ...raw,
        current_interval_remaining_percent:
          raw.current_interval_remaining_percent ?? raw.currentIntervalRemainingPercent,
        current_interval_total_count: raw.current_interval_total_count ?? raw.currentIntervalTotalCount,
        current_interval_usage_count: raw.current_interval_usage_count ?? raw.currentIntervalUsageCount,
        current_interval_status: raw.current_interval_status ?? raw.currentIntervalStatus,
        current_weekly_remaining_percent:
          raw.current_weekly_remaining_percent ?? raw.currentWeeklyRemainingPercent,
        current_weekly_total_count: raw.current_weekly_total_count ?? raw.currentWeeklyTotalCount,
        current_weekly_usage_count: raw.current_weekly_usage_count ?? raw.currentWeeklyUsageCount,
        current_weekly_status: raw.current_weekly_status ?? raw.currentWeeklyStatus,
      };
      // Status 3 with 100% remaining and zero counts means the window is not
      // available for this plan; skip it rather than reporting a full bar.
      const unavailable = (prefix: "interval" | "weekly"): boolean =>
        readNumber(model[`current_${prefix}_status`]) === 3 &&
        (readNumber(model[`current_${prefix}_remaining_percent`]) ?? 0) >= 100 &&
        (readNumber(model[`current_${prefix}_total_count`]) ?? 0) === 0 &&
        (readNumber(model[`current_${prefix}_usage_count`]) ?? 0) === 0;
      const interval = unavailable("interval")
        ? null
        : usedPercentFromCounts(model, {
            remainingPercent: "current_interval_remaining_percent",
            total: "current_interval_total_count",
            remaining: "current_interval_usage_count",
          });
      if (interval !== null) {
        intervalWindows.push({ percent: interval, resetsAt: miniMaxResetAt(model, "current", nowMs) });
      }
      const weekly = unavailable("weekly")
        ? null
        : usedPercentFromCounts(model, {
            remainingPercent: "current_weekly_remaining_percent",
            total: "current_weekly_total_count",
            remaining: "current_weekly_usage_count",
          });
      if (weekly !== null) {
        weeklyWindows.push({ percent: weekly, resetsAt: miniMaxResetAt(model, "weekly", nowMs) });
      }
    }
  }

  const session = pickHighestWindow(intervalWindows);
  const weekly = pickHighestWindow(weeklyWindows);
  if (!session) {
    return accountBalance ? { balance: [accountBalance] } : null;
  }
  const lanes: UsageLane[] = [lane("Interval", cleanPercent(session.percent), session.resetsAt)];
  if (weekly) lanes.push(lane("Weekly", cleanPercent(weekly.percent), weekly.resetsAt));
  return accountBalance ? { lanes, balance: [accountBalance] } : { lanes };
}

function miniMaxPayloadStatus(payload: unknown): number | null {
  const root = asObject(payload);
  const data = asObject(root?.data);
  const baseResponse = asObject(data?.base_resp ?? data?.baseResp ?? root?.base_resp ?? root?.baseResp);
  return readNumber(baseResponse?.status_code ?? baseResponse?.statusCode);
}

function miniMaxPayloadError(payload: unknown): string | null {
  const root = asObject(payload);
  const data = asObject(root?.data);
  const baseResponse = asObject(data?.base_resp ?? data?.baseResp ?? root?.base_resp ?? root?.baseResp);
  const status = miniMaxPayloadStatus(payload);
  if (status === null || status === 0) return null;
  const message = baseResponse?.status_msg ?? baseResponse?.statusMessage;
  return typeof message === "string" && message.trim()
    ? `API ${status}: ${message.trim()}`
    : `API ${status}`;
}

interface MiniMaxEndpoints {
  minimax: string;
  minimaxLegacy: string;
  minimaxCn: string;
  minimaxCnLegacy: string;
}

function resolveMiniMaxEndpoints(env: NodeJS.ProcessEnv): MiniMaxEndpoints {
  const configured = (value: string | undefined, fallback: string): string => {
    const trimmed = value?.trim();
    return trimmed || fallback;
  };
  return {
    minimax: configured(env.PI_MINIMAX_USAGE_ENDPOINT, DEFAULT_MINIMAX_USAGE_ENDPOINT),
    minimaxLegacy: configured(env.PI_MINIMAX_LEGACY_USAGE_ENDPOINT, DEFAULT_MINIMAX_LEGACY_USAGE_ENDPOINT),
    minimaxCn: configured(env.PI_MINIMAX_CN_USAGE_ENDPOINT, DEFAULT_MINIMAX_CN_USAGE_ENDPOINT),
    minimaxCnLegacy: configured(env.PI_MINIMAX_CN_LEGACY_USAGE_ENDPOINT, DEFAULT_MINIMAX_CN_LEGACY_USAGE_ENDPOINT),
  };
}

/**
 * Fetch MiniMax usage for one region, trying each endpoint candidate in
 * order. Never throws: failures are an error usage; a 2062 (no active token
 * plan) payload yields a notice instead.
 */
export async function fetchMiniMaxUsage(
  token: string,
  region: "minimax" | "minimax-cn",
  ctx: AdapterContext,
): Promise<AdapterAttempt> {
  const nowMs = ctx.nowMs ?? Date.now();
  const endpoints = resolveMiniMaxEndpoints(ctx.env);
  const candidates = region === "minimax-cn"
    ? [endpoints.minimaxCn, endpoints.minimaxCnLegacy]
    : [endpoints.minimax, endpoints.minimaxLegacy];

  let lastError = "usage request failed";
  let lastStatus: number | null = null;
  let credentialError: string | undefined;
  let noActiveTokenPlan = false;

  for (const endpoint of [...new Set(candidates)]) {
    const result = await requestJson(
      endpoint,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
      { fetchFn: ctx.fetchFn, signal: ctx.signal },
    );
    if (!result.ok) {
      lastError = result.error;
      lastStatus = result.status;
      if (result.status === 401 || result.status === 403) credentialError ??= result.error;
      if (ctx.signal?.aborted) break;
      continue;
    }
    lastStatus = result.status;
    const payloadStatus = miniMaxPayloadStatus(result.data);
    const payloadError = miniMaxPayloadError(result.data);
    const usage = extractMiniMaxUsageFromPayload(result.data, nowMs);
    if (usage && (!payloadError || usage.lanes === undefined)) {
      return { usage, status: lastStatus ?? undefined };
    }
    if (payloadStatus === 2062) {
      noActiveTokenPlan = true;
      continue;
    }
    if (payloadError) {
      lastError = payloadError;
      continue;
    }
    lastError = "unrecognized response shape";
  }

  if (noActiveTokenPlan) {
    return {
      usage: { notice: "No active Token Plan · check Credit balance in the MiniMax console" },
      status: lastStatus ?? undefined,
    };
  }
  return { usage: { error: credentialError ?? lastError }, status: lastStatus ?? undefined };
}

export const minimaxAdapter: UsageAdapter = {
  id: "minimax",
  fetch: (token, ctx) => fetchMiniMaxUsage(token, "minimax", ctx),
};

export const minimaxCnAdapter: UsageAdapter = {
  id: "minimax-cn",
  fetch: (token, ctx) => fetchMiniMaxUsage(token, "minimax-cn", ctx),
};
