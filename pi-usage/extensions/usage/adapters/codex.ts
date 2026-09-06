/**
 * Ported from @hk_net/pi-usage-bars (MIT, hk_net): `parseCodexRateLimit` +
 * `fetchCodexUsage` (https://chatgpt.com/backend-api/wham/usage, Bearer token).
 *
 * Porting notes: the source rendered `reset_after_seconds` as a human
 * duration string (`sessionResetsIn`); the target `UsageLane` type only
 * carries ISO timestamps, so this port converts it to `resetsAt` against
 * `nowMs`. Caching/backoff was not ported: http.ts's `fetchWithBackoff`
 * owns that here; the adapter only reports the HTTP status in the attempt.
 */
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { UsageLane } from "../types.ts";

const CODEX_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const WEEK_WINDOW_SECONDS = 2 * 24 * 60 * 60;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Accepts 0-1 fractions (scaled to percent) and 0-100 percents, as in the source. */
function readPercentCandidate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return Number.isInteger(value) ? value : value * 100;
  return value >= 0 && value <= 100 ? value : null;
}

function normalizePercent(percent: number): number {
  return Number(percent.toFixed(2));
}

function laneFromWindow(
  window: Record<string, unknown> | null,
  label: string,
  nowMs: number,
): UsageLane | undefined {
  if (!window) return undefined;
  const lane: UsageLane = {
    label,
    percent: normalizePercent(readPercentCandidate(window.used_percent) ?? 0),
  };
  const seconds = readFiniteNumber(window.reset_after_seconds);
  if (seconds !== null && seconds > 0) {
    lane.resetsAt = new Date(nowMs + seconds * 1000).toISOString();
  }
  return lane;
}

/**
 * Pure parser for the wham/usage payload: classifies the primary/secondary
 * windows into the 5-hour and weekly lanes. A window whose
 * `limit_window_seconds` is >= 2 days counts as the weekly window
 * regardless of position: some Codex accounts return their seven-day quota
 * as `primary_window` and omit `secondary_window`, so position alone does
 * not identify it. Returns the lanes that are present; a missing window
 * yields no lane.
 */
export function parseCodexRateLimit(data: unknown, nowMs: number = Date.now()): UsageLane[] {
  const root = asRecord(data);
  const rateLimit = root ? asRecord(root.rate_limit) ?? asRecord(root.rate_limits) : null;
  const primary = rateLimit
    ? asRecord(rateLimit.primary_window) ?? asRecord(rateLimit.primary) ?? asRecord(rateLimit.five_hour)
    : null;
  const secondary = rateLimit
    ? asRecord(rateLimit.secondary_window) ?? asRecord(rateLimit.secondary) ?? asRecord(rateLimit.weekly)
    : null;

  let sessionWindow: Record<string, unknown> | null = null;
  let weeklyWindow: Record<string, unknown> | null = null;
  for (const [position, window] of [["primary", primary], ["secondary", secondary]] as const) {
    if (!window) continue;
    const duration = readFiniteNumber(window.limit_window_seconds);
    if (duration !== null) {
      if (duration >= WEEK_WINDOW_SECONDS) weeklyWindow ??= window;
      else sessionWindow ??= window;
    } else if (position === "primary") {
      sessionWindow ??= window;
    } else {
      weeklyWindow ??= window;
    }
  }

  const lanes: UsageLane[] = [];
  const session = laneFromWindow(sessionWindow, "5h", nowMs);
  if (session) lanes.push(session);
  const weekly = laneFromWindow(weeklyWindow, "Weekly", nowMs);
  if (weekly) lanes.push(weekly);
  return lanes;
}

/** Codex (ChatGPT subscription) usage adapter; never throws. */
export const codexAdapter: UsageAdapter = {
  id: "openai-codex",
  fetch: async (token: string, ctx: AdapterContext): Promise<AdapterAttempt> => {
    const nowMs = ctx.nowMs ?? Date.now();
    const result = await requestJson(
      CODEX_USAGE_ENDPOINT,
      { headers: { Authorization: `Bearer ${token}` } },
      { fetchFn: ctx.fetchFn, signal: ctx.signal },
    );
    if (!result.ok) {
      return { usage: { error: result.error }, status: result.status ?? undefined };
    }
    return {
      usage: { lanes: parseCodexRateLimit(result.data, nowMs), fetchedAt: nowMs },
      status: result.status ?? undefined,
    };
  },
};
