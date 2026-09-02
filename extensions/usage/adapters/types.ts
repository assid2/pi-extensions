/**
 * UsageAdapter: turns one account's credential into a ProviderUsage.
 *
 * Adapters are stateless; all cross-call state (caching, backoff) lives in
 * http.ts, and all per-endpoint knowledge lives in the adapter's parse
 * function, so each provider module is independently testable against
 * fixture payloads.
 */
import type { ProviderUsage } from "../types.ts";

/** Minimal fetch surface (tests inject fakes). */
export interface HeadersLike {
  get(name: string): string | null;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers?: HeadersLike;
  json(): Promise<unknown>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<FetchResponseLike>;

/** Context handed to adapters for each fetch. */
export interface AdapterContext {
  /** The account's provider id (alias or base) — used for cache keys. */
  providerId: string;
  /** The base provider's effective base URL (for relative endpoints). */
  baseUrl?: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  /** Injectable clock (tests). */
  nowMs?: number;
  /** Injectable cache file (tests). */
  cacheFile?: string;
  /** Injectable fetch (tests). */
  fetchFn?: FetchLike;
  /**
   * Resolved by the account registry: lets adapters read the provider's
   * registered auth env name or custom headers when needed.
   */
  headers?: Record<string, string>;
}

/** Result of one adapter fetch attempt. */
export interface AdapterAttempt {
  usage: ProviderUsage;
  /** HTTP status when a response was received; enables 429 backoff. */
  status?: number;
  /** Optional Retry-After value, in milliseconds, parsed from headers. */
  retryAfterMs?: number;
}

export interface UsageAdapter {
  /** Provider id this adapter is registered for (base id). */
  readonly id: string;
  fetch(token: string, ctx: AdapterContext): Promise<AdapterAttempt>;
}
