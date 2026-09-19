/**
 * One-shot loopback HTTP server for Command Code browser login.
 *
 * Command Code Studio posts the freshly minted API key back to a localhost
 * callback after the user authenticates (`cmd login` semantics). This module
 * mirrors the official CLI's callback server with the hardening required by the
 * implementation plan (`docs/plans/pi-commandcode-cloud.md` §3.5, §5, §10 R9):
 *
 * - binds `127.0.0.1` only (never a public interface),
 * - tries ports `5959..5968` in order and falls back to an ephemeral port,
 * - accepts exactly **one** valid `POST /callback` and then shuts down,
 * - checks the base64url `state` (32 random bytes) and answers `403` on mismatch,
 * - enforces the Studio CORS allowlist, echoes `Access-Control-Request-Headers`,
 *   and answers Chrome's Private Network Access preflight,
 * - caps the request body at 10 KB and times out after 120 s
 *   (`COMMANDCODE_AUTH_TIMEOUT_MS`).
 *
 * Every error string that can reach a response body, a notification or a log is
 * routed through `redactCommandCodeErrorText` from `./utils.ts` so a leaked key
 * can never be echoed back.
 */

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  AUTH_ALLOWED_ORIGINS,
  AUTH_BODY_LIMIT_BYTES,
  AUTH_CALLBACK_PATH,
  AUTH_LOGIN_URL,
  AUTH_PORT_END,
  AUTH_PORT_START,
  AUTH_TIMEOUT_MS,
  ENV_AUTH_TIMEOUT_MS,
} from "./constants.ts";
import { envInt, redactCommandCodeErrorText } from "./utils.ts";

/** Studio callback payload (the CLI names these fields exactly). */
export interface AuthCallback {
  apiKey: string;
  state: string;
  userId: string;
  userName: string;
  keyName: string;
}

/** Options accepted by {@link startAuthServer}. */
export interface AuthServerOptions {
  /** Expected `state`; generated with {@link generateStateToken} when omitted. */
  expectedState?: string;
  /** First port to try (inclusive). Defaults to {@link AUTH_PORT_START}. */
  startPort?: number;
  /** Last port to try (inclusive). Defaults to {@link AUTH_PORT_END}. */
  endPort?: number;
  /** Overall wait budget in ms. Defaults to `COMMANDCODE_AUTH_TIMEOUT_MS` or {@link AUTH_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** CORS allowlist override (tests). Defaults to {@link AUTH_ALLOWED_ORIGINS}. */
  allowedOrigins?: readonly string[];
  /** Body-size cap override (tests). Defaults to {@link AUTH_BODY_LIMIT_BYTES}. */
  bodyLimitBytes?: number;
  /** Callback path override (tests). Defaults to {@link AUTH_CALLBACK_PATH}. */
  callbackPath?: string;
  /** Env source for `COMMANDCODE_AUTH_TIMEOUT_MS`. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Aborts the wait (e.g. pi's login `callbacks.signal`). */
  signal?: AbortSignal;
}

/** Running callback server handed to the login flow. */
export interface AuthServer {
  /** Underlying `node:http` server (exposed for tests/observability). */
  server: Server;
  /** Bound loopback port (ephemeral when 5959–5968 were all in use). */
  port: number;
  /** The state the server will accept; embed it in the login URL. */
  state: string;
  /** `http://localhost:<port>/callback` — the Studio `callback` query value. */
  callbackUrl: string;
  /** Full Studio login URL (`onAuth({ url })`). */
  loginUrl: string;
  /** Resolves with the accepted callback, rejects on timeout/denial/abort. */
  waitForCallback: Promise<AuthCallback>;
  /** Force-close the server (idempotent). */
  close(): void;
}

/** Raised when no valid callback arrives within the configured budget. */
export class AuthTimeoutError extends Error {
  constructor(message = "Command Code browser login timed out") {
    super(message);
    this.name = "AuthTimeoutError";
  }
}

/**
 * Raised when the Studio reports a login error (including `access_denied`) or
 * when the callback cannot be accepted. `code` is the raw Studio error code.
 */
export class AuthCallbackError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(redactCommandCodeErrorText(message));
    this.name = "AuthCallbackError";
    this.code = code;
  }
}

