/**
 * @assid2/pi-usage — extension entry point.
 *
 * Wiring only: events, commands, flags, and the poll loop. All logic lives in
 * the modules under ./ (adapters, accounts, agents, ui).
 *
 * What it does:
 *  - registers the opencode-go provider (idempotent) and alias providers for
 *    multi-account setups declared in usage.json;
 *  - polls the ACTIVE account's provider usage every 2 minutes and renders a
 *    footer status line (quota lanes + live subagent count);
 *  - `/usage` opens a dialog with the session agent tree, per-account
 *    quota/balance/spend, and a time-window rollup;
 *  - `--usage` prints the same data as JSON and exits (scripting).
 */
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { loadConfig, type UsageConfig } from "./config.ts";
import {
  AccountRegistry,
  buildAccounts,
  registerAliasProviders,
  resolveCredential,
} from "./accounts/registry.ts";
import { resolveAdapter } from "./adapters/index.ts";
import { fetchWithBackoff } from "./adapters/http.ts";
import { SessionScanner } from "./agents/scanner.ts";
import { AgentEventTracker } from "./agents/events.ts";
import { buildSessionTree } from "./agents/tree.ts";
import { computeRollup } from "./agents/rollup.ts";
import { renderFooterStatus } from "./ui/footer.ts";
import { UsageDialog, type AccountView, type UsageView } from "./ui/dialog.ts";
import { opencodeGoProviderConfig } from "./providers/opencode-go.ts";
import type { Account, ProviderUsage } from "./types.ts";

const EXTENSION_ID = "@assid2/pi-usage";
const STATUS_KEY = EXTENSION_ID;
const POLL_INTERVAL_MS = 2 * 60 * 1000;
const STATUS_THROTTLE_MS = 1000;

const SUBAGENT_EVENTS = [
  "subagents:started",
  "subagents:created",
  "subagents:ready",
  "subagents:scheduled",
  "subagents:completed",
  "subagents:failed",
  "subagents:steered",
  "subagents:compacted",
  "pi-dynamic-workflows:lifecycle",
];

