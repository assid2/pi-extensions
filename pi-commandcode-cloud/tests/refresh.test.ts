/**
 * `refreshModels` contract tests (plan §8 `refresh.test.ts`, §11.4 C5).
 *
 * Pins: stored → generated fallback, never `[]`, `allowNetwork:false` is a pure
 * read, fresh-snapshot cooldown, persist only on full success, checkedAt
 * advanced on partial failure, publish rejection keeps the in-memory list, and
 * rehydration of `provider`/`api`/`baseUrl`.
 *
 * The catalog fetch has no injection point (it is pi's `refreshModels`,
 * network-free by contract), so these tests stub `globalThis.fetch`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelsPublication, ModelsStoreEntry, RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { PROVIDER_API_BASE } from "../constants.ts";
import { GENERATED_MODELS } from "../models.generated.ts";
import { type RehydratedModel, refreshCommandCodeCatalog, rehydrate } from "../models.ts";
import { loadFixture, routedFetch } from "./helpers.ts";

const MODELS_FIXTURE = loadFixture("models.json");
const MODELS_URL_ENV = "COMMANDCODE_MODELS_URL";
const FAKE_URL = "https://catalog.test/provider/v1/models";

async function withGlobalFetch<T>(fetchFn: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function withModelsUrl<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env[MODELS_URL_ENV];
  process.env[MODELS_URL_ENV] = FAKE_URL;
  return fn().finally(() => {
    if (original === undefined) delete process.env[MODELS_URL_ENV];
    else process.env[MODELS_URL_ENV] = original;
  });
}

function storedModels(): ProviderModelConfig[] {
  const ids = ["deepseek/deepseek-v4.1-flash", "Qwen/Qwen3.8-27B", "claude-sonnet-5"];
  return ids.map((id) => {
    const model = GENERATED_MODELS.find((candidate) => candidate.id === id);
    if (!model) throw new Error(`missing generated model ${id}`);
    return model;
  });
}

function storeEntry(checkedAt?: number): ModelsStoreEntry {
  return { models: storedModels() as unknown as ModelsStoreEntry["models"], checkedAt };
}

interface PublishSpy {
  calls: ModelsPublication[];
}

function makeContext(options: {
  stored?: ModelsStoreEntry;
  allowNetwork: boolean;
  force?: boolean;
  signal?: AbortSignal;
  publish?: (publication: ModelsPublication) => Promise<boolean>;
}): { context: RefreshModelsContext; publishSpy: PublishSpy } {
  const publishSpy: PublishSpy = { calls: [] };
  const context: RefreshModelsContext = {
    stored: options.stored,
    allowNetwork: options.allowNetwork,
    force: options.force,
    signal: options.signal ?? new AbortController().signal,
    async publish(publication: ModelsPublication): Promise<boolean> {
      publishSpy.calls.push(publication);
      return options.publish ? options.publish(publication) : true;
    },
  };
  return { context, publishSpy };
}

async function captureWarn<T>(fn: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    return { result: await fn(), warnings };
  } finally {
    console.warn = original;
  }
}

// --- Fallback / never [] ---

test("refreshModels: stored snapshot wins and is returned as a mutable rehydrated copy", async () => {
  const entry = storeEntry(0);
  const { context } = makeContext({ stored: entry, allowNetwork: false });
  const result = await refreshCommandCodeCatalog(context);
  assert.equal(result.length, storedModels().length);
  const first = result[0] as unknown as RehydratedModel | undefined;
  assert.equal(first?.provider, "commandcode-cloud");
  assert.equal(first?.api, "openai-completions");
  assert.equal(first?.baseUrl, PROVIDER_API_BASE);
  // A copy, not the stored array.
  assert.notEqual(result, entry.models);
  result.push(result[0] as ProviderModelConfig);
  assert.equal(entry.models.length, storedModels().length);
});

test("refreshModels: no stored snapshot falls back to GENERATED_MODELS (never [])", async () => {
  const { context } = makeContext({ allowNetwork: false });
  const result = await refreshCommandCodeCatalog(context);
  assert.ok(result.length > 0);
  assert.equal(result, GENERATED_MODELS);
  assert.ok(
    result.some((model) => model.id.includes("/")),
    "slash-containing ids survive the fallback",
  );
});

test("refreshModels: allowNetwork:false is a pure read (no fetch, no publish)", async () => {
  const fake = routedFetch([["", { body: MODELS_FIXTURE }]]);
  await withGlobalFetch(fake.fetchFn, async () => {
    const { context, publishSpy } = makeContext({ stored: storeEntry(0), allowNetwork: false });
    const result = await refreshCommandCodeCatalog(context);
    assert.equal(result.length, storedModels().length);
    assert.equal(fake.requests.length, 0);
    assert.equal(publishSpy.calls.length, 0);
  });
});

test("refreshModels: a fresh checkedAt within the cooldown is reused without a fetch", async () => {
  const fake = routedFetch([["", { body: MODELS_FIXTURE }]]);
  await withGlobalFetch(fake.fetchFn, async () => {
    const { context, publishSpy } = makeContext({ stored: storeEntry(Date.now()), allowNetwork: true });
    const result = await refreshCommandCodeCatalog(context);
    assert.equal(fake.requests.length, 0);
    assert.equal(publishSpy.calls.length, 0);
    assert.equal(result.length, storedModels().length);
  });
});

test("refreshModels: an aborted signal short-circuits to the fallback", async () => {
  const fake = routedFetch([["", { body: MODELS_FIXTURE }]]);
  await withGlobalFetch(fake.fetchFn, async () => {
    const controller = new AbortController();
    controller.abort();
    const { context } = makeContext({ stored: storeEntry(0), allowNetwork: true, signal: controller.signal });
    const result = await refreshCommandCodeCatalog(context);
    assert.equal(fake.requests.length, 0);
    assert.equal(result.length, storedModels().length);
  });
});

// --- Full-success persistence ---

test("refreshModels: a forced refresh persists only on full success", async () => {
  const fake = routedFetch([["", { body: MODELS_FIXTURE }]]);
  await withModelsUrl(() =>
    withGlobalFetch(fake.fetchFn, async () => {
      const { context, publishSpy } = makeContext({ stored: storeEntry(0), allowNetwork: true, force: true });
      const result = await refreshCommandCodeCatalog(context);
      assert.equal(fake.requests.length, 1);
      assert.equal(fake.requests[0]?.url, FAKE_URL);
      assert.equal(result.length, 8);
      assert.equal(publishSpy.calls.length, 1);
      const persist = publishSpy.calls[0]?.persist;
      assert.ok(persist && "models" in persist);
      assert.equal(persist.models.length, 8);
      assert.ok(typeof persist.checkedAt === "number" && persist.checkedAt > 0);
      // Every persisted model carries its own provider/api/baseUrl.
      for (const model of persist.models) {
        const rehydrated = rehydrate(model as unknown as ProviderModelConfig);
        assert.equal(rehydrated.provider, "commandcode-cloud");
        assert.ok(rehydrated.api === "openai-completions" || rehydrated.api === "anthropic-messages");
        assert.ok(typeof rehydrated.baseUrl === "string" && rehydrated.baseUrl.startsWith("https://"));
      }
    }),
  );
});

test("refreshModels: a partial refresh keeps the stored list but advances checkedAt", async () => {
  const partial = {
    object: "list",
    data: [...(MODELS_FIXTURE as { data: unknown[] }).data, { id: "   " }],
  };
  const fake = routedFetch([["", { body: partial }]]);
  await withGlobalFetch(fake.fetchFn, async () => {
    const entry = storeEntry(1_000);
    const { context, publishSpy } = makeContext({ stored: entry, allowNetwork: true, force: true });
    const { result, warnings } = await captureWarn(() => refreshCommandCodeCatalog(context));
    // The freshly assembled list is returned even though persistence was partial.
    assert.equal(result.length, 8);
    assert.equal(publishSpy.calls.length, 1);
    const persist = publishSpy.calls[0]?.persist;
    assert.ok(persist && "models" in persist);
    // Only the stored models are persisted (the partial catalog is not adopted).
    assert.equal(persist.models.length, entry.models.length);
    assert.ok(typeof persist.checkedAt === "number" && persist.checkedAt > 1_000);
    assert.ok(warnings.some((line) => line.includes("refresh incomplete")));
  });
});

// --- Publish rejection / failure ---

test("refreshModels: a rejected publish keeps the in-memory list and logs", async () => {
  const fake = routedFetch([["", { body: MODELS_FIXTURE }]]);
  await withGlobalFetch(fake.fetchFn, async () => {
    const { context, publishSpy } = makeContext({
      stored: storeEntry(0),
      allowNetwork: true,
      force: true,
      publish: async () => false,
    });
    const { result, warnings } = await captureWarn(() => refreshCommandCodeCatalog(context));
    assert.equal(publishSpy.calls.length, 1);
    assert.equal(result.length, 8, "the in-memory list is returned despite the rejected persist");
    assert.ok(warnings.some((line) => line.includes("persist rejected")));
  });
});

test("refreshModels: a throwing publish keeps the in-memory list and logs", async () => {
  const fake = routedFetch([["", { body: MODELS_FIXTURE }]]);
  await withGlobalFetch(fake.fetchFn, async () => {
    const { context } = makeContext({
      stored: storeEntry(0),
      allowNetwork: true,
      force: true,
      publish: async () => {
        throw new Error("disk full for user_Abc123456789");
      },
    });
    const { result, warnings } = await captureWarn(() => refreshCommandCodeCatalog(context));
    assert.equal(result.length, 8);
    assert.ok(warnings.some((line) => line.includes("persist failed")));
    // Secret redaction is applied to the logged error.
    assert.ok(!warnings.join("\n").includes("user_Abc123456789"));
  });
});

test("refreshModels: a transport error propagates (pi keeps the last good catalog)", async () => {
  const fake = routedFetch([["", { status: 500, body: { error: "boom" } }]]);
  await withGlobalFetch(fake.fetchFn, async () => {
    const { context, publishSpy } = makeContext({ stored: storeEntry(0), allowNetwork: true, force: true });
    await assert.rejects(() => refreshCommandCodeCatalog(context), /Command Code model catalog/);
    assert.equal(publishSpy.calls.length, 0);
  });
});
