/**
 * Tests for the ZAI / Kimi / MiniMax usage adapters (ported from
 * @hk_net/pi-usage-bars, MIT). The pure parsers are exercised with fixture
 * payloads modeled on the source shapes; fetch() runs against an injected
 * fake fetchFn — no real network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractZaiUsageFromPayload,
  zaiAdapter,
  zaiCnAdapter,
} from "../extensions/usage/adapters/zai.ts";
import {
  extractKimiUsageFromPayload,
  kimiAdapter,
} from "../extensions/usage/adapters/kimi.ts";
import {
  extractMiniMaxUsageFromPayload,
  minimaxAdapter,
  minimaxCnAdapter,
} from "../extensions/usage/adapters/minimax.ts";
import type { AdapterContext, FetchLike } from "../extensions/usage/adapters/types.ts";

const NOW_MS = Date.UTC(2025, 5, 10, 12, 0, 0); // 2025-06-10T12:00:00.000Z
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return { providerId: "test", env: {}, nowMs: NOW_MS, ...overrides };
}

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function headersOf(call: RecordedCall | undefined): Record<string, string> | undefined {
  return call?.init?.headers as Record<string, string> | undefined;
}

/** Fake fetchFn returning one canned response (per the dispatch spec shape). */
function fakeFetch(body: unknown, status = 200): { fetchFn: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status < 400,
      status,
      headers: { get: () => null },
      json: async () => body,
    };
  };
  return { fetchFn, calls };
}

/** Fake fetchFn serving one response per call (last one repeats). */
function fakeFetchQueue(
  entries: Array<{ body: unknown; status?: number }>,
): { fetchFn: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const entry = entries[Math.min(i, entries.length - 1)];
    i += 1;
    const status = entry.status ?? 200;
    return {
      ok: status < 400,
      status,
      headers: { get: () => null },
      json: async () => entry.body,
    };
  };
  return { fetchFn, calls };
}

// ---------------------------------------------------------------- ZAI

const zaiFixture = {
  code: 0,
  message: "success",
  data: {
    limits: [
      { type: "TOKENS_LIMIT", unit: 3, percentage: 42.5, nextResetTime: NOW_MS + 3 * HOUR_MS },
      { type: "TOKENS_LIMIT", unit: 6, percentage: 70.25, nextResetTime: NOW_MS + 5 * DAY_MS },
      { type: "REQUEST_LIMIT", unit: 3, percentage: 90 }, // other types are ignored
    ],
  },
};

const zaiExpectedLanes = [
  { label: "5h", percent: 42.5, resetsAt: new Date(NOW_MS + 3 * HOUR_MS).toISOString() },
  { label: "Weekly", percent: 70.25, resetsAt: new Date(NOW_MS + 5 * DAY_MS).toISOString() },
];

test("extractZaiUsageFromPayload maps unit 3/6 TOKENS_LIMIT to 5h/Weekly lanes", () => {
  assert.deepEqual(extractZaiUsageFromPayload(zaiFixture), { lanes: zaiExpectedLanes });
});

test("extractZaiUsageFromPayload accepts CREDIT_LIMIT entries and 0-1 fractions", () => {
  const usage = extractZaiUsageFromPayload({
    data: {
      limits: [
        { type: "CREDIT_LIMIT", unit: 3, percentage: 0.5, nextResetTime: NOW_MS + HOUR_MS },
        { type: "CREDIT_LIMIT", unit: 6, percentage: 0.25, nextResetTime: NOW_MS + 7 * DAY_MS },
      ],
    },
  });
  assert.deepEqual(usage, {
    lanes: [
      { label: "5h", percent: 50, resetsAt: new Date(NOW_MS + HOUR_MS).toISOString() },
      { label: "Weekly", percent: 25, resetsAt: new Date(NOW_MS + 7 * DAY_MS).toISOString() },
    ],
  });
});

test("extractZaiUsageFromPayload returns null for unrecognized shapes", () => {
  assert.equal(extractZaiUsageFromPayload(null), null);
  assert.equal(extractZaiUsageFromPayload({}), null);
  assert.equal(extractZaiUsageFromPayload({ data: { limits: [] } }), null);
  // weekly window missing
  assert.equal(
    extractZaiUsageFromPayload({ data: { limits: [{ type: "TOKENS_LIMIT", unit: 3, percentage: 10 }] } }),
    null,
  );
  // percentage out of range
  assert.equal(
    extractZaiUsageFromPayload({
      data: {
        limits: [
          { type: "TOKENS_LIMIT", unit: 3, percentage: 150 },
          { type: "TOKENS_LIMIT", unit: 6, percentage: 10 },
        ],
      },
    }),
    null,
  );
  // wrong limit type
  assert.equal(
    extractZaiUsageFromPayload({
      data: {
        limits: [
          { type: "REQUEST_LIMIT", unit: 3, percentage: 10 },
          { type: "REQUEST_LIMIT", unit: 6, percentage: 20 },
        ],
      },
    }),
    null,
  );
});

