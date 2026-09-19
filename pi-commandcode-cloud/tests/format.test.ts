/**
 * Formatting tests (plan §8 `format.test.ts`, §6.4).
 *
 * Pins: `quotaBar` length/edges, the 60/80 color thresholds in
 * `colorSegment`, joined present-only lanes in `formatUsageStatusColored`, the
 * `formatResetsIn` countdown and the multi-line `formatUsage` (including
 * "unavailable" sections and redacted error text).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { colorSegment, formatResetsIn, formatUsage, formatUsageStatusColored, quotaBar } from "../usage.ts";
import { type CommandCodeUsage, deriveUsage } from "../usage-types.ts";
import { asTheme, fakeTheme, loadFixture } from "./helpers.ts";

const WHOAMI = loadFixture("whoami.json");
const CREDITS = loadFixture("credits.json");
const SUBSCRIPTIONS = loadFixture("subscriptions.json");
const SUMMARY = loadFixture("summary.json");

function fullUsage(): CommandCodeUsage {
  return deriveUsage({ whoami: WHOAMI, credits: CREDITS, subscriptions: SUBSCRIPTIONS, summary: SUMMARY });
}

// --- quotaBar ---

test("quotaBar: 10 cells, edges clamped", () => {
  assert.equal(quotaBar(0), "▕░░░░░░░░░░▏");
  assert.equal(quotaBar(100), "▕██████████▏");
  assert.equal(quotaBar(45), "▕████░░░░░░▏");
  assert.equal(quotaBar(4), "▕░░░░░░░░░░▏");
  assert.equal(quotaBar(10), "▕█░░░░░░░░░▏");
  // Out-of-range and non-finite inputs are clamped, not thrown.
  assert.equal(quotaBar(-5), "▕░░░░░░░░░░▏");
  assert.equal(quotaBar(150), "▕██████████▏");
  assert.equal(quotaBar(Number.NaN), "▕░░░░░░░░░░▏");
  for (const pct of [0, 1, 9, 10, 55, 99, 100, -1, 200]) {
    const bar = quotaBar(pct);
    // 10 content cells between the two end caps.
    assert.equal([...bar].length, 12, `bar for ${pct}`);
    assert.ok(bar.startsWith("▕") && bar.endsWith("▏"));
  }
});

// --- color thresholds ---

test("colorSegment: error >= 80, warning >= 60, success below", () => {
  const cases: Array<[number, string]> = [
    [0, "success"],
    [59, "success"],
    [60, "warning"],
    [79, "warning"],
    [80, "error"],
    [100, "error"],
    [150, "error"],
  ];
  for (const [pct, expected] of cases) {
    const theme = fakeTheme();
    const rendered = colorSegment(asTheme(theme), "5h", pct);
    assert.equal(theme.colors.at(-1), expected, `pct ${pct}`);
    assert.match(rendered, new RegExp(`5h ${Math.round(Math.min(Math.max(pct, 0), 100))}%`));
    assert.ok(rendered.includes(quotaBar(pct)));
  }
});

// --- formatUsageStatusColored ---

test("formatUsageStatusColored: joins only present lanes, one space apart", () => {
  const usage: CommandCodeUsage = {
    lanes: [
      { label: "5h", percent: 22 },
      { label: "Weekly", percent: 61 },
    ],
    balance: [{ amount: 12, unit: "usd", label: "Monthly credits remaining" }],
    available: { whoami: true, credits: true, subscriptions: true, summary: true },
  };
  const theme = fakeTheme();
  const status = formatUsageStatusColored(asTheme(theme), usage);
  assert.equal(status, "▕██░░░░░░░░▏ 5h 22% ▕██████░░░░▏ Weekly 61% $12.00 left");
  assert.deepEqual(theme.colors, ["success", "warning", "muted"]);
});

test("formatUsageStatusColored: missing lanes are omitted, never rendered as 0%", () => {
  const usage: CommandCodeUsage = {
    lanes: [{ label: "Monthly", percent: 90 }],
    available: { whoami: false, credits: false, subscriptions: false, summary: true },
  };
  const theme = fakeTheme();
  const status = formatUsageStatusColored(asTheme(theme), usage);
  assert.equal(status, "▕█████████░▏ Monthly 90%");
  assert.ok(!status.includes("5h"));
  assert.ok(!status.includes("Weekly"));
  assert.ok(!/[^\d]0%/.test(status), "no lane may render as 0%");

  const empty = formatUsageStatusColored(asTheme(fakeTheme()), {
    lanes: [],
    available: { whoami: false, credits: false, subscriptions: false, summary: false },
  });
  assert.equal(empty, "");
});

// --- countdown ---

test("formatResetsIn: documented countdown shapes", () => {
  assert.equal(formatResetsIn(0, new Date(9_660_000).toISOString()), "2h 41m");
  assert.equal(formatResetsIn(0, new Date(356_400_000).toISOString()), "4d 3h");
  assert.equal(formatResetsIn(0, new Date(600_000).toISOString()), "10m");
  assert.equal(formatResetsIn(1_000, new Date(500).toISOString()), "now");
  assert.equal(formatResetsIn(0, "not-a-date"), "unknown");
  assert.equal(formatResetsIn(Number.NaN, new Date(1_000).toISOString()), "unknown");
});

// --- formatUsage ---

test("formatUsage: prints every lane, balances, spend, notice and org limits", () => {
  const text = formatUsage(fullUsage());
  assert.match(text, /^Command Code usage:/);
  assert.match(text, /5h: 75% \(2\.25 \/ 3\.00 credits\)/);
  assert.match(text, /Weekly: 100% \(6\.24 \/ 6\.00 credits\)/);
  assert.match(text, /Monthly: 85% \(67\.68 \/ 79\.68 credits\)/);
  assert.match(text, /Monthly credits remaining: \$12\.00/);
  assert.match(text, /Purchased credits: \$3\.00/);
  assert.match(text, /Free credits: \$1\.00/);
  assert.match(text, /Spend: \$67\.68, 17641 requests, 100% success/);
  assert.match(text, /⚠ weekly limit reached/);
  assert.match(text, /org deepseek\/deepseek-v4\.1-flash — \$1\.20 \/ \$5\.00/);
  assert.ok(!text.includes("Unavailable:"));
});

test("formatUsage: absent lanes and failed sections render as 'unavailable'", () => {
  const text = formatUsage({
    lanes: [{ label: "Weekly", percent: 30, used: 3, cap: 10 }],
    available: { whoami: false, credits: true, subscriptions: false, summary: true },
  });
  assert.match(text, /5h: unavailable/);
  assert.match(text, /Weekly: 30%/);
  assert.match(text, /Monthly: unavailable/);
  assert.match(text, /Unavailable: whoami, subscriptions/);
});

test("formatUsage: an estimated Monthly cap is labelled", () => {
  const usage = deriveUsage({
    credits: { credits: { planId: "individual-provider" } },
    subscriptions: { data: { status: "active" } },
    summary: { totalCredits: 6 },
  });
  assert.match(formatUsage(usage), /Monthly: 40% \(6\.00 \/ 15\.00 credits, estimated\)/);
});

test("formatUsage: error text is redacted before it is printed", () => {
  const text = formatUsage({
    lanes: [],
    available: { whoami: false, credits: false, subscriptions: false, summary: false },
    error: "request failed with Bearer user_secret_leak_123",
  });
  assert.match(text, /Error:/);
  assert.ok(!text.includes("user_secret_leak_123"));
  assert.match(text, /Bearer \[redacted\]/);
});
