import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AccountRegistry,
  buildAccounts,
  registerAliasProviders,
  registerOllamaNamespaceProviders,
  resolveCredential,
} from "../extensions/usage/accounts/registry.ts";
import type { UsageConfig } from "../extensions/usage/config.ts";

interface FakeProvider {
  id: string;
  name: string;
  baseUrl?: string;
  headers?: Record<string, string | null>;
  refreshModels?: (context: unknown) => Promise<unknown>;
  getModels(): unknown[];
}

function makeCtx(providers: FakeProvider[], auth: Record<string, { configured: boolean; apiKey?: string; headers?: Record<string, string>; source?: string }>) {
  const registered: Array<{ name: string; config: unknown }> = [];
  const registeredIds = new Set<string>();
  // Clones registered through registerProvider become visible to getProvider so
  // the namespace pass stays idempotent in tests, exactly like the real registry.
  const find = (id: string): FakeProvider | undefined => {
    const clone = registered.find((entry) => entry.name === id);
    if (clone) {
      const cfg = clone.config as { name?: string; models?: unknown[]; refreshModels?: FakeProvider["refreshModels"] };
      return { id, name: cfg.name ?? id, getModels: () => (Array.isArray(cfg.models) ? cfg.models : []), refreshModels: cfg.refreshModels };
    }
    return providers.find((p) => p.id === id);
  };
  return {
    modelRegistry: {
      getProvider: find,
      getProviderDisplayName: (id: string) => find(id)?.name ?? id,
      getProviderAuthStatus: (id: string) => ({ configured: auth[id]?.configured ?? false, label: auth[id]?.source }),
      getProviderAuth: async (id: string) => {
        const a = auth[id];
        if (!a) return undefined;
        return { auth: { apiKey: a.apiKey, headers: a.headers }, source: a.source };
      },
      registerProvider: (name: string, config: unknown) => {
        registered.push({ name, config });
        registeredIds.add(name);
      },
      getRegisteredProviderIds: () => [...registeredIds],
    },
    registered,
  };
}

function tmpAgentDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usage-auth-"));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

const config: UsageConfig = {
  accounts: [
    { provider: "ollama-cloud", name: "work" },
    { provider: "ollama-cloud", name: "personal", alias: "ollama-cloud-personal", env: "OLLAMA_CLOUD_KEY_2" },
    { provider: "opencode-go", name: "go" },
  ],
  adapters: {},
  rollupWindow: "1d",
  pollIntervalMs: 120000,
};

test("buildAccounts: default + alias accounts", () => {
  const ctx = makeCtx([{ id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] }], {}) as never;
  const warnings: string[] = [];
  const registry = buildAccounts(ctx, config, warnings);
  assert.equal(registry.accounts.length, 3);
  const alias = registry.get("ollama-cloud-personal")!;
  assert.equal(alias.isAlias, true);
  assert.equal(alias.base, "ollama-cloud");
  assert.equal(alias.name, "personal");
  const work = registry.get("ollama-cloud")!;
  assert.equal(work.isAlias, false);
  assert.equal(work.name, "work");
});

test("registerAliasProviders: clones base provider shape for the alias", async () => {
  let baseRefreshes = 0;
  const providers: FakeProvider[] = [
    {
      id: "ollama-cloud",
      name: "Ollama Cloud",
      baseUrl: "https://ollama.com/v1",
      refreshModels: async () => {
        baseRefreshes++;
        return [];
      },
      getModels: () => [{ id: "qwen3.5:397b", name: "Qwen3.5 397B", api: "openai-completions", reasoning: false, input: ["text"], cost: {}, contextWindow: 262144, maxTokens: 32768 }],
    },
  ];
  const ctx = makeCtx(providers, {}) as never;
  const warnings: string[] = [];
  const registry = buildAccounts(ctx, config, warnings);
  registerAliasProviders(ctx, registry, config, warnings);

  const calls = (ctx as unknown as { registered: Array<{ name: string; config: Record<string, unknown> }> }).registered;
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.name, "ollama-cloud-personal");
  assert.equal(call.config.name, "Ollama Cloud (personal)");
  assert.equal(call.config.baseUrl, "https://ollama.com/v1");
  assert.equal(call.config.apiKey, "$OLLAMA_CLOUD_KEY_2");
  assert.equal(call.config.authHeader, true);
  assert.ok(Array.isArray(call.config.models));
  assert.equal((call.config.models as unknown[]).length, 1);

  // The clone inherits the base's refresh so the alias keeps the live catalog.
  assert.equal(typeof call.config.refreshModels, "function");
  const refreshed = await (call.config.refreshModels as (context: unknown) => Promise<unknown>)({});
  assert.equal(baseRefreshes, 1);
  assert.ok(Array.isArray(refreshed));
});

