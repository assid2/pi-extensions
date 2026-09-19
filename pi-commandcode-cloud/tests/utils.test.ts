/**
 * Shared utility tests (plan §3.1/§6.1 hardening).
 *
 * Pins the error-mapping table, the reset-unit normalization (window
 * `resetAt` is epoch-ms; the 429 `error.rateLimit.reset` is seconds), header
 * attribution/ZDR precedence, `envInt`, `parseProviderError` and
 * `concurrentMap`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMAND_CODE_CLI_VERSION, ENV_ZDR, ENV_ZDR_ALIAS } from "../constants.ts";
import {
  attributionHeaders,
  concurrentMap,
  envInt,
  formatDurationMs,
  httpError,
  parseProviderError,
  resetSecondsToMs,
  zdrEnabled,
} from "../utils.ts";

// --- reset units ---

test("resetSecondsToMs: seconds -> ms, non-positive/invalid -> 0", () => {
  assert.equal(resetSecondsToMs(1_700_000_000), 1_700_000_000_000);
  assert.equal(resetSecondsToMs("1700000000"), 1_700_000_000_000);
  assert.equal(resetSecondsToMs(0), 0);
  assert.equal(resetSecondsToMs(-5), 0);
  assert.equal(resetSecondsToMs(Number.NaN), 0);
  assert.equal(resetSecondsToMs(undefined), 0);
});

// --- error mapping ---

test("parseProviderError: nested envelope, bare object and garbage", () => {
  const nested = parseProviderError(JSON.stringify({ error: { code: "UNAUTHORIZED", status: 401, message: "nope" } }));
  assert.equal(nested?.code, "UNAUTHORIZED");
  assert.equal(nested?.status, 401);
  assert.equal(nested?.message, "nope");

  const bare = parseProviderError(JSON.stringify({ code: "x", message: "y" }));
  assert.equal(bare?.code, "x");

  assert.equal(parseProviderError("plain text"), undefined);
  assert.equal(parseProviderError(""), undefined);
  assert.equal(parseProviderError(undefined), undefined);
  assert.equal(parseProviderError("[1,2,3]"), undefined);
});

test("httpError: 401 -> /login guidance", () => {
  assert.throws(() => httpError("usage", 401, "{}"), /authentication failed — run \/login/);
});

test("httpError: 403 upgrade_required -> plan guidance; other 403 -> forbidden", () => {
  assert.throws(
    () => httpError("chat", 403, JSON.stringify({ error: { code: "upgrade_required" } })),
    /does not include Provider API access \(Go plan\)/,
  );
  assert.throws(() => httpError("chat", 403, JSON.stringify({ error: { code: "nope" } })), /forbidden \(status 403/);
});

test("httpError: 422 surfaces the provider message verbatim", () => {
  assert.throws(
    () =>
      httpError("chat", 422, JSON.stringify({ error: { code: "cmd_zdr_no_providers", message: "no zdr upstream" } })),
    /no zdr upstream/,
  );
});

test("httpError: 429 names the window and converts the reset seconds to a countdown", () => {
  const futureSeconds = Math.floor(Date.now() / 1000) + 3_600;
  assert.throws(
    () =>
      httpError(
        "chat",
        429,
        JSON.stringify({ error: { code: "rate_limited", rateLimit: { window: "weekly", reset: futureSeconds } } }),
      ),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /rate limited/);
      assert.match(message, /weekly window/);
      assert.match(message, /resets in/);
      return true;
    },
  );
});

test("httpError: a past 429 reset omits the countdown and 5xx passes the message", () => {
  assert.throws(
    () => httpError("chat", 429, JSON.stringify({ error: { rateLimit: { window: "5h", reset: 1 } } })),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /5h window/);
      assert.ok(!message.includes("resets in"));
      return true;
    },
  );
  assert.throws(
    () => httpError("chat", 503, JSON.stringify({ error: { message: "upstream" } })),
    /server error \(status 503: upstream\)/,
  );
});

test("httpError: unexpected statuses are redacted", () => {
  assert.throws(
    () => httpError("chat", 418, "Bearer user_leak_123"),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /unexpected response \(status 418/);
      assert.ok(!message.includes("user_leak_123"));
      return true;
    },
  );
});

// --- duration ---

test("formatDurationMs: day/hour/minute shapes and non-positive edges", () => {
  assert.equal(formatDurationMs(0), "0m");
  assert.equal(formatDurationMs(-1), "0m");
  assert.equal(formatDurationMs(Number.NaN), "0m");
  assert.equal(formatDurationMs(60_000), "1m");
  assert.equal(formatDurationMs(3_600_000), "1h");
  assert.equal(formatDurationMs(5_400_000), "1h 30m");
  assert.equal(formatDurationMs(86_400_000), "1d");
  assert.equal(formatDurationMs(356_400_000), "4d 3h");
});

// --- envInt ---

test("envInt: positive integers only, else fallback", () => {
  assert.equal(envInt("X", 10, { X: "42" }), 42);
  assert.equal(envInt("X", 10, { X: "0" }), 10);
  assert.equal(envInt("X", 10, { X: "-1" }), 10);
  assert.equal(envInt("X", 10, { X: "1.5" }), 10);
  assert.equal(envInt("X", 10, { X: "nope" }), 10);
  assert.equal(envInt("X", 10, {}), 10);
});

// --- ZDR / attribution headers ---

test("zdrEnabled: CMD_ZDR takes precedence over COMMANDCODE_ZDR", () => {
  assert.equal(zdrEnabled({}), false);
  assert.equal(zdrEnabled({ [ENV_ZDR]: "1" }), true);
  assert.equal(zdrEnabled({ [ENV_ZDR_ALIAS]: "yes" }), true);
  assert.equal(zdrEnabled({ [ENV_ZDR]: "0", [ENV_ZDR_ALIAS]: "1" }), false, "the first set value wins");
  assert.equal(zdrEnabled({ [ENV_ZDR]: "", [ENV_ZDR_ALIAS]: "on" }), true, "empty primary defers to the alias");
});

test("attributionHeaders: CLI version + environment always, x-cmd-zdr only when requested", () => {
  const base = attributionHeaders({});
  assert.equal(base["x-cmd-zdr"], undefined);
  assert.equal(base["x-command-code-version"], COMMAND_CODE_CLI_VERSION);
  assert.equal(base["x-cli-environment"], "production");
  assert.deepEqual(Object.keys(base).sort(), ["x-cli-environment", "x-command-code-version"]);
  assert.equal(attributionHeaders({ [ENV_ZDR]: "1" })["x-cmd-zdr"], "1");
});

// --- concurrentMap ---

test("concurrentMap: preserves order, bounds workers and captures rejections", async () => {
  const items = [1, 2, 3, 4, 5];
  let active = 0;
  let maxActive = 0;
  const results = await concurrentMap(items, 2, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (item === 3) throw new Error("boom");
    return item * 10;
  });

  assert.equal(results.length, 5);
  assert.equal(results[0]?.status, "fulfilled");
  assert.equal((results[0] as PromiseFulfilledResult<number>).value, 10);
  assert.equal(results[2]?.status, "rejected");
  assert.equal((results[2] as PromiseRejectedResult).reason instanceof Error, true);
  assert.ok(maxActive <= 2, `maxActive ${maxActive} <= 2`);
});