export default function (pi: ExtensionAPI): void {
  pi.registerFlag("usage", {
    description: "Print provider and agent usage as JSON and exit",
    type: "boolean",
    default: false,
  });

  let currentContext: ExtensionContext | undefined;
  let sessionController: AbortController | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let pollInFlight: Promise<void> | undefined;
  let pollQueued = false;
  let config: UsageConfig = loadConfig(getAgentDir()).config;
  let registry: AccountRegistry | undefined;
  let activeAccount: Account | undefined;
  let agentDir = getAgentDir();
  let lastStatusAt = 0;
  const scanner = new SessionScanner(path.join(agentDir, "sessions"));
  const tracker = new AgentEventTracker();
  const usageByAccount = new Map<string, ProviderUsage>();

  function displayName(ctx: ExtensionContext, providerId: string): string {
    try {
      return ctx.modelRegistry.getProviderDisplayName(providerId) || providerId;
    } catch {
      return providerId;
    }
  }

  function updateActiveAccount(ctx: ExtensionContext): void {
    const provider = ctx.model?.provider;
    if (!provider) {
      activeAccount = undefined;
      return;
    }
    const reg = registry ?? new AccountRegistry([]);
    activeAccount = reg.accountForProvider(provider, displayName(ctx, provider));
  }

  async function fetchAccount(ctx: ExtensionContext, account: Account, nowMs: number): Promise<AccountView> {
    const credential = await resolveCredential(ctx, account);
    if (!credential.configured) {
      return { account, configured: false };
    }
    if (credential.error) {
      return { account, configured: true, usage: { error: credential.error } };
    }
    const adapter = resolveAdapter(account.base, config);
    const usage = await fetchWithBackoff(
      account.id,
      (signal) =>
        adapter.fetch(credential.token!, {
          providerId: account.id,
          baseUrl: credential.baseUrl,
          env: process.env,
          signal,
          nowMs,
          headers: credential.headers,
        }),
      { nowMs },
    );
    usageByAccount.set(account.id, usage);
    return { account, configured: true, usage };
  }

  async function fetchAllAccounts(ctx: ExtensionContext, nowMs: number): Promise<AccountView[]> {
    const reg = registry ?? new AccountRegistry([]);
    const accounts = [...reg.accounts];
    // Ensure the active provider is always represented, even when unconfigured.
    if (ctx.model?.provider && !reg.get(ctx.model.provider)) {
      accounts.push(reg.accountForProvider(ctx.model.provider, displayName(ctx, ctx.model.provider)));
    }
    const results = await Promise.all(accounts.map((account) => fetchAccount(ctx, account, nowMs)));
    return results;
  }

  async function buildView(ctx: ExtensionContext): Promise<UsageView> {
    const nowMs = Date.now();
    scanner.refresh();
    const accounts = await fetchAllAccounts(ctx, nowMs);
    const agents = buildSessionTree(scanner, ctx.sessionManager.getSessionFile(), tracker, nowMs);
    const rollup = computeRollup(scanner, registry ?? new AccountRegistry([]), config.rollupWindow, nowMs, (id) =>
      displayName(ctx, id),
    );
    return {
      generatedAt: nowMs,
      activeProvider: ctx.model?.provider ?? null,
      agents,
      accounts,
      rollup,
      rollupWindow: config.rollupWindow,
    };
  }

  function updateStatus(): void {
    const ctx = currentContext;
    if (!ctx || ctx.mode !== "tui") return;
    const account = activeAccount;
    if (!account) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const usage = usageByAccount.get(account.id);
    const line = renderFooterStatus({
      account,
      usage,
      liveAgents: tracker.liveCount(),
      fg: (color, text) => ctx.ui.theme.fg(color, text),
      nowMs: Date.now(),
    });
    ctx.ui.setStatus(STATUS_KEY, line);
  }

  function throttledStatus(): void {
    const now = Date.now();
    if (now - lastStatusAt < STATUS_THROTTLE_MS) return;
    lastStatusAt = now;
    updateStatus();
  }

  async function runPoll(): Promise<void> {
    const ctx = currentContext;
    const sessionSignal = sessionController?.signal;
    if (!ctx || !sessionSignal || sessionSignal.aborted || ctx.mode !== "tui" || !activeAccount) {
      updateStatus();
      return;
    }
    await fetchAccount(ctx, activeAccount, Date.now());
    if (sessionSignal.aborted) return;
    updateStatus();
  }

  async function poll(): Promise<void> {
    if (pollInFlight) {
      pollQueued = true;
      return pollInFlight;
    }
    do {
      pollQueued = false;
      pollInFlight = runPoll()
        .catch(() => undefined)
        .finally(() => {
          pollInFlight = undefined;
        });
      await pollInFlight;
    } while (pollQueued && !sessionController?.signal.aborted);
  }

  function setupSession(ctx: ExtensionContext): void {
    agentDir = getAgentDir();
    scanner.sessionsDir = path.join(agentDir, "sessions");
    const loaded = loadConfig(agentDir);
    config = loaded.config;
    for (const warning of loaded.warnings) console.warn(`[${EXTENSION_ID}] ${warning}`);

    registry = buildAccounts(ctx, config, loaded.warnings);
    registerAliasProviders(ctx, registry, config, loaded.warnings);
    for (const warning of loaded.warnings) console.warn(`[${EXTENSION_ID}] ${warning}`);

    // Register the opencode-go provider unless the user already defined one.
    if (!ctx.modelRegistry.getProvider("opencode-go")) {
      try {
        ctx.modelRegistry.registerProvider("opencode-go", opencodeGoProviderConfig);
      } catch (error) {
        console.warn(`[${EXTENSION_ID}] opencode-go provider registration failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    updateActiveAccount(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    sessionController?.abort();
    sessionController = new AbortController();
    setupSession(ctx);

    if (pi.getFlag("usage") === true) {
      try {
        const view = await buildView(ctx);
        console.log(JSON.stringify({
          extension: EXTENSION_ID,
          activeProvider: view.activeProvider,
          accounts: view.accounts.map((a) => ({
            id: a.account.id,
            name: a.account.name,
            base: a.account.base,
            isAlias: a.account.isAlias,
            configured: a.configured,
            usage: a.usage ?? null,
          })),
          agents: view.agents.map((a) => ({
            name: a.name,
            depth: a.depth,
            status: a.status,
            usage: a.usage,
            byProvider: a.byProvider,
          })),
          rollup: view.rollup,
        }));
      } catch (error) {
        console.log(JSON.stringify({
          extension: EXTENSION_ID,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        }));
      }
      ctx.shutdown();
      return;
    }

    if (ctx.mode !== "tui") return;

    updateStatus();
    void poll();
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    sessionController?.abort();
    sessionController = undefined;
    pollQueued = false;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
    if (ctx.mode === "tui") ctx.ui.setStatus(STATUS_KEY, undefined);
    currentContext = undefined;
  });

  pi.on("model_select", (event, ctx) => {
    currentContext = ctx;
    updateActiveAccount(ctx);
    void poll();
  });

  for (const eventName of SUBAGENT_EVENTS) {
    try {
      pi.events.on(eventName, (data: unknown) => {
        if (tracker.handle(eventName, data, Date.now())) throttledStatus();
      });
    } catch {
      // Event bus subscription is best-effort; versions may rename events.
    }
  }

  pi.registerCommand("usage", {
    description: "Show provider quota/balance/spend and per-agent usage",
    handler: async (_args, ctx) => {
      currentContext = ctx;
      updateActiveAccount(ctx);
      if (ctx.mode !== "tui") {
        if (ctx.hasUI) ctx.ui.notify("/usage is available in interactive mode", "warning");
        return;
      }

      const initial = await buildView(ctx);
      await ctx.ui.custom<void>((tui, theme, keybindings, done) =>
        new UsageDialog(tui, theme, keybindings, initial, () => buildView(ctx), () => done()),
      );
      void poll();
    },
  });
}
