/**
 * Command Code (commandcode.ai) usage adapter.
 *
 * The account/quota API lives at the host root (NOT under `/provider/v1`):
 *   GET /alpha/whoami?limits=1
 *   GET /alpha/billing/credits?orgId=<org>
 *   GET /alpha/billing/subscriptions?orgId=<org>
 *   GET /alpha/usage/summary?orgId=<org>&since=<currentPeriodStart>
 * all authenticated with the same `Authorization: Bearer <key>` used by the
 * Provider API, plus `x-command-code-version` / `x-cli-environment`.
 *
 * Lane mapping (see docs/providers.md):
 *   - `5h`      <- windowLimits.fiveHour  (used/cap credit-value USD; resetAt epoch ms)
 *   - `Weekly`  <- windowLimits.weekly
 *   - `Monthly` <- derived: used = summary.totalCredits ?? summary.totalCost,
 *                  remaining = credits.monthlyCredits, cap = used + remaining
 *                  (fallback: plan-nominal credits when the subscription is active)
 *
 * `pi-usage` resolves per-account credentials itself, so this module must never
 * import from the `pi-commandcode-cloud` package: the CLI version, ZDR flag,
 * org-id and period-start pickers are defined locally.
 */
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { MoneyAmount, ProviderUsage, UsageLane } from "../types.ts";

/** Pinned Command Code CLI version reported via `x-command-code-version`. */
export const COMMAND_CODE_CLI_VERSION = "1.58.0";

const ORIGIN = "https://api.commandcode.ai";
const ENV_ORIGIN = "PI_COMMANDCODE_USAGE_ENDPOINT";

/** Plan -> nominal monthly credits (docs/resources/pricing-limits). */
export const PLAN_NOMINAL_CREDITS: Record<string, number> = {
  "individual-go": 10,
  "individual-goat": 70,
  "individual-pro": 30,
  "individual-pro-v1": 80,
  "individual-provider": 15,
  "individual-max": 150,
  "individual-ultra": 300,
  "teams-pro": 40,
};

/** Literal values that must never be sent as a credential. */
const PLACEHOLDER_KEYS = new Set(["$COMMAND_CODE_API_KEY", "$COMMANDCODE_API_KEY", "$CMD_API_KEY"]);

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

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Strip bracketed-paste markers and control characters from a pasted key, and
 * refuse the literal `$COMMAND_CODE_API_KEY` placeholder (a provider config
 * value, never a real secret).
 */
export function sanitizeApiKey(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\u001b\[200~/g, "")
    .replace(/\u001b\[201~/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!cleaned || PLACEHOLDER_KEYS.has(cleaned)) return null;
  return cleaned;
}

/** Redact Bearer tokens and `user_`/`cc_` keys from any surfaced string. */
export function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:user|cc)_[A-Za-z0-9._-]+/g, (match) => `${match.slice(0, match.indexOf("_") + 1)}[redacted]`);
}

function isTruthyFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "no" && normalized !== "off";
}

/** True when ZDR was requested via `CMD_ZDR`/`COMMANDCODE_ZDR`. */
export function zdr(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyFlag(env["CMD_ZDR"]) || isTruthyFlag(env["COMMANDCODE_ZDR"]);
}

/** Extract `org.id` from a whoami payload (tolerates string org and `orgId`). */
export function pickOrgId(whoami: unknown): string | undefined {
  const root = asObject(whoami);
  if (!root) return undefined;
  const org = root["org"];
  if (typeof org === "string") return readString(org) ?? undefined;
  const orgObject = asObject(org);
  if (orgObject) {
    const id = readString(orgObject["id"]);
    if (id) return id;
  }
  return readString(root["orgId"]) ?? undefined;
}

