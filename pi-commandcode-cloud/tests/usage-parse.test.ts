/**
 * Usage bucket-mapping tests (plan §8 `usage-parse.test.ts`, §6.3).
 *
 * Pins the recorded-fixture derivations: the 5h/weekly/monthly lanes,
 * `resetAt<=0` omission, the `used + remaining` monthly cap, the plan-nominal
 * fallback, string-vs-boolean `exceeded`, Provider-plan (no windows), missing
 * sections and the 401 envelope.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveUsage,
  PLAN_NOMINAL_CREDITS,
  parseCommandCodeUsage,
  parseCredits,
  parseSubscriptions,
  parseSummary,
  parseWhoami,
} from "../usage-types.ts";
import { loadFixture } from "./helpers.ts";

const WHOAMI = loadFixture("whoami.json");
const CREDITS = loadFixture("credits.json");
const SUBSCRIPTIONS = loadFixture("subscriptions.json");
const SUMMARY = loadFixture("summary.json");
const UNAUTHORIZED = loadFixture("unauthorized.json");
const PROVIDER_PLAN = loadFixture("credits-provider-plan.json");

// --- Full fixture derivation ---

test("deriveUsage: 5h / Weekly / derived Monthly lanes from the fixtures", () => {
  const usage = deriveUsage({ whoami: WHOAMI, credits: CREDITS, subscriptions: SUBSCRIPTIONS, summary: SUMMARY });

  assert.deepEqual(
    usage.lanes.map((lane) => [lane.label, lane.percent]),
    [
      ["5h", 75],
      ["Weekly", 100], // 6.24 / 6 clamped to 100
      ["Monthly", 84.94], // 67.68 / (67.68 + 12)
    ],
  );

  assert.equal(usage.lanes[0]?.used, 2.25);
  assert.equal(usage.lanes[0]?.cap, 3);
  assert.equal(usage.lanes[0]?.resetsAt, new Date(1786091731770).toISOString());
  assert.equal(usage.lanes[1]?.resetsAt, new Date(1786603898869).toISOString());
  assert.equal(usage.lanes[2]?.used, 67.68);
  assert.equal(usage.lanes[2]?.cap, 79.68);
  assert.equal(usage.lanes[2]?.estimated, false);
  assert.equal(usage.lanes[2]?.resetsAt, "2026-10-01T00:00:00.000Z");
});

test("deriveUsage: balances, spend, period, orgId and availability", () => {
  const usage = deriveUsage({ whoami: WHOAMI, credits: CREDITS, subscriptions: SUBSCRIPTIONS, summary: SUMMARY });

  assert.deepEqual(usage.balance, [
    { amount: 12, unit: "usd", label: "Monthly credits remaining" },
    { amount: 3, unit: "usd", label: "Purchased credits" },
    { amount: 1, unit: "usd", label: "Free credits" },
  ]);
  assert.equal(usage.spend?.monthly, 67.68);
  assert.equal(usage.spend?.unit, "usd");
  assert.equal(usage.spend?.totalCount, 17_641);
  assert.equal(usage.spend?.successRate, 100);
  assert.equal(usage.orgId, "org_RedactedOrg01");
  assert.deepEqual(usage.period, {
    start: "2026-09-01T00:00:00.000Z",
    end: "2026-10-01T00:00:00.000Z",
  });
  assert.equal(usage.orgLimits?.length, 2);
  assert.equal(usage.orgLimits?.[0]?.model, "deepseek/deepseek-v4.1-flash");
  assert.deepEqual(usage.available, { whoami: true, credits: true, subscriptions: true, summary: true });
  assert.equal(usage.whoami?.user?.userName, "ada");
});

test("deriveUsage: an exceeded window produces a countdown notice when nowMs is given", () => {
  const resetMs = 1786603898869;
  const withoutClock = deriveUsage({ credits: CREDITS });
  assert.equal(withoutClock.notice, "weekly limit reached");

  const withClock = deriveUsage({
    credits: CREDITS,
    nowMs: resetMs - 9_660_000, // 2h 41m before the weekly reset
  });
  assert.equal(withClock.notice, "weekly limit reached — resets in 2h 41m");
});

// --- Window edge cases ---

test("deriveUsage: idle 0/0 windows and non-positive caps are omitted, not rendered as 0%", () => {
  const usage = deriveUsage({
    credits: {
      credits: { monthlyCredits: 5, planId: "individual-provider" },
      windowLimits: {
        fiveHour: { used: 0, cap: 0, resetAt: 0 },
        weekly: { used: 1, cap: 0, resetAt: 0 },
      },
    },
  });
  assert.deepEqual(usage.lanes, []);
  assert.equal(usage.available.credits, true);
});

test("deriveUsage: resetAt<=0 is omitted from the lane resetsAt", () => {
  const usage = deriveUsage({
    credits: {
      credits: {},
      windowLimits: { fiveHour: { used: 1, cap: 2, resetAt: 0 }, weekly: { used: 1, cap: 2, resetAt: -5 } },
    },
  });
  assert.deepEqual(
    usage.lanes.map((lane) => lane.label),
    ["5h", "Weekly"],
  );
  assert.equal(usage.lanes[0]?.resetsAt, undefined);
  assert.equal(usage.lanes[1]?.resetsAt, undefined);
});

// --- Derived Monthly fallback ---

test("deriveUsage: plan-nominal cap is used (and flagged estimated) when remaining is missing", () => {
  const usage = deriveUsage({
    credits: { credits: { planId: "individual-provider" } },
    subscriptions: { data: { planId: "individual-provider", status: "active" } },
    summary: { totalCredits: 6 },
  });
  const monthly = usage.lanes.find((lane) => lane.label === "Monthly");
  assert.ok(monthly);
  assert.equal(monthly.cap, PLAN_NOMINAL_CREDITS["individual-provider"]);
  assert.equal(monthly.used, 6);
  assert.equal(monthly.estimated, true);
  assert.equal(monthly.percent, 40);
});

test("deriveUsage: summary without totals derives used from the nominal cap minus remaining", () => {
  const usage = deriveUsage({
    credits: { credits: { monthlyCredits: 4, planId: "individual-provider" } },
    subscriptions: { data: { planId: "individual-provider", status: "active" } },
    summary: { totalCount: 5 },
  });
  const monthly = usage.lanes.find((lane) => lane.label === "Monthly");
  assert.ok(monthly);
  assert.equal(monthly.used, 11);
  assert.equal(monthly.cap, 15);
  assert.equal(monthly.estimated, true);
  assert.equal(monthly.percent, 73.33);
});

test("deriveUsage: a non-active subscription disables the plan-nominal fallback", () => {
  const usage = deriveUsage({
    credits: { credits: { planId: "individual-provider" } },
    subscriptions: { data: { planId: "individual-provider", status: "canceled" } },
    summary: { totalCredits: 6 },
  });
  assert.equal(
    usage.lanes.some((lane) => lane.label === "Monthly"),
    false,
  );
});

// --- exceeded string vs boolean ---

test("deriveUsage: windowLimits.exceeded as a string names the window", () => {
  const usage = deriveUsage({
    credits: { credits: {}, windowLimits: { exceeded: "weekly", weekly: { used: 1, cap: 2 } } },
  });
  assert.equal(usage.notice, "weekly limit reached");
});

test("deriveUsage: windowLimits.exceeded=true (boolean) normalizes to a generic notice", () => {
  const usage = deriveUsage({
    credits: { credits: {}, windowLimits: { exceeded: true, limited: true } },
  });
  assert.equal(usage.notice, "usage limit reached");
});

test("deriveUsage: the per-window boolean exceeded drives the notice", () => {
  const usage = deriveUsage({
    credits: { credits: {}, windowLimits: { fiveHour: { used: 3, cap: 3, exceeded: true } } },
  });
  assert.equal(usage.notice, "5h limit reached");
});

// --- Provider plan / missing sections / 401 ---

test("deriveUsage: Provider plan (no windowLimits) yields Monthly-only lanes", () => {
  const usage = deriveUsage({ whoami: WHOAMI, credits: PROVIDER_PLAN, subscriptions: SUBSCRIPTIONS, summary: SUMMARY });
  assert.deepEqual(
    usage.lanes.map((lane) => lane.label),
    ["Monthly"],
  );
  assert.equal(usage.lanes[0]?.percent, 93.77); // 67.68 / (67.68 + 4.5)
  assert.equal(usage.notice, undefined);
  assert.equal(usage.available.credits, true);
});

test("deriveUsage: missing sections degrade to empty/unavailable, never 0%", () => {
  const usage = deriveUsage({});
  assert.deepEqual(usage.lanes, []);
  assert.equal(usage.balance, undefined);
  assert.equal(usage.spend, undefined);
  assert.deepEqual(usage.available, { whoami: false, credits: false, subscriptions: false, summary: false });
});

test("deriveUsage: the 401 envelope is rejected by every parser and yields no lanes", () => {
  assert.equal(parseWhoami(UNAUTHORIZED), undefined);
  assert.equal(parseCredits(UNAUTHORIZED), undefined);
  assert.equal(parseSubscriptions(UNAUTHORIZED), undefined);
  assert.equal(parseSummary(UNAUTHORIZED), undefined);

  const usage = deriveUsage({
    whoami: UNAUTHORIZED,
    credits: UNAUTHORIZED,
    subscriptions: UNAUTHORIZED,
    summary: UNAUTHORIZED,
  });
  assert.deepEqual(usage.lanes, []);
  assert.equal(usage.available.whoami, false);
});

// --- Tolerant parsing ---

test("parsers: unwrap {data} envelopes and tolerate numeric strings", () => {
  assert.equal(parseWhoami({ data: { user: { id: "u_1" }, org: { id: "org_1" } } })?.user?.id, "u_1");
  assert.equal(parseCredits({ data: { credits: { monthlyCredits: "12.5" } } })?.credits?.monthlyCredits, 12.5);
  assert.equal(
    parseSubscriptions({ data: { currentPeriodEnd: "2026-10-01T00:00:00.000Z" } })?.currentPeriodEnd,
    "2026-10-01T00:00:00.000Z",
  );
  assert.equal(parseSummary({ data: { totalCost: "3.5" } })?.totalCost, 3.5);
});

test("parseSummary: totalCredits is preferred over totalCost", () => {
  assert.equal(parseSummary({ totalCost: 10, totalCredits: 4 })?.totalCredits, 4);
  const usage = deriveUsage({
    credits: { credits: { monthlyCredits: 6 } },
    summary: { totalCost: 10, totalCredits: 4 },
  });
  assert.equal(usage.spend?.monthly, 4);
  assert.equal(usage.lanes[0]?.used, 4);
});

test("parseWhoami: a bare user object and a string org are accepted", () => {
  const whoami = parseWhoami({ id: "u_2", userName: "grace", org: "org_2" });
  assert.equal(whoami?.user?.id, "u_2");
  assert.equal(whoami?.org?.id, "org_2");
});

test("parseCommandCodeUsage is an alias of deriveUsage", () => {
  const a = parseCommandCodeUsage({ credits: CREDITS });
  const b = deriveUsage({ credits: CREDITS });
  assert.deepEqual(a.lanes, b.lanes);
  assert.equal(a.notice, b.notice);
});

test("PLAN_NOMINAL_CREDITS matches the verified plan table", () => {
  assert.deepEqual(PLAN_NOMINAL_CREDITS, {
    "individual-go": 10,
    "individual-goat": 70,
    "individual-pro": 30,
    "individual-pro-v1": 80,
    "individual-provider": 15,
    "individual-max": 150,
    "individual-ultra": 300,
    "teams-pro": 40,
  });
});
