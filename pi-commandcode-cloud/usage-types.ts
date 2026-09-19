/**
 * Command Code usage domain types and **pure** parsers.
 *
 * This module is deliberately free of I/O: it turns the raw `/alpha/*`
 * payloads documented in `docs/plans/pi-commandcode-cloud.md` §6.2 into a
 * normalized {@link CommandCodeUsage} value. Every parser is tolerant:
 *
 * - a missing/absent section is `undefined`, never `0`;
 * - only finite numbers are accepted (numeric strings are tolerated);
 * - `whoami` accepts both the wrapped (`{success,user,org,orgLimits}`) and the
 *   unwrapped (`{user,org}` / bare user) shapes, plus a `{data:{…}}` envelope;
 * - the Monthly lane is **derived** (`used = totalCredits ?? totalCost`,
 *   `cap = used + monthlyCredits`, with a plan-nominal fallback) because
 *   `windowLimits` only exposes `fiveHour` and `weekly`.
 *
 * Lane labels are exactly `"5h"`, `"Weekly"` and `"Monthly"` and a lane is
 * omitted (never rendered as `0 %`) when its source is absent.
 */

import { formatDurationMs } from "./utils.ts";

// --- Raw response snapshots (post-parse, all fields optional) ---

/** One rolling window (`windowLimits.fiveHour` / `.weekly`). */
export interface WindowLimitSnapshot {
  /** Credit-value USD already used in this window. */
  used?: number;
  /** Credit-value USD cap for this window. `cap <= 0` means "not started". */
  cap?: number;
  /** Whether this specific window is exhausted. */
  exceeded?: boolean;
  /** Epoch **milliseconds**; `<= 0` means idle/not-started. */
  resetAt?: number;
}

/** `credits` object from `GET /alpha/billing/credits`. */
export interface CreditsSnapshot {
  /** Remaining monthly credits (USD value), **not** the cap. */
  monthlyCredits?: number;
  purchasedCredits?: number;
  freeCredits?: number;
  planId?: string;
}

/** `windowLimits` object from `GET /alpha/billing/credits`. */
export interface WindowLimitsSnapshot {
  limited?: boolean;
  /** String naming the exceeded window (`"weekly"`, …); boolean `true` is normalized to `"window"`. */
  exceeded?: string;
  fiveHour?: WindowLimitSnapshot;
  weekly?: WindowLimitSnapshot;
}

/** Parsed `GET /alpha/billing/credits` response. */
export interface CreditsResponse {
  credits?: CreditsSnapshot;
  windowLimits?: WindowLimitsSnapshot;
}

