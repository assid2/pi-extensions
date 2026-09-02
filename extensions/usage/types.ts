/** Shared domain types for @assid2/pi-usage. */

/** One quota window (e.g. a 5-hour or weekly window), as a 0-100 percent. */
export interface UsageLane {
  label: string;
  percent: number;
  /** ISO timestamp of when the window resets, when the provider exposes it. */
  resetsAt?: string;
}

/** A monetary (or credit) amount with a display label. */
export interface MoneyAmount {
  amount: number;
  unit: string;
  label: string;
}

/** Periodic spend breakdown for an account. */
export interface Spend {
  unit: string;
  daily?: number;
  weekly?: number;
  monthly?: number;
  lifetime?: number;
}

/**
 * Provider-side usage for one account, as reported by a provider adapter.
 * All fields are optional: providers that expose only spend have no lanes,
 * local providers expose none at all (the fallback adapter yields {}).
 */
export interface ProviderUsage {
  /** Quota windows; undefined when the provider has no quota concept. */
  lanes?: UsageLane[];
  /** Balance entries; first is primary, the rest are detail breakdowns. */
  balance?: MoneyAmount[];
  spend?: Spend;
  notice?: string;
  warning?: string;
  /** True when showing a stale cached value during backoff. */
  stale?: boolean;
  error?: string;
  fetchedAt?: number;
}

/**
 * A usage account: one pi provider id with a display name.
 * `isAlias` accounts are clone providers this extension registers so that
 * multiple accounts of the same provider can be used (and measured) separately.
 */
export interface Account {
  /** pi provider id (base provider, or alias registered by this extension). */
  id: string;
  name: string;
  /** The base provider id this account draws quota from. */
  base: string;
  isAlias: boolean;
}

/** Token usage aggregate over a set of assistant/tool messages. */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  /** USD, from the model cost tables pi applies to messages. */
  cost: number;
  /** Number of LLM requests aggregated here. */
  requests: number;
}

export function emptyTokenUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, requests: 0 };
}

export function addTokenUsage(target: TokenUsage, src: TokenUsage): void {
  target.input += src.input;
  target.output += src.output;
  target.cacheRead += src.cacheRead;
  target.cacheWrite += src.cacheWrite;
  target.totalTokens += src.totalTokens;
  target.cost += src.cost;
  target.requests += src.requests;
}

export type AgentStatus = "live" | "done" | "failed" | "unknown";

/** Usage of one agent (main or subagent) from one session file. */
export interface AgentUsage {
  sessionId: string;
  sessionFile: string;
  name?: string;
  cwd?: string;
  parentSession?: string;
  /** 0 = main session, 1 = direct subagent, 2 = nested, ... */
  depth: number;
  status: AgentStatus;
  usage: TokenUsage;
  /** Per-provider split; the provider id (alias or base) attributes it to an account. */
  byProvider: Array<{ provider: string; usage: TokenUsage }>;
  firstTs?: string;
  lastTs?: string;
}

export type AgentRole = "main" | "subagent" | "workflow";

/** A time-window rollup row, grouped by account and provider. */
export interface RollupRow {
  account: string;
  provider: string;
  role: AgentRole;
  usage: TokenUsage;
  sessions: number;
}
