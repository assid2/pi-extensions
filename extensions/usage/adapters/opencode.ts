/**
 * OpenCode (Zen + Go) usage adapters.
 *
 * OpenCode Go is a $10/month subscription with documented dollar limits
 * (opencode.ai/docs/go): 5-hour $12, weekly $30, monthly $60. The usage
 * endpoint is `GET {base}/usage` with a Bearer key; the authenticated
 * response shape is not publicly documented, so the parser below is tolerant:
 * it accepts window arrays ({name, limit, used/spent/amount} or percent),
 * object windows keyed five_hour/weekly/monthly, and flat dollar keys.
 * Where a percent is absent but a dollar amount and a limit are present, the
 * percent is computed against the documented limits.
 *
 * OpenCode Zen is credit-billed with no fixed windows: spend rows only.
 */
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { ProviderUsage, UsageLane } from "../types.ts";

/** Documented Go limits in USD (opencode.ai/docs/go). */
export const GO_LIMITS = {
  "5h": 12,
  Weekly: 30,
  Month: 60,
} as const;

export type OpencodeLimits = Partial<Record<string, number>>;

const ZEN_BASE = "https://opencode.ai/zen/v1";
const GO_BASE = "https://opencode.ai/zen/go/v1";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const KEY_TO_LABEL: Array<[string, string]> = [
  ["5h", "5h"], ["five_hour", "5h"], ["fiveHour", "5h"],
  ["weekly", "Weekly"], ["week", "Weekly"], ["seven_day", "Weekly"], ["sevenDay", "Weekly"],
  ["monthly", "Month"], ["month", "Month"],
];

interface WindowInfo {
  label: string;
  limit?: number;
  spent?: number;
  percent?: number;
}

function windowFromValue(value: unknown, label: string): WindowInfo | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") {
    const spent = readNumber(value);
    return spent === null ? null : { label, spent };
  }
  const w = asObject(value);
  if (!w) return null;
  const info: WindowInfo = { label };
  info.limit = readNumber(w.limit ?? w.max ?? w.cap ?? w.limit_usd) ?? undefined;
  info.spent = readNumber(w.spent ?? w.used ?? w.amount ?? w.cost ?? w.usage ?? w.total) ?? undefined;
  const pct = readNumber(w.percent ?? w.percentage ?? w.used_percent ?? w.utilization);
  info.percent = pct === null ? undefined : (pct <= 1 && pct > 0 ? pct * 100 : pct);
  return info.spent === undefined && info.percent === undefined && info.limit === undefined ? null : info;
}

export function parseOpencodeUsage(payload: unknown, limits: OpencodeLimits = GO_LIMITS): ProviderUsage | null {
  const root = asObject(payload);
  if (!root) return null;
  const data = asObject(root.data) ?? root;

  const windows = new Map<string, WindowInfo>();

  // 1. Window arrays.
  for (const source of [root.windows, data.windows, root.limits, data.limits, root.usage]) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      const name = String(asObject(entry)?.name ?? asObject(entry)?.label ?? asObject(entry)?.type ?? "");
      const label = KEY_TO_LABEL.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
      if (!label) continue;
      const w = windowFromValue(entry, label);
      if (w) windows.set(label, w);
    }
    if (windows.size > 0) break;
  }

  // 2. Object/flat keys.
  for (const [key, label] of KEY_TO_LABEL) {
    if (windows.has(label)) continue;
    for (const c of [root, data, asObject(root.usage), asObject(data.usage)].filter((c): c is Record<string, unknown> => c !== null)) {
      if (c[key] === undefined) continue;
      const w = windowFromValue(c[key], label);
      if (w) {
        windows.set(label, w);
        break;
      }
    }
  }

  if (windows.size === 0) {
    // Last resort: a single total spend.
    const total = readNumber(root.total ?? data.total ?? root.total_cost ?? data.total_cost ?? root.cost);
    if (total === null) return null;
    return { spend: { unit: "USD", monthly: total } };
  }

  const lanes: UsageLane[] = [];
  const spend: ProviderUsage["spend"] = { unit: "USD" };
  let found = false;
  for (const [label, w] of windows) {
    const limit = w.limit ?? limits[label];
    const spent = w.spent;
    let percent = w.percent;
    if (percent === undefined && spent !== undefined && limit !== undefined && limit > 0) {
      percent = Math.max(0, Math.min(100, (spent / limit) * 100));
    }
    if (percent === undefined && spent !== undefined) {
      // No limit known (zen): report the raw spend, no lane.
      if (label === "Month") spend.monthly = spent;
      else if (label === "Weekly") spend.weekly = spent;
      found = true;
      continue;
    }
    if (percent === undefined) continue;
    found = true;
    lanes.push({ label, percent: Number(percent.toFixed(2)) });
    if (spent !== undefined && label === "Month") spend.monthly = spent;
  }
  if (!found) return null;

  if (spend.monthly === undefined && spend.weekly === undefined) {
    // Synthesize monthly spend from the 5h+weekly view when present, else omit.
  }
  return {
    lanes: lanes.length > 0 ? lanes : undefined,
    spend: spend.monthly !== undefined || spend.weekly !== undefined ? spend : undefined,
    warning: spend.monthly !== undefined && limits.Month !== undefined && spend.monthly > limits.Month
      ? "over monthly limit"
      : undefined,
    notice: lanes.length === 0 ? undefined : "dollar-based limits",
  };
}

async function fetchOpencodeUsage(
  token: string,
  ctx: AdapterContext,
  base: string,
  limits: OpencodeLimits,
): Promise<AdapterAttempt> {
  const env = base === GO_BASE ? ctx.env?.["PI_OPENCODE_GO_USAGE_ENDPOINT"] : ctx.env?.["PI_OPENCODE_USAGE_ENDPOINT"];
  const url = (env ?? "").trim() || `${base.replace(/\/+$/, "")}/usage`;
  const result = await requestJson(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }, { fetchFn: ctx.fetchFn, signal: ctx.signal });
  if (!result.ok) {
    return { usage: { error: result.error }, status: result.status ?? undefined };
  }
  const usage = parseOpencodeUsage(result.data, limits);
  return { usage: usage ?? { error: "unrecognized response shape" }, status: result.status ?? undefined };
}

export const opencodeGoAdapter: UsageAdapter = {
  id: "opencode-go",
  fetch: (token, ctx) => fetchOpencodeUsage(token, ctx, ctx.baseUrl ?? GO_BASE, GO_LIMITS),
};

export const opencodeAdapter: UsageAdapter = {
  id: "opencode",
  fetch: (token, ctx) => fetchOpencodeUsage(token, ctx, ctx.baseUrl ?? ZEN_BASE, {}),
};
