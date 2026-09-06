/**
 * Ported from @hk_net/pi-usage-bars (MIT, hk_net): `fetchClaudeUsageAttempt` /
 * `fetchClaudeUsage` (https://api.anthropic.com/api/oauth/usage, Bearer token
 * plus the header "anthropic-beta": "oauth-2025-04-20").
 *
 * Porting notes: caching/backoff was not ported — http.ts's
 * `fetchWithBackoff` owns that here; the adapter reports the HTTP status and
 * the parsed Retry-After in the attempt so the caller drives 429 backoff.
 * The source's `extra_usage` fields (`extraSpend` / `extraLimit`) are
 * surfaced as a single `notice` string on the target type.
 */
import { parseRetryAfterMs, requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, HeadersLike, UsageAdapter } from "./types.ts";
import type { ProviderUsage, UsageLane } from "../types.ts";

const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const ANTHROPIC_BETA_HEADER = "oauth-2025-04-20";

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

function getHeader(headers: HeadersLike | undefined, name: string): string | null {
  if (!headers) return null;
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}

function laneFromWindow(
  window: Record<string, unknown> | null,
  label: string,
): UsageLane | undefined {
  if (!window) return undefined;
  const lane: UsageLane = {
    label,
    percent: normalizePercent(readPercentCandidate(window.utilization) ?? 0),
  };
  if (typeof window.resets_at === "string" && window.resets_at.trim() !== "") {
    lane.resetsAt = window.resets_at;
  }
  return lane;
}

/**
 * Pure parser for the Anthropic OAuth usage payload: `five_hour` /
 * `seven_day` utilization windows become the 5h/Weekly lanes (the source's
 * "5-hour" / "Weekly" labels), and an enabled `extra_usage` becomes a
 * notice string. Returns the lanes that are present.
 */
export function parseClaudeUsage(data: unknown): { lanes: UsageLane[]; notice?: string } {
  const root = asRecord(data);
  const fiveHour = asRecord(root?.five_hour);
  const sevenDay = asRecord(root?.seven_day);

  const lanes: UsageLane[] = [];
  const five = laneFromWindow(fiveHour, "5h");
  if (five) lanes.push(five);
  const week = laneFromWindow(sevenDay, "Weekly");
  if (week) lanes.push(week);

  let notice: string | undefined;
  const extra = asRecord(root?.extra_usage);
  if (extra && extra.is_enabled) {
    const used = readFiniteNumber(extra.used_credits) ?? 0;
    const limit = readFiniteNumber(extra.monthly_limit) ?? 0;
    notice = `Extra $${used} / $${limit}`;
  }

  return notice === undefined ? { lanes } : { lanes, notice };
}

/** Anthropic (Claude, OAuth token) usage adapter; never throws. */
export const claudeAdapter: UsageAdapter = {
  id: "anthropic",
  fetch: async (token: string, ctx: AdapterContext): Promise<AdapterAttempt> => {
    const nowMs = ctx.nowMs ?? Date.now();
    const result = await requestJson(
      CLAUDE_USAGE_ENDPOINT,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": ANTHROPIC_BETA_HEADER,
        },
      },
      { fetchFn: ctx.fetchFn, signal: ctx.signal },
    );
    const retryAfterMs = parseRetryAfterMs(getHeader(result.headers, "retry-after"), nowMs) ?? undefined;
    if (!result.ok) {
      return {
        usage: { error: result.error },
        status: result.status ?? undefined,
        retryAfterMs,
      };
    }
    const parsed = parseClaudeUsage(result.data);
    const usage: ProviderUsage = { lanes: parsed.lanes, fetchedAt: nowMs };
    if (parsed.notice !== undefined) usage.notice = parsed.notice;
    return {
      usage,
      status: result.status ?? undefined,
      retryAfterMs,
    };
  },
};
