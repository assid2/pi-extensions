/**
 * Pure-parser and injected-fetch coverage for the balance/usage adapters
 * ported from @hk_net/pi-usage-bars (MIT, hk_net): openrouter, deepseek,
 * moonshot (US + CN), baseten. No real network: fetch is injected per call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { openrouterAdapter, extractOpenRouterUsage } from "../extensions/usage/adapters/openrouter.ts";
import { deepseekAdapter, extractDeepSeekBalance } from "../extensions/usage/adapters/deepseek.ts";
import { moonshotAdapter, moonshotCnAdapter, extractMoonshotBalance } from "../extensions/usage/adapters/moonshot.ts";
import { basetenAdapter, extractBasetenUsage } from "../extensions/usage/adapters/baseten.ts";
import type { AdapterContext, FetchLike } from "../extensions/usage/adapters/types.ts";

function fakeFetch(
  calls: string[],
  respond: (url: string) => { ok: boolean; status: number; body?: unknown },
): FetchLike {
  return async (input: string) => {
    calls.push(input);
    const response = respond(input);
    return {
      ok: response.ok,
      status: response.status,
      headers: { get: () => null },
      json: async () => response.body,
    };
  };
}

function makeCtx(providerId: string, fetchFn?: FetchLike, nowMs?: number): AdapterContext {
  const ctx: AdapterContext = { providerId, env: {} };
  if (fetchFn !== undefined) ctx.fetchFn = fetchFn;
  if (nowMs !== undefined) ctx.nowMs = nowMs;
  return ctx;
}

// --- openrouter -------------------------------------------------------------

test("extractOpenRouterUsage: balance, spend, and key-limit lane", () => {
  const usage = extractOpenRouterUsage(
    { data: { total_credits: 100, total_usage: 37.5 } },
    {
      data: {
        usage_daily: 1.25,
        usage_weekly: 8.75,
        usage_monthly: 37.5,
        usage: 512,
        limit: 100,
        limit_remaining: 25,
      },
    },
  );
  assert.deepEqual(usage, {
    balance: [{ amount: 62.5, unit: "USD", label: "Balance" }],
    spend: { unit: "USD", daily: 1.25, weekly: 8.75, monthly: 37.5, lifetime: 512 },
    lanes: [{ label: "Key limit", percent: 75 }],
  });
});

test("extractOpenRouterUsage: key payload without limit yields spend only", () => {
  const usage = extractOpenRouterUsage(null, { data: { usage_monthly: 12.5 } });
  assert.deepEqual(usage, { spend: { unit: "USD", monthly: 12.5 } });
});

test("extractOpenRouterUsage: unrecognized payloads yield null", () => {
  assert.equal(extractOpenRouterUsage(null, null), null);
  assert.equal(extractOpenRouterUsage({}, {}), null);
});

test("openrouterAdapter: fetches credits and key endpoints in parallel", async () => {
  const calls: string[] = [];
  const attempt = await openrouterAdapter.fetch("sk-or-v1-test", makeCtx("openrouter", fakeFetch(calls, (url) =>
    url === "https://openrouter.ai/api/v1/credits"
      ? { ok: true, status: 200, body: { data: { total_credits: 100, total_usage: 37.5 } } }
      : {
          ok: true,
          status: 200,
          body: {
            data: {
              usage_daily: 1.25,
              usage_weekly: 8.75,
              usage_monthly: 37.5,
              usage: 512,
              limit: 100,
              limit_remaining: 25,
            },
          },
        },
  )));
  assert.deepEqual([...calls].sort(), [
    "https://openrouter.ai/api/v1/credits",
    "https://openrouter.ai/api/v1/key",
  ]);
  assert.deepEqual(attempt, {
    usage: {
      balance: [{ amount: 62.5, unit: "USD", label: "Balance" }],
      spend: { unit: "USD", daily: 1.25, weekly: 8.75, monthly: 37.5, lifetime: 512 },
      lanes: [{ label: "Key limit", percent: 75 }],
    },
    status: 200,
  });
});

test("openrouterAdapter: HTTP 401 on both endpoints reports the joined error", async () => {
  const calls: string[] = [];
  const attempt = await openrouterAdapter.fetch(
    "sk-or-v1-bad",
    makeCtx("openrouter", fakeFetch(calls, () => ({ ok: false, status: 401 }))),
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(attempt, {
    usage: { error: "credits: HTTP 401; key: HTTP 401" },
    status: 401,
  });
});

// --- deepseek ---------------------------------------------------------------

test("extractDeepSeekBalance: primary plus topped-up and granted details", () => {
  const usage = extractDeepSeekBalance({
    balance_infos: [{ currency: "USD", total_balance: 40, topped_up_balance: 30, granted_balance: 10 }],
    is_available: true,
  });
  assert.deepEqual(usage, {
    balance: [
      { amount: 40, unit: "USD", label: "Total balance" },
      { amount: 30, unit: "USD", label: "Topped up" },
      { amount: 10, unit: "USD", label: "Granted" },
    ],
  });
});

test("extractDeepSeekBalance: is_available=false warns", () => {
  const usage = extractDeepSeekBalance({
    balance_infos: [{ currency: "USD", total_balance: 40, topped_up_balance: 40, granted_balance: 0 }],
    is_available: false,
  });
  assert.deepEqual(usage, {
    balance: [
      { amount: 40, unit: "USD", label: "Total balance" },
      { amount: 40, unit: "USD", label: "Topped up" },
      { amount: 0, unit: "USD", label: "Granted" },
    ],
    warning: "Balance is not currently available for API use",
  });
});

test("extractDeepSeekBalance: additional currencies become detail entries", () => {
  const usage = extractDeepSeekBalance({
    balance_infos: [
      { currency: "USD", total_balance: 40, topped_up_balance: 40, granted_balance: 0 },
      { currency: "CNY", total_balance: 66.5 },
    ],
  });
  assert.deepEqual(usage, {
    balance: [
      { amount: 40, unit: "USD", label: "Total balance" },
      { amount: 40, unit: "USD", label: "Topped up" },
      { amount: 0, unit: "USD", label: "Granted" },
      { amount: 66.5, unit: "CNY", label: "Total balance" },
    ],
  });
});

test("extractDeepSeekBalance: unrecognized payloads yield null", () => {
  assert.equal(extractDeepSeekBalance({}), null);
  assert.equal(extractDeepSeekBalance(null), null);
  assert.equal(extractDeepSeekBalance({ balance_infos: [] }), null);
});

test("deepseekAdapter: happy path hits the balance endpoint", async () => {
  const calls: string[] = [];
  const attempt = await deepseekAdapter.fetch("ds-test", makeCtx("deepseek", fakeFetch(calls, () => ({
    ok: true,
    status: 200,
    body: {
      balance_infos: [{ currency: "USD", total_balance: 40, topped_up_balance: 30, granted_balance: 10 }],
      is_available: true,
    },
  }))));
  assert.equal(calls[0], "https://api.deepseek.com/user/balance");
  assert.deepEqual(attempt.usage, {
    balance: [
      { amount: 40, unit: "USD", label: "Total balance" },
      { amount: 30, unit: "USD", label: "Topped up" },
      { amount: 10, unit: "USD", label: "Granted" },
    ],
  });
  assert.equal(attempt.status, 200);
});

test("deepseekAdapter: PI_DEEPSEEK_BALANCE_ENDPOINT overrides the default", async () => {
  const calls: string[] = [];
  const ctx: AdapterContext = {
    providerId: "deepseek",
    env: { PI_DEEPSEEK_BALANCE_ENDPOINT: "https://example.test/v1/balance" },
    fetchFn: fakeFetch(calls, () => ({
      ok: true,
      status: 200,
      body: { balance_infos: [{ currency: "USD", total_balance: 1 }], is_available: true },
    })),
  };
  await deepseekAdapter.fetch("ds-test", ctx);
  assert.equal(calls[0], "https://example.test/v1/balance");
});

test("deepseekAdapter: HTTP 401 propagates with status", async () => {
  const attempt = await deepseekAdapter.fetch(
    "ds-bad",
    makeCtx("deepseek", fakeFetch([], () => ({ ok: false, status: 401 }))),
  );
  assert.deepEqual(attempt, { usage: { error: "HTTP 401" }, status: 401 });
});

// --- moonshot ----------------------------------------------------------------

test("extractMoonshotBalance: USD available/cash/voucher", () => {
  const usage = extractMoonshotBalance(
    { data: { available_balance: 12.5, cash_balance: 10, voucher_balance: 2.5 } },
    "USD",
  );
  assert.deepEqual(usage, {
    balance: [
      { amount: 12.5, unit: "USD", label: "Available balance" },
      { amount: 10, unit: "USD", label: "Cash" },
      { amount: 2.5, unit: "USD", label: "Voucher" },
    ],
  });
});

test("extractMoonshotBalance: CNY for the CN region", () => {
  const usage = extractMoonshotBalance(
    { data: { available_balance: 88, cash_balance: 68, voucher_balance: 20 } },
    "CNY",
  );
  assert.deepEqual(usage, {
    balance: [
      { amount: 88, unit: "CNY", label: "Available balance" },
      { amount: 68, unit: "CNY", label: "Cash" },
      { amount: 20, unit: "CNY", label: "Voucher" },
    ],
  });
});

test("extractMoonshotBalance: exhausted balance warns", () => {
  const usage = extractMoonshotBalance({ data: { available_balance: 0 } }, "USD");
  assert.deepEqual(usage, {
    balance: [{ amount: 0, unit: "USD", label: "Available balance" }],
    warning: "Balance exhausted; inference requests may be rejected",
  });
});

test("extractMoonshotBalance: accepts unwrapped payloads; null without available_balance", () => {
  assert.deepEqual(extractMoonshotBalance({ available_balance: 5 }, "USD"), {
    balance: [{ amount: 5, unit: "USD", label: "Available balance" }],
  });
  assert.equal(extractMoonshotBalance({ data: {} }, "USD"), null);
  assert.equal(extractMoonshotBalance(null, "CNY"), null);
});

test("moonshotAdapter/moonshotCnAdapter: regional endpoints, currency, and 401", async () => {
  const body = { data: { available_balance: 12.5, cash_balance: 10, voucher_balance: 2.5 } };

  let calls: string[] = [];
  let attempt = await moonshotAdapter.fetch(
    "mk-test",
    makeCtx("moonshotai", fakeFetch(calls, () => ({ ok: true, status: 200, body }))),
  );
  assert.equal(calls[0], "https://api.moonshot.ai/v1/users/me/balance");
  assert.deepEqual(attempt.usage, {
    balance: [
      { amount: 12.5, unit: "USD", label: "Available balance" },
      { amount: 10, unit: "USD", label: "Cash" },
      { amount: 2.5, unit: "USD", label: "Voucher" },
    ],
  });

  calls = [];
  attempt = await moonshotCnAdapter.fetch(
    "mk-cn-test",
    makeCtx("moonshotai-cn", fakeFetch(calls, () => ({ ok: true, status: 200, body }))),
  );
  assert.equal(calls[0], "https://api.moonshot.cn/v1/users/me/balance");
  assert.deepEqual(attempt.usage, {
    balance: [
      { amount: 12.5, unit: "CNY", label: "Available balance" },
      { amount: 10, unit: "CNY", label: "Cash" },
      { amount: 2.5, unit: "CNY", label: "Voucher" },
    ],
  });

  for (const [id, adapter] of [["moonshotai", moonshotAdapter], ["moonshotai-cn", moonshotCnAdapter]] as const) {
    calls = [];
    attempt = await adapter.fetch("bad", makeCtx(id, fakeFetch(calls, () => ({ ok: false, status: 401 }))));
    assert.deepEqual(attempt, { usage: { error: "HTTP 401" }, status: 401 });
  }
});

// --- baseten -----------------------------------------------------------------

test("extractBasetenUsage: sums credits across usage sections", () => {
  const usage = extractBasetenUsage({
    dedicated_usage: { credits_used: 100 },
    training_usage: { credits_used: 50.5 },
    model_apis_usage: { credits_used: 49.5 },
  });
  assert.deepEqual(usage, {
    spend: { unit: "credits", monthly: 200 },
    notice: "Credits used this month",
  });
});

test("extractBasetenUsage: null without any credits_used", () => {
  assert.equal(extractBasetenUsage({}), null);
  assert.equal(extractBasetenUsage({ dedicated_usage: {} }), null);
});

test("basetenAdapter: query string carries the month range from ctx.nowMs", async () => {
  const nowMs = Date.parse("2026-03-15T12:34:56.789Z");
  const calls: string[] = [];
  const attempt = await basetenAdapter.fetch(
    "bt-test",
    makeCtx("baseten", fakeFetch(calls, () => ({
      ok: true,
      status: 200,
      body: {
        dedicated_usage: { credits_used: 100 },
        training_usage: { credits_used: 50.5 },
        model_apis_usage: { credits_used: 49.5 },
      },
    })), nowMs),
  );
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.origin, "https://api.baseten.co");
  assert.equal(url.pathname, "/v1/billing/usage_summary");
  assert.equal(url.searchParams.get("start_date"), "2026-03-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("end_date"), "2026-03-15T12:34:56.789Z");
  assert.deepEqual(attempt.usage, {
    spend: { unit: "credits", monthly: 200 },
    notice: "Credits used this month",
  });
});

test("basetenAdapter: HTTP 401 propagates with status", async () => {
  const attempt = await basetenAdapter.fetch(
    "bt-bad",
    makeCtx("baseten", fakeFetch([], () => ({ ok: false, status: 401 }))),
  );
  assert.deepEqual(attempt, { usage: { error: "HTTP 401" }, status: 401 });
});