test("zaiAdapter.fetch resolves the default endpoint, sends the bearer token, maps lanes", async () => {
  const { fetchFn, calls } = fakeFetch(zaiFixture);
  const attempt = await zaiAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.z.ai/api/monitor/usage/quota/limit");
  assert.equal(headersOf(calls[0])?.Authorization, "Bearer tok");
  assert.deepEqual(attempt.usage, { lanes: zaiExpectedLanes });
});

test("zaiCnAdapter.fetch uses the CN endpoint by default and the env override", async () => {
  const { fetchFn, calls } = fakeFetch(zaiFixture);
  await zaiCnAdapter.fetch("tok", makeCtx({ fetchFn, env: { PI_ZAI_CODING_CN_USAGE_ENDPOINT: "https://override.example/z" } }));
  assert.equal(calls[0].url, "https://override.example/z");

  const plain = fakeFetch(zaiFixture);
  const attempt = await zaiCnAdapter.fetch("tok", makeCtx({ fetchFn: plain.fetchFn }));
  assert.equal(plain.calls[0].url, "https://open.bigmodel.cn/api/monitor/usage/quota/limit");
  assert.deepEqual(attempt.usage, { lanes: zaiExpectedLanes });
});

test("zaiAdapter.fetch maps HTTP 401 to an error usage", async () => {
  const { fetchFn } = fakeFetch(undefined, 401);
  const attempt = await zaiAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.deepEqual(attempt.usage, { error: "HTTP 401" });
});

test("zaiCnAdapter.fetch maps HTTP 401 to an error usage", async () => {
  const { fetchFn } = fakeFetch(undefined, 401);
  const attempt = await zaiCnAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.deepEqual(attempt.usage, { error: "HTTP 401" });
});

test("zaiAdapter.fetch reports unrecognized response shape", async () => {
  const { fetchFn } = fakeFetch({ data: { limits: [{ type: "REQUEST_LIMIT", unit: 3 }] } });
  const attempt = await zaiAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.deepEqual(attempt.usage, { error: "unrecognized response shape" });
});

// ---------------------------------------------------------------- Kimi

const kimiFixture = {
  usages: [
    { scope: "FEATURE_WEB", usage: { used: 1, limit: 2 } }, // other feature, ignored
    {
      scope: "FEATURE_CODING",
      usage: {
        used: 1234,
        limit: 2000,
        remaining_percent: 38.7,
        resetTime: "2025-06-17T12:00:00Z",
      },
      limits: [
        {
          window: { duration: 300, timeUnit: "MINUTE" },
          detail: {
            used: 400,
            limit: 1000,
            remaining_percent: 60.25,
            resetTime: "2025-06-10T17:00:00Z",
          },
        },
      ],
    },
  ],
};

const kimiExpectedLanes = [
  { label: "5-hour", percent: 39.75, resetsAt: "2025-06-10T17:00:00Z" },
  { label: "Weekly", percent: 61.3, resetsAt: "2025-06-17T12:00:00Z" },
];

test("extractKimiUsageFromPayload maps 5-hour/Weekly windows from usages[]", () => {
  assert.deepEqual(extractKimiUsageFromPayload(kimiFixture), { lanes: kimiExpectedLanes });
});

test("extractKimiUsageFromPayload handles data-row payloads without usages/limits", () => {
  const usage = extractKimiUsageFromPayload({
    usage: { remaining_percent: 50, resetTime: "2025-06-17T12:00:00Z" },
    data: [
      { model_name: "kimi-k2-turbo", used: 200, limit: 400, resetTime: "2025-06-10T17:00:00Z" },
      { model_name: "all", used: 800, limit: 1600, resetTime: "2025-06-17T12:00:00Z" },
    ],
  });
  assert.deepEqual(usage, {
    lanes: [
      { label: "5-hour", percent: 50, resetsAt: "2025-06-10T17:00:00Z" },
      { label: "Weekly", percent: 50, resetsAt: "2025-06-17T12:00:00Z" },
    ],
  });
});

