/**
 * Shared utilities for pi-commandcode-cloud.
 *
 * Shape mirrors `pi-ollama-cloud/utils.ts` (`fetchJsonWithTimeout`,
 * `httpError`, `envInt`, `concurrentMap`) with Command Code-specific
 * additions: credential resolution, secret redaction, API-key sanitization and
 * attribution headers.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  API_KEY_PREFIX,
  CLI_ENVIRONMENT,
  COMMAND_CODE_CLI_VERSION,
  ENV_API_KEY,
  ENV_API_KEY_ALIASES,
  PLACEHOLDER_API_KEY,
  PROVIDER_ID,
  ZDR_ENV_PRECEDENCE,
} from "./constants.ts";

// --- HTTP ---

export interface JsonResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Fetch JSON with a hard timeout and an optional external abort signal. Never
 * throws: transport failures come back as `{ ok: false, status: 0, error }`.
 * Error text is passed through {@link redactCommandCodeErrorText} so secrets
 * can never leak into notifications or logs.
 */
export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Link an external abort signal (e.g. a model-refresh cancellation) so the
  // request aborts on either the timeout or the caller aborting. Cleanup runs
  // in the finally block on both the happy and error paths.
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      // Keep data null and report the raw text below.
    }
    const rawError =
      data && typeof data === "object" && "error" in data
        ? typeof (data as { error: unknown }).error === "object"
          ? JSON.stringify((data as { error: unknown }).error)
          : String((data as { error: unknown }).error)
        : text;
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : redactCommandCodeErrorText(rawError),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: redactCommandCodeErrorText(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timeout);
    if (externalSignal && !externalSignal.aborted) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/** Run `fn` over `items` with a bounded number of concurrent workers. */
export async function concurrentMap<T, R>(
  items: T[],
  workers: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, workers) }, async () => {
      while (next < items.length) {
        const index = next++;
        try {
          results[index] = { status: "fulfilled", value: await fn(items[index]) };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    }),
  );
  return results;
}

