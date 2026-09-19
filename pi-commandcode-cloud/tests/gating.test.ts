/**
 * Gating tests (plan §8 `gating.test.ts`, §3.6).
 *
 * Pins: `isCommandCode` matches only the registered provider id, the fast-path
 * cadence, and the footer's TUI guard plus opt-in default — driven through the
 * real extension factory with a fake `ExtensionAPI`/`ExtensionContext`.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PROVIDER_API_BASE, PROVIDER_ID, USAGE_FAST_REFRESH_MS } from "../constants.ts";
import factory, { isCommandCode, nextUsageRefreshMs, USAGE_STATUS_KEY } from "../index.ts";
import { GENERATED_MODELS } from "../models.generated.ts";
import { asTheme, fakeTheme } from "./helpers.ts";

type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown;

interface MockPi {
  api: ExtensionAPI;
  handlers: Map<string, EventHandler>;
  commands: Map<string, (args: string, ctx: ExtensionContext) => unknown>;
  providerId?: string;
  providerConfig?: Record<string, unknown>;
}

function mockPi(): MockPi {
  const handlers = new Map<string, EventHandler>();
  const commands = new Map<string, (args: string, ctx: ExtensionContext) => unknown>();
  const mock: MockPi = {
    api: undefined as unknown as ExtensionAPI,
    handlers,
    commands,
  };
  mock.api = {
    registerProvider: (id: string, config: Record<string, unknown>) => {
      mock.providerId = id;
      mock.providerConfig = config;
    },
    registerCommand: (name: string, spec: { handler: (args: string, ctx: ExtensionContext) => unknown }) => {
      commands.set(name, spec.handler);
    },
    on: (event: string, handler: EventHandler) => {
      handlers.set(event, handler);
    },
  } as unknown as ExtensionAPI;
  return mock;
}

interface FakeCtx {
  ctx: ExtensionContext;
  statuses: Array<[key: string, value: string | undefined]>;
}

function fakeCtx(options: { mode: string; provider?: string; key?: string; cwd: string }): FakeCtx {
  const statuses: Array<[key: string, value: string | undefined]> = [];
  const ctx = {
    mode: options.mode,
    cwd: options.cwd,
    model: options.provider ? { provider: options.provider, id: "test-model" } : undefined,
    ui: {
      theme: asTheme(fakeTheme()),
      setStatus: (key: string, value: string | undefined) => {
        statuses.push([key, value]);
      },
      notify: () => {},
    },
    modelRegistry: {
      getApiKeyForProvider: async () => options.key,
      getProviderAuthStatus: () => ({ configured: false, source: undefined, label: undefined }),
      getAll: () => [],
    },
  };
  return { ctx: ctx as unknown as ExtensionContext, statuses };
}

function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "cc-gating-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// --- isCommandCode ---

test("isCommandCode: true only for the commandcode-cloud provider", () => {
  assert.equal(isCommandCode({ model: { provider: PROVIDER_ID } } as unknown as ExtensionContext), true);
  assert.equal(isCommandCode({ model: { provider: "commandcode" } } as unknown as ExtensionContext), false);
  assert.equal(isCommandCode({ model: { provider: "ollama-cloud" } } as unknown as ExtensionContext), false);
  assert.equal(isCommandCode({} as unknown as ExtensionContext), false);
  assert.equal(isCommandCode({ model: undefined } as unknown as ExtensionContext), false);
});

// --- fast-path cadence ---

test("nextUsageRefreshMs: fast path only for lanes 85..<100, bounded by the base interval", () => {
  const lane = (percent: number) => ({
    lanes: [{ label: "5h" as const, percent }],
    available: { whoami: true, credits: true, subscriptions: true, summary: true },
  });
  assert.equal(nextUsageRefreshMs(lane(90), 300_000), USAGE_FAST_REFRESH_MS);
  assert.equal(nextUsageRefreshMs(lane(85), 300_000), USAGE_FAST_REFRESH_MS);
  assert.equal(nextUsageRefreshMs(lane(99.9), 300_000), USAGE_FAST_REFRESH_MS);
  assert.equal(nextUsageRefreshMs(lane(100), 300_000), 300_000);
  assert.equal(nextUsageRefreshMs(lane(50), 300_000), 300_000);
  assert.equal(nextUsageRefreshMs(lane(0), 300_000), 300_000);
  // Never poll faster than the user's own setting.
  assert.equal(nextUsageRefreshMs(lane(90), 30_000), 30_000);
});

// --- registration surface ---

test("factory: registers the provider id, wire config, catalog and oauth", async () => {
  const mock = mockPi();
  await factory(mock.api);

  assert.equal(mock.providerId, PROVIDER_ID);
  const config = mock.providerConfig;
  assert.ok(config);
  assert.equal(config.name, "Command Code");
  assert.equal(config.baseUrl, PROVIDER_API_BASE);
  assert.equal(config.api, "openai-completions");
  assert.equal(config.apiKey, "$COMMAND_CODE_API_KEY");
  assert.equal(config.models, GENERATED_MODELS);
  assert.equal(typeof config.refreshModels, "function");
  assert.ok(config.oauth);
  const headers = config.headers as Record<string, string>;
  assert.equal(headers["x-command-code-version"], "1.58.0");
  assert.equal(headers["x-cli-environment"], "production");

  for (const command of [
    "commandcode-usage",
    "commandcode-usage-status",
    "commandcode-status",
    "commandcode-refresh",
  ]) {
    assert.ok(mock.commands.has(command), `missing command ${command}`);
  }
  for (const event of ["session_start", "model_select", "agent_end", "session_shutdown"]) {
    assert.ok(mock.handlers.has(event), `missing event hook ${event}`);
  }
});

// --- TUI guard / opt-in default ---

test("session_start: nothing is written in non-TUI modes even when enabled", async () => {
  const tmp = tempDir();
  const mock = mockPi();
  await factory(mock.api);
  try {
    await withEnv({ PI_COMMANDCODE_USAGE_STATUS: "on", PI_CODING_AGENT_DIR: join(tmp.dir, "agent") }, async () => {
      const { ctx, statuses } = fakeCtx({ mode: "json", provider: PROVIDER_ID, cwd: tmp.dir });
      await mock.handlers.get("session_start")?.({}, ctx);
      await tick();
      assert.deepEqual(statuses, [], "startUsageStatus must early-return for mode !== tui");
    });
  } finally {
    tmp.cleanup();
  }
});

test("session_start: default opt-in is false, so the commandcode provider still clears the key", async () => {
  const tmp = tempDir();
  const mock = mockPi();
  await factory(mock.api);
  try {
    await withEnv({ PI_COMMANDCODE_USAGE_STATUS: undefined, PI_CODING_AGENT_DIR: join(tmp.dir, "agent") }, async () => {
      const { ctx, statuses } = fakeCtx({ mode: "tui", provider: PROVIDER_ID, cwd: tmp.dir });
      await mock.handlers.get("session_start")?.({}, ctx);
      await tick();
      assert.deepEqual(statuses, [[USAGE_STATUS_KEY, undefined]]);
    });
  } finally {
    tmp.cleanup();
  }
});

test("session_start: enabled + tui + commandcode starts the footer (no key => cleared status, no fetch)", async () => {
  const tmp = tempDir();
  const mock = mockPi();
  await factory(mock.api);
  try {
    await withEnv({ PI_COMMANDCODE_USAGE_STATUS: "on", PI_CODING_AGENT_DIR: join(tmp.dir, "agent") }, async () => {
      const { ctx, statuses } = fakeCtx({ mode: "tui", provider: PROVIDER_ID, cwd: tmp.dir, key: undefined });
      await mock.handlers.get("session_start")?.({}, ctx);
      await tick();
      assert.deepEqual(statuses, [[USAGE_STATUS_KEY, undefined]]);
      // Stop the timer the footer scheduled.
      await mock.handlers.get("session_shutdown")?.({}, ctx);
    });
  } finally {
    tmp.cleanup();
  }
});

test("model_select: a non-commandcode provider clears the status key", async () => {
  const tmp = tempDir();
  const mock = mockPi();
  await factory(mock.api);
  try {
    await withEnv({ PI_COMMANDCODE_USAGE_STATUS: "on", PI_CODING_AGENT_DIR: join(tmp.dir, "agent") }, async () => {
      const { ctx, statuses } = fakeCtx({ mode: "tui", provider: "ollama-cloud", cwd: tmp.dir });
      await mock.handlers.get("model_select")?.({}, ctx);
      await tick();
      assert.deepEqual(statuses, [[USAGE_STATUS_KEY, undefined]]);
    });
  } finally {
    tmp.cleanup();
  }
});

test("session_shutdown: clears the timer and the status key", async () => {
  const tmp = tempDir();
  const mock = mockPi();
  await factory(mock.api);
  try {
    await withEnv({ PI_COMMANDCODE_USAGE_STATUS: "on", PI_CODING_AGENT_DIR: join(tmp.dir, "agent") }, async () => {
      const { ctx, statuses } = fakeCtx({ mode: "tui", provider: PROVIDER_ID, cwd: tmp.dir });
      await mock.handlers.get("session_start")?.({}, ctx);
      await tick();
      await mock.handlers.get("session_shutdown")?.({}, ctx);
      assert.deepEqual(statuses.at(-1), [USAGE_STATUS_KEY, undefined]);
    });
  } finally {
    tmp.cleanup();
  }
});

// --- runtime toggle command ---

test("/commandcode-usage-status: on/off/unknown arguments resolve the runtime toggle", async () => {
  const tmp = tempDir();
  const mock = mockPi();
  await factory(mock.api);
  try {
    await withEnv({ PI_COMMANDCODE_USAGE_STATUS: undefined, PI_CODING_AGENT_DIR: join(tmp.dir, "agent") }, async () => {
      const notifications: Array<[string, string]> = [];
      const { ctx, statuses } = fakeCtx({ mode: "tui", provider: PROVIDER_ID, cwd: tmp.dir });
      (ctx.ui as unknown as { notify: (message: string, level: string) => void }).notify = (message, level) => {
        notifications.push([message, level]);
      };
      const handler = mock.commands.get("commandcode-usage-status");
      assert.ok(handler);

      await handler?.("on", ctx);
      await tick();
      assert.ok(notifications.some(([message]) => message.includes("enabled")));

      await handler?.("off", ctx);
      await tick();
      assert.ok(notifications.some(([message]) => message.includes("disabled")));
      assert.deepEqual(statuses.at(-1), [USAGE_STATUS_KEY, undefined]);

      await handler?.("sideways", ctx);
      assert.ok(notifications.some(([message, level]) => level === "error" && message.includes("Unknown argument")));
      await mock.handlers.get("session_shutdown")?.({}, ctx);
    });
  } finally {
    tmp.cleanup();
  }
});
