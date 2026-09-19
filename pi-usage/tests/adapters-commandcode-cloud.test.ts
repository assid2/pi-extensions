import assert from "node:assert/strict";

// Run under both the repo's `node --test` runner and the Vitest runner used by CI harnesses.
const isVitest = process.env.VITEST === "true" || process.env.VITEST_WORKER_ID !== undefined;
const { test } = (await import(isVitest ? "vitest" : "node:test")) as {
  test: (name: string, fn: () => unknown) => unknown;
};
import {
  COMMAND_CODE_CLI_VERSION,
  commandCodeCloudAdapter,
  parseCommandCodeUsage,
  pickCurrentPeriodStart,
  pickOrgId,
  sanitizeApiKey,
  zdr,
} from "../extensions/usage/adapters/commandcode-cloud.ts";
import { resolveAdapter } from "../extensions/usage/adapters/index.ts";
import type { FetchLike, FetchResponseLike } from "../extensions/usage/adapters/types.ts";

function jsonResponse(payload: unknown, status = 200): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  };
}

interface Route {
  status?: number;
  payload: unknown;
}

interface RequestLogEntry {
  url: string;
  headers: Record<string, string>;
}

/** URL-routed fake fetch that records every request (network-free). */
function routedFetch(routes: Array<[needle: string, route: Route]>): { fetchFn: FetchLike; log: RequestLogEntry[] } {
  const log: RequestLogEntry[] = [];
  const fetchFn: FetchLike = async (input: string, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers as Record<string, string> | undefined;
    for (const [key, value] of Object.entries(rawHeaders ?? {})) headers[key] = value;
    log.push({ url: input, headers });
    for (const [needle, route] of routes) {
      if (input.includes(needle)) return jsonResponse(route.payload, route.status ?? 200);
    }
    return jsonResponse({ error: "unrouted" }, 404);
  };
  return { fetchFn, log };
}

// ---- fixtures -------------------------------------------------------------

const WHOAMI = {
  success: true,
  user: { id: "u_1", name: "Ada", userName: "ada" },
  org: { id: "org_123", login: "acme" },
  // slash-containing model ids must survive the org-limits notice path
  orgLimits: [{ scope: "model", model: "deepseek/deepseek-v4.1-flash", spent: 1, limit: 5, exceeded: false }],
};

const CREDITS = {
  credits: { monthlyCredits: 12.0, purchasedCredits: 3.0, freeCredits: 1.0, planId: "individual-provider" },
  windowLimits: {
    limited: false,
    exceeded: null,
    fiveHour: { used: 2.25, cap: 3, exceeded: false, resetAt: 1786091731770 },
    weekly: { used: 3, cap: 12, exceeded: false, resetAt: 1786603898869 },
  },
};

const SUBSCRIPTION = {
  success: true,
  data: {
    planId: "individual-provider",
    status: "active",
    currentPeriodStart: "2026-09-01T00:00:00.000Z",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  },
};

const SUMMARY = { totalCount: 100, totalCost: 4.0, totalCredits: 4.0, successRate: 100, periodBasis: "billing-period" };

function happyRoutes(): Array<[string, Route]> {
  return [
    ["/alpha/whoami", { payload: WHOAMI }],
    ["/alpha/billing/credits", { payload: CREDITS }],
    ["/alpha/billing/subscriptions", { payload: SUBSCRIPTION }],
    ["/alpha/usage/summary", { payload: SUMMARY }],
  ];
}

// ---- pure parser ----------------------------------------------------------

test("parseCommandCodeUsage: lanes, balances, spend and ISO resets", () => {
  const usage = parseCommandCodeUsage({ whoami: WHOAMI, credits: CREDITS, subscription: SUBSCRIPTION, summary: SUMMARY });
  assert.ok(usage);

  assert.deepEqual(usage.lanes?.map((lane) => [lane.label, lane.percent]), [
    ["5h", 75],
    ["Weekly", 25],
    ["Monthly", 25],
  ]);
  assert.equal(usage.lanes?.[0]?.resetsAt, new Date(1786091731770).toISOString());
  assert.equal(usage.lanes?.[1]?.resetsAt, new Date(1786603898869).toISOString());
  assert.equal(usage.lanes?.[2]?.resetsAt, "2026-10-01T00:00:00.000Z");

  assert.deepEqual(usage.balance, [
    { amount: 12, unit: "usd", label: "Monthly credits remaining" },
    { amount: 3, unit: "usd", label: "Purchased credits" },
    { amount: 1, unit: "usd", label: "Free credits" },
  ]);
  assert.equal(usage.spend?.monthly, 4);
  assert.equal(usage.spend?.unit, "usd");
});

