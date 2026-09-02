/** Ported from @hk_net/pi-usage-bars (MIT, hk_net).
 *
 * DeepSeek adapter: account balance from /user/balance — total, topped-up,
 * and granted entries per currency — plus the "not available for API use"
 * warning when is_available is false.
 *
 * Source: extensions/usage-bars/core.ts — extractDeepSeekBalanceFromPayload,
 * fetchDeepSeekBalance. Endpoint overridable via PI_DEEPSEEK_BALANCE_ENDPOINT.
 */
import { requestJson } from "./http.ts";
import type { AdapterContext, UsageAdapter } from "./types.ts";
import type { MoneyAmount, ProviderUsage } from "../types.ts";

const BALANCE_ENDPOINT_ENV = "PI_DEEPSEEK_BALANCE_ENDPOINT";
const DEFAULT_BALANCE_ENDPOINT = "https://api.deepseek.com/user/balance";

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveEndpoint(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const trimmed = env[name]?.trim();
  return trimmed || fallback;
}

/**
 * Parse the /user/balance payload. Pure and defensive: the first
 * balance_infos entry with a total is the primary balance; its topped-up and
 * granted parts become detail entries, and any further currencies are
 * appended as additional entries.
 */
export function extractDeepSeekBalance(payload: unknown): ProviderUsage | null {
  const root = asObject(payload);
  if (!root || !Array.isArray(root.balance_infos)) return null;
  const balances = root.balance_infos
    .map(asObject)
    .filter((value): value is Record<string, unknown> => value !== null);
  if (balances.length === 0) return null;

  const parsed = balances.flatMap((balance) => {
    const unit = typeof balance.currency === "string" ? balance.currency.toUpperCase() : "USD";
    const total = readNumber(balance.total_balance ?? balance.totalBalance);
    if (total === null) return [];
    return [{
      total: { amount: total, unit, label: "Total balance" },
      toppedUp: readNumber(balance.topped_up_balance ?? balance.toppedUpBalance),
      granted: readNumber(balance.granted_balance ?? balance.grantedBalance),
    }];
  });
  const primary = parsed[0];
  if (!primary) return null;

  const balance: MoneyAmount[] = [primary.total];
  if (primary.toppedUp !== null) {
    balance.push({ amount: primary.toppedUp, unit: primary.total.unit, label: "Topped up" });
  }
  if (primary.granted !== null) {
    balance.push({ amount: primary.granted, unit: primary.total.unit, label: "Granted" });
  }
  for (const additional of parsed.slice(1)) balance.push(additional.total);

  const usage: ProviderUsage = { balance };
  if (root.is_available === false) {
    usage.warning = "Balance is not currently available for API use";
  }
  return usage;
}

export const deepseekAdapter: UsageAdapter = {
  id: "deepseek",
  async fetch(token, ctx) {
    const result = await requestJson(
      resolveEndpoint(ctx.env, BALANCE_ENDPOINT_ENV, DEFAULT_BALANCE_ENDPOINT),
      {
        headers: {
          ...ctx.headers,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      { fetchFn: ctx.fetchFn, signal: ctx.signal },
    );
    const status = result.status === null ? undefined : result.status;
    if (!result.ok) return { usage: { error: result.error }, status };
    const usage = extractDeepSeekBalance(result.data);
    if (!usage) return { usage: { error: "unrecognized response shape" }, status };
    return { usage, status };
  },
};
