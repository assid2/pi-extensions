/**
 * Command Code Cloud Provider Extension
 *
 * Registers Command Code (commandcode.ai) as a first-class pi model provider
 * using its OpenAI- and Anthropic-compatible Provider API, exposes credential
 * setup through pi's native `/login` (API-key paste plus an optional browser
 * loopback flow), and surfaces Command Code quota in an opt-in footer bar.
 *
 * Setup:
 *   1. Get an API key from https://commandcode.ai (Studio → API keys), or run
 *      the official `cmd login` CLI (its `~/.commandcode/auth.json` is read as
 *      a read-only fallback).
 *   2. Run `/login commandcode-cloud` (API key paste or browser), or export
 *      `COMMAND_CODE_API_KEY`.
 *   3. Select a model with `/model` (ids may contain `/`, e.g.
 *      `commandcode-cloud/deepseek/deepseek-v4.1-flash`).
 *
 * Registration mirrors the plan (`docs/plans/pi-commandcode-cloud.md` §3.1):
 * one provider id hosting both wire formats. Non-Claude models use
 * `openai-completions`; models whose catalog entry lists only `/messages` use
 * `anthropic-messages` with a `/v1`-less base URL, so both the OpenAI and the
 * Anthropic split survive persistence via `refreshModels` rehydration.
 *
 * The footer status bar is **opt-in** (default off) and is only ever set while
 * `ctx.model?.provider === "commandcode-cloud"`.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, resolveUsageStatusToggle } from "./config.ts";
import {
  PLACEHOLDER_API_KEY,
  PROVIDER_API_BASE,
  PROVIDER_ID,
  PROVIDER_NAME,
  USAGE_FAST_REFRESH_MS,
  USAGE_REFRESH_MS,
} from "./constants.ts";
import { GENERATED_MODELS } from "./models.generated.ts";
import { refreshCommandCodeCatalog } from "./models.ts";
import { commandCodeOAuth, validateCommandCodeKey } from "./oauth.ts";
import { fetchCommandCodeUsage, formatUsage, formatUsageStatusColored } from "./usage.ts";
import type { CommandCodeUsage } from "./usage-types.ts";
import {
  attributionHeaders,
  type ResolvedCommandCodeApiKey,
  redactCommandCodeErrorText,
  resolveCommandCodeApiKey,
} from "./utils.ts";

/**
 * Re-exported so other modules/tests can import it from the extension
 * entrypoint (the plan documents `resolveUsageStatusToggle` on the config
 * surface).
 */
export { resolveUsageStatusToggle };

/** Footer status-bar key shown by pi. */
export const USAGE_STATUS_KEY = "commandcode-usage";

/**
 * Gating predicate: the footer (and every status write) is enabled only while a
 * `commandcode-cloud` model is active. Exported for unit testing.
 */
export function isCommandCode(ctx: Pick<ExtensionContext, "model">): boolean {
  return ctx.model?.provider === PROVIDER_ID;
}

/**
 * Fast-path cadence: while any lane is between 85 % and 100 % the footer
 * refreshes at {@link USAGE_FAST_REFRESH_MS} instead of the configured base
 * interval (bounded "hot poll", never above the user's setting). Exported for
 * unit testing.
 */
export function nextUsageRefreshMs(data: CommandCodeUsage, baseMs: number): number {
  const hot = data.lanes.some((lane) => lane.percent >= 85 && lane.percent < 100);
  return hot ? Math.min(USAGE_FAST_REFRESH_MS, baseMs) : baseMs;
}

function errorMessage(error: unknown): string {
  return redactCommandCodeErrorText(error instanceof Error ? error.message : String(error));
}

function summarizeUsage(data: CommandCodeUsage): string {
  if (data.lanes.length === 0) return "no quota lanes reported";
  return data.lanes.map((lane) => `${lane.label} ${Math.round(lane.percent)}%`).join(", ");
}

function describeCredentialSource(resolved: ResolvedCommandCodeApiKey): string {
  switch (resolved.source) {
    case "registry":
      return "pi /login credential";
    case "env":
      return resolved.sourceDetail ? `env ${resolved.sourceDetail}` : "environment";
    case "auth.json":
      return resolved.sourceDetail ?? "~/.commandcode/auth.json";
    default:
      return "not configured";
  }
}

// --- Main ---

