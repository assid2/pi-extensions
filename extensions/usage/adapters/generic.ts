/**
 * Generic usage adapter: attaches a usage endpoint to ANY provider (or runs a
 * shell command) and heuristically parses whatever it returns. Configured per
 * provider in usage.json under "adapters". Best-effort by design — unknown
 * shapes degrade to an "unrecognized response shape" error, never a crash.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { ProviderUsage, UsageLane } from "../types.ts";

const execAsync = promisify(exec);
const EXEC_TIMEOUT_MS = 10_000;

export interface GenericSpec {
  usageEndpoint: string;
}

type EndpointTarget = { url: string } | { command: string };

export function resolveEndpoint(spec: string, baseUrl?: string): EndpointTarget {
  if (spec.startsWith("!")) return { command: spec.slice(1).trim() };
  if (/^https?:\/\//.test(spec) || !baseUrl) return { url: spec };
  try {
    // Join a relative path onto the provider's base URL (root-relative
    // leading slashes are treated as path segments, not origins).
    return { url: new URL(spec.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString() };
  } catch {
    return { url: spec };
  }
}

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

/** Port of the reference's percent candidate logic: 0-1 fractions become percents. */
export function readPercentCandidate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return Number.isInteger(value) ? value * 100 : value * 100;
  if (value >= 0 && value <= 100) return value;
  return null;
}

const WINDOW_NAMES: Array<[string, string]> = [
  ["5h", "5h"], ["five_hour", "5h"], ["fiveHour", "5h"], ["session", "Session"],
  ["weekly", "Weekly"], ["week", "Weekly"], ["seven_day", "Weekly"], ["sevenDay", "Weekly"],
  ["monthly", "Month"], ["month", "Month"], ["daily", "Daily"], ["day", "Daily"],
];

function percentFromWindow(w: Record<string, unknown>): number | null {
  for (const key of ["percent", "percentage", "used_percent", "usedPercent", "utilization", "usage_percent", "usagePercent"]) {
    const v = readPercentCandidate(w[key]);
    if (v !== null) return v;
  }
  const limit = readNumber(w.limit) ?? readNumber(w.max) ?? readNumber(w.cap);
  if (limit === null || limit <= 0) return null;
  const used = readNumber(w.used) ?? readNumber(w.spent) ?? readNumber(w.amount);
  if (used !== null) return Math.max(0, Math.min(100, (used / limit) * 100));
  const remaining = readNumber(w.remaining);
  if (remaining !== null) return Math.max(0, Math.min(100, ((limit - remaining) / limit) * 100));
  return null;
}

/**
 * Heuristic payload parser. Tries, in order: a windows/limits array, flat
 * window keys (session/weekly/monthly...), then balance/spend fields. Returns
 * null when nothing recognizable is found.
 */
export function parseGenericPayload(payload: unknown): ProviderUsage | null {
  const root = asObject(payload);
  if (!root) return null;
  const data = asObject(root.data) ?? root;

  const lanes: UsageLane[] = [];

  // 1. Explicit window arrays.
  for (const source of [root.windows, data.windows, root.limits, data.limits, root.usage && Array.isArray(root.usage) ? root.usage : undefined]) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      const w = asObject(entry);
      if (!w) continue;
      const name = String(w.name ?? w.label ?? w.type ?? w.window ?? "");
      const label = WINDOW_NAMES.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? (name || "Window");
      const percent = percentFromWindow(w);
      if (percent !== null) {
        lanes.push({ label, percent, resetsAt: typeof w.resetsAt === "string" ? w.resetsAt : undefined });
      }
    }
    if (lanes.length > 0) break;
  }

  // 2. Flat window keys, one or two levels deep.
  if (lanes.length === 0) {
    const containers = [root, data, asObject(root.usage), asObject(data.usage)].filter((c): c is Record<string, unknown> => c !== null);
    for (const [key, label] of WINDOW_NAMES) {
      if (lanes.some((l) => l.label === label)) continue;
      for (const c of containers) {
        const v = c[key];
        if (v === undefined || v === null) continue;
        const percent = typeof v === "number" ? readPercentCandidate(v) : percentFromWindow(asObject(v) ?? {});
        if (percent !== null) {
          lanes.push({ label, percent });
          break;
        }
      }
    }
  }

  // 3. Balance.
  let balance: ProviderUsage["balance"];
  const balanceValue = readNumber(
    root.balance ?? data.balance ?? root.available_balance ?? data.available_balance ??
    root.credits ?? data.credits ?? root.available ?? data.available,
  );
  if (balanceValue !== null) {
    const unit = typeof root.currency === "string" ? root.currency.toUpperCase() : "USD";
    balance = [{ amount: balanceValue, unit, label: "Balance" }];
  }

  // 4. Spend.
  let spend: ProviderUsage["spend"];
  const spendObj = asObject(root.spent) ?? asObject(data.spent) ?? asObject(root.spend) ?? asObject(root.usage_cost) ?? asObject(data.cost);
  if (spendObj) {
    const unit = typeof spendObj.unit === "string" ? String(spendObj.unit).toUpperCase() : "USD";
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = readNumber(spendObj[k]);
        if (v !== null) return v;
      }
      return undefined;
    };
    spend = {
      unit,
      daily: pick("daily", "day"),
      weekly: pick("weekly", "week"),
      monthly: pick("monthly", "month", "total", "lifetime"),
      lifetime: pick("lifetime"),
    };
    if (spend.daily === undefined && spend.weekly === undefined && spend.monthly === undefined && spend.lifetime === undefined) spend = undefined;
  } else {
    const total = readNumber(root.cost ?? data.cost ?? root.total_cost ?? data.total_cost);
    if (total !== null) spend = { unit: "USD", monthly: total };
  }

  if (lanes.length === 0 && !balance && !spend) return null;
  return {
    lanes: lanes.length > 0 ? lanes : undefined,
    balance,
    spend,
    fetchedAt: undefined,
  };
}

/** Create an adapter bound to one configured endpoint spec. */
export function createGenericAdapter(id: string, spec: GenericSpec): UsageAdapter {
  return {
    id,
    async fetch(token, ctx: AdapterContext): Promise<AdapterAttempt> {
      const target = resolveEndpoint(spec.usageEndpoint, ctx.baseUrl);

      let payload: unknown;
      let status: number | undefined;

      if ("command" in target) {
        try {
          const { stdout } = await execAsync(target.command, { timeout: EXEC_TIMEOUT_MS });
          payload = JSON.parse(stdout);
        } catch (error) {
          return { usage: { error: `usage command failed: ${error instanceof Error ? error.message : String(error)}` } };
        }
      } else {
        const result = await requestJson(target.url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }, { fetchFn: ctx.fetchFn, signal: ctx.signal });
        if (!result.ok) {
          return { usage: { error: result.error }, status: result.status ?? undefined };
        }
        payload = result.data;
        status = result.status ?? undefined;
      }

      const usage = parseGenericPayload(payload);
      return { usage: usage ?? { error: "unrecognized response shape" }, status };
    },
  };
}
