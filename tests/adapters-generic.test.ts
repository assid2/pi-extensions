import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGenericPayload, resolveEndpoint, createGenericAdapter } from "../extensions/usage/adapters/generic.ts";
import type { FetchLike } from "../extensions/usage/adapters/types.ts";

function fakeFetch(payload: unknown, status = 200): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  });
}

test("resolveEndpoint: absolute, relative-to-base, and command", () => {
  assert.deepEqual(resolveEndpoint("https://x.example/usage", "https://p.example/v1"), { url: "https://x.example/usage" });
  assert.deepEqual(resolveEndpoint("/usage", "https://p.example/v1"), { url: "https://p.example/v1/usage" });
  assert.deepEqual(resolveEndpoint("!curl -s localhost:9999/u", "https://p.example/v1"), { command: "curl -s localhost:9999/u" });
});

test("parseGenericPayload: window array with spent/limit", () => {
  const usage = parseGenericPayload({
    windows: [
      { name: "5h", limit: 12, spent: 3 },
      { name: "weekly", limit: 30, spent: 6 },
    ],
  });
  assert.ok(usage);
  assert.equal(usage.lanes?.length, 2);
  assert.equal(usage.lanes?.[0]?.label, "5h");
  assert.equal(usage.lanes?.[0]?.percent, 25);
  assert.equal(usage.lanes?.[1]?.label, "Weekly");
  assert.equal(usage.lanes?.[1]?.percent, 20);
});

test("parseGenericPayload: flat percent keys + balance + spend", () => {
  const usage = parseGenericPayload({
    session: 0.5,
    weekly: 80,
    balance: 12.5,
    currency: "USD",
    cost: 3.25,
  });
  assert.ok(usage);
  assert.equal(usage.lanes?.[0]?.label, "Session");
  assert.equal(usage.lanes?.[0]?.percent, 50);
  assert.equal(usage.lanes?.[1]?.label, "Weekly");
  assert.equal(usage.lanes?.[1]?.percent, 80);
  assert.equal(usage.balance?.[0]?.amount, 12.5);
  assert.equal(usage.spend?.monthly, 3.25);
});

test("parseGenericPayload: unrecognized shape returns null", () => {
  assert.equal(parseGenericPayload({ hello: "world" }), null);
  assert.equal(parseGenericPayload(null), null);
});

test("generic adapter: fetch happy path and 401", async () => {
  const adapter = createGenericAdapter("my-gw", { usageEndpoint: "/usage" });
  const ok = await adapter.fetch("tok", {
    providerId: "my-gw",
    baseUrl: "https://gw.example/v1",
    env: {},
    fetchFn: fakeFetch({ weekly: 42 }),
  });
  assert.equal(ok.usage.lanes?.[0]?.percent, 42);
  assert.equal(ok.status, 200);

  const bad = await adapter.fetch("tok", {
    providerId: "my-gw",
    baseUrl: "https://gw.example/v1",
    env: {},
    fetchFn: fakeFetch({}, 401),
  });
  assert.equal(bad.usage.error, "HTTP 401");
  assert.equal(bad.status, 401);
});