test("parseCommandCodeUsage: resetAt<=0 is omitted; 0/0 window is skipped", () => {
  const usage = parseCommandCodeUsage({
    credits: {
      credits: {},
      windowLimits: {
        fiveHour: { used: 1, cap: 2, exceeded: false, resetAt: 0 },
        weekly: { used: 0, cap: 0, exceeded: false, resetAt: 1786603898869 },
      },
    },
  });
  assert.ok(usage);
  assert.deepEqual(usage.lanes?.map((lane) => lane.label), ["5h"]);
  assert.equal(usage.lanes?.[0]?.resetsAt, undefined);
});

test("parseCommandCodeUsage: Provider plan (no windowLimits) => Monthly only", () => {
  const credits = {
    credits: { monthlyCredits: 12.0, planId: "individual-provider" },
    // no windowLimits at all
  };
  const usage = parseCommandCodeUsage({ credits, subscription: SUBSCRIPTION, summary: { totalCredits: 3 } });
  assert.ok(usage);
  assert.deepEqual(usage.lanes?.map((lane) => lane.label), ["Monthly"]);
  assert.equal(usage.lanes?.[0]?.percent, 20); // 3 / (3 + 12)
});

test("parseCommandCodeUsage: exceeded windows produce a notice", () => {
  const usage = parseCommandCodeUsage({
    credits: {
      credits: {},
      windowLimits: {
        limited: true,
        exceeded: "weekly",
        fiveHour: { used: 1, cap: 2, exceeded: false, resetAt: 0 },
        weekly: { used: 12, cap: 12, exceeded: true, resetAt: 1786603898869 },
      },
    },
  });
  assert.ok(usage);
  assert.equal(usage.lanes?.find((lane) => lane.label === "Weekly")?.percent, 100);
  assert.equal(usage.notice, "weekly limit reached");
});

test("parseCommandCodeUsage: garbage returns null", () => {
  assert.equal(parseCommandCodeUsage({}), null);
  assert.equal(parseCommandCodeUsage({ credits: { nope: true }, summary: { totalCost: "abc" } }), null);
  assert.equal(parseCommandCodeUsage({ whoami: WHOAMI }), null);
});

// ---- pickers / helpers ----------------------------------------------------

test("pickOrgId / pickCurrentPeriodStart are tolerant", () => {
  assert.equal(pickOrgId(WHOAMI), "org_123");
  assert.equal(pickOrgId({ org: "org_plain" }), "org_plain");
  assert.equal(pickOrgId({ org: null, orgId: "org_top" }), "org_top");
  assert.equal(pickOrgId({ org: null }), undefined);
  assert.equal(pickCurrentPeriodStart(SUBSCRIPTION), "2026-09-01T00:00:00.000Z");
  assert.equal(pickCurrentPeriodStart({ currentPeriodStart: "2026-01-01T00:00:00.000Z" }), "2026-01-01T00:00:00.000Z");
  assert.equal(pickCurrentPeriodStart({}), undefined);
});

test("sanitizeApiKey strips paste markers/control chars and rejects the placeholder", () => {
  assert.equal(sanitizeApiKey("\u001b[200~user_abc123\u001b[201~"), "user_abc123");
  assert.equal(sanitizeApiKey("  user_key \n"), "user_key");
  assert.equal(sanitizeApiKey("$COMMAND_CODE_API_KEY"), null);
  assert.equal(sanitizeApiKey(""), null);
  assert.equal(sanitizeApiKey(undefined), null);
});

