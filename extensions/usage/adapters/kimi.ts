/** Ported from @hk_net/pi-usage-bars (MIT, hk_net). Kimi (Moonshot) coding
 * usage adapter (`kimi-coding`). The endpoint reports the weekly window as a
 * `usage` object (or a `detail` object, or an "all" data row) and the
 * five-hour window inside `limits[]` entries keyed by a 300-minute window;
 * each window carries a remaining_percent or used/limit counts plus a
 * reset time. The request sends a `KimiCLI/1.5` User-Agent. */
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { ProviderUsage, UsageLane } from "../types.ts";

const DEFAULT_KIMI_USAGE_ENDPOINT = "https://api.kimi.com/coding/v1/usages";

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

function cleanPercent(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function lane(label: string, percent: number, resetsAt?: string): UsageLane {
  return resetsAt === undefined ? { label, percent } : { label, percent, resetsAt };
}

/**
 * Parse a Kimi usages payload. Returns the five-hour and weekly windows as
 * lanes ("5-hour"/"Weekly") or null for unrecognized shapes. Pure: no I/O,
 * no clock.
 */
export function extractKimiUsageFromPayload(payload: unknown): ProviderUsage | null {
  const root = asObject(payload);
  if (!root) return null;
  const usages = Array.isArray(root.usages) ? (root.usages as unknown[]) : undefined;
  const codingUsage = usages?.map(asObject).find((entry) =>
    String(entry?.scope ?? "").toUpperCase() === "FEATURE_CODING") ?? root;
  const dataRows: Record<string, unknown>[] = Array.isArray(codingUsage.data)
    ? (codingUsage.data as unknown[]).map(asObject).filter((value): value is Record<string, unknown> => value !== null)
    : [];
  const usage = asObject(codingUsage.usage) ?? asObject(codingUsage.detail) ??
    dataRows.find((entry) => String(entry?.model_name ?? entry?.modelName ?? "").toLowerCase() === "all");
  const limits: Array<Record<string, unknown> | null> = Array.isArray(codingUsage.limits)
    ? (codingUsage.limits as unknown[]).map(asObject)
    : dataRows.filter((entry) => entry !== usage);
  const sessionLimit =
    limits.find((entry) => {
      if (!entry) return false;
      const window = asObject(entry.window);
      const duration = readNumber(window?.duration);
      const unit = String(window?.timeUnit ?? window?.time_unit ?? "").toUpperCase();
      return duration === 300 && unit.includes("MINUTE");
    }) ?? limits.find((entry) => entry !== null);
  const sessionDetail = asObject(sessionLimit?.detail) ?? sessionLimit ?? null;

  const session = usedPercentFromCounts(sessionDetail);
  const weekly = usedPercentFromCounts(usage ?? null);
  if (session === null || weekly === null) return null;

  return {
    lanes: [
      lane(
        "5-hour",
        cleanPercent(session),
        normalizeIsoDate(sessionDetail?.resetTime ?? sessionDetail?.reset_at ?? sessionDetail?.reset_time),
      ),
      lane(
        "Weekly",
        cleanPercent(weekly),
        normalizeIsoDate(usage?.resetTime ?? usage?.reset_at ?? usage?.reset_time),
      ),
    ],
  };
}

/** Fetch Kimi coding usage. Never throws: failures are an error usage. */
export async function fetchKimiUsage(token: string, ctx: AdapterContext): Promise<AdapterAttempt> {
  const override = (ctx.env.PI_KIMI_USAGE_ENDPOINT ?? "").trim();
  const endpoint = override || DEFAULT_KIMI_USAGE_ENDPOINT;
  const result = await requestJson(
    endpoint,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "KimiCLI/1.5",
      },
    },
    { fetchFn: ctx.fetchFn, signal: ctx.signal },
  );
  if (!result.ok) return { usage: { error: result.error }, status: result.status ?? undefined };
  const usage = extractKimiUsageFromPayload(result.data);
  return { usage: usage ?? { error: "unrecognized response shape" }, status: result.status ?? undefined };
}

export const kimiAdapter: UsageAdapter = {
  id: "kimi-coding",
  fetch: (token, ctx) => fetchKimiUsage(token, ctx),
};
