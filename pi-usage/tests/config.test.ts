import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig, DEFAULT_CONFIG } from "../extensions/usage/config.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-usage-config-"));
}

test("loadConfig: missing file yields defaults", () => {
  const dir = tmpDir();
  const { config, warnings } = loadConfig(dir);
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(warnings.length, 0);
});

test("loadConfig: parses accounts, adapters, window, interval", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "usage.json"),
    JSON.stringify({
      accounts: [
        { provider: "ollama-cloud", name: "work" },
        { provider: "ollama-cloud", name: "personal", alias: "ollama-cloud-personal", env: "OLLAMA_CLOUD_KEY_2" },
        { provider: "opencode-go", name: "go" },
      ],
      adapters: { vllm: { usageEndpoint: "http://127.0.0.1:18020/metrics/usage" } },
      rollupWindow: "7d",
      pollIntervalMs: 60000,
    }),
  );
  const { config, warnings } = loadConfig(dir);
  assert.equal(warnings.length, 0);
  assert.equal(config.accounts.length, 3);
  assert.equal(config.accounts[1]?.alias, "ollama-cloud-personal");
  assert.equal(config.accounts[1]?.env, "OLLAMA_CLOUD_KEY_2");
  assert.equal(config.adapters["vllm"]?.usageEndpoint, "http://127.0.0.1:18020/metrics/usage");
  assert.equal(config.rollupWindow, "7d");
  assert.equal(config.pollIntervalMs, 60000);
});

test("loadConfig: invalid entries warn and are skipped", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "usage.json"),
    JSON.stringify({
      accounts: [{ provider: "a" }, { provider: "b", alias: "b" }, { name: "no-provider" }, "junk"],
      adapters: { x: { usageEndpoint: "" }, y: "not-an-object" },
      rollupWindow: "fortnight",
      pollIntervalMs: 100,
    }),
  );
  const { config, warnings } = loadConfig(dir);
  assert.ok(warnings.length >= 4, `expected warnings, got ${warnings.length}`);
  // "a" and "b" (alias==provider degrades to a default account) are valid.
  assert.equal(config.accounts.length, 2);
  assert.equal(config.adapters.x, undefined);
  assert.equal(config.rollupWindow, "1d");
  assert.equal(config.pollIntervalMs, DEFAULT_CONFIG.pollIntervalMs);
});

test("loadConfig: invalid JSON falls back to defaults with a warning", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "usage.json"), "{ not json");
  const { config, warnings } = loadConfig(dir);
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(warnings.length, 1);
});