/** `subscription.data` from `GET /alpha/billing/subscriptions`. */
export interface SubscriptionSnapshot {
  planId?: string;
  status?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

/** Parsed `GET /alpha/whoami` response. */
export interface WhoamiSnapshot {
  success?: boolean;
  user?: {
    id?: string;
    name?: string;
    userName?: string;
    email?: string;
  };
  org?: {
    id?: string;
    login?: string;
  };
  orgLimits?: OrgLimitSnapshot[];
}

/** One entry of `whoami.orgLimits[]` (team plans). */
export interface OrgLimitSnapshot {
  scope?: string;
  model?: string;
  spent?: number;
  limit?: number;
  exceeded?: boolean;
  resetInterval?: string;
  resetAt?: number;
}

/** Parsed `GET /alpha/usage/summary` response. */
export interface UsageSummarySnapshot {
  totalCount?: number;
  totalCost?: number;
  totalCredits?: number;
  successRate?: number;
  periodBasis?: string;
  totalTokensIn?: number;
  totalTokensOut?: number;
}

// --- Normalized domain types ---

/**
 * One quota/usage lane. `percent` is `clamp(used / cap * 100, 0, 100)`.
 * Structurally compatible with pi-usage's `UsageLane`.
 */
export interface UsageLane {
  label: "5h" | "Weekly" | "Monthly";
  percent: number;
  /** ISO timestamp of the reset, when known. */
  resetsAt?: string;
  /** Credit-value USD used (present for every derived lane). */
  used?: number;
  /** Credit-value USD cap (present for every derived lane). */
  cap?: number;
  /** True when `cap` came from the plan-nominal fallback rather than observed data. */
  estimated?: boolean;
}

/** A balance entry. Structurally compatible with pi-usage's `MoneyAmount`. */
export interface BalanceAmount {
  amount: number;
  unit: string;
  label: string;
}

/** Period spend aggregate from `usage/summary`. */
export interface UsageSpendSnapshot {
  unit: string;
  monthly?: number;
  totalCount?: number;
  successRate?: number;
}

/** Which of the four account endpoints produced a recognizable payload. */
export interface UsageAvailability {
  whoami: boolean;
  credits: boolean;
  subscriptions: boolean;
  summary: boolean;
}

/** Normalized Command Code usage for the extension footer / commands. */
export interface CommandCodeUsage {
  /** Present lanes only, in display order: `5h`, `Weekly`, `Monthly`. */
  lanes: UsageLane[];
  /** Balance entries (remaining monthly, purchased, free), present fields only. */
  balance?: BalanceAmount[];
  spend?: UsageSpendSnapshot;
  notice?: string;
  orgId?: string;
  whoami?: WhoamiSnapshot;
  orgLimits?: OrgLimitSnapshot[];
  period?: { start?: string; end?: string };
  /** Section availability; a `false` flag must render as "unavailable", never `0 %`. */
  available: UsageAvailability;
  fetchedAt?: number;
  /** Present only when the whole fetch failed in a way worth surfacing. */
  error?: string;
}

// --- Plan → nominal monthly credits (§2 facts table) ---

/**
 * Plan id → nominal monthly credit allowance (USD). Used **only** as the
 * `cap` fallback for the derived Monthly lane when `credits.monthlyCredits`
 * is unavailable; it never overrides observed data.
 */
export const PLAN_NOMINAL_CREDITS: Readonly<Record<string, number>> = {
  "individual-go": 10,
  "individual-goat": 70,
  "individual-pro": 30,
  "individual-pro-v1": 80,
  "individual-provider": 15,
  "individual-max": 150,
  "individual-ultra": 300,
  "teams-pro": 40,
};

// --- Small tolerant readers ---

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Finite number, never `0` for a missing value. Tolerates numeric strings. */
function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Non-empty string. */
function finiteString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function boolValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

/** Convert an epoch-ms window reset to ISO; `<= 0`/non-finite/out-of-range ⇒ omitted. */
function isoFromEpochMs(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0 || value > 8.64e15) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** ISO string passthrough with validation (used for `currentPeriodEnd`). */
function isoString(value: unknown): string | undefined {
  const raw = finiteString(value);
  if (!raw) return undefined;
  return Number.isNaN(Date.parse(raw)) ? undefined : raw;
}

/** `clamp(used / cap * 100, 0, 100)`; `undefined` when either side is missing or `cap <= 0`. */
function clampPercent(used: number | undefined, cap: number | undefined): number | undefined {
  if (used === undefined || cap === undefined) return undefined;
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return undefined;
  return Number(Math.min(Math.max((used / cap) * 100, 0), 100).toFixed(2));
}

function planNominal(planId: string | undefined): number | undefined {
  if (!planId) return undefined;
  return PLAN_NOMINAL_CREDITS[planId.trim().toLowerCase()];
}

// --- Section parsers ---

function parseWindowLimit(value: unknown): WindowLimitSnapshot | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const used = finiteNumber(pick(record, "used", "usage"));
  const cap = finiteNumber(pick(record, "cap", "limit", "total"));
  const exceeded = boolValue(record.exceeded);
  const resetAt = finiteNumber(pick(record, "resetAt", "reset_at", "resetsAt"));
  if (used === undefined && cap === undefined && exceeded === undefined && resetAt === undefined) return undefined;
  return { used, cap, exceeded, resetAt };
}

function parseWindowLimits(value: unknown): WindowLimitsSnapshot | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const limited = boolValue(record.limited);
  let exceeded = finiteString(record.exceeded);
  if (exceeded === undefined && boolValue(record.exceeded) === true) exceeded = "window";
  const fiveHour = parseWindowLimit(pick(record, "fiveHour", "five_hour", "fivehour", "5h"));
  const weekly = parseWindowLimit(record.weekly);
  if (fiveHour === undefined && weekly === undefined && limited === undefined && exceeded === undefined) {
    return undefined;
  }
  return { limited, exceeded, fiveHour, weekly };
}

