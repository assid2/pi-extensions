/**
 * Ollama Cloud usage adapter.
 *
 * Endpoint (undocumented, per pi-ollama-cloud source): GET https://ollama.com/api/usage
 * with `Authorization: Bearer <OLLAMA key>`. Response:
 *   {
 *     "limits": {
 *       "session": { "usage": 0.42, "models": [{ "name": "...", "request_count": 3 }] },
 *       "weekly":  { "usage": 0.61, "models": [...] }
 *     },
 *     "activity": { "cost": "$12.34" }   // 4-week spend string, optional
 *   }
 * Note: the fractions are REQUEST-count fractions of plan caps (Ollama Cloud
 * is subscription-billed), not token fractions.
 */
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { ProviderUsage, UsageLane } from "../types.ts";

const DEFAULT_ENDPOINT = "https://ollama.com/api/usage";
const ENV_ENDPOINT = "PI_OLLAMA_USAGE_ENDPOINT";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readFraction(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value * 100;
  if (value >= 0 && value <= 100) return value;
  return null;
}

function parseDollar(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const m = value.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseOllamaCloudUsage(payload: unknown): ProviderUsage | null {
  const root = asObject(payload);
  const limits = asObject(root?.limits) ?? root; // tolerate a bare limits object
  if (!limits) return null;

  const lanes: UsageLane[] = [];
  for (const [key, label] of [["session", "5h"], ["weekly", "Weekly"]] as const) {
    const window = asObject(limits[key]);
    if (!window) continue;
    const percent = readFraction(window.usage);
    if (percent === null) continue;
    lanes.push({ label, percent, resetsAt: typeof window.resetsAt === "string" ? window.resetsAt : undefined });
  }

  let notice: string | undefined;
  const activity = asObject(root?.activity) ?? root ?? {};
  const cost = parseDollar(activity.cost ?? activity.spend ?? activity.total_cost);
  if (cost !== null) notice = `4-week spend $${cost.toFixed(2)}`;

  if (lanes.length === 0 && notice === undefined) return null;
  return { lanes: lanes.length > 0 ? lanes : undefined, notice };
}

export const ollamaCloudAdapter: UsageAdapter = {
  id: "ollama-cloud",
  async fetch(token, ctx: AdapterContext): Promise<AdapterAttempt> {
    const url = (ctx.env?.[ENV_ENDPOINT] ?? "").trim() || DEFAULT_ENDPOINT;
    const result = await requestJson(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }, { fetchFn: ctx.fetchFn, signal: ctx.signal });
    if (!result.ok) {
      return { usage: { error: result.error }, status: result.status ?? undefined };
    }
    const usage = parseOllamaCloudUsage(result.data);
    return { usage: usage ?? { error: "unrecognized response shape" }, status: result.status ?? undefined };
  },
};
