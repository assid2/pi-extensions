import { test } from "node:test";
import assert from "node:assert/strict";
import factory from "../extensions/usage/index.ts";

test("index: the extension factory loads and registers its surface", () => {
  const flags: string[] = [];
  const commands: string[] = [];
  const events: string[] = [];
  const pi = {
    registerFlag: (name: string) => {
      flags.push(name);
    },
    registerCommand: (name: string) => {
      commands.push(name);
    },
    on: (name: string) => {
      events.push(name);
    },
    events: { on: () => () => {}, emit: () => {} },
    getFlag: () => false,
  };
  factory(pi as never);
  assert.ok(flags.includes("usage"));
  assert.ok(commands.includes("usage"));
  assert.ok(events.includes("session_start"));
  assert.ok(events.includes("session_shutdown"));
});