function parseCreditsInfo(value: unknown): CreditsSnapshot | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const monthlyCredits = finiteNumber(pick(record, "monthlyCredits", "monthly_credits"));
  const purchasedCredits = finiteNumber(pick(record, "purchasedCredits", "purchased_credits"));
  const freeCredits = finiteNumber(pick(record, "freeCredits", "free_credits"));
  const planId = finiteString(pick(record, "planId", "plan_id", "plan"));
  if (
    monthlyCredits === undefined &&
    purchasedCredits === undefined &&
    freeCredits === undefined &&
    planId === undefined
  ) {
    return undefined;
  }
  return { monthlyCredits, purchasedCredits, freeCredits, planId };
}

/** Parse `GET /alpha/billing/credits` (raw or already-normalized). */
export function parseCredits(payload: unknown): CreditsResponse | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;
  const hasCredits = asRecord(root.credits) !== undefined || asRecord(root.windowLimits) !== undefined;
  const source = hasCredits ? root : (asRecord(root.data) ?? root);
  const credits = parseCreditsInfo(source.credits);
  const windowLimits = parseWindowLimits(source.windowLimits);
  if (credits === undefined && windowLimits === undefined) return undefined;
  return { credits, windowLimits };
}

/** Parse `GET /alpha/billing/subscriptions`; unwraps the `{success,data}` envelope. */
export function parseSubscriptions(payload: unknown): SubscriptionSnapshot | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;
  const data = asRecord(root.data) ?? root;
  const planId = finiteString(pick(data, "planId", "plan_id", "plan"));
  const status = finiteString(data.status);
  const currentPeriodStart = isoString(pick(data, "currentPeriodStart", "current_period_start"));
  const currentPeriodEnd = isoString(pick(data, "currentPeriodEnd", "current_period_end"));
  const cancelAtPeriodEnd = boolValue(pick(data, "cancelAtPeriodEnd", "cancel_at_period_end"));
  if (
    planId === undefined &&
    status === undefined &&
    currentPeriodStart === undefined &&
    currentPeriodEnd === undefined &&
    cancelAtPeriodEnd === undefined
  ) {
    return undefined;
  }
  return { planId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd };
}

/** Parse `GET /alpha/usage/summary`; unwraps a `{data}` envelope. */
export function parseSummary(payload: unknown): UsageSummarySnapshot | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;
  const data = asRecord(root.data) ?? root;
  const totalCount = finiteNumber(pick(data, "totalCount", "total_count"));
  const totalCost = finiteNumber(pick(data, "totalCost", "total_cost"));
  const totalCredits = finiteNumber(pick(data, "totalCredits", "total_credits"));
  const successRate = finiteNumber(pick(data, "successRate", "success_rate"));
  const periodBasis = finiteString(pick(data, "periodBasis", "period_basis"));
  const totalTokensIn = finiteNumber(pick(data, "totalTokensIn", "total_tokens_in"));
  const totalTokensOut = finiteNumber(pick(data, "totalTokensOut", "total_tokens_out"));
  if (
    totalCount === undefined &&
    totalCost === undefined &&
    totalCredits === undefined &&
    successRate === undefined &&
    periodBasis === undefined &&
    totalTokensIn === undefined &&
    totalTokensOut === undefined
  ) {
    return undefined;
  }
  return { totalCount, totalCost, totalCredits, successRate, periodBasis, totalTokensIn, totalTokensOut };
}

function looksLikeUser(record: Record<string, unknown>): boolean {
  return (
    finiteString(record.id) !== undefined ||
    finiteString(record.userName) !== undefined ||
    finiteString(record.email) !== undefined ||
    finiteString(record.name) !== undefined
  );
}

function parseOrg(value: unknown): WhoamiSnapshot["org"] {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const id = finiteString(value);
    return id ? { id } : undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const id = finiteString(record.id);
  const login = finiteString(record.login);
  if (id === undefined && login === undefined) return undefined;
  return { id, login };
}

function parseOrgLimits(value: unknown): OrgLimitSnapshot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const limits: OrgLimitSnapshot[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const scope = finiteString(record.scope);
    const model = finiteString(record.model);
    const spent = finiteNumber(record.spent);
    const limit = finiteNumber(record.limit);
    const exceeded = boolValue(record.exceeded);
    const resetInterval = finiteString(pick(record, "resetInterval", "reset_interval"));
    const resetAt = finiteNumber(pick(record, "resetAt", "reset_at"));
    if (
      scope === undefined &&
      model === undefined &&
      spent === undefined &&
      limit === undefined &&
      exceeded === undefined &&
      resetInterval === undefined &&
      resetAt === undefined
    ) {
      continue;
    }
    limits.push({ scope, model, spent, limit, exceeded, resetInterval, resetAt });
  }
  return limits.length > 0 ? limits : undefined;
}