/** True for {@link AuthTimeoutError} instances (name check, so it survives bundling). */
export function isAuthTimeoutError(error: unknown): boolean {
  return error instanceof AuthTimeoutError || (error instanceof Error && error.name === "AuthTimeoutError");
}

/** True for {@link AuthCallbackError} instances. */
export function isAuthCallbackError(error: unknown): boolean {
  return error instanceof AuthCallbackError || (error instanceof Error && error.name === "AuthCallbackError");
}

/** Generate a base64url CSRF `state` token from 32 cryptographically random bytes. */
export function generateStateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** `http://localhost:<port><path>` — the value Studio posts back to. */
export function buildCallbackUrl(port: number, callbackPath: string = AUTH_CALLBACK_PATH): string {
  return `http://localhost:${port}${callbackPath}`;
}

/** Studio CLI login URL with `callback` and `state` query parameters. */
export function buildLoginUrl(callbackUrl: string, state: string): string {
  return `${AUTH_LOGIN_URL}?callback=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
}

/** Resolve the wait budget from options/env. */
export function resolveAuthTimeoutMs(env: NodeJS.ProcessEnv = process.env, override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) return override;
  return envInt(ENV_AUTH_TIMEOUT_MS, AUTH_TIMEOUT_MS, env);
}

function sendJson(res: ServerResponse, status: number, payload: unknown, onDone?: () => void): void {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload), onDone);
}

function closeServer(server: Server): void {
  try {
    // Node >= 19 closes idle keep-alive sockets for us; in-flight responses
    // (e.g. the `{ success: true }` we just queued) are allowed to flush first.
    server.close();
  } catch {
    // Nothing useful to report during auth cleanup.
  }
}

function forceCloseServer(server: Server): void {
  closeServer(server);
  const withConnections = server as Server & { closeAllConnections?: () => void };
  try {
    withConnections.closeAllConnections?.();
  } catch {
    // Best effort only.
  }
}

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse, allowedOrigins: readonly string[]): void {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const allowed = origin.length > 0 && allowedOrigins.includes(origin);
  if (allowed) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  const requestedHeaders = req.headers["access-control-request-headers"];
  res.setHeader(
    "Access-Control-Allow-Headers",
    typeof requestedHeaders === "string" && requestedHeaders.trim().length > 0 ? requestedHeaders : "Content-Type",
  );
  // Chrome Private Network Access: an HTTPS Studio page posting to http://localhost.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function parseCallbackBody(
  body: string,
  expectedState: string,
): { ok: true; callback: AuthCallback } | { ok: false; status: number; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
  const raw = parsed as Record<string, unknown>;

  const pick = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

  const apiKey = pick(raw.apiKey);
  const state = pick(raw.state);
  const userId = pick(raw.userId);
  const userName = pick(raw.userName);
  const keyName = pick(raw.keyName);

  if (!apiKey || !state || !userId || !userName || !keyName) {
    return { ok: false, status: 400, error: "Missing required fields" };
  }
  if (state !== expectedState) {
    return { ok: false, status: 403, error: "Invalid state token" };
  }
  return { ok: true, callback: { apiKey, state, userId, userName, keyName } };
}

function readStudioError(parsed: unknown): { code: string; message: string } | undefined {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const raw = parsed as Record<string, unknown>;
  if (raw.error === undefined || raw.error === null || raw.error === false) return undefined;
  const code = typeof raw.error === "string" ? raw.error : "error";
  const description =
    typeof raw.error_description === "string"
      ? raw.error_description
      : typeof raw.error === "string"
        ? raw.error
        : "Command Code login failed";
  return { code, message: code === "access_denied" ? "Authorization was denied in the browser" : description };
}

function listenOnAvailablePort(server: Server, startPort: number, endPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let fellBack = false;

    const tryListen = () => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE" && !fellBack) {
          if (port < endPort) {
            port += 1;
            tryListen();
            return;
          }
          // Every well-known port is taken: ask the OS for an ephemeral port.
          fellBack = true;
          port = 0;
          tryListen();
          return;
        }
        reject(error);
      };

      const onListening = () => {
        server.off("error", onError);
        resolve((server.address() as AddressInfo).port);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    };

    tryListen();
  });
}

/**
 * Start the one-shot loopback callback server. Resolves once the server is
 * listening; `waitForCallback` settles on the first valid POST (or on
 * timeout/denial/abort).
 */
export async function startAuthServer(options: AuthServerOptions = {}): Promise<AuthServer> {
  const expectedState = options.expectedState ?? generateStateToken();
  const allowedOrigins = options.allowedOrigins ?? AUTH_ALLOWED_ORIGINS;
  const bodyLimitBytes = options.bodyLimitBytes ?? AUTH_BODY_LIMIT_BYTES;
  const callbackPath = options.callbackPath ?? AUTH_CALLBACK_PATH;
  const timeoutMs = resolveAuthTimeoutMs(options.env, options.timeoutMs);
  const startPort = options.startPort ?? AUTH_PORT_START;
  const endPort = options.endPort ?? AUTH_PORT_END;

  let settled = false;
  let timer: NodeJS.Timeout | undefined;
  let resolveCallback: (value: AuthCallback) => void = () => {};
  let rejectCallback: (error: Error) => void = () => {};

  const waitForCallback = new Promise<AuthCallback>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  // The login flow always awaits this promise; the guard below only prevents an
  // "unhandled rejection" when `startAuthServer` itself throws before the caller
  // gets a chance to attach its own handler.
  void waitForCallback.catch(() => {});

  const server = createServer((req, res) => {
    applyCorsHeaders(req, res, allowedOrigins);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    let pathname = "";
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      pathname = "";
    }

    if (pathname !== callbackPath) {
      sendJson(res, 404, { success: false, error: "Not found" });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { success: false, error: "Method not allowed. Use POST." });
      return;
    }
    if (settled) {
      // One-shot: a second callback must never overwrite the first credential.
      sendJson(res, 409, { success: false, error: "Login already completed" });
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;

    req.on("data", (chunk: Buffer) => {
      if (aborted || settled) return;
      size += chunk.length;
      if (size > bodyLimitBytes) {
        aborted = true;
        sendJson(res, 413, { success: false, error: "Request body too large" }, () => {
          try {
            req.destroy();
          } catch {
            // The socket may already be gone.
          }
        });
        return;
      }
      chunks.push(chunk);
    });

    req.on("error", () => {
      if (aborted || res.writableEnded) return;
      sendJson(res, 500, { success: false, error: "Request error" });
    });

    req.on("end", () => {
      if (aborted || settled) return;
      const body = Buffer.concat(chunks).toString("utf8");

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON" });
        return;
      }

      const studioError = readStudioError(parsed);
      if (studioError) {
        // The Studio aborts the flow (e.g. `access_denied`); acknowledge, then
        // fail the wait so the caller can fall back to API-key paste.
        sendJson(res, 200, { success: true });
        settled = true;
        if (timer) clearTimeout(timer);
        rejectCallback(new AuthCallbackError(studioError.code, studioError.message));
        closeServer(server);
        return;
      }

      const result = parseCallbackBody(body, expectedState);
      if (!result.ok) {
        // A bad/foreign callback (wrong state, missing fields) must not kill the
        // legitimate flow: keep waiting for a valid one.
        sendJson(res, result.status, { success: false, error: result.error });
        return;
      }

      sendJson(res, 200, { success: true });
      settled = true;
      if (timer) clearTimeout(timer);
      resolveCallback(result.callback);
      closeServer(server);
    });
  });

  let port: number;
  try {
    port = await listenOnAvailablePort(server, startPort, endPort);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = new Error(`Failed to start the Command Code login server: ${redactCommandCodeErrorText(message)}`);
    settled = true;
    rejectCallback(failure);
    throw failure;
  }

  const callbackUrl = buildCallbackUrl(port, callbackPath);
  const loginUrl = buildLoginUrl(callbackUrl, expectedState);

  timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectCallback(new AuthTimeoutError());
    closeServer(server);
  }, timeoutMs);
  // Do not keep the process alive purely for the login timer.
  timer.unref?.();

  // A post-listen server error must settle the wait instead of hanging it.
  server.on("error", (error: Error) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    rejectCallback(new Error(`Command Code login server error: ${redactCommandCodeErrorText(error.message)}`));
    closeServer(server);
  });

  const signal = options.signal;
  const onAbort = () => {
    if (settled) return;
    settled = true;
    rejectCallback(new Error("Command Code login cancelled"));
    closeServer(server);
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const close = () => {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
    forceCloseServer(server);
  };

  return { server, port, state: expectedState, callbackUrl, loginUrl, waitForCallback, close };
}