/** Parse a positive-integer env var, falling back when unset or invalid (NaN, non-integer, <= 0). */
export function envInt(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// --- Error mapping (§3.1) ---

export interface ParsedProviderError {
  code?: string;
  message?: string;
  status?: number;
  rateLimit?: { window?: string; reset?: number; limit?: number };
}

/**
 * Parse the Command Code error envelope (`{ error: { code, message, … } }`, or
 * a bare error object). Returns undefined for non-JSON / unrecognized text.
 */
export function parseProviderError(error?: string): ParsedProviderError | undefined {
  if (!error) return undefined;
  const trimmed = error.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const outer = parsed as Record<string, unknown>;
    const inner =
      outer.error && typeof outer.error === "object" && !Array.isArray(outer.error)
        ? (outer.error as Record<string, unknown>)
        : outer;
    const rateLimitRaw =
      inner.rateLimit && typeof inner.rateLimit === "object" && !Array.isArray(inner.rateLimit)
        ? (inner.rateLimit as Record<string, unknown>)
        : undefined;
    return {
      code: typeof inner.code === "string" ? inner.code : undefined,
      message: typeof inner.message === "string" ? inner.message : undefined,
      status: typeof inner.status === "number" ? inner.status : undefined,
      rateLimit: rateLimitRaw
        ? {
            window: typeof rateLimitRaw.window === "string" ? rateLimitRaw.window : undefined,
            reset: typeof rateLimitRaw.reset === "number" ? rateLimitRaw.reset : undefined,
            limit: typeof rateLimitRaw.limit === "number" ? rateLimitRaw.limit : undefined,
          }
        : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Convert a 429 `error.rateLimit.reset` value to an absolute epoch-ms instant.
 * Per the verified contract this field is in **seconds** (only
 * `windowLimits.*.resetAt` is epoch-ms). Values <= 0 mean "unknown" and map to 0.
 */
export function resetSecondsToMs(reset: unknown): number {
  const value = typeof reset === "number" ? reset : Number(reset);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value * 1000;
}

/** Human countdown (`2h 41m`, `4d 3h`, `12m`). */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/**
 * Throw a user-facing error for a non-ok Command Code HTTP response, mapping
 * the statuses documented in the plan's §3.1 table. The error text is redacted
 * before it is embedded.
 */
export function httpError(op: string, status: number, error?: string): never {
  const detail = redactCommandCodeErrorText(error ?? "");
  const parsed = parseProviderError(error);

  if (status === 401) {
    throw new Error("Command Code authentication failed — run /login");
  }
  if (status === 403) {
    if (parsed?.code === "upgrade_required" || detail.includes("upgrade_required")) {
      throw new Error(
        "Your Command Code plan does not include Provider API access (Go plan). Upgrade or use the Command Code CLI.",
      );
    }
    throw new Error(`Command Code ${op} failed: forbidden (status 403${detail ? `: ${detail}` : ""}).`);
  }
  if (status === 422) {
    // Surface the provider message verbatim (e.g. cmd_zdr_no_providers).
    const message = parsed?.message ?? detail;
    throw new Error(`Command Code ${op} failed${message ? `: ${message}` : " (status 422)"}.`);
  }
  if (status === 429) {
    const parts: string[] = [];
    const window = parsed?.rateLimit?.window;
    if (window) parts.push(`${window} window`);
    const resetAtMs = resetSecondsToMs(parsed?.rateLimit?.reset);
    const remainingMs = resetAtMs > 0 ? resetAtMs - Date.now() : 0;
    const reset = remainingMs > 0 ? ` — resets in ${formatDurationMs(remainingMs)}` : "";
    throw new Error(`Command Code ${op} failed: rate limited${parts.length ? ` (${parts.join(", ")})` : ""}${reset}.`);
  }
  if (status >= 500) {
    const message = parsed?.message ?? detail;
    throw new Error(
      `Command Code ${op} failed: server error (status ${status}${message ? `: ${message}` : ""}). Try again shortly.`,
    );
  }
  throw new Error(
    `Command Code ${op} failed: unexpected response (status ${status}${detail ? `: ${detail}` : ""}). Try again shortly.`,
  );
}

// --- Secrets ---

const BEARER_RE = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const USER_KEY_RE = /\buser_[A-Za-z0-9_-]+/g;
const CC_KEY_RE = /\bcc_[A-Za-z0-9_-]+/g;
const JSON_SECRET_RE = /("(?:apiKey|api_key|access|refresh|token|key)"\s*:\s*")[^"]*(")/gi;
const HEADER_SECRET_RE = /((?:x-api-key|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi;
const BRACKETED_PASTE_RE = /\[20[01]~/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: pasted API keys must have C0/C1 control characters stripped.
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f-\u009f]/g;
const UNRESOLVED_ENV_RE = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
const SENTINEL_KEYS = new Set(["undefined", "null", "none", "changeme", "your-api-key", "your_api_key"]);

/**
 * Redact Command Code credentials from arbitrary text before it reaches a
 * notification, log or error message. Strips `Bearer` tokens and
 * `user_…` / `cc_…` API keys (including JSON/header-shaped occurrences).
 */
export function redactCommandCodeErrorText(input: unknown): string {
  if (input === undefined || input === null) return "";
  let text = typeof input === "string" ? input : String(input);
  text = text.replace(JSON_SECRET_RE, "$1[redacted]$2");
  text = text.replace(BEARER_RE, "$1[redacted]");
  text = text.replace(USER_KEY_RE, `${API_KEY_PREFIX}[redacted]`);
  text = text.replace(CC_KEY_RE, "cc_[redacted]");
  text = text.replace(HEADER_SECRET_RE, "$1[redacted]");
  return text;
}

/**
 * Sanitize a pasted API key: strip bracketed-paste markers and control chars,
 * trim, and reject unresolved env placeholders / sentinel values. Returns
 * undefined when no usable key remains.
 */
export function sanitizeApiKey(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  let value = input.replace(BRACKETED_PASTE_RE, "");
  value = value.replace(CONTROL_CHARS_RE, "");
  value = value.trim();
  if (!value) return undefined;
  if (value === PLACEHOLDER_API_KEY) return undefined;
  if (UNRESOLVED_ENV_RE.test(value)) return undefined;
  if (SENTINEL_KEYS.has(value.toLowerCase())) return undefined;
  return value;
}

// --- Interop credentials (read-only) ---

export interface InteropAuth {
  apiKey?: string;
  userId?: string;
  userName?: string;
  keyName?: string;
  authenticatedAt?: string;
}

/** Default CLI credential file location: `~/.commandcode/auth.json`. */
export function interopAuthPath(): string {
  return join(homedir(), ".commandcode", "auth.json");
}

/**
 * Read the official Command Code CLI credential file **read-only**. Never
 * throws and never mutates the file. Accepts `apiKey` (canonical) and `key`
 * (tolerated alias).
 */
export function readInteropAuthJson(filePath: string = interopAuthPath()): InteropAuth | undefined {
  try {
    if (!existsSync(filePath)) return undefined;
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const obj = parsed as Record<string, unknown>;
    const apiKey = typeof obj.apiKey === "string" ? obj.apiKey : typeof obj.key === "string" ? obj.key : undefined;
    return {
      apiKey,
      userId: typeof obj.userId === "string" ? obj.userId : undefined,
      userName: typeof obj.userName === "string" ? obj.userName : undefined,
      keyName: typeof obj.keyName === "string" ? obj.keyName : undefined,
      authenticatedAt: typeof obj.authenticatedAt === "string" ? obj.authenticatedAt : undefined,
    };
  } catch {
    return undefined;
  }
}

// --- Credential resolution (§3.5) ---

export type CommandCodeApiKeySource = "registry" | "env" | "auth.json" | "none";

export interface ResolvedCommandCodeApiKey {
  key?: string;
  source: CommandCodeApiKeySource;
  /** Env var name or file path when applicable (for `/commandcode-status`). */
  sourceDetail?: string;
}

/**
 * Resolve the Command Code API key with the documented precedence:
 * pi's provider registry (authoritative, honors `/login`) → `COMMAND_CODE_API_KEY`
 * → `COMMANDCODE_API_KEY` → `CMD_API_KEY` → `~/.commandcode/auth.json` (read-only).
 * The placeholder never wins: every candidate goes through {@link sanitizeApiKey}.
 */
export async function resolveCommandCodeApiKey(
  ctx: Pick<ExtensionContext, "modelRegistry">,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedCommandCodeApiKey> {
  let registryKey: string | undefined;
  try {
    registryKey = sanitizeApiKey(await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID));
  } catch {
    registryKey = undefined;
  }
  if (registryKey) return { key: registryKey, source: "registry" };

  for (const name of [ENV_API_KEY, ...ENV_API_KEY_ALIASES]) {
    const envKey = sanitizeApiKey(env[name]);
    if (envKey) return { key: envKey, source: "env", sourceDetail: name };
  }

  const fileKey = sanitizeApiKey(readInteropAuthJson()?.apiKey);
  if (fileKey) return { key: fileKey, source: "auth.json", sourceDetail: interopAuthPath() };

  return { source: "none" };
}

/** Convenience wrapper: the resolved key, or undefined when none is usable. */
export async function getCommandCodeApiKey(
  ctx: Pick<ExtensionContext, "modelRegistry">,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  return (await resolveCommandCodeApiKey(ctx, env)).key;
}

// --- Headers ---

/** Parse a boolean-ish env value; undefined when unset/empty. */
export function parseEnvFlag(value: unknown): boolean | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) return false;
  return true;
}

/**
 * ZDR opt-in with the documented precedence (`CMD_ZDR` > `COMMANDCODE_ZDR`):
 * the first env var that is set to a non-empty value decides.
 */
export function zdrEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  for (const name of ZDR_ENV_PRECEDENCE) {
    const parsed = parseEnvFlag(env[name]);
    if (parsed !== undefined) return parsed;
  }
  return false;
}

/**
 * Attribution headers sent on every Command Code request:
 * `x-command-code-version`, `x-cli-environment`, plus `x-cmd-zdr: 1` when ZDR
 * is requested.
 */
export function attributionHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers: Record<string, string> = {
    "x-command-code-version": COMMAND_CODE_CLI_VERSION,
    "x-cli-environment": CLI_ENVIRONMENT,
  };
  if (zdrEnabled(env)) headers["x-cmd-zdr"] = "1";
  return headers;
}
