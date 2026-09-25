import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOllamaCloudUsage, ollamaCloudAdapter } from "../extensions/usage/adapters/ollama-cloud.ts";
import { resolveAdapter } from "../extensions/usage/adapters/index.ts";
import type { FetchLike } from "../extensions/usage/adapters/types.ts";

function fakeFetch(payload: unknown, status = 200): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  });
}

test("parseOllamaCloudUsage: request-count fractions + 4-week spend", () => {
  const usage = parseOllamaCloudUsage({
    limits: {
      session: { usage: 0.42, models: [{ name: "qwen3.5:397b", request_count: 3 }] },
      weekly: { usage: 0.61, models: [] },
    },
    activity: { cost: "$12.34" },
  });
  assert.ok(usage);
  assert.equal(usage.lanes?.[0]?.label, "5h");
  assert.equal(usage.lanes?.[0]?.percent, 42);
  assert.equal(usage.lanes?.[1]?.label, "Weekly");
  assert.equal(usage.lanes?.[1]?.percent, 61);
  assert.equal(usage.notice, "4-week spend $12.34");
});

test("parseOllamaCloudUsage: unrecognized shape returns null", () => {
  assert.equal(parseOllamaCloudUsage({ nope: true }), null);
});

test("resolveAdapter: every ollama-* id maps to the ollama-cloud adapter", () => {
  const config = { adapters: {} } as never;
  assert.equal(resolveAdapter("ollama-cloud", config), ollamaCloudAdapter);
  assert.equal(resolveAdapter("ollama-assid2", config), ollamaCloudAdapter);
  assert.equal(resolveAdapter("ollama-work", config), ollamaCloudAdapter);
});

test("resolveAdapter: an explicit config attachment overrides the ollama-* rule", () => {
  const adapter = resolveAdapter("ollama-custom", { adapters: { "ollama-custom": { usageEndpoint: "https://example.test/usage" } } } as never);
  assert.notEqual(adapter, ollamaCloudAdapter);
});

test("ollamaCloudAdapter: fetch happy path and 401", async () => {
  const ok = await ollamaCloudAdapter.fetch("oll-key", {
    providerId: "ollama-cloud",
    env: {},
    fetchFn: fakeFetch({ limits: { session: { usage: 0.1 }, weekly: { usage: 0.2 } } }),
  });
  assert.equal(ok.usage.lanes?.[0]?.percent, 10);
  assert.equal(ok.usage.lanes?.[1]?.percent, 20);

  const bad = await ollamaCloudAdapter.fetch("oll-key", {
    providerId: "ollama-cloud",
    env: {},
    fetchFn: fakeFetch({}, 401),
  });
  assert.equal(bad.usage.error, "HTTP 401");
  assert.equal(bad.status, 401);
});
