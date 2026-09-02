import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampPercent,
  colorForPercent,
  formatCost,
  formatDuration,
  formatMoney,
  formatSpend,
  formatTokens,
  formatUsageLine,
  renderBar,
  type ColorFn,
} from "../extensions/usage/format.ts";

const noop: ColorFn = (_c, t) => t;

test("clampPercent bounds 0..100", () => {
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent(42.4), 42);
  assert.equal(clampPercent(Number.NaN), 0);
});

test("colorForPercent thresholds", () => {
  assert.equal(colorForPercent(10), "success");
  assert.equal(colorForPercent(70), "warning");
  assert.equal(colorForPercent(90), "error");
});

test("renderBar fills by percent", () => {
  const bar = renderBar(noop, 50, 8);
  assert.equal(bar, "████░░░░");
  assert.equal(renderBar(noop, 0, 8), "░░░░░░░░");
  assert.equal(renderBar(noop, 100, 8), "████████");
});

test("formatTokens scales", () => {
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1234), "1.2K");
  assert.equal(formatTokens(2_400_000), "2.4M");
  assert.equal(formatTokens(Number.NaN), "0");
});

test("formatCost", () => {
  assert.equal(formatCost(0), "$0");
  assert.equal(formatCost(0.123), "$0.12");
  assert.equal(formatCost(0.0005), "$0.0005");
  assert.equal(formatCost(12.5), "$12.50");
});

test("formatDuration", () => {
  assert.equal(formatDuration(0), "now");
  assert.equal(formatDuration(45), "<1m");
  assert.equal(formatDuration(120), "2m");
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(90000), "1d 1h");
});

test("formatMoney", () => {
  assert.equal(formatMoney(12.34, "USD", "Balance"), "Balance · $12.34");
  assert.equal(formatMoney(40, "credits", "Topped up"), "Topped up · 40 credits");
});

test("formatSpend", () => {
  const s = formatSpend("USD", { daily: 1.2, weekly: 8.1, monthly: 40.02 });
  assert.ok(s.includes("today $1.20"));
  assert.ok(s.includes("week $8.10"));
  assert.ok(s.includes("month $40.02"));
});

test("formatUsageLine", () => {
  assert.equal(formatUsageLine({ input: 2_100_000, output: 340_000, cost: 1.23 }), "2.1M in / 340K out / $1.23");
});