test("registerAliasProviders: omits refreshModels when the base has none", () => {
  const providers: FakeProvider[] = [{ id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] }];
  const ctx = makeCtx(providers, {}) as never;
  const warnings: string[] = [];
  const registry = buildAccounts(ctx, config, warnings);
  registerAliasProviders(ctx, registry, config, warnings);

  const calls = (ctx as unknown as { registered: Array<{ name: string; config: Record<string, unknown> }> }).registered;
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.config.refreshModels, undefined);
});

test("registerOllamaNamespaceProviders: clones each credentialed ollama-* id exactly once", () => {
  const base: FakeProvider = {
    id: "ollama-cloud",
    name: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    refreshModels: async () => [],
    getModels: () => [{ id: "qwen3.5:397b", api: "openai-completions" }],
  };
  const ctx = makeCtx([base], {}) as never;
  const dir = tmpAgentDir({ "auth.json": JSON.stringify({ "ollama-cloud": { type: "api_key" }, "ollama-assid2": { type: "api_key" }, vllm: { type: "api_key" } }) });
  const warnings: string[] = [];
  registerOllamaNamespaceProviders(ctx, dir, warnings);

  const calls = (ctx as unknown as { registered: Array<{ name: string; config: Record<string, unknown> }> }).registered;
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "ollama-assid2");
  assert.equal(calls[0]?.config.name, "Ollama Cloud (assid2)");
  assert.equal(calls[0]?.config.baseUrl, "https://ollama.com/v1");
  assert.equal(calls[0]?.config.apiKey, undefined, "clone must not inherit the base apiKey");
  assert.equal(typeof calls[0]?.config.refreshModels, "function");
  assert.deepEqual(warnings, []);

  // Idempotent across repeated session_start calls.
  registerOllamaNamespaceProviders(ctx, dir, warnings);
  assert.equal(calls.length, 1);
});

test("registerOllamaNamespaceProviders: a second ollama-* key yields an independent provider", () => {
  const base: FakeProvider = { id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [{ id: "m", api: "openai-completions" }] };
  const ctx = makeCtx([base], {}) as never;
  const dir = tmpAgentDir({ "auth.json": JSON.stringify({ "ollama-cloud": {}, "ollama-assid2": {}, "ollama-work": {} }) });
  registerOllamaNamespaceProviders(ctx, dir, []);

  const calls = (ctx as unknown as { registered: Array<{ name: string; config: Record<string, unknown> }> }).registered;
  assert.deepEqual(calls.map((c) => c.name).sort(), ["ollama-assid2", "ollama-work"]);
  assert.equal(calls.find((c) => c.name === "ollama-assid2")?.config.name, "Ollama Cloud (assid2)");
  assert.equal(calls.find((c) => c.name === "ollama-work")?.config.name, "Ollama Cloud (work)");
});

test("registerOllamaNamespaceProviders: absent base warns once and registers nothing", () => {
  const ctx = makeCtx([], {}) as never;
  const dir = tmpAgentDir({ "auth.json": JSON.stringify({ "ollama-assid2": { type: "api_key" } }) });
  const warnings: string[] = [];
  registerOllamaNamespaceProviders(ctx, dir, warnings);

  assert.equal((ctx as unknown as { registered: unknown[] }).registered.length, 0);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]?.includes("ollama-cloud"));
});

