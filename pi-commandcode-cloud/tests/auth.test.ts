/**
 * Credential interop + sanitization tests (plan §8 `auth.test.ts`, §3.5).
 *
 * Pins: `readInteropAuthJson` (`apiKey` + `key` alias), env precedence,
 * registry-over-env precedence, the `$COMMAND_CODE_API_KEY` placeholder guard,
 * bracketed-paste/control-character sanitization and secret redaction.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PLACEHOLDER_API_KEY, PROVIDER_ID } from "../constants.ts";
import {
  getCommandCodeApiKey,
  interopAuthPath,
  readInteropAuthJson,
  redactCommandCodeErrorText,
  resolveCommandCodeApiKey,
  sanitizeApiKey,
} from "../utils.ts";

function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "cc-auth-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function ctx(registryKey?: string | (() => Promise<string | undefined>)): Pick<ExtensionContext, "modelRegistry"> {
  return {
    modelRegistry: {
      getApiKeyForProvider: async () => (typeof registryKey === "function" ? await registryKey() : registryKey),
    },
  } as unknown as Pick<ExtensionContext, "modelRegistry">;
}

// --- readInteropAuthJson ---

test("readInteropAuthJson: accepts the canonical {apiKey} shape", () => {
  const { dir, cleanup } = tempDir();
  try {
    const path = join(dir, "auth.json");
    writeFileSync(
      path,
      JSON.stringify({
        apiKey: "user_interop_1",
        userId: "u_1",
        userName: "ada",
        keyName: "laptop",
        authenticatedAt: "2026-09-19T00:00:00.000Z",
      }),
    );
    const auth = readInteropAuthJson(path);
    assert.equal(auth?.apiKey, "user_interop_1");
    assert.equal(auth?.userId, "u_1");
    assert.equal(auth?.userName, "ada");
    assert.equal(auth?.keyName, "laptop");
    assert.equal(auth?.authenticatedAt, "2026-09-19T00:00:00.000Z");
  } finally {
    cleanup();
  }
});

test("readInteropAuthJson: tolerates the `key` alias and ignores malformed files", () => {
  const { dir, cleanup } = tempDir();
  try {
    const aliasPath = join(dir, "alias.json");
    writeFileSync(aliasPath, JSON.stringify({ key: "user_alias_1" }));
    assert.equal(readInteropAuthJson(aliasPath)?.apiKey, "user_alias_1");

    const brokenPath = join(dir, "broken.json");
    writeFileSync(brokenPath, "{not json");
    assert.equal(readInteropAuthJson(brokenPath), undefined);

    const arrayPath = join(dir, "array.json");
    writeFileSync(arrayPath, "[1,2,3]");
    assert.equal(readInteropAuthJson(arrayPath), undefined);

    assert.equal(readInteropAuthJson(join(dir, "missing.json")), undefined);
  } finally {
    cleanup();
  }
});

test("interopAuthPath: resolves to ~/.commandcode/auth.json", () => {
  assert.ok(interopAuthPath().endsWith(join(".commandcode", "auth.json")));
});

// --- sanitizeApiKey ---

test("sanitizeApiKey: strips bracketed-paste markers and control characters", () => {
  assert.equal(sanitizeApiKey("\u001b[200~user_abc123\u001b[201~"), "user_abc123");
  assert.equal(sanitizeApiKey("  user_abc123\u0000\u001b[201~  "), "user_abc123");
  assert.equal(sanitizeApiKey("user_abc\u0007123"), "user_abc123");
  assert.equal(sanitizeApiKey(""), undefined);
  assert.equal(sanitizeApiKey("   "), undefined);
  assert.equal(sanitizeApiKey(undefined), undefined);
  assert.equal(sanitizeApiKey(42), undefined);
});

test("sanitizeApiKey: placeholder and unresolved env/sentinel values are rejected", () => {
  assert.equal(sanitizeApiKey(PLACEHOLDER_API_KEY), undefined);
  assert.equal(sanitizeApiKey("$COMMAND_CODE_API_KEY"), undefined);
  assert.equal(sanitizeApiKey("$SOME_OTHER_ENV"), undefined);
  assert.equal(sanitizeApiKey("null"), undefined);
  assert.equal(sanitizeApiKey("changeme"), undefined);
  assert.equal(sanitizeApiKey("user_real_key"), "user_real_key");
});

// --- redaction ---

test("redactCommandCodeErrorText: strips Bearer tokens and user_/cc_ keys", () => {
  assert.equal(redactCommandCodeErrorText("Bearer user_secret_123"), "Bearer [redacted]");
  assert.equal(redactCommandCodeErrorText("key=cc_abcdef123"), "key=cc_[redacted]");
  assert.equal(redactCommandCodeErrorText('{"apiKey":"user_json_secret"}'), '{"apiKey":"[redacted]"}');
  assert.equal(redactCommandCodeErrorText("user_alpha and user_beta"), "user_[redacted] and user_[redacted]");
  assert.equal(redactCommandCodeErrorText(undefined), "");
  assert.equal(redactCommandCodeErrorText(null), "");
  assert.equal(redactCommandCodeErrorText(1234), "1234");
});

// --- precedence ---

test("resolveCommandCodeApiKey: the pi registry wins over every env var", async () => {
  const resolved = await resolveCommandCodeApiKey(ctx("user_registry_1"), {
    COMMAND_CODE_API_KEY: "user_env_1",
    COMMANDCODE_API_KEY: "user_env_2",
  });
  assert.deepEqual(resolved, { key: "user_registry_1", source: "registry" });
});

test("resolveCommandCodeApiKey: env precedence COMMAND_CODE_API_KEY > aliases", async () => {
  assert.deepEqual(await resolveCommandCodeApiKey(ctx(), { COMMAND_CODE_API_KEY: "user_primary" }), {
    key: "user_primary",
    source: "env",
    sourceDetail: "COMMAND_CODE_API_KEY",
  });
  assert.deepEqual(await resolveCommandCodeApiKey(ctx(), { COMMANDCODE_API_KEY: "user_alias_1" }), {
    key: "user_alias_1",
    source: "env",
    sourceDetail: "COMMANDCODE_API_KEY",
  });
  assert.deepEqual(await resolveCommandCodeApiKey(ctx(), { CMD_API_KEY: "user_alias_2" }), {
    key: "user_alias_2",
    source: "env",
    sourceDetail: "CMD_API_KEY",
  });
});

test("resolveCommandCodeApiKey: the placeholder never wins (registry then env fall through)", async () => {
  const resolved = await resolveCommandCodeApiKey(ctx(PLACEHOLDER_API_KEY), {
    COMMAND_CODE_API_KEY: PLACEHOLDER_API_KEY,
    COMMANDCODE_API_KEY: "user_env_win",
  });
  assert.deepEqual(resolved, { key: "user_env_win", source: "env", sourceDetail: "COMMANDCODE_API_KEY" });
});

test("resolveCommandCodeApiKey: a failing registry call degrades to env", async () => {
  const resolved = await resolveCommandCodeApiKey(
    ctx(async () => {
      throw new Error("registry unavailable");
    }),
    { COMMAND_CODE_API_KEY: "user_env_fallback" },
  );
  assert.equal(resolved.key, "user_env_fallback");
  assert.equal(resolved.source, "env");
});

test("resolveCommandCodeApiKey: falls back to the read-only CLI auth.json", async () => {
  const { dir, cleanup } = tempDir();
  const originalHome = process.env.HOME;
  try {
    mkdirSync(join(dir, ".commandcode"));
    writeFileSync(join(dir, ".commandcode", "auth.json"), JSON.stringify({ apiKey: "user_cli_file" }));
    process.env.HOME = dir;

    assert.equal(interopAuthPath(), join(dir, ".commandcode", "auth.json"));
    const resolved = await resolveCommandCodeApiKey(ctx(), {});
    assert.equal(resolved.key, "user_cli_file");
    assert.equal(resolved.source, "auth.json");

    // A placeholder in the CLI file must not be accepted either.
    writeFileSync(join(dir, ".commandcode", "auth.json"), JSON.stringify({ apiKey: PLACEHOLDER_API_KEY }));
    assert.deepEqual(await resolveCommandCodeApiKey(ctx(), {}), { source: "none" });
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    cleanup();
  }
});

test("getCommandCodeApiKey: returns the resolved key or undefined", async () => {
  assert.equal(await getCommandCodeApiKey(ctx(), { COMMAND_CODE_API_KEY: "user_direct" }), "user_direct");
  const { dir, cleanup } = tempDir();
  const originalHome = process.env.HOME;
  try {
    process.env.HOME = dir; // no auth.json here
    assert.equal(await getCommandCodeApiKey(ctx(), {}), undefined);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    cleanup();
  }
});

test("PROVIDER_ID is the documented provider id", () => {
  assert.equal(PROVIDER_ID, "commandcode-cloud");
});
