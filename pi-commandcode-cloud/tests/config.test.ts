/**
 * Config loader tests (plan §8 `config.test.ts`, §3.4).
 *
 * Pins: `DEFAULT_CONFIG < global < project < env` precedence, `sanitizeConfig`
 * type filtering, malformed/non-object JSON tolerance, the `usageStatus`
 * default of false, the env override parser, and the toggle-argument resolver.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_CONFIG,
  loadConfig,
  resolveUsageStatusEnv,
  resolveUsageStatusToggle,
  sanitizeConfig,
} from "../config.ts";
import { USAGE_REFRESH_MS } from "../constants.ts";

function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "cc-config-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
}

/** Run `fn` with PI_CODING_AGENT_DIR pointing at `agentDir`. */
async function withAgentDir<T>(agentDir: string, fn: () => T): Promise<T> {
  const original = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = original;
  }
}

// --- sanitizeConfig ---

test("sanitizeConfig: keeps only type-matching known keys", () => {
  assert.deepEqual(sanitizeConfig({ usageStatus: true, usageRefreshMs: 12_345, unknown: "x", webTools: true }), {
    usageStatus: true,
    usageRefreshMs: 12_345,
  });
  assert.deepEqual(sanitizeConfig({ usageStatus: "yes", usageRefreshMs: -1 }), {});
  assert.deepEqual(sanitizeConfig({ usageRefreshMs: Number.NaN }), {});
  assert.deepEqual(sanitizeConfig({ usageRefreshMs: 0 }), {});
  assert.deepEqual(sanitizeConfig({}), {});
});

// --- precedence ---

test("loadConfig: defaults are usageStatus:false and usageRefreshMs:300000", async () => {
  const agent = tempDir();
  const project = tempDir();
  try {
    await withAgentDir(agent.dir, () => {
      assert.deepEqual(loadConfig(project.dir, {}), { usageStatus: false, usageRefreshMs: USAGE_REFRESH_MS });
      assert.deepEqual(DEFAULT_CONFIG, { usageStatus: false, usageRefreshMs: 300_000 });
    });
  } finally {
    agent.cleanup();
    project.cleanup();
  }
});

test("loadConfig: global < project < env precedence", async () => {
  const agent = tempDir();
  const project = tempDir();
  try {
    writeJson(join(agent.dir, "commandcode-cloud.json"), { usageStatus: true, usageRefreshMs: 111 });
    writeJson(join(project.dir, ".pi", "commandcode-cloud.json"), { usageStatus: false, usageRefreshMs: 222 });

    await withAgentDir(agent.dir, () => {
      // project overrides global
      assert.deepEqual(loadConfig(project.dir, {}), { usageStatus: false, usageRefreshMs: 222 });
      // env overrides project for usageStatus only
      assert.deepEqual(loadConfig(project.dir, { PI_COMMANDCODE_USAGE_STATUS: "on" }), {
        usageStatus: true,
        usageRefreshMs: 222,
      });
      assert.deepEqual(loadConfig(project.dir, { PI_COMMANDCODE_USAGE_STATUS: "0" }), {
        usageStatus: false,
        usageRefreshMs: 222,
      });
    });
  } finally {
    agent.cleanup();
    project.cleanup();
  }
});

test("loadConfig: malformed and non-object JSON are ignored (defaults apply)", async () => {
  const agent = tempDir();
  const project = tempDir();
  try {
    writeJson(join(agent.dir, "commandcode-cloud.json"), "{ not json");
    writeJson(join(project.dir, ".pi", "commandcode-cloud.json"), "[1,2,3]");

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    };
    try {
      await withAgentDir(agent.dir, () => {
        assert.deepEqual(loadConfig(project.dir, {}), { usageStatus: false, usageRefreshMs: USAGE_REFRESH_MS });
      });
    } finally {
      console.error = originalError;
    }
    assert.ok(errors.some((line) => line.includes("Failed to load global config")));
  } finally {
    agent.cleanup();
    project.cleanup();
  }
});

test("loadConfig: a partially valid config keeps the valid keys and defaults the rest", async () => {
  const agent = tempDir();
  const project = tempDir();
  try {
    writeJson(join(project.dir, ".pi", "commandcode-cloud.json"), { usageStatus: true, usageRefreshMs: "60s" });
    await withAgentDir(agent.dir, () => {
      assert.deepEqual(loadConfig(project.dir, {}), { usageStatus: true, usageRefreshMs: USAGE_REFRESH_MS });
    });
  } finally {
    agent.cleanup();
    project.cleanup();
  }
});

// --- env parser ---

test("resolveUsageStatusEnv: documented falsy/truthy handling", () => {
  assert.equal(resolveUsageStatusEnv({}), undefined);
  for (const value of ["0", "false", "no", "off", "", "OFF", " False "]) {
    assert.equal(resolveUsageStatusEnv({ PI_COMMANDCODE_USAGE_STATUS: value }), false, `"${value}" => false`);
  }
  for (const value of ["1", "true", "yes", "on", "anything"]) {
    assert.equal(resolveUsageStatusEnv({ PI_COMMANDCODE_USAGE_STATUS: value }), true, `"${value}" => true`);
  }
});

// --- toggle resolver ---

test("resolveUsageStatusToggle: on/off/toggle/unknown", () => {
  assert.deepEqual(resolveUsageStatusToggle("on", false), { enabled: true });
  assert.deepEqual(resolveUsageStatusToggle("enable", false), { enabled: true });
  assert.deepEqual(resolveUsageStatusToggle("off", true), { enabled: false });
  assert.deepEqual(resolveUsageStatusToggle("disable", true), { enabled: false });
  assert.deepEqual(resolveUsageStatusToggle("", false), { enabled: true });
  assert.deepEqual(resolveUsageStatusToggle("   ", true), { enabled: false });

  const unknown = resolveUsageStatusToggle("sideways", true);
  assert.equal(unknown.enabled, true);
  assert.match(unknown.error ?? "", /Unknown argument "sideways"/);
});
