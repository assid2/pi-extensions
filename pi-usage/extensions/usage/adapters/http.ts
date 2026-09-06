/**
 * HTTP + cross-process caching/backoff backbone for usage fetches.
 *
 * Pattern ported from @hk_net/pi-usage-bars (MIT): a per-provider cache file
 * in the OS tmp dir holds the last successful usage plus a 429 cooldown, and
 * a pid-scoped file lock serializes concurrent pi processes so they share
 * one fetch per TTL instead of stampeding the provider's usage endpoint.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ProviderUsage } from "../types.ts";
import type { AdapterAttempt, FetchLike, HeadersLike } from "./types.ts";

export const DEFAULT_USAGE_CACHE_FILE = path.join(os.tmpdir(), "pi", "pi-usage-cache.json");

export const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
export const DEFAULT_TTL_MS = 2 * 60 * 1000;
export const DEFAULT_BASE_BACKOFF_MS = 2 * 60 * 1000;
export const DEFAULT_MAX_BACKOFF_MS = 30 * 60 * 1000;
const LOCK_WAIT_MS = 4_000;
const LOCK_POLL_MS = 125;
const LOCK_STALE_MS = 20_000;

export interface RequestConfig {
  fetchFn?: FetchLike;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BackoffConfig extends RequestConfig {
  ttlMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  nowMs?: number;
  cacheFile?: string;
}

interface ProviderCacheState {
  lastSuccess?: ProviderUsage;
  lastSuccessAt?: number;
  cooldownUntil?: number;
  consecutive429s?: number;
  lastError?: string;
}

interface CacheFile {
  version: 2;
  providers: Record<string, ProviderCacheState>;
}

export interface JsonRequestResult {
  ok: boolean;
  data?: unknown;
  error: string;
  status: number | null;
  headers?: HeadersLike;
}

function toErrorMessage(error: unknown, externalSignal?: AbortSignal): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return externalSignal?.aborted ? "request cancelled" : "request timeout";
    }
    return error.message || String(error);
  }
  return String(error);
}

function combineSignals(timeoutSignal: AbortSignal | undefined, externalSignal: AbortSignal | undefined): AbortSignal | undefined {
  if (timeoutSignal && externalSignal) return AbortSignal.any([timeoutSignal, externalSignal]);
  return timeoutSignal ?? externalSignal;
}

/** GET/POST JSON with timeout + external abort; never throws. */
export async function requestJson(url: string, init: RequestInit, config: RequestConfig = {}): Promise<JsonRequestResult> {
  const fetchFn = config.fetchFn ?? (fetch as unknown as FetchLike);
  const timeoutMs = config.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const timeoutController = timeoutMs > 0 ? new AbortController() : undefined;
  const timeout = timeoutController ? setTimeout(() => timeoutController.abort(), timeoutMs) : undefined;
  const signal = combineSignals(timeoutController?.signal, config.signal);

  try {
    if (config.signal?.aborted) {
      return { ok: false, error: "request cancelled", status: null };
    }
    const response = await fetchFn(url, { ...init, signal });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, status: response.status, headers: response.headers };
    }
    try {
      const data = await response.json();
      return { ok: true, data, error: "", status: response.status, headers: response.headers };
    } catch {
      return { ok: false, error: "invalid JSON response", status: response.status, headers: response.headers };
    }
  } catch (error) {
    return { ok: false, error: toErrorMessage(error, config.signal), status: null };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds from now. */
export function parseRetryAfterMs(value: string | null | undefined, nowMs = Date.now()): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric * 1000;
  const dateMs = new Date(value).getTime();
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : null;
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, "_");
}

function readCacheFile(cacheFile: string): CacheFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { version?: unknown }).version === 2 &&
      typeof (parsed as { providers?: unknown }).providers === "object"
    ) {
      return parsed as CacheFile;
    }
  } catch {
    // Missing or invalid cache is treated as empty.
  }
  return { version: 2, providers: {} };
}

