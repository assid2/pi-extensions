/**
 * Configuration loader for pi-commandcode-cloud.
 *
 * Reads settings from JSON config files with project-over-global precedence:
 *   - ~/.pi/agent/commandcode-cloud.json (global / user-level)
 *   - .pi/commandcode-cloud.json        (project-local, takes precedence)
 *
 * Environment variables override both config files:
 *   - PI_COMMANDCODE_USAGE_STATUS   opt-in/out of the footer usage status bar
 *
 * Example commandcode-cloud.json:
 * ```json
 * {
 *   "usageStatus": true,
 *   "usageRefreshMs": 300000
 * }
 * ```
 *
 * The status bar is **opt-in** (default `false`). The loader is deliberately
 * forgiving: malformed or wrongly-typed JSON never throws and never crashes the
 * extension — unrecognized keys are dropped and defaults apply.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { ENV_USAGE_STATUS, USAGE_REFRESH_MS } from "./constants.ts";

// --- Types ---

/** Raw (partially populated) config as read from a config file. */
export interface CommandCodeCloudConfig {
  /**
   * When true, the footer usage status bar is shown while a `commandcode-cloud`
   * model is active. Default: false (opt-in; toggle with `/commandcode-usage-status`).
   */
  usageStatus?: boolean;
  /** Footer refresh interval in milliseconds. Default: 300000 (5 minutes). */
  usageRefreshMs?: number;
}

/** Fully resolved config: every field present. */
export interface ResolvedCommandCodeCloudConfig {
  usageStatus: boolean;
  usageRefreshMs: number;
}

// --- Defaults ---

export const DEFAULT_CONFIG: ResolvedCommandCodeCloudConfig = {
  usageStatus: false,
  usageRefreshMs: USAGE_REFRESH_MS,
};

// --- Validation ---

/** Allowed config keys and their expected runtime types. */
const CONFIG_SCHEMA: Record<keyof CommandCodeCloudConfig, "boolean" | "number"> = {
  usageStatus: "boolean",
  usageRefreshMs: "number",
};

/**
 * Validate a parsed JSON object against the known schema. Unknown keys are
 * silently dropped; values with the wrong type fall back to undefined. Numbers
 * must be finite and strictly positive (`usageRefreshMs: 0` is invalid).
 */
export function sanitizeConfig(raw: Record<string, unknown>): CommandCodeCloudConfig {
  const out: CommandCodeCloudConfig = {};
  for (const [key, expectedType] of Object.entries(CONFIG_SCHEMA)) {
    const value = raw[key];
    if (expectedType === "boolean") {
      if (typeof value === "boolean") out[key as "usageStatus"] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      out[key as "usageRefreshMs"] = value;
    }
  }
  return out;
}

// --- Environment overrides ---

/**
 * Resolve the `PI_COMMANDCODE_USAGE_STATUS` environment override.
 * Returns undefined when unset (no override); `true`/`false` when explicitly
 * set. `0`/`false`/`no`/`off`/empty mean disabled; any other non-empty value
 * means enabled (mirrors `pi-ollama-cloud`'s `resolveWebToolsEnv`).
 */
export function resolveUsageStatusEnv(env: NodeJS.ProcessEnv = process.env): boolean | undefined {
  const raw = env[ENV_USAGE_STATUS];
  if (raw === undefined) return undefined;
  const lowered = raw.trim().toLowerCase();
  if (["0", "false", "no", "off", ""].includes(lowered)) return false;
  return true;
}

// --- Loader ---

function readConfigFile(path: string, label: string): CommandCodeCloudConfig {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    // Silently skip files that parse to null, arrays, or primitives —
    // malformed config should not crash the extension (defaults apply).
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return sanitizeConfig(parsed as Record<string, unknown>);
    }
    return {};
  } catch (err) {
    console.error(`[pi-commandcode-cloud] Failed to load ${label} from ${path}: ${err}`);
    return {};
  }
}

/**
 * Load configuration from JSON files.
 *
 * Precedence: `DEFAULT_CONFIG` < global (`~/.pi/agent/commandcode-cloud.json`)
 * < project (`<cwd>/.pi/commandcode-cloud.json`) < env
 * (`PI_COMMANDCODE_USAGE_STATUS`).
 */
export function loadConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): ResolvedCommandCodeCloudConfig {
  const globalPath = join(getAgentDir(), "commandcode-cloud.json");
  const projectPath = join(cwd, ".pi", "commandcode-cloud.json");

  const globalConfig = readConfigFile(globalPath, "global config");
  const projectConfig = readConfigFile(projectPath, "project config");

  const merged: ResolvedCommandCodeCloudConfig = {
    ...DEFAULT_CONFIG,
    ...globalConfig,
    ...projectConfig,
  };

  const envOverride = resolveUsageStatusEnv(env);
  if (envOverride !== undefined) merged.usageStatus = envOverride;

  return merged;
}

// --- Command argument handling ---

/**
 * Resolve the new enabled state for `/commandcode-usage-status` from its
 * argument. No argument toggles. Unknown arguments leave the state unchanged
 * and return an error message. Exported for unit testing.
 */
export function resolveUsageStatusToggle(arg: string, current: boolean): { enabled: boolean; error?: string } {
  const a = arg.trim().toLowerCase();
  if (a === "on" || a === "enable") return { enabled: true };
  if (a === "off" || a === "disable") return { enabled: false };
  if (a === "") return { enabled: !current };
  return {
    enabled: current,
    error: `Unknown argument "${arg.trim()}". Usage: /commandcode-usage-status [on|off|enable|disable]`,
  };
}
