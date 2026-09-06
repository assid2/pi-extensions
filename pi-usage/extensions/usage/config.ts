/**
 * Extension configuration: `usage.json` in the pi agent dir (default
 * `~/.pi/agent/usage.json`). The file is KEY-FREE by design — credentials
 * live exclusively in pi's auth.json / env vars and are resolved through
 * pi's ModelRegistry.
 *
 * Shape:
 * {
 *   "accounts": [
 *     { "provider": "ollama-cloud", "name": "work" },
 *     { "provider": "ollama-cloud", "name": "personal", "alias": "ollama-cloud-personal" },
 *     { "provider": "opencode-go", "name": "go" }
 *   ],
 *   "adapters": {
 *     "vllm": { "usageEndpoint": "http://127.0.0.1:18020/metrics/usage" }
 *   },
 *   "rollupWindow": "1d",
 *   "pollIntervalMs": 120000
 * }
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface AccountSpec {
  /** pi provider id the account belongs to (e.g. "ollama-cloud"). */
  provider: string;
  /** Display name. Defaults to the provider's name (first account) or the alias. */
  name?: string;
  /**
   * Extra accounts for a provider: registers a clone provider under this id.
   * Leave unset for the provider's default account.
   */
  alias?: string;
  /** Optional explicit env var holding this account's key (overrides the provider's own). */
  env?: string;
}

export interface GenericAdapterSpec {
  /**
   * Usage endpoint: absolute URL, or a path relative to the provider's baseUrl.
   * May start with "!" to run a shell command whose stdout is the JSON payload.
   */
  usageEndpoint: string;
}

export type RollupWindow = "1d" | "7d" | "30d" | "all";

export interface UsageConfig {
  accounts: AccountSpec[];
  adapters: Record<string, GenericAdapterSpec>;
  rollupWindow: RollupWindow;
  pollIntervalMs: number;
}

export interface LoadConfigResult {
  config: UsageConfig;
  /** Non-fatal problems found while parsing; surfaced once at startup. */
  warnings: string[];
}

export const DEFAULT_CONFIG: UsageConfig = {
  accounts: [],
  adapters: {},
  rollupWindow: "1d",
  pollIntervalMs: 2 * 60 * 1000,
};

export function configPath(agentDir: string): string {
  return path.join(agentDir, "usage.json");
}

const WINDOWS: readonly RollupWindow[] = ["1d", "7d", "30d", "all"];

export function loadConfig(agentDir: string): LoadConfigResult {
  const warnings: string[] = [];
  const config: UsageConfig = {
    accounts: [],
    adapters: {},
    rollupWindow: DEFAULT_CONFIG.rollupWindow,
    pollIntervalMs: DEFAULT_CONFIG.pollIntervalMs,
  };

  let raw: string;
  try {
    raw = fs.readFileSync(configPath(agentDir), "utf8");
  } catch {
    return { config, warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    warnings.push(`usage.json: invalid JSON (${(error as Error).message}); using defaults`);
    return { config, warnings };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    warnings.push("usage.json: top level must be an object; using defaults");
    return { config, warnings };
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.accounts !== undefined) {
    if (!Array.isArray(obj.accounts)) {
      warnings.push("usage.json: 'accounts' must be an array; ignored");
    } else {
      for (const [i, entry] of obj.accounts.entries()) {
        if (!entry || typeof entry !== "object") {
          warnings.push(`usage.json: accounts[${i}] is not an object; skipped`);
          continue;
        }
        const a = entry as Record<string, unknown>;
        if (typeof a.provider !== "string" || !a.provider.trim()) {
          warnings.push(`usage.json: accounts[${i}] has no 'provider'; skipped`);
          continue;
        }
        const spec: AccountSpec = { provider: a.provider.trim() };
        if (typeof a.name === "string" && a.name.trim()) spec.name = a.name.trim();
        if (typeof a.alias === "string" && a.alias.trim()) spec.alias = a.alias.trim();
        if (typeof a.env === "string" && a.env.trim()) spec.env = a.env.trim();
        if (spec.alias && spec.alias === spec.provider) {
          warnings.push(`usage.json: accounts[${i}] alias must differ from provider; alias ignored`);
          spec.alias = undefined;
        }
        config.accounts.push(spec);
      }
    }
  }

  if (obj.adapters !== undefined) {
    if (typeof obj.adapters !== "object" || obj.adapters === null || Array.isArray(obj.adapters)) {
      warnings.push("usage.json: 'adapters' must be an object; ignored");
    } else {
      for (const [provider, spec] of Object.entries(obj.adapters as Record<string, unknown>)) {
        if (!spec || typeof spec !== "object") {
          warnings.push(`usage.json: adapters.${provider} is not an object; skipped`);
          continue;
        }
        const usageEndpoint = (spec as Record<string, unknown>).usageEndpoint;
        if (typeof usageEndpoint !== "string" || !usageEndpoint.trim()) {
          warnings.push(`usage.json: adapters.${provider} has no 'usageEndpoint'; skipped`);
          continue;
        }
        config.adapters[provider] = { usageEndpoint: usageEndpoint.trim() };
      }
    }
  }

  if (obj.rollupWindow !== undefined) {
    if (WINDOWS.includes(obj.rollupWindow as RollupWindow)) {
      config.rollupWindow = obj.rollupWindow as RollupWindow;
    } else {
      warnings.push(`usage.json: rollupWindow must be one of ${WINDOWS.join(", ")}; using 1d`);
    }
  }

  if (obj.pollIntervalMs !== undefined) {
    if (typeof obj.pollIntervalMs === "number" && obj.pollIntervalMs >= 5000) {
      config.pollIntervalMs = obj.pollIntervalMs;
    } else {
      warnings.push("usage.json: pollIntervalMs must be a number >= 5000; using 120000");
    }
  }

  return { config, warnings };
}
