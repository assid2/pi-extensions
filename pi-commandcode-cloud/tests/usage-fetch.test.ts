/**
 * Usage fetch tests (plan §8 `usage-fetch.test.ts`, §6.1/§6.2).
 *
 * Pins: request order and URLs (`orgId`, `since`), the header set, ZDR,
 * per-endpoint degradation, the all-404 plan classification, 401 mapping,
 * the no-key guard, timeouts and secret redaction. All network I/O is injected.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchCommandCodeUsage } from "../usage.ts";
import { type FakeRoute, loadFixture, routedFetch } from "./helpers.ts";

const BASE = "https://usage.test";
const KEY = "user_test_redacted_key";
const WHOAMI = loadFixture("whoami.json");
const CREDITS = loadFixture("credits.json");
const SUBSCRIPTIONS = loadFixture("subscriptions.json");
const SUMMARY = loadFixture("summary.json");

function happyRoutes(): Array<[string, FakeRoute]> {
  return [
    ["/alpha/whoami", { body: WHOAMI }],
    ["/alpha/billing/credits", { body: CREDITS }],
    ["/alpha/billing/subscriptions", { body: SUBSCRIPTIONS }],
    ["/alpha/usage/summary", { body: SUMMARY }],
  ];
}

test("fetchCommandCodeUsage: request order, URLs (orgId + since) and headers", async () => {
  const fake = routedFetch(happyRoutes());
  const usage = await fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE, nowMs: 1_000 });

  assert.deepEqual(
    fake.requests.map((request) => request.url),
    [
      `${BASE}/alpha/whoami?limits=1`,
      `${BASE}/alpha/billing/credits?orgId=org_RedactedOrg01`,
      `${BASE}/alpha/billing/subscriptions?orgId=org_RedactedOrg01`,
      `${BASE}/alpha/usage/summary?orgId=org_RedactedOrg01&since=2026-09-01T00%3A00%3A00.000Z`,
    ],
  );

  for (const request of fake.requests) {
    assert.equal(request.headers.authorization, `Bearer ${KEY}`);
    assert.equal(request.headers.accept, "application/json");
    assert.equal(request.headers["x-command-code-version"], "1.58.0");
    assert.equal(request.headers["x-cli-environment"], "production");
    assert.ok(request.headers["user-agent"]?.startsWith("pi-commandcode-cloud/"));
    assert.equal(request.headers["x-cmd-zdr"], undefined);
  }

  assert.equal(usage.fetchedAt, 1_000);
  assert.equal(usage.available.credits, true);
});

test("fetchCommandCodeUsage: a null org omits orgId (but still sends since)", async () => {
  const fake = routedFetch([
    ["/alpha/whoami", { body: { success: true, user: { id: "u_1" }, org: null } }],
    ["/alpha/billing/credits", { body: CREDITS }],
    ["/alpha/billing/subscriptions", { body: SUBSCRIPTIONS }],
    ["/alpha/usage/summary", { body: SUMMARY }],
  ]);
  await fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE });
  const urls = fake.requests.map((request) => request.url);
  assert.equal(urls[1], `${BASE}/alpha/billing/credits`);
  assert.equal(urls[2], `${BASE}/alpha/billing/subscriptions`);
  assert.equal(urls[3], `${BASE}/alpha/usage/summary?since=2026-09-01T00%3A00%3A00.000Z`);
});

test("fetchCommandCodeUsage: ZDR env adds x-cmd-zdr on every request", async () => {
  const fake = routedFetch(happyRoutes());
  await fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: { CMD_ZDR: "1" }, baseUrl: BASE });
  assert.ok(fake.requests.length > 0);
  for (const request of fake.requests) {
    assert.equal(request.headers["x-cmd-zdr"], "1");
  }
});

test("fetchCommandCodeUsage: the endpoint override env var is honored", async () => {
  const fake = routedFetch(happyRoutes());
  await fetchCommandCodeUsage(KEY, {
    fetchFn: fake.fetchFn,
    env: { PI_COMMANDCODE_USAGE_ENDPOINT: "https://override.test" },
  });
  assert.ok(fake.requests.every((request) => request.url.startsWith("https://override.test/alpha/")));
});

test("fetchCommandCodeUsage: a failing credits section degrades instead of blanking the line", async () => {
  const fake = routedFetch([
    ["/alpha/whoami", { body: WHOAMI }],
    ["/alpha/billing/credits", { status: 500, body: { error: "upstream down" } }],
    ["/alpha/billing/subscriptions", { body: SUBSCRIPTIONS }],
    ["/alpha/usage/summary", { body: SUMMARY }],
  ]);
  const usage = await fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE });

  assert.deepEqual(usage.available, { whoami: true, credits: false, subscriptions: true, summary: true });
  // No rolling windows without credits; Monthly still derives from the plan nominal.
  assert.deepEqual(
    usage.lanes.map((lane) => lane.label),
    ["Monthly"],
  );
  assert.equal(usage.lanes[0]?.estimated, true);
  assert.equal(usage.lanes[0]?.cap, 15);
});

test("fetchCommandCodeUsage: a failing summary leaves 5h/Weekly intact and Monthly unavailable", async () => {
  const fake = routedFetch([
    ["/alpha/whoami", { body: WHOAMI }],
    ["/alpha/billing/credits", { body: CREDITS }],
    ["/alpha/billing/subscriptions", { body: SUBSCRIPTIONS }],
    ["/alpha/usage/summary", { status: 503, body: { error: "try later" } }],
  ]);
  const usage = await fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE });

  assert.deepEqual(
    usage.lanes.map((lane) => lane.label),
    ["5h", "Weekly"],
  );
  assert.equal(usage.available.summary, false);
  assert.equal(usage.spend, undefined);
});

test("fetchCommandCodeUsage: 404 on all four endpoints is classified as a plan limitation", async () => {
  const fake = routedFetch([["/alpha/", { status: 404, body: { error: "not found" } }]]);
  await assert.rejects(
    () => fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE }),
    /does not expose the account API/,
  );
});

test("fetchCommandCodeUsage: a 401 on the first request maps to the /login error", async () => {
  const fake = routedFetch([["/alpha/whoami", { status: 401, body: loadFixture("unauthorized.json") }]]);
  await assert.rejects(
    () => fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE }),
    /authentication failed — run \/login/,
  );
});

test("fetchCommandCodeUsage: a 401 on a later request is detected after the parallel round", async () => {
  const fake = routedFetch([
    ["/alpha/whoami", { body: WHOAMI }],
    ["/alpha/billing/credits", { status: 401, body: loadFixture("unauthorized.json") }],
    ["/alpha/billing/subscriptions", { body: SUBSCRIPTIONS }],
    ["/alpha/usage/summary", { body: SUMMARY }],
  ]);
  await assert.rejects(
    () => fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE }),
    /authentication failed/,
  );
});

test("fetchCommandCodeUsage: missing / placeholder / unusable keys never reach the network", async () => {
  const fake = routedFetch(happyRoutes());
  await assert.rejects(
    () => fetchCommandCodeUsage("", { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE }),
    /no API key configured/,
  );
  await assert.rejects(
    () => fetchCommandCodeUsage("$COMMAND_CODE_API_KEY", { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE }),
    /no API key configured/,
  );
  await assert.rejects(
    () => fetchCommandCodeUsage("   ", { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE }),
    /no API key configured/,
  );
  assert.equal(fake.requests.length, 0);
});

test("fetchCommandCodeUsage: an unusable key with bracketed-paste markers is sanitized", async () => {
  const fake = routedFetch(happyRoutes());
  const usage = await fetchCommandCodeUsage("\u001b[200~user_pasted_key\u001b[201~", {
    fetchFn: fake.fetchFn,
    env: {},
    baseUrl: BASE,
  });
  assert.equal(fake.requests[0]?.headers.authorization, "Bearer user_pasted_key");
  assert.equal(usage.available.whoami, true);
});

test("fetchCommandCodeUsage: a hung request times out and fails closed", async () => {
  const fake = routedFetch([["/alpha/", { hang: true }]]);
  await assert.rejects(
    () => fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE, timeoutMs: 25 }),
    /Command Code usage failed/,
  );
});

test("fetchCommandCodeUsage: transport errors are redacted before they surface", async () => {
  const fake = routedFetch([["/alpha/", { status: 500, body: { error: "Bearer user_LeakMe123456789 expired" } }]]);
  const error = await fetchCommandCodeUsage(KEY, { fetchFn: fake.fetchFn, env: {}, baseUrl: BASE }).then(
    () => undefined,
    (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)),
  );
  assert.ok(error);
  assert.match(error, /redacted/);
  assert.ok(!error.includes("user_LeakMe123456789"), "the raw key must not leak into the error message");
});
