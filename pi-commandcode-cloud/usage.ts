/**
 * Command Code usage data plane: fetch the four `/alpha/*` endpoints and format
 * the result for the extension's `/commandcode-usage` command and footer bar.
 *
 * Self-contained module (mirrors `pi-ollama-cloud/usage.ts` structurally):
 * it resolves nothing itself — the caller resolves the API key and passes it in.
 * Every request goes through {@link safeRequest}, which degrades per endpoint so
 * a failing section is reported as *unavailable* (never zeroed, never blanks the
 * whole line).
 *
 * Contract (plan §6):
 *   GET {base}/alpha/whoami?limits=1                       → orgId
 *   GET {base}/alpha/billing/credits?orgId=…               ┐ in parallel
 *   GET {base}/alpha/billing/subscriptions?orgId=…         ┘
 *   GET {base}/alpha/usage/summary?orgId=…&since=…         (best-effort)
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  API_BASE,
  CREDITS_PATH,
  ENV_USAGE_ENDPOINT,
  ENV_USAGE_TIMEOUT_MS,
  SUBSCRIPTIONS_PATH,
  USAGE_SUMMARY_PATH,
  USAGE_TIMEOUT_MS,
  USER_AGENT,
  WHOAMI_PATH,
} from "./constants.ts";
import { type CommandCodeUsage, deriveUsage, parseSubscriptions, parseWhoami } from "./usage-types.ts";
import {
  attributionHeaders,
  envInt,
  formatDurationMs,
  httpError,
  type JsonResponse,
  redactCommandCodeErrorText,
  sanitizeApiKey,
} from "./utils.ts";

// --- Fetch ---

export interface FetchCommandCodeUsageOptions {
  /** Injected fetch for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /** Environment used for endpoint/timeout/ZDR overrides; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** External cancellation (e.g. the footer refreshing again). */
  signal?: AbortSignal;
  /** Per-request timeout override (ms). */
  timeoutMs?: number;
  /** Origin override; defaults to `PI_COMMANDCODE_USAGE_ENDPOINT` or the API base. */
  baseUrl?: string;
  /** Clock for the exceeded-window countdown; defaults to `Date.now()`. */
  nowMs?: number;
}

/**
 * Fetch JSON with a hard timeout and an external abort signal. Never throws:
 * transport failures come back as `{ ok: false, status: 0, error }`. Error
 * text is redacted so secrets never reach a notification or a log.
 */
async function safeRequest<T>(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      // Keep data null; the raw text is reported below.
    }
    const errorPayload =
      data !== null && typeof data === "object" && "error" in data ? (data as { error: unknown }).error : undefined;
    const rawError =
      errorPayload !== undefined
        ? typeof errorPayload === "object"
          ? JSON.stringify(errorPayload)
          : String(errorPayload)
        : text;
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : redactCommandCodeErrorText(rawError),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: redactCommandCodeErrorText(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timeout);
    if (externalSignal && !externalSignal.aborted) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/** Per-request headers per §6.1, including ZDR when requested. */
function usageHeaders(apiKey: string, env: NodeJS.ProcessEnv): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    ...attributionHeaders(env),
  };
}

function orgQuery(orgId: string | undefined): string {
  return orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
}

/**
 * Fetch Command Code account usage.
 *
 * Per-endpoint degradation: each section is fetched independently; only a
 * complete failure (401 anywhere, 404 on all four endpoints, or every request
 * failing) throws. Anything partial is returned with `available` flags so the
 * formatter can print "unavailable" for the missing sections.
 */
export async function fetchCommandCodeUsage(
  apiKey: string,
  opts: FetchCommandCodeUsageOptions = {},
): Promise<CommandCodeUsage> {
  const env = opts.env ?? process.env;
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? envInt(ENV_USAGE_TIMEOUT_MS, USAGE_TIMEOUT_MS, env);
  const base = (opts.baseUrl ?? env[ENV_USAGE_ENDPOINT] ?? "").trim() || API_BASE;
  const nowMs = opts.nowMs ?? Date.now();

  const key = sanitizeApiKey(apiKey);
  if (!key) {
    throw new Error("Command Code usage failed: no API key configured — run /login.");
  }
  const headers = usageHeaders(key, env);
  const init: RequestInit = { method: "GET", headers };

  const whoami = await safeRequest<unknown>(fetchFn, `${base}${WHOAMI_PATH}?limits=1`, init, timeoutMs, opts.signal);
  if (whoami.status === 401) httpError("usage", 401);
  const orgId = parseWhoami(whoami.data)?.org?.id;
  const query = orgQuery(orgId);

  const [credits, subscriptions] = await Promise.all([
    safeRequest<unknown>(fetchFn, `${base}${CREDITS_PATH}${query}`, init, timeoutMs, opts.signal),
    safeRequest<unknown>(fetchFn, `${base}${SUBSCRIPTIONS_PATH}${query}`, init, timeoutMs, opts.signal),
  ]);

  const since = parseSubscriptions(subscriptions.data)?.currentPeriodStart;
  const summaryParams = new URLSearchParams();
  if (orgId) summaryParams.set("orgId", orgId);
  if (since) summaryParams.set("since", since);
  const summaryQuery = summaryParams.toString();
  const summary = await safeRequest<unknown>(
    fetchFn,
    `${base}${USAGE_SUMMARY_PATH}${summaryQuery ? `?${summaryQuery}` : ""}`,
    init,
    timeoutMs,
    opts.signal,
  );

  const sections = [whoami, credits, subscriptions, summary];
  if (sections.some((section) => section.status === 401)) httpError("usage", 401);
  if (sections.every((section) => section.status === 404)) {
    throw new Error(
      redactCommandCodeErrorText(
        "Your Command Code plan does not expose the account API (Go plan?). Usage is unavailable.",
      ),
    );
  }
  if (sections.every((section) => !section.ok)) {
    const detail = sections.map((section) => section.error).find((value) => value) ?? "network error";
    throw new Error(redactCommandCodeErrorText(`Command Code usage failed: ${detail}`));
  }

  const usage = deriveUsage({
    whoami: whoami.data,
    credits: credits.data,
    subscriptions: subscriptions.data,
    summary: summary.data,
    nowMs,
  });
  usage.fetchedAt = nowMs;
  return usage;
}