test("extractKimiUsageFromPayload returns null for unrecognized shapes", () => {
  assert.equal(extractKimiUsageFromPayload(null), null);
  assert.equal(extractKimiUsageFromPayload({}), null);
  assert.equal(extractKimiUsageFromPayload({ usages: [{ scope: "FEATURE_WEB", usage: { used: 1 } }] }), null);
  assert.equal(extractKimiUsageFromPayload({ usages: [] }), null);
});

test("kimiAdapter.fetch calls the default endpoint with the KimiCLI User-Agent", async () => {
  const { fetchFn, calls } = fakeFetch(kimiFixture);
  const attempt = await kimiAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.equal(calls[0].url, "https://api.kimi.com/coding/v1/usages");
  assert.equal(headersOf(calls[0])?.Authorization, "Bearer tok");
  assert.equal(headersOf(calls[0])?.["User-Agent"], "KimiCLI/1.5");
  assert.deepEqual(attempt.usage, { lanes: kimiExpectedLanes });
});

test("kimiAdapter.fetch honors the PI_KIMI_USAGE_ENDPOINT override (trimmed)", async () => {
  const { fetchFn, calls } = fakeFetch(kimiFixture);
  await kimiAdapter.fetch("tok", makeCtx({ fetchFn, env: { PI_KIMI_USAGE_ENDPOINT: " https://override.example/u " } }));
  assert.equal(calls[0].url, "https://override.example/u");
});

test("kimiAdapter.fetch maps HTTP 401 to an error usage", async () => {
  const { fetchFn } = fakeFetch(undefined, 401);
  const attempt = await kimiAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.deepEqual(attempt.usage, { error: "HTTP 401" });
});

test("kimiAdapter.fetch reports unrecognized response shape", async () => {
  const { fetchFn } = fakeFetch({ usages: [{ scope: "FEATURE_WEB" }] });
  const attempt = await kimiAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.deepEqual(attempt.usage, { error: "unrecognized response shape" });
});

// ---------------------------------------------------------------- MiniMax

const minimaxServicesFixture = {
  data: {
    services: [
      { window_type: "interval", percent: 45.5, resets_at: "2025-06-10T17:00:00Z" },
      { window_type: "weekly", percent: 72.1, resets_at: "2025-06-17T17:00:00Z" },
    ],
    points_balance: 123.45,
  },
};

const minimaxServicesExpected = {
  lanes: [
    { label: "Interval", percent: 45.5, resetsAt: "2025-06-10T17:00:00Z" },
    { label: "Weekly", percent: 72.1, resetsAt: "2025-06-17T17:00:00Z" },
  ],
  balance: [{ amount: 123.45, unit: "credits", label: "Credit balance" }],
};

test("extractMiniMaxUsageFromPayload maps services[] windows and credit balance", () => {
  assert.deepEqual(extractMiniMaxUsageFromPayload(minimaxServicesFixture, NOW_MS), minimaxServicesExpected);
});

test("extractMiniMaxUsageFromPayload maps model_remains[] percent/count windows", () => {
  const usage = extractMiniMaxUsageFromPayload({
    data: {
      model_remains: [
        {
          model: "MiniMax-M2",
          current_interval_remaining_percent: 40,
          current_interval_total_count: 1000,
          current_interval_usage_count: 600,
          current_interval_status: 1,
          current_weekly_remaining_percent: 55.5,
          current_weekly_total_count: 5000,
          current_weekly_usage_count: 2225,
          current_weekly_status: 1,
          weekly_end_time: NOW_MS + 3 * DAY_MS,
        },
      ],
    },
  }, NOW_MS);
  assert.deepEqual(usage, {
    lanes: [
      { label: "Interval", percent: 60 },
      { label: "Weekly", percent: 44.5, resetsAt: new Date(NOW_MS + 3 * DAY_MS).toISOString() },
    ],
  });
});

test("extractMiniMaxUsageFromPayload derives resetsAt from remains_time (seconds)", () => {
  const usage = extractMiniMaxUsageFromPayload({
    data: {
      model_remains: [
        {
          current_interval_remaining_percent: 25,
          current_interval_status: 1,
          remains_time: 3600,
        },
      ],
    },
  }, NOW_MS);
  assert.deepEqual(usage, {
    lanes: [{ label: "Interval", percent: 75, resetsAt: new Date(NOW_MS + 3_600_000).toISOString() }],
  });
});

