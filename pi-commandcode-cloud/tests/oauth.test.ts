/**
 * OAuth / loopback login tests (plan §8 `oauth.test.ts`, §3.5, §5, §10 R9).
 *
 * Pins: login-URL construction (state, callback, port range, allowlist),
 * state-mismatch → 403 without a credential, required-field → 400, the CORS /
 * private-network preflight, Studio `access_denied`, the 120 s-configurable
 * timeout, paste validation (200/401/placeholder) and the static-credential
 * shape.
 *
 * The loopback callback server is the unit under test, so these tests do open
 * one `127.0.0.1` socket; no Command Code API is contacted (`validateCommandCodeKey`
 * always gets an injected `fetchFn`).
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import {
  AuthCallbackError,
  buildCallbackUrl,
  buildLoginUrl,
  generateStateToken,
  isAuthCallbackError,
  isAuthTimeoutError,
  resolveAuthTimeoutMs,
  startAuthServer,
} from "../auth-server.ts";
import { API_BASE, AUTH_LOGIN_URL, WHOAMI_PATH } from "../constants.ts";
import {
  commandCodeOAuth,
  credentialsFromApiKey,
  getApiKey,
  loginCommandCode,
  refreshToken,
  validateCommandCodeKey,
} from "../oauth.ts";
import { loadFixture } from "./helpers.ts";

const WHOAMI = loadFixture("whoami.json");

interface ApiRequest {
  url: string;
  headers: Record<string, string>;
}

function apiFetch(payload: unknown, status = 200): { fetchFn: typeof fetch; requests: ApiRequest[] } {
  const requests: ApiRequest[] = [];
  const fetchFn = (async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers as Record<string, string>) ?? {})) {
      headers[key.toLowerCase()] = value;
    }
    requests.push({ url, headers });
    return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
  }) as typeof fetch;
  return { fetchFn, requests };
}

function loopbackUrl(port: number, path = "/callback"): string {
  return `http://127.0.0.1:${port}${path}`;
}

function validCallbackBody(state: string, apiKey = "user_browser_ok"): string {
  return JSON.stringify({ apiKey, state, userId: "u_1", userName: "ada", keyName: "laptop" });
}

function callbacks(overrides: Partial<OAuthLoginCallbacks> = {}): OAuthLoginCallbacks {
  return {
    onAuth: () => {},
    onDeviceCode: () => {},
    onPrompt: async () => "",
    onSelect: async () => undefined,
    ...overrides,
  };
}

// --- URL construction ---

test("buildLoginUrl / buildCallbackUrl: Studio URL carries the callback and state", () => {
  const callbackUrl = buildCallbackUrl(5959);
  assert.equal(callbackUrl, "http://localhost:5959/callback");
  const loginUrl = buildLoginUrl(callbackUrl, "abc123");
  assert.ok(loginUrl.startsWith(`${AUTH_LOGIN_URL}?`));
  const parsed = new URL(loginUrl);
  assert.equal(parsed.searchParams.get("callback"), callbackUrl);
  assert.equal(parsed.searchParams.get("state"), "abc123");
});

test("generateStateToken: 32 random bytes encoded as base64url", () => {
  const token = generateStateToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(token.length, 43); // ceil(32 * 4 / 3)
  assert.notEqual(token, generateStateToken());
});

// --- Loopback server ---

test("startAuthServer: binds 5959-5968, serves CORS/PNA preflight and resolves one valid callback", async () => {
  const server = await startAuthServer({ startPort: 5959, endPort: 5968, timeoutMs: 5_000 });
  try {
    assert.ok(server.port >= 5959 && server.port <= 5968, `port ${server.port} in 5959-5968`);
    // Bound to loopback only, never a public interface.
    assert.equal((server.server.address() as AddressInfo).address, "127.0.0.1");
    assert.equal(server.callbackUrl, `http://localhost:${server.port}/callback`);
    assert.equal(new URL(server.loginUrl).searchParams.get("callback"), server.callbackUrl);
    assert.equal(new URL(server.loginUrl).searchParams.get("state"), server.state);

    // Allowed-origin preflight: allowlist origin + private-network + echoed headers.
    const preflight = await fetch(loopbackUrl(server.port), {
      method: "OPTIONS",
      headers: { origin: "https://commandcode.ai", "access-control-request-headers": "content-type, x-custom" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://commandcode.ai");
    assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
    assert.equal(preflight.headers.get("access-control-allow-headers"), "content-type, x-custom");

    // Disallowed origin gets no ACAO header.
    const denied = await fetch(loopbackUrl(server.port), {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);

    // State mismatch: 403 and no credential.
    const mismatch = await fetch(loopbackUrl(server.port), {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://commandcode.ai" },
      body: validCallbackBody("wrong-state"),
    });
    assert.equal(mismatch.status, 403);

    // Missing required fields: 400.
    const missing = await fetch(loopbackUrl(server.port), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "user_x" }),
    });
    assert.equal(missing.status, 400);

    // Valid callback: 200 and resolves exactly once.
    const ok = await fetch(loopbackUrl(server.port), {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://staging.commandcode.ai" },
      body: validCallbackBody(server.state),
    });
    assert.equal(ok.status, 200);

    const callback = await server.waitForCallback;
    assert.deepEqual(callback, {
      apiKey: "user_browser_ok",
      state: server.state,
      userId: "u_1",
      userName: "ada",
      keyName: "laptop",
    });
  } finally {
    server.close();
  }
});

test("startAuthServer: a Studio error callback rejects with AuthCallbackError", async () => {
  const server = await startAuthServer({ timeoutMs: 5_000 });
  try {
    const response = await fetch(loopbackUrl(server.port), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "access_denied", error_description: "user cancelled" }),
    });
    assert.equal(response.status, 200);
    await assert.rejects(server.waitForCallback, (error: unknown) => {
      assert.ok(isAuthCallbackError(error));
      assert.ok(error instanceof AuthCallbackError);
      assert.equal((error as AuthCallbackError).code, "access_denied");
      return true;
    });
  } finally {
    server.close();
  }
});

test("startAuthServer: the wait budget times out (COMMANDCODE_AUTH_TIMEOUT_MS override respected)", async () => {
  assert.equal(resolveAuthTimeoutMs({}, 30), 30);
  assert.equal(resolveAuthTimeoutMs({ COMMANDCODE_AUTH_TIMEOUT_MS: "40" }), 40);
  assert.equal(resolveAuthTimeoutMs({ COMMANDCODE_AUTH_TIMEOUT_MS: "not-a-number" }), 120_000);

  const server = await startAuthServer({ timeoutMs: 30 });
  try {
    await assert.rejects(server.waitForCallback, (error: unknown) => isAuthTimeoutError(error));
  } finally {
    server.close();
  }
});

test("startAuthServer: the body cap rejects oversized callbacks with 413", async () => {
  const server = await startAuthServer({ timeoutMs: 4_000, bodyLimitBytes: 10 });
  try {
    const response = await fetch(loopbackUrl(server.port), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: validCallbackBody(server.state),
    });
    assert.equal(response.status, 413);
  } finally {
    server.close();
  }
});

test("startAuthServer: the default cap is 10 KB", async () => {
  const server = await startAuthServer({ timeoutMs: 4_000 });
  try {
    const oversized = JSON.stringify({
      apiKey: `user_${"a".repeat(11_000)}`,
      state: server.state,
      userId: "u_1",
      userName: "ada",
      keyName: "laptop",
    });
    assert.ok(oversized.length > 10 * 1024);
    const response = await fetch(loopbackUrl(server.port), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversized,
    });
    assert.equal(response.status, 413);
  } finally {
    server.close();
  }
});

test("startAuthServer: falls back to an ephemeral port when 5959-5968 are all busy", async () => {
  const blockers: Server[] = [];
  const occupied = new Set<number>();
  for (let port = 5959; port <= 5968; port += 1) {
    const blocker = createServer((_request, response) => response.end());
    try {
      await new Promise<void>((resolve, reject) => {
        blocker.once("error", reject);
        blocker.listen(port, "127.0.0.1", () => resolve());
      });
      blockers.push(blocker);
    } catch {
      // The port is already taken by another process, which still counts as busy.
      blocker.close();
    }
    occupied.add(port);
  }

  try {
    assert.equal(occupied.size, 10);
    const server = await startAuthServer({ startPort: 5959, endPort: 5968, timeoutMs: 5_000 });
    try {
      assert.ok(server.port > 0);
      assert.ok(server.port < 5959 || server.port > 5968, `expected an ephemeral port, got ${server.port}`);
    } finally {
      server.close();
    }
  } finally {
    await Promise.all(blockers.map((blocker) => new Promise<void>((resolve) => blocker.close(() => resolve()))));
  }
});

// --- validateCommandCodeKey ---

test("validateCommandCodeKey: 200 validates and returns the whoami identity", async () => {
  const api = apiFetch(WHOAMI);
  const result = await validateCommandCodeKey("user_validate_ok", api.fetchFn);
  assert.equal(result.valid, true);
  assert.equal(result.status, 200);
  assert.equal(result.user?.userName, "ada");
  assert.equal(result.org?.id, "org_RedactedOrg01");
  assert.equal(api.requests[0]?.url, `${API_BASE}${WHOAMI_PATH}`);
  assert.equal(api.requests[0]?.headers.authorization, "Bearer user_validate_ok");
});

test("validateCommandCodeKey: 401 is invalid and never echoes the key", async () => {
  const api = apiFetch(loadFixture("unauthorized.json"), 401);
  const result = await validateCommandCodeKey("user_validate_bad", api.fetchFn);
  assert.equal(result.valid, false);
  assert.equal(result.status, 401);
  assert.match(result.error ?? "", /Invalid Command Code API key/);
  assert.ok(!(result.error ?? "").includes("user_validate_bad"));
});

test("validateCommandCodeKey: 200 with success:false is still a rejection", async () => {
  const api = apiFetch({ success: false, error: { message: "revoked" } });
  const result = await validateCommandCodeKey("user_validate_revoked", api.fetchFn);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /revoked/);
});

test("validateCommandCodeKey: placeholder/empty keys short-circuit before any request", async () => {
  const api = apiFetch(WHOAMI);
  for (const key of ["", "   ", "$COMMAND_CODE_API_KEY"]) {
    const result = await validateCommandCodeKey(key, api.fetchFn);
    assert.equal(result.valid, false);
    assert.equal(result.status, 0);
  }
  assert.equal(api.requests.length, 0);
});

test("validateCommandCodeKey: a transport failure degrades to status 0", async () => {
  const fetchFn = (async () => {
    throw new Error("socket hang up");
  }) as unknown as typeof fetch;
  const result = await validateCommandCodeKey("user_transport_fail", fetchFn);
  assert.equal(result.valid, false);
  assert.equal(result.status, 0);
  assert.match(result.error ?? "", /Could not reach Command Code/);
});

// --- loginCommandCode: paste flow ---

test("loginCommandCode: paste flow validates the key and returns the static credential shape", async () => {
  const api = apiFetch(WHOAMI);
  const progress: string[] = [];
  const before = Date.now();
  const credentials = await loginCommandCode(
    callbacks({
      onSelect: async () => "paste",
      onPrompt: async () => "user_paste_ok",
      onProgress: (message) => progress.push(message),
    }),
    { fetchFn: api.fetchFn, maxAttempts: 1 },
  );

  assert.equal(credentials.refresh, "user_paste_ok");
  assert.equal(credentials.access, "user_paste_ok");
  assert.equal(credentials.refresh, credentials.access, "Command Code keys are static (refresh === access)");
  assert.ok(credentials.expires > before + 9 * 365 * 24 * 60 * 60 * 1000, "expiry is ~10 years out");
  assert.ok(progress.some((line) => line.includes("Signed in")));
});

test("loginCommandCode: a rejected paste key is retried then fails", async () => {
  const api = apiFetch(loadFixture("unauthorized.json"), 401);
  let prompts = 0;
  await assert.rejects(
    () =>
      loginCommandCode(
        callbacks({
          onSelect: async () => "paste",
          onPrompt: async () => {
            prompts += 1;
            return "user_rejected";
          },
        }),
        { fetchFn: api.fetchFn, maxAttempts: 2 },
      ),
    /no valid API key provided after 2 attempts/,
  );
  assert.equal(prompts, 2);
});

test("loginCommandCode: no callback surface for prompting fails with actionable guidance", async () => {
  await assert.rejects(
    () =>
      loginCommandCode(
        {
          onAuth: () => {},
          onDeviceCode: () => {},
          onPrompt: undefined as unknown as OAuthLoginCallbacks["onPrompt"],
          onSelect: async () => "paste",
        },
        { fetchFn: apiFetch(WHOAMI).fetchFn },
      ),
    /cannot prompt/,
  );
});

// --- loginCommandCode: browser flow against the real loopback server ---

test("loginCommandCode: browser flow opens the Studio URL and accepts the loopback callback", async () => {
  const api = apiFetch(WHOAMI);
  let authUrl: string | undefined;
  let callbackStatus = 0;
  let callbackRequest: Promise<void> = Promise.resolve();

  const promise = loginCommandCode(
    callbacks({
      onSelect: async () => "browser",
      onAuth: (info) => {
        authUrl = info.url;
        const parsed = new URL(info.url);
        const callback = parsed.searchParams.get("callback") ?? "";
        const state = parsed.searchParams.get("state") ?? "";
        const port = Number(new URL(callback).port);
        callbackRequest = fetch(loopbackUrl(port), {
          method: "POST",
          headers: { "content-type": "application/json", origin: "https://commandcode.ai" },
          body: validCallbackBody(state, "user_browser_flow"),
        }).then((response) => {
          callbackStatus = response.status;
        });
      },
      onProgress: () => {},
    }),
    { fetchFn: api.fetchFn, startPort: 5959, endPort: 5968, timeoutMs: 5_000 },
  );

  const credentials = await promise;
  await callbackRequest;
  assert.ok(authUrl?.startsWith(AUTH_LOGIN_URL), `authUrl ${authUrl}`);
  const parsedAuth = new URL(authUrl ?? "");
  assert.match(parsedAuth.searchParams.get("state") ?? "", /^[A-Za-z0-9_-]{43}$/);
  const port = Number(new URL(parsedAuth.searchParams.get("callback") ?? "").port);
  assert.ok(port >= 5959 && port <= 5968);
  assert.equal(callbackStatus, 200);
  assert.equal(credentials.access, "user_browser_flow");
});

// --- static credential helpers ---

test("credentialsFromApiKey / refreshToken / getApiKey: static key re-wrapping", async () => {
  const credentials = credentialsFromApiKey("user_static_1");
  assert.equal(credentials.access, "user_static_1");
  assert.equal(credentials.refresh, "user_static_1");
  assert.equal(getApiKey(credentials), "user_static_1");

  const refreshed = await refreshToken({ refresh: "user_static_1", access: "user_static_1", expires: 0 });
  assert.equal(refreshed.access, "user_static_1");
  assert.ok(refreshed.expires > Date.now());

  await assert.rejects(() => refreshToken({ refresh: "", access: "", expires: 0 }), /missing an API key/);
});

test("commandCodeOAuth: exposes the documented ProviderConfig.oauth surface", () => {
  assert.equal(commandCodeOAuth.name, "Command Code");
  assert.equal(commandCodeOAuth.isSubscription, false);
  assert.equal(commandCodeOAuth.usesCallbackServer, true);
  assert.equal(typeof commandCodeOAuth.login, "function");
  assert.equal(typeof commandCodeOAuth.refreshToken, "function");
  assert.equal(typeof commandCodeOAuth.getApiKey, "function");
});