// --- Formatting ---

function displayPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(Math.max(percent, 0), 100);
}

/** Render a 10-cell quota bar for a 0-100 percentage: `▕████░░░░░░▏`. */
export function quotaBar(pct: number): string {
  const value = displayPercent(pct);
  const filled = Math.min(Math.max(Math.floor(value / 10), 0), 10);
  return `▕${"█".repeat(filled)}${"░".repeat(10 - filled)}▏`;
}

/** Color a single segment: `error` ≥ 80, `warning` ≥ 60, else `success`. */
export function colorSegment(theme: Theme, label: string, pct: number): string {
  const value = displayPercent(pct);
  const color = value >= 80 ? "error" : value >= 60 ? "warning" : "success";
  return theme.fg(color, `${quotaBar(value)} ${label} ${Math.round(value)}%`);
}

/**
 * Countdown to an ISO reset instant: `2h 41m`, `4d 3h`, `now`, `unknown`.
 * Signature is `(nowMs, iso)` per the plan's helper name.
 */
export function formatResetsIn(nowMs: number, iso: string): string {
  const target = Date.parse(iso);
  if (!Number.isFinite(target) || !Number.isFinite(nowMs)) return "unknown";
  const delta = target - nowMs;
  if (delta <= 0) return "now";
  return formatDurationMs(delta);
}

/**
 * Compact one-line usage for the footer bar, one colored segment per present
 * lane plus the remaining monthly credits. Missing lanes are omitted entirely.
 */
export function formatUsageStatusColored(theme: Theme, data: CommandCodeUsage): string {
  const segments = data.lanes.map((lane) => colorSegment(theme, lane.label, lane.percent));
  const primary = data.balance?.find((entry) => entry.label === "Monthly credits remaining") ?? data.balance?.[0];
  if (primary && primary.unit === "usd" && Number.isFinite(primary.amount)) {
    segments.push(theme.fg("muted", `$${primary.amount.toFixed(2)} left`));
  }
  return redactCommandCodeErrorText(segments.join(" "));
}

/** Multi-line plain text for `/commandcode-usage` and `/commandcode-status`. */
export function formatUsage(data: CommandCodeUsage, nowMs: number = Date.now()): string {
  const lines: string[] = ["Command Code usage:"];
  const byLabel = new Map(data.lanes.map((lane) => [lane.label, lane]));

  for (const label of ["5h", "Weekly", "Monthly"] as const) {
    const lane = byLabel.get(label);
    if (!lane) {
      lines.push(`  ${label}: unavailable`);
      continue;
    }
    const percent = Math.round(displayPercent(lane.percent));
    const detail =
      lane.used !== undefined && lane.cap !== undefined
        ? ` (${lane.used.toFixed(2)} / ${lane.cap.toFixed(2)} credits${lane.estimated ? ", estimated" : ""})`
        : "";
    const reset = lane.resetsAt ? ` — resets in ${formatResetsIn(nowMs, lane.resetsAt)}` : "";
    lines.push(`  ${label}: ${percent}%${detail}${reset}`);
  }

  for (const entry of data.balance ?? []) {
    lines.push(`  ${entry.label}: $${entry.amount.toFixed(2)}`);
  }

  if (data.spend) {
    const parts: string[] = [];
    if (data.spend.monthly !== undefined) parts.push(`$${data.spend.monthly.toFixed(2)}`);
    if (data.spend.totalCount !== undefined) parts.push(`${data.spend.totalCount} requests`);
    if (data.spend.successRate !== undefined) parts.push(`${data.spend.successRate}% success`);
    if (parts.length > 0) lines.push(`  Spend: ${parts.join(", ")}`);
  }

  if (data.notice) lines.push(`  ⚠ ${data.notice}`);

  for (const limit of data.orgLimits ?? []) {
    const name = limit.model ?? limit.scope ?? "limit";
    const amount =
      limit.spent !== undefined && limit.limit !== undefined
        ? ` — $${limit.spent.toFixed(2)} / $${limit.limit.toFixed(2)}`
        : "";
    lines.push(`  org ${name}${amount}`);
  }

  const unavailable = Object.entries(data.available)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  if (unavailable.length > 0) lines.push(`  Unavailable: ${unavailable.join(", ")}`);
  if (data.error) lines.push(`  Error: ${data.error}`);

  return redactCommandCodeErrorText(lines.join("\n"));
}
