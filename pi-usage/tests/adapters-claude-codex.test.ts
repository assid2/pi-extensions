/**
 * Parser + injected-fetch tests for the ported Claude and Codex adapters.
 * No real network: fetch is injected through AdapterContext.fetchFn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { codexAdapter, parseCodexRateLimit } from "../extensions/usage/adapters/codex.ts";
import { claudeAdapter, parseClaudeUsage } from "../extensions/usage/adapters/claude.ts";
import type { AdapterContext, FetchResponseLike } from "../extensions/usage/adapters/types.ts";

const NOW = 1_700_000_000_000;

/** Modeled on the source's expected shape: primary/secondary windows with
 * used_percent + limit_window_seconds + reset_after_seconds. */
const CODEX_FIXTURE = {
  rate_limit: {
    primary_window: {
      used_percent: 0.42,
      limit_window_seconds: 18_000,
      reset_after_seconds: 7_200,
    },
    secondary_window: {
      used_percent: 65,
      limit_window_seconds: 604_800,
      reset_after_seconds: 86_400,
    },
  },
};

/** Modeled on the source's expected shape: five_hour/seven_day utilization
 * + resets_at + extra_usage. */
const CLAUDE_FIXTURE = {
  five_hour: { utilization: 0.31, resets_at: "2026-02-03T10:00:00Z" },
  seven_day: { utilization: 0.72, resets_at: "2026-02-09T10:00:00Z" },
  extra_usage: { is_enabled: true, used_credits: 12.5, monthly_limit: 100 },
};

function makeCtx(fetchFn: NonNullable<AdapterContext["fetchFn"]>): AdapterContext {
  return { providerId: "test", env: {}, nowMs: NOW, fetchFn };
}

function fakeResponse(
  payload: unknown,
  status = 200,
  retryAfter: string | null = null,
): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === "retry-after" ? retryAfter : null) },
    json: async () => payload,
  };
}

test("parseCodexRateLimit maps primary/secondary windows to 5h/Weekly lanes with ISO resets", () => {
  const lanes = parseCodexRateLimit(CODEX_FIXTURE, NOW);
  assert.deepEqual(lanes, [
    {
      label: "5h",
      percent: 42,
      resetsAt: new Date(NOW + 7_200 * 1000).toISOString(),
    },
    {
      label: "Weekly",
      percent: 65,
      resetsAt: new Date(NOW + 86_400 * 1000).toISOString(),
    },
  ]);
});

test("parseCodexRateLimit classifies a 7-day window returned as primary as Weekly", () => {
  const lanes = parseCodexRateLimit(
    {
      rate_limit: {
        primary_window: {
          used_percent: 80,
          limit_window_seconds: 604_800,
          reset_after_seconds: 3_600,
        },
      },
    },
    NOW,
  );
  assert.deepEqual(lanes, [
    { label: "Weekly", percent: 80, resetsAt: new Date(NOW + 3_600 * 1000).toISOString() },
  ]);
});

test("parseCodexRateLimit returns no lanes for an empty or missing payload", () => {
  assert.deepEqual(parseCodexRateLimit({}, NOW), []);
  assert.deepEqual(parseCodexRateLimit(null, NOW), []);
});

test("parseClaudeUsage maps utilization windows to lanes with resetsAt and a notice", () => {
  const parsed = parseClaudeUsage(CLAUDE_FIXTURE);
  assert.deepEqual(parsed.lanes, [
    { label: "5h", percent: 31, resetsAt: "2026-02-03T10:00:00Z" },
    { label: "Weekly", percent: 72, resetsAt: "2026-02-09T10:00:00Z" },
  ]);
  assert.equal(parsed.notice, "Extra $12.5 / $100");
});

test("parseClaudeUsage omits the notice when extra usage is disabled", () => {
  const parsed = parseClaudeUsage({
    ...CLAUDE_FIXTURE,
    extra_usage: { is_enabled: false, used_credits: 1, monthly_limit: 10 },
  });
  assert.equal(parsed.notice, undefined);
  assert.equal(parsed.lanes.length, 2);
});

test("parseClaudeUsage tolerates missing windows", () => {
  const parsed = parseClaudeUsage({ five_hour: { utilization: 0.5 } });
  assert.deepEqual(parsed.lanes, [{ label: "5h", percent: 50 }]);
  assert.equal(parsed.notice, undefined);
});

test("claudeAdapter.fetch returns lanes, notice and status 200 on success", async () => {
  const attempt = await claudeAdapter.fetch(
    "test-token",
    makeCtx(async () => fakeResponse(CLAUDE_FIXTURE)),
  );
  assert.equal(attempt.usage.error, undefined);
  assert.deepEqual(attempt.usage.lanes, [
    { label: "5h", percent: 31, resetsAt: "2026-02-03T10:00:00Z" },
    { label: "Weekly", percent: 72, resetsAt: "2026-02-09T10:00:00Z" },
  ]);
  assert.equal(attempt.usage.notice, "Extra $12.5 / $100");
  assert.equal(attempt.status, 200);
  assert.equal(attempt.retryAfterMs, undefined);
  assert.equal(attempt.usage.fetchedAt, NOW);
});

test("claudeAdapter.fetch reports a 429 with parsed Retry-After without throwing", async () => {
  const attempt = await claudeAdapter.fetch(
    "test-token",
    makeCtx(async () => fakeResponse({ error: "rate limited" }, 429, "120")),
  );
  assert.equal(attempt.status, 429);
  assert.equal(attempt.retryAfterMs, 120_000);
  assert.equal(attempt.usage.error, "HTTP 429");
  assert.equal(attempt.usage.lanes, undefined);
});

test("codexAdapter.fetch returns lanes from the wham/usage payload", async () => {
  const attempt = await codexAdapter.fetch(
    "test-token",
    makeCtx(async () => fakeResponse(CODEX_FIXTURE)),
  );
  assert.equal(attempt.usage.error, undefined);
  assert.deepEqual(attempt.usage.lanes, [
    { label: "5h", percent: 42, resetsAt: new Date(NOW + 7_200 * 1000).toISOString() },
    { label: "Weekly", percent: 65, resetsAt: new Date(NOW + 86_400 * 1000).toISOString() },
  ]);
  assert.equal(attempt.status, 200);
  assert.equal(attempt.usage.fetchedAt, NOW);
});