test("extractMiniMaxUsageFromPayload drops unavailable windows (status 3, 100% remaining, zero counts)", () => {
  const row = {
    current_interval_status: 3,
    current_interval_remaining_percent: 100,
    current_interval_total_count: 0,
    current_interval_usage_count: 0,
    current_weekly_status: 1,
    current_weekly_remaining_percent: 50,
    current_weekly_total_count: 100,
    current_weekly_usage_count: 50,
  };
  // No interval window survives -> balance-only usage when a balance exists...
  assert.deepEqual(
    extractMiniMaxUsageFromPayload({ data: { model_remains: [row], points_balance: 5 } }, NOW_MS),
    { balance: [{ amount: 5, unit: "credits", label: "Credit balance" }] },
  );
  // ...and null when there is no balance either.
  assert.equal(extractMiniMaxUsageFromPayload({ data: { model_remains: [row] } }, NOW_MS), null);
});

test("extractMiniMaxUsageFromPayload returns null for base_resp error payloads", () => {
  assert.equal(
    extractMiniMaxUsageFromPayload({ data: { base_resp: { status_code: 1004, status_msg: "invalid api key" } } }, NOW_MS),
    null,
  );
});

test("minimaxAdapter.fetch maps services windows and credit balance", async () => {
  const { fetchFn, calls } = fakeFetchQueue([{ body: minimaxServicesFixture }]);
  const attempt = await minimaxAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.minimax.io/v1/token_plan/remains");
  assert.deepEqual(attempt.usage, minimaxServicesExpected);
});

test("minimaxAdapter.fetch falls back to the legacy endpoint", async () => {
  const { fetchFn, calls } = fakeFetchQueue([
    { body: undefined, status: 404 },
    { body: minimaxServicesFixture },
  ]);
  const attempt = await minimaxAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.minimax.io/v1/token_plan/remains");
  assert.equal(calls[1].url, "https://api.minimax.io/v1/api/openplatform/coding_plan/remains");
  assert.deepEqual(attempt.usage, minimaxServicesExpected);
});

test("minimaxAdapter.fetch extracts base_resp errors", async () => {
  const errorBody = { data: { base_resp: { status_code: 1004, status_msg: "invalid api key" } } };
  const { fetchFn, calls } = fakeFetchQueue([
    { body: errorBody },
    { body: errorBody },
  ]);
  const attempt = await minimaxAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.equal(calls.length, 2);
  assert.deepEqual(attempt.usage, { error: "API 1004: invalid api key" });
});

test("minimaxAdapter.fetch reports the no-active-token-plan notice (2062)", async () => {
  const body = { data: { base_resp: { status_code: 2062, status_msg: "no active token plan" } } };
  const { fetchFn } = fakeFetch(body);
  const attempt = await minimaxAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.deepEqual(attempt.usage, {
    notice: "No active Token Plan · check Credit balance in the MiniMax console",
  });
});

test("minimaxAdapter.fetch maps HTTP 401 to an error usage", async () => {
  const { fetchFn, calls } = fakeFetchQueue([
    { body: undefined, status: 401 },
    { body: undefined, status: 401 },
  ]);
  const attempt = await minimaxAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.equal(calls.length, 2);
  assert.deepEqual(attempt.usage, { error: "HTTP 401" });
});

test("minimaxCnAdapter.fetch uses the CN endpoints by default and the env override", async () => {
  const { fetchFn, calls } = fakeFetchQueue([
    { body: undefined, status: 404 },
    { body: minimaxServicesFixture },
  ]);
  const attempt = await minimaxCnAdapter.fetch(
    "tok",
    makeCtx({ fetchFn, env: { PI_MINIMAX_CN_USAGE_ENDPOINT: " https://cn.example/m " } }),
  );
  assert.equal(calls[0].url, "https://cn.example/m");
  assert.equal(calls[1].url, "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains");
  assert.deepEqual(attempt.usage, minimaxServicesExpected);

  const plain = fakeFetchQueue([{ body: minimaxServicesFixture }]);
  await minimaxCnAdapter.fetch("tok", makeCtx({ fetchFn: plain.fetchFn }));
  assert.equal(plain.calls[0].url, "https://api.minimaxi.com/v1/token_plan/remains");
});

test("minimaxCnAdapter.fetch maps HTTP 401 to an error usage", async () => {
  const { fetchFn } = fakeFetchQueue([
    { body: undefined, status: 401 },
    { body: undefined, status: 401 },
  ]);
  const attempt = await minimaxCnAdapter.fetch("tok", makeCtx({ fetchFn }));
  assert.deepEqual(attempt.usage, { error: "HTTP 401" });
});
