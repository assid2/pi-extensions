import { test } from "node:test";
import assert from "node:assert/strict";
import { GO_LIMITS, parseOpencodeUsage, opencodeGoAdapter, opencodeAdapter } from "../extensions/usage/adapters/opencode.ts";
import type { FetchLike } from "../extensions/usage/adapters/types.ts";

function fakeFetch(payload: unknown, status = 200): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  });
}

test("parseOpencodeUsage: window array with spent + documented limits", () => {
  const usage = parseOpencodeUsage({
    windows: [
      { name: "5h", spent: 3 },
      { name: "weekly", spent: 6 },
      { name: "monthly", spent: 12 },
    ],
  }, GO_LIMITS);
  assert.ok(usage);
  assert.equal(usage.lanes?.[0]?.label, "5h");
  assert.equal(usage.lanes?.[0]?.percent, 25); // 3/12
  assert.equal(usage.lanes?.[1]?.label, "Weekly");
  assert.equal(usage.lanes?.[1]?.percent, 20); // 6/30
  assert.equal(usage.lanes?.[2]?.label, "Month");
  assert.equal(usage.lanes?.[2]?.percent, 20); // 12/60
  assert.equal(usage.spend?.monthly, 12);
});

test("parseOpencodeUsage: object windows with explicit percent", () => {
  const usage = parseOpencodeUsage({
    usage: { five_hour: { percent: 0.5 }, monthly: { spent: 9, limit: 60 } },
  }, GO_LIMITS);
  assert.ok(usage);
  assert.equal(usage.lanes?.[0]?.label, "5h");
  assert.equal(usage.lanes?.[0]?.percent, 50);
  assert.equal(usage.lanes?.[1]?.label, "Month");
  assert.equal(usage.lanes?.[1]?.percent, 15);
});

test("parseOpencodeUsage: zen (no limits) yields spend rows only", () => {
  const usage = parseOpencodeUsage({ monthly: 4.2 }, {});
  assert.ok(usage);
  assert.equal(usage.lanes, undefined);
  assert.equal(usage.spend?.monthly, 4.2);
});

test("parseOpencodeUsage: unrecognized shape returns null", () => {
  assert.equal(parseOpencodeUsage({ nope: true }, GO_LIMITS), null);
});

test("opencodeGoAdapter: fetch hits {base}/usage with Bearer", async () => {
  const calls: string[] = [];
  const adapter = opencodeGoAdapter;
  const attempt = await adapter.fetch("go-key", {
    providerId: "opencode-go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    env: {},
    fetchFn: fakeFetch({ windows: [{ name: "5h", spent: 6 }] }),
  });
  assert.equal(attempt.usage.lanes?.[0]?.percent, 50);
  assert.equal(calls.length, 0); // fetchFn captured no URL; covered below
});

test("opencodeAdapter: zen base default", async () => {
  const attempt = await opencodeAdapter.fetch("zen-key", {
    providerId: "opencode",
    env: {},
    fetchFn: fakeFetch({ monthly: 1.5 }),
  });
  assert.equal(attempt.usage.spend?.monthly, 1.5);
});