export default async function (pi: ExtensionAPI) {
  pi.registerProvider(PROVIDER_ID, {
    name: PROVIDER_NAME,
    baseUrl: PROVIDER_API_BASE,
    apiKey: PLACEHOLDER_API_KEY,
    api: "openai-completions",
    headers: attributionHeaders(),
    models: GENERATED_MODELS,
    refreshModels: refreshCommandCodeCatalog,
    oauth: commandCodeOAuth,
  });

  // Config is read once per extension factory invocation (on the first
  // session_start). The factory is re-invoked on /new, /fork, /resume, and
  // /reload, so runtime toggles (/commandcode-usage-status) reset to the file
  // default on each session restart. Restart pi or /reload to pick up config
  // file changes.
  let configLoaded = false;
  let usageStatusEnabled = false;
  let usageRefreshMs = USAGE_REFRESH_MS;

  // Footer status showing live quota while commandcode-cloud is the active
  // provider. Refreshes on a timer and (throttled) after turns. The timer is
  // rescheduled after each attempt so the fast path (a lane near exhaustion)
  // can shorten the interval without hammering the undocumented account API.
  let usageTimer: ReturnType<typeof setTimeout> | null = null;
  let usageActive = false;
  // Timestamp (ms) of the most recent refresh attempt; set BEFORE the fetch so a
  // failing endpoint is also throttled for the agent_end path.
  let lastRefreshAt = 0;
  let lastUsageSummary = "not fetched this session";

  function scheduleUsageRefresh(ctx: ExtensionContext, delayMs: number): void {
    if (!usageActive) return;
    if (usageTimer) clearTimeout(usageTimer);
    usageTimer = setTimeout(
      () => {
        void refreshUsageStatus(ctx);
      },
      Math.max(1, delayMs),
    );
  }

  async function refreshUsageStatus(ctx: ExtensionContext): Promise<void> {
    if (!usageActive) return;
    // Never write the status key for another provider; a stale key must be
    // cleared and the timer stopped so a later switch re-activates cleanly.
    if (!isCommandCode(ctx)) {
      stopUsageStatus(ctx);
      return;
    }

    let delay = usageRefreshMs;
    try {
      const resolved = await resolveCommandCodeApiKey(ctx);
      if (!resolved.key) {
        ctx.ui.setStatus(USAGE_STATUS_KEY, undefined);
        lastUsageSummary = "no API key configured";
        return;
      }
      lastRefreshAt = Date.now();
      const data = await fetchCommandCodeUsage(resolved.key);
      ctx.ui.setStatus(USAGE_STATUS_KEY, formatUsageStatusColored(ctx.ui.theme, data));
      lastUsageSummary = summarizeUsage(data);
      delay = nextUsageRefreshMs(data, usageRefreshMs);
    } catch (error) {
      // Transient errors (undocumented endpoint, network, plan gating) should
      // not spam the footer; clear the status and retry on the next refresh.
      ctx.ui.setStatus(USAGE_STATUS_KEY, undefined);
      lastUsageSummary = `error: ${errorMessage(error)}`;
    } finally {
      if (usageActive) scheduleUsageRefresh(ctx, delay);
    }
  }

  function startUsageStatus(ctx: ExtensionContext): void {
    if (usageActive) return;
    // The status bar is TUI-only; skip the fetch and timer in print/json/rpc.
    if (ctx.mode !== "tui") return;
    usageActive = true;
    void refreshUsageStatus(ctx);
  }

  function stopUsageStatus(ctx: ExtensionContext): void {
    usageActive = false;
    if (usageTimer) {
      clearTimeout(usageTimer);
      usageTimer = null;
    }
    ctx.ui.setStatus(USAGE_STATUS_KEY, undefined);
  }

  function ensureConfigLoaded(cwd: string): void {
    if (configLoaded) return;
    configLoaded = true;
    const config = loadConfig(cwd);
    usageRefreshMs = config.usageRefreshMs;
    usageStatusEnabled = config.usageStatus;
  }

  pi.on("session_start", async (_event, ctx) => {
    ensureConfigLoaded(ctx.cwd);
    if (usageStatusEnabled && isCommandCode(ctx)) {
      startUsageStatus(ctx);
    } else {
      stopUsageStatus(ctx);
    }
  });

  pi.on("model_select", async (_event, ctx) => {
    ensureConfigLoaded(ctx.cwd);
    if (usageStatusEnabled && isCommandCode(ctx)) {
      startUsageStatus(ctx);
    } else {
      stopUsageStatus(ctx);
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    // Throttle the after-turn refresh to the configured cooldown so a burst of
    // turns never exceeds one account-API call per interval.
    if (usageActive && isCommandCode(ctx) && Date.now() - lastRefreshAt >= usageRefreshMs) {
      await refreshUsageStatus(ctx);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stopUsageStatus(ctx);
  });

  // --- Commands (§3.5) ---

  pi.registerCommand("commandcode-usage", {
    description: "Show Command Code usage limits.",
    handler: async (_args, ctx) => {
      const resolved = await resolveCommandCodeApiKey(ctx);
      if (!resolved.key) {
        ctx.ui.notify(
          redactCommandCodeErrorText(
            "No Command Code API key configured. Run /login commandcode-cloud or set COMMAND_CODE_API_KEY.",
          ),
          "error",
        );
        return;
      }
      try {
        const data = await fetchCommandCodeUsage(resolved.key);
        lastUsageSummary = summarizeUsage(data);
        ctx.ui.notify(formatUsage(data), "info");
      } catch (error) {
        const message = errorMessage(error);
        lastUsageSummary = `error: ${message}`;
        ctx.ui.notify(message, "error");
      }
    },
  });

  pi.registerCommand("commandcode-usage-status", {
    description:
      "Enable or disable the Command Code usage status bar. " +
      "Accepts optional argument: on/off/enable/disable. Without argument, toggles.",
    handler: async (args, ctx) => {
      ensureConfigLoaded(ctx.cwd);
      const { enabled, error } = resolveUsageStatusToggle(args, usageStatusEnabled);
      if (error) {
        ctx.ui.notify(redactCommandCodeErrorText(error), "error");
        return;
      }
      usageStatusEnabled = enabled;

      if (usageStatusEnabled && isCommandCode(ctx)) {
        startUsageStatus(ctx);
      } else {
        stopUsageStatus(ctx);
      }

      ctx.ui.notify(`Command Code usage status: ${usageStatusEnabled ? "enabled" : "disabled"}`, "info");
    },
  });

  pi.registerCommand("commandcode-status", {
    description: "Show Command Code provider diagnostics (credential, catalog, usage).",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      ensureConfigLoaded(ctx.cwd);

      let authConfigured = false;
      let authSource: string | undefined;
      let authLabel: string | undefined;
      try {
        const status = ctx.modelRegistry.getProviderAuthStatus(PROVIDER_ID);
        authConfigured = status.configured;
        authSource = status.source;
        authLabel = status.label;
      } catch {
        // Diagnostics must never throw; an unavailable registry degrades to
        // "not configured" plus the credential resolution below.
      }

      const resolved = await resolveCommandCodeApiKey(ctx);
      const resolvedLabel = describeCredentialSource(resolved);
      const credential = resolved.key
        ? `configured (resolved from ${resolvedLabel}${
            authConfigured ? `; pi auth: ${authSource ?? "unknown"}${authLabel ? ` ${authLabel}` : ""}` : ""
          })`
        : "not configured — run /login commandcode-cloud or set COMMAND_CODE_API_KEY";

      // Validate the key live against /alpha/whoami when one exists (§5.4).
      // `validateCommandCodeKey` never throws and never emits the key.
      let keyCheck = "not checked (no credential)";
      if (resolved.key) {
        try {
          const validation = await validateCommandCodeKey(resolved.key);
          if (validation.valid) {
            const who = validation.user?.userName ?? validation.user?.name;
            keyCheck = `valid (HTTP ${validation.status}${who ? `, ${who}` : ""})`;
          } else {
            keyCheck = `invalid (${validation.error ?? `HTTP ${validation.status}`})`;
          }
        } catch (error) {
          keyCheck = `check failed (${errorMessage(error)})`;
        }
      }

      const modelCount = ctx.modelRegistry.getAll().filter((model) => model.provider === PROVIDER_ID).length;

      const lines = [
        "Command Code status:",
        `  provider: ${PROVIDER_ID}`,
        `  baseUrl: ${PROVIDER_API_BASE}`,
        "  transport: OpenAI /chat/completions + Anthropic /v1/messages (per model)",
        `  credential: ${credential}`,
        `  key check: ${keyCheck}`,
        `  models: ${modelCount}`,
        `  usage status bar: ${usageStatusEnabled ? "enabled" : "disabled"}`,
        `  last usage: ${lastUsageSummary}`,
      ];
      ctx.ui.notify(redactCommandCodeErrorText(lines.join("\n")), "info");
    },
  });

  pi.registerCommand("commandcode-refresh", {
    description: "Force a Command Code model-catalog refresh.",
    handler: async (_args, ctx) => {
      try {
        const result = await ctx.modelRegistry.refresh({ providers: [PROVIDER_ID], force: true });
        const modelCount = ctx.modelRegistry.getAll().filter((model) => model.provider === PROVIDER_ID).length;
        const failure = result.errors.get(PROVIDER_ID);
        if (failure) {
          ctx.ui.notify(redactCommandCodeErrorText(`Command Code model refresh failed: ${failure.message}`), "error");
          return;
        }
        ctx.ui.notify(`Command Code models refreshed: ${modelCount} model(s).`, "info");
      } catch (error) {
        ctx.ui.notify(redactCommandCodeErrorText(`Command Code model refresh failed: ${errorMessage(error)}`), "error");
      }
    },
  });
}