function writeCacheFile(cacheFile: string, cache: CacheFile): boolean {
  try {
    const directory = path.dirname(cacheFile);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const tmp = `${cacheFile}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, cacheFile);
    return true;
  } catch {
    return false;
  }
}

function ensureParentDir(filePath: string): void {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
}

function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup races.
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Acquire an exclusive pid-scoped lock file (created with "wx"), tolerating
 * stale locks left by a crashed process. Returns a release function, or null
 * if the lock could not be acquired within the wait window.
 */
export async function acquireFileLock(
  lockFile: string,
  signal?: AbortSignal,
  waitMs = LOCK_WAIT_MS,
): Promise<(() => void) | null> {
  ensureParentDir(lockFile);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= waitMs) {
    if (signal?.aborted) return null;
    try {
      const fd = fs.openSync(lockFile, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      fs.closeSync(fd);
      return () => safeUnlink(lockFile);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") return null;
      try {
        const stat = fs.statSync(lockFile);
        if (Date.now() - stat.mtimeMs >= LOCK_STALE_MS) {
          safeUnlink(lockFile);
          continue;
        }
      } catch {
        continue;
      }
      try {
        await sleep(LOCK_POLL_MS, signal);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function snapshotUsage(usage: ProviderUsage, nowMs: number): ProviderUsage {
  const copy: ProviderUsage = { ...usage };
  delete copy.stale;
  copy.fetchedAt = usage.fetchedAt ?? nowMs;
  return copy;
}

function staleUsage(cached: ProviderUsage, warning: string): ProviderUsage {
  return { ...cached, stale: true, warning };
}

function cooldownMessage(untilMs: number, nowMs: number): string {
  const seconds = Math.max(0, untilMs - nowMs) / 1000;
  const m = Math.round(seconds / 60);
  return `rate limited; retry in ${m}m`;
}

/**
 * Run an adapter fetch with per-provider caching and 429 backoff:
 *  - a fresh lastSuccess within TTL is served from the shared cache;
 *  - a live 429 puts the provider in cooldown (exponential, honoring
 *    Retry-After); during cooldown the last success is shown as stale, or an
 *    error is reported when there is none;
 *  - a file lock serializes concurrent processes on one fetch per window.
 */
export async function fetchWithBackoff(
  key: string,
  fn: (signal: AbortSignal | undefined) => Promise<AdapterAttempt>,
  config: BackoffConfig = {},
): Promise<ProviderUsage> {
  const cacheFile = config.cacheFile ?? DEFAULT_USAGE_CACHE_FILE;
  const nowMs = config.nowMs ?? Date.now();
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const base = config.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const max = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const safe = sanitizeKey(key);
  const state = () => readCacheFile(cacheFile).providers[safe] ?? {};

  let current = state();
  if (current.cooldownUntil && current.cooldownUntil > nowMs) {
    return current.lastSuccess
      ? staleUsage(current.lastSuccess, cooldownMessage(current.cooldownUntil, nowMs))
      : { lanes: undefined, error: `${current.lastError ?? "request failed"}; ${cooldownMessage(current.cooldownUntil, nowMs)}` };
  }
  if (current.lastSuccess && current.lastSuccessAt && nowMs - current.lastSuccessAt <= ttlMs) {
    return { ...current.lastSuccess, fetchedAt: current.lastSuccessAt };
  }

  const lockFile = `${cacheFile}.${safe}.lock`;
  const releaseLock = await acquireFileLock(lockFile, config.signal);
  if (!releaseLock) {
    // Another process holds it; re-read whatever it may have written.
    const waited = state();
    if (waited.lastSuccess && waited.lastSuccessAt && nowMs - waited.lastSuccessAt <= ttlMs) {
      return { ...waited.lastSuccess, fetchedAt: waited.lastSuccessAt };
    }
    if (config.signal?.aborted) return { lanes: undefined, error: "request cancelled" };
    // Fall through and fetch ourselves; the lock is best-effort dedupe.
  }

  try {
    const afterLock = state();
    if (afterLock.lastSuccess && afterLock.lastSuccessAt && nowMs - afterLock.lastSuccessAt <= ttlMs) {
      return { ...afterLock.lastSuccess, fetchedAt: afterLock.lastSuccessAt };
    }

    const attempt = await fn(config.signal);
    let next = state();

    if (!attempt.usage.error) {
      next = {
        lastSuccess: snapshotUsage(attempt.usage, nowMs),
        lastSuccessAt: nowMs,
      };
      writeCacheFile(cacheFile, { version: 2, providers: { ...readCacheFile(cacheFile).providers, [safe]: next } });
      return attempt.usage;
    }

    if (attempt.status === 429) {
      const consecutive = Math.max(1, (next.consecutive429s ?? 0) + 1);
      const backoff = attempt.retryAfterMs && attempt.retryAfterMs > 0
        ? Math.min(max, Math.max(base, attempt.retryAfterMs))
        : Math.min(max, base * 2 ** Math.max(0, consecutive - 1));
      next = {
        ...next,
        consecutive429s: consecutive,
        cooldownUntil: nowMs + backoff,
        lastError: attempt.usage.error,
      };
      writeCacheFile(cacheFile, { version: 2, providers: { ...readCacheFile(cacheFile).providers, [safe]: next } });
      return next.lastSuccess
        ? staleUsage(next.lastSuccess, cooldownMessage(nowMs + backoff, nowMs))
        : { lanes: undefined, error: `${attempt.usage.error}; retrying in ${Math.round(backoff / 60000)}m` };
    }

    // Non-429 failure: report it, keep any prior success for stale display.
    return attempt.usage;
  } finally {
    releaseLock?.();
  }
}