/**
 * Parse `GET /alpha/whoami?limits=1`. Accepts the documented top-level
 * `{success,user,org,orgLimits}` shape, a `{data:{…}}` wrapper, and a bare
 * user object (unwrapped). Error envelopes (`{success:false,error}`) yield
 * `undefined`.
 */
export function parseWhoami(payload: unknown): WhoamiSnapshot | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;
  const data = asRecord(root.data);
  const source =
    data !== undefined && (data.user !== undefined || data.org !== undefined || data.orgLimits !== undefined)
      ? data
      : root;
  const success = boolValue(root.success);
  const userRecord = asRecord(source.user) ?? (looksLikeUser(source) ? source : undefined);
  const org = parseOrg(source.org ?? root.org);
  const orgLimits = parseOrgLimits(source.orgLimits ?? root.orgLimits);

  const rawUser = userRecord
    ? {
        id: finiteString(userRecord.id),
        name: finiteString(userRecord.name),
        userName: finiteString(userRecord.userName),
        email: finiteString(userRecord.email),
      }
    : undefined;
  const user =
    rawUser &&
    (rawUser.id !== undefined ||
      rawUser.name !== undefined ||
      rawUser.userName !== undefined ||
      rawUser.email !== undefined)
      ? rawUser
      : undefined;

  // Nothing recognizable: an error envelope or empty body.
  if (user === undefined && org === undefined && orgLimits === undefined) return undefined;
  if (success === false && user === undefined && org === undefined) return undefined;
  return { success, user, org, orgLimits };
}

// --- Derivation ---

/** Raw sections plus an optional clock for the exceeded-window countdown. */
export interface CommandCodeSections {
  whoami?: unknown;
  credits?: unknown;
  subscriptions?: unknown;
  summary?: unknown;
  /** When provided, the exceeded notice gains a "resets in …" suffix. */
  nowMs?: number;
}

function windowLane(label: "5h" | "Weekly", window: WindowLimitSnapshot | undefined): UsageLane | undefined {
  if (!window) return undefined;
  // Skip idle lanes: used===0 && cap===0 (and any cap<=0) means "not started".
  if (window.used === 0 && window.cap === 0) return undefined;
  const percent = clampPercent(window.used, window.cap);
  if (percent === undefined) return undefined;
  return {
    label,
    percent,
    used: window.used,
    cap: window.cap,
    resetsAt: isoFromEpochMs(window.resetAt),
  };
}

/**
 * Derive the normalized {@link CommandCodeUsage} from the four raw sections.
 *
 * Bucket mapping (§6.3):
 * - `5h` / `Weekly` come from `windowLimits.fiveHour` / `.weekly`; `cap <= 0`
 *   (or idle `0/0`) omits the lane.
 * - `Monthly` is synthesized: `used = summary.totalCredits ?? summary.totalCost`,
 *   `remaining = credits.monthlyCredits`, `cap = used + remaining`. When
 *   `remaining` is missing the plan-nominal cap is used (active subscription);
 *   when the summary section is entirely absent Monthly is omitted, never `0 %`.
 */