test("registerOllamaNamespaceProviders: malformed auth.json does not throw", () => {
  const base: FakeProvider = { id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] };
  const ctx = makeCtx([base], {}) as never;
  const dir = tmpAgentDir({ "auth.json": "{ not json" });
  const warnings: string[] = [];
  assert.doesNotThrow(() => registerOllamaNamespaceProviders(ctx, dir, warnings));
  assert.equal((ctx as unknown as { registered: unknown[] }).registered.length, 0);
  assert.equal(warnings.length, 1);
});

test("registerOllamaNamespaceProviders: missing auth.json is quiet", () => {
  const base: FakeProvider = { id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] };
  const ctx = makeCtx([base], {}) as never;
  const dir = tmpAgentDir({});
  const warnings: string[] = [];
  registerOllamaNamespaceProviders(ctx, dir, warnings);
  assert.equal((ctx as unknown as { registered: unknown[] }).registered.length, 0);
  assert.equal(warnings.length, 0);
});

test("registerAliasProviders: skips when the alias already exists or base is missing", () => {
  const providers: FakeProvider[] = [{ id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] }];
  const ctx = makeCtx(providers, {}) as never;
  const warnings: string[] = [];
  const registry = buildAccounts(ctx, config, warnings);
  // Pre-register the alias id.
  (ctx as unknown as { modelRegistry: { getProvider: (id: string) => FakeProvider | undefined } }).modelRegistry.getProvider = (id: string) =>
    id === "ollama-cloud-personal" ? { id: "ollama-cloud-personal", name: "existing", getModels: () => [] } : providers.find((p) => p.id === id);
  registerAliasProviders(ctx, registry, config, warnings);
  assert.equal((ctx as unknown as { registered: unknown[] }).registered.length, 0);
  assert.ok(warnings.some((w) => w.includes("already exists")));

  // Missing base provider.
  const ctx2 = makeCtx([], {}) as never;
  const warnings2: string[] = [];
  const registry2 = buildAccounts(ctx2, config, warnings2);
  registerAliasProviders(ctx2, registry2, config, warnings2);
  assert.ok(warnings2.some((w) => w.includes("base provider")));
});

test("resolveCredential: auth.json-first resolution and Bearer fallback", async () => {
  const providers: FakeProvider[] = [{ id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] }];
  const ctx = makeCtx(providers, {
    "ollama-cloud": { configured: true, apiKey: "oll-key-1", source: "OLLAMA_API_KEY" },
  }) as never;
  const registry = new AccountRegistry([{ id: "ollama-cloud", name: "Ollama Cloud", base: "ollama-cloud", isAlias: false }]);
  const cred = await resolveCredential(ctx, registry.get("ollama-cloud")!);
  assert.equal(cred.configured, true);
  assert.equal(cred.token, "oll-key-1");
  assert.equal(cred.source, "OLLAMA_API_KEY");

  // Unconfigured.
  const ctx2 = makeCtx(providers, {}) as never;
  const cred2 = await resolveCredential(ctx2, registry.get("ollama-cloud")!);
  assert.equal(cred2.configured, false);

  // Bearer header fallback (OAuth-style).
  const ctx3 = makeCtx(providers, {
    "ollama-cloud": { configured: true, headers: { Authorization: "Bearer oauth-tok" }, source: "OAuth" },
  }) as never;
  const cred3 = await resolveCredential(ctx3, registry.get("ollama-cloud")!);
  assert.equal(cred3.token, "oauth-tok");
});

test("accountForProvider: implicit default for unknown providers", () => {
  const registry = new AccountRegistry([]);
  const account = registry.accountForProvider("vllm", "vLLM (local)");
  assert.equal(account.id, "vllm");
  assert.equal(account.name, "vLLM (local)");
  assert.equal(account.isAlias, false);
  assert.equal(registry.get("vllm"), account);
});