test("zdr reads CMD_ZDR / COMMANDCODE_ZDR", () => {
  assert.equal(zdr({} as NodeJS.ProcessEnv), false);
  assert.equal(zdr({ CMD_ZDR: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(zdr({ COMMANDCODE_ZDR: "true" } as NodeJS.ProcessEnv), true);
  assert.equal(zdr({ CMD_ZDR: "0" } as NodeJS.ProcessEnv), false);
});

// ---- adapter --------------------------------------------------------------

test("commandCodeCloudAdapter: multi-request flow, orgId/since, headers", async () => {
  const { fetchFn, log } = routedFetch(happyRoutes());
  const attempt = await commandCodeCloudAdapter.fetch("user_secret_key", {
    providerId: "commandcode-cloud",
    env: { CMD_ZDR: "1" } as NodeJS.ProcessEnv,
    fetchFn,
  });

  assert.equal(attempt.status, 200);
  assert.equal(attempt.usage.error, undefined);
  assert.deepEqual(attempt.usage.lanes?.map((lane) => [lane.label, lane.percent]), [
    ["5h", 75],
    ["Weekly", 25],
    ["Monthly", 25],
  ]);

  // whoami -> credits + subscriptions (parallel) -> summary
  assert.equal(log[0]?.url.includes("/alpha/whoami?limits=1"), true);
  assert.equal(log[1]?.url.includes("/alpha/billing/credits?orgId=org_123"), true);
  assert.equal(log[2]?.url.includes("/alpha/billing/subscriptions?orgId=org_123"), true);
  assert.equal(log[3]?.url.includes("/alpha/usage/summary?orgId=org_123&since="), true);

  const headers = log[0]?.headers ?? {};
  assert.equal(headers["x-command-code-version"], COMMAND_CODE_CLI_VERSION);
  assert.equal(headers["x-cli-environment"], "production");
  assert.equal(headers["x-cmd-zdr"], "1");
  assert.equal(headers["Authorization"], "Bearer user_secret_key");
  assert.equal(headers["Accept"], "application/json");
});

test("commandCodeCloudAdapter: omits orgId when whoami.org is null", async () => {
  const { fetchFn, log } = routedFetch([
    ["/alpha/whoami", { payload: { success: true, user: { id: "u_1" }, org: null } }],
    ["/alpha/billing/credits", { payload: CREDITS }],
    ["/alpha/billing/subscriptions", { payload: SUBSCRIPTION }],
    ["/alpha/usage/summary", { payload: SUMMARY }],
  ]);
  const attempt = await commandCodeCloudAdapter.fetch("user_key", {
    providerId: "commandcode-cloud",
    env: {} as NodeJS.ProcessEnv,
    fetchFn,
  });
  assert.ok(attempt.usage.lanes);
  assert.equal(log[1]?.url.includes("orgId"), false);
  assert.equal(log[3]?.url.includes("since="), true);
});

test("commandCodeCloudAdapter: 401 on whoami => error with status 401", async () => {
  const { fetchFn } = routedFetch([["/alpha/whoami", { status: 401, payload: { success: false } }]]);
  const attempt = await commandCodeCloudAdapter.fetch("user_bad", {
    providerId: "commandcode-cloud",
    env: {} as NodeJS.ProcessEnv,
    fetchFn,
  });
  assert.equal(attempt.status, 401);
  assert.equal(attempt.usage.error, "HTTP 401");
});

test("commandCodeCloudAdapter: placeholder/empty key never hits the network", async () => {
  const { fetchFn, log } = routedFetch(happyRoutes());
  const attempt = await commandCodeCloudAdapter.fetch("$COMMAND_CODE_API_KEY", {
    providerId: "commandcode-cloud",
    env: {} as NodeJS.ProcessEnv,
    fetchFn,
  });
  assert.equal(attempt.usage.error, "missing Command Code API key");
  assert.equal(log.length, 0);
});

test("commandCodeCloudAdapter: garbage payloads => error, never throws", async () => {
  const { fetchFn } = routedFetch([
    ["/alpha/whoami", { payload: { success: true, org: null } }],
    ["/alpha/billing/credits", { payload: { nope: true } }],
    ["/alpha/billing/subscriptions", { payload: {} }],
    ["/alpha/usage/summary", { payload: {} }],
  ]);
  const attempt = await commandCodeCloudAdapter.fetch("user_key", {
    providerId: "commandcode-cloud",
    env: {} as NodeJS.ProcessEnv,
    fetchFn,
  });
  assert.ok(attempt.usage.error);
  assert.equal(attempt.usage.lanes, undefined);
});

test("commandCodeCloudAdapter: honors PI_COMMANDCODE_USAGE_ENDPOINT", async () => {
  const { fetchFn, log } = routedFetch(happyRoutes());
  await commandCodeCloudAdapter.fetch("user_key", {
    providerId: "commandcode-cloud",
    env: { PI_COMMANDCODE_USAGE_ENDPOINT: "https://example.test" } as NodeJS.ProcessEnv,
    fetchFn,
  });
  assert.equal(log[0]?.url.startsWith("https://example.test/alpha/whoami"), true);
});

test('resolveAdapter("commandcode-cloud") returns the specialized adapter', () => {
  const adapter = resolveAdapter("commandcode-cloud", { adapters: {} } as never);
  assert.equal(adapter.id, "commandcode-cloud");
});