export function deriveUsage(input: CommandCodeSections): CommandCodeUsage {
  const whoami = parseWhoami(input.whoami);
  const credits = parseCredits(input.credits);
  const subscription = parseSubscriptions(input.subscriptions);
  const summary = parseSummary(input.summary);

  const windowLimits = credits?.windowLimits;
  const lanes: UsageLane[] = [];
  const fiveHour = windowLane("5h", windowLimits?.fiveHour);
  if (fiveHour) lanes.push(fiveHour);
  const weekly = windowLane("Weekly", windowLimits?.weekly);
  if (weekly) lanes.push(weekly);

  // --- Derived Monthly lane ---
  const summaryUsed = summary ? (summary.totalCredits ?? summary.totalCost) : undefined;
  const remaining = credits?.credits?.monthlyCredits;
  const planId = credits?.credits?.planId ?? subscription?.planId;
  const status = subscription?.status;
  const nominalAllowed = status === undefined || status === "active";
  const nominal = nominalAllowed ? planNominal(planId) : undefined;

  let monthlyUsed = summaryUsed;
  let monthlyCap: number | undefined;
  let estimated = false;
  if (monthlyUsed !== undefined && remaining !== undefined) {
    monthlyCap = monthlyUsed + remaining;
  } else if (monthlyUsed !== undefined && nominal !== undefined) {
    // Summary succeeded but remaining credits are unavailable: estimate the cap.
    monthlyCap = nominal;
    estimated = true;
  } else if (summary !== undefined && monthlyUsed === undefined && remaining !== undefined && nominal !== undefined) {
    // Summary succeeded but carried no spend totals: derive used from the plan nominal.
    monthlyUsed = Math.max(nominal - remaining, 0);
    monthlyCap = nominal;
    estimated = true;
  }
  const monthlyPercent = clampPercent(monthlyUsed, monthlyCap);
  if (monthlyPercent !== undefined) {
    lanes.push({
      label: "Monthly",
      percent: monthlyPercent,
      used: monthlyUsed,
      cap: monthlyCap,
      estimated,
      resetsAt: isoString(subscription?.currentPeriodEnd),
    });
  }

  // --- Balance ---
  const balance: BalanceAmount[] = [];
  if (credits?.credits?.monthlyCredits !== undefined) {
    balance.push({ amount: credits.credits.monthlyCredits, unit: "usd", label: "Monthly credits remaining" });
  }
  if (credits?.credits?.purchasedCredits !== undefined) {
    balance.push({ amount: credits.credits.purchasedCredits, unit: "usd", label: "Purchased credits" });
  }
  if (credits?.credits?.freeCredits !== undefined) {
    balance.push({ amount: credits.credits.freeCredits, unit: "usd", label: "Free credits" });
  }

  // --- Spend ---
  let spend: UsageSpendSnapshot | undefined;
  if (summary) {
    const monthly = summary.totalCredits ?? summary.totalCost;
    if (monthly !== undefined || summary.totalCount !== undefined || summary.successRate !== undefined) {
      spend = {
        unit: "usd",
        monthly,
        totalCount: summary.totalCount,
        successRate: summary.successRate,
      };
    }
  }

  // --- Exceeded notice ---
  const notice = buildExceededNotice(lanes, windowLimits, input.nowMs);

  const orgLimits = whoami?.orgLimits;
  const period =
    subscription && (subscription.currentPeriodStart !== undefined || subscription.currentPeriodEnd !== undefined)
      ? { start: subscription.currentPeriodStart, end: subscription.currentPeriodEnd }
      : undefined;

  const available: UsageAvailability = {
    whoami: whoami !== undefined,
    credits: credits !== undefined,
    subscriptions: subscription !== undefined,
    summary: summary !== undefined,
  };

  return {
    lanes,
    balance: balance.length > 0 ? balance : undefined,
    spend,
    notice,
    orgId: whoami?.org?.id,
    whoami,
    orgLimits,
    period,
    available,
  };
}

function buildExceededNotice(
  lanes: UsageLane[],
  windowLimits: WindowLimitsSnapshot | undefined,
  nowMs: number | undefined,
): string | undefined {
  const exceededWindow = windowLimits?.exceeded;
  const label =
    windowLimits?.weekly?.exceeded === true || /week/i.test(exceededWindow ?? "")
      ? "Weekly"
      : windowLimits?.fiveHour?.exceeded === true || /(five|5h|session)/i.test(exceededWindow ?? "")
        ? "5h"
        : exceededWindow && exceededWindow !== "window"
          ? exceededWindow
          : windowLimits?.limited || exceededWindow === "window"
            ? "Usage"
            : undefined;
  if (!label) return undefined;

  const lane = lanes.find((candidate) => candidate.label === label);
  const resetsAt = lane?.resetsAt;
  if (nowMs !== undefined && resetsAt) {
    const resetMs = Date.parse(resetsAt);
    if (Number.isFinite(resetMs) && resetMs > nowMs) {
      return `${label.toLowerCase()} limit reached — resets in ${formatDurationMs(resetMs - nowMs)}`;
    }
  }
  return `${label.toLowerCase()} limit reached`;
}

/** Convenience: run all four parsers and derive in one call. */
export function parseCommandCodeUsage(input: CommandCodeSections): CommandCodeUsage {
  return deriveUsage(input);
}