/** Extract the current billing-period start from a subscriptions payload. */
export function pickCurrentPeriodStart(subscription: unknown): string | undefined {
  const root = asObject(subscription);
  if (!root) return undefined;
  const data = asObject(root["data"]) ?? root;
  return readString(data["currentPeriodStart"]) ?? readString(data["currentPeriodEnd"]) ?? undefined;
}

/** A window is only renderable when both `used` and a positive `cap` exist. */
interface ParsedWindow {
  used: number;
  cap: number;
  resetAt: number | null;
}

function parseWindow(window: unknown): ParsedWindow | null {
  const value = asObject(window);
  if (!value) return null;
  const used = readNumber(value["used"]);
  const cap = readNumber(value["cap"]);
  if (used === null || cap === null) return null;
  // Never show an idle/empty window (`0/0`) and drop non-positive caps.
  if (used === 0 && cap === 0) return null;
  if (cap <= 0) return null;
  const rawReset = value["resetAt"];
  const resetAt = typeof rawReset === "number" && Number.isFinite(rawReset) && rawReset > 0 ? rawReset : null;
  return { used, cap, resetAt };
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function percentFor(used: number, cap: number): number {
  return round2(Math.max(0, Math.min(100, (used / cap) * 100)));
}

/** Sections of the Command Code account API, as returned by the fetch flow. */
export interface CommandCodeUsagePayloads {
  whoami?: unknown;
  credits?: unknown;
  subscription?: unknown;
  summary?: unknown;
}

/**
 * Pure, tolerant parser. Returns `null` only when no meaningful usage can be
 * derived (so the adapter reports an error rather than a fake `0`).
 */
export function parseCommandCodeUsage(input: CommandCodeUsagePayloads): ProviderUsage | null {
  const creditsRoot = asObject(input.credits);
  const credits = asObject(creditsRoot?.["credits"]);
  const windowLimits = asObject(creditsRoot?.["windowLimits"]);
  const summary = asObject(input.summary);
  const subscriptionRoot = asObject(input.subscription);
  const subscription = asObject(subscriptionRoot?.["data"]) ?? subscriptionRoot;
  const whoami = asObject(input.whoami);

  const lanes: UsageLane[] = [];

  const fiveHour = parseWindow(windowLimits?.["fiveHour"]);
  if (fiveHour) {
    lanes.push({ label: "5h", percent: percentFor(fiveHour.used, fiveHour.cap), resetsAt: toIsoTimestamp(fiveHour.resetAt) });
  }
  const weekly = parseWindow(windowLimits?.["weekly"]);
  if (weekly) {
    lanes.push({ label: "Weekly", percent: percentFor(weekly.used, weekly.cap), resetsAt: toIsoTimestamp(weekly.resetAt) });
  }

  const balance: MoneyAmount[] = [];
  const monthlyRemaining = readNumber(credits?.["monthlyCredits"]);
  const purchased = readNumber(credits?.["purchasedCredits"]);
  const free = readNumber(credits?.["freeCredits"]);
  if (monthlyRemaining !== null) balance.push({ amount: round2(monthlyRemaining), unit: "usd", label: "Monthly credits remaining" });
  if (purchased !== null) balance.push({ amount: round2(purchased), unit: "usd", label: "Purchased credits" });
  if (free !== null) balance.push({ amount: round2(free), unit: "usd", label: "Free credits" });

  // `totalCredits` is the observed bridge field; the official CLI reads `totalCost`.
  const totalUsed = readNumber(summary?.["totalCredits"]) ?? readNumber(summary?.["totalCost"]);
  const planId = readString(credits?.["planId"]) ?? readString(subscription?.["planId"]);
  const status = readString(subscription?.["status"]);
  const nominal = planId ? PLAN_NOMINAL_CREDITS[planId] : undefined;

  let monthlyCap: number | null = null;
  if (totalUsed !== null && monthlyRemaining !== null) {
    monthlyCap = totalUsed + monthlyRemaining;
  } else if (totalUsed !== null && nominal !== undefined && (status === null || status === "active")) {
    monthlyCap = nominal;
  }
  if (totalUsed !== null && monthlyCap !== null && monthlyCap > 0) {
    lanes.push({
      label: "Monthly",
      percent: percentFor(totalUsed, monthlyCap),
      resetsAt: toIsoTimestamp(subscription?.["currentPeriodEnd"]),
    });
  }

  const spend: ProviderUsage["spend"] | undefined = totalUsed !== null ? { unit: "usd", monthly: round2(totalUsed) } : undefined;

  const exceeded: string[] = [];
  if (asObject(windowLimits?.["fiveHour"])?.["exceeded"] === true) exceeded.push("5h");
  if (asObject(windowLimits?.["weekly"])?.["exceeded"] === true) exceeded.push("weekly");
  const exceededField = readString(windowLimits?.["exceeded"]);
  if (exceededField && !exceeded.includes(exceededField)) exceeded.push(exceededField);
  if (exceeded.length === 0 && windowLimits?.["limited"] === true) exceeded.push("rolling");
  let notice = exceeded.length > 0 ? `${exceeded.join(" and ")} limit reached` : undefined;

  const orgLimits = Array.isArray(whoami?.["orgLimits"]) ? whoami["orgLimits"] : [];
  const exceededOrgLimits = orgLimits
    .map(asObject)
    .filter((entry): entry is Record<string, unknown> => entry !== null && entry["exceeded"] === true);
  if (exceededOrgLimits.length > 0) {
    const label = exceededOrgLimits.map((entry) => readString(entry["model"]) ?? readString(entry["scope"]) ?? "model").join(", ");
    notice = notice ? `${notice}; ${label} limit exceeded` : `${label} limit exceeded`;
  }

  if (lanes.length === 0 && balance.length === 0 && spend === undefined && notice === undefined) return null;
  return {
    lanes: lanes.length > 0 ? lanes : undefined,
    balance: balance.length > 0 ? balance : undefined,
    spend,
    notice,
  };
}

export const commandCodeCloudAdapter: UsageAdapter = {
  id: "commandcode-cloud",
  async fetch(token, ctx: AdapterContext): Promise<AdapterAttempt> {
    const key = sanitizeApiKey(token);
    if (!key) return { usage: { error: "missing Command Code API key" } };

    const origin = (ctx.env?.[ENV_ORIGIN] ?? "").trim() || ORIGIN;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "x-command-code-version": COMMAND_CODE_CLI_VERSION,
      "x-cli-environment": "production",
      ...ctx.headers,
      ...(zdr(ctx.env) ? { "x-cmd-zdr": "1" } : {}),
    };
    const request = (url: string) => requestJson(url, { headers }, { fetchFn: ctx.fetchFn, signal: ctx.signal });

    const whoami = await request(`${origin}/alpha/whoami?limits=1`);
    if (!whoami.ok && whoami.status === 401) {
      return { usage: { error: redact(whoami.error || "HTTP 401") }, status: 401 };
    }

    const orgId = pickOrgId(whoami.data);
    const query = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
    const [credits, subscription] = await Promise.all([
      request(`${origin}/alpha/billing/credits${query}`),
      request(`${origin}/alpha/billing/subscriptions${query}`),
    ]);
    const since = pickCurrentPeriodStart(subscription.data);
    const summaryQuery = since ? `${query ? `${query}&` : "?"}since=${encodeURIComponent(since)}` : query;
    const summary = await request(`${origin}/alpha/usage/summary${summaryQuery}`);

    const usage = parseCommandCodeUsage({
      whoami: whoami.data,
      credits: credits.data,
      subscription: subscription.data,
      summary: summary.data,
    });
    const status = credits.status === null ? undefined : credits.status;
    if (!usage) {
      const error = credits.error || subscription.error || summary.error || whoami.error || "unrecognized response shape";
      return { usage: { error: redact(error) }, status };
    }
    return { usage, status };
  },
};
