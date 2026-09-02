/** Ported from @hk_net/pi-usage-bars (MIT, hk_net).
 *
 * Moonshot (Kimi) adapters: account balance from /v1/users/me/balance for the
 * US region (moonshotai, USD) and the CN region (moonshotai-cn, CNY).
 *
 * Source: extensions/usage-bars/core.ts — extractMoonshotBalanceFromPayload,
 * fetchMoonshotBalance. Endpoints overridable via PI_MOONSHOT_BALANCE_ENDPOINT
 * and PI_MOONSHOT_CN_BALANCE_ENDPOINT.
 */
import { requestJson } from "./http.ts";
import type { AdapterContext, UsageAdapter } from "./types.ts";
import type { MoneyAmount, ProviderUsage } from "../types.ts";

const DEFAULT_ENDPOINT = "https://api.moonshot.ai/v1/users/me/balance";
const DEFAULT_CN_ENDPOINT = "https://api.moonshot.cn/v1/users/me/balance";

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
 * Parse the /v1/users/me/balance payload (optionally wrapped in `data`).
 * Pure and defensive: available balance is primary; cash and voucher become
 * detail entries in the region's currency.
 */
export function extractMoonshotBalance(payload: unknown, currency: "USD" | "CNY"): ProviderUsage | null {
  const root = asObject(payload);
  if (!root) return null;
  const data = asObject(root.data) ?? root;
  if (!data) return null;
  const available = readNumber(data.available_balance ?? data.availableBalance);
  if (available === null) return null;
  const cash = readNumber(data.cash_balance ?? data.cashBalance);
  const voucher = readNumber(data.voucher_balance ?? data.voucherBalance);

  const balance: MoneyAmount[] = [{ amount: available, unit: currency, label: "Available balance" }];
  if (cash !== null) balance.push({ amount: cash, unit: currency, label: "Cash" });
  if (voucher !== null) balance.push({ amount: voucher, unit: currency, label: "Voucher" });

  const usage: ProviderUsage = { balance };
  if (available <= 0) {
    usage.warning = "Balance exhausted; inference requests may be rejected";
  }
  return usage;
}

function createMoonshotAdapter(
  id: string,
  endpointEnv: string,
  defaultEndpoint: string,
  currency: "USD" | "CNY",
): UsageAdapter {
  return {
    id,
    async fetch(token, ctx) {
      const result = await requestJson(
        resolveEndpoint(ctx.env, endpointEnv, defaultEndpoint),
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
      const usage = extractMoonshotBalance(result.data, currency);
      if (!usage) return { usage: { error: "unrecognized response shape" }, status };
      return { usage, status };
    },
  };
}

export const moonshotAdapter: UsageAdapter = createMoonshotAdapter(
  "moonshotai",
  "PI_MOONSHOT_BALANCE_ENDPOINT",
  DEFAULT_ENDPOINT,
  "USD",
);

export const moonshotCnAdapter: UsageAdapter = createMoonshotAdapter(
  "moonshotai-cn",
  "PI_MOONSHOT_CN_BALANCE_ENDPOINT",
  DEFAULT_CN_ENDPOINT,
  "CNY",
);
