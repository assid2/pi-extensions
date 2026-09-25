/**
 * Account registry: the multi-account core.
 *
 * pi resolves exactly ONE credential per provider id, so multiple accounts
 * of the same provider are modeled as ALIAS providers: this module registers
 * a clone provider per extra account (`ollama-cloud-personal` for a second
 * Ollama Cloud key). Credentials for an alias come from:
 *   - `/login` against the alias (pi stores the key in auth.json under the
 *     alias id — auth.json stays the single source of truth), or
 *   - an explicit `env` in the account spec (`$ENV_VAR`).
 * Because every assistant message records the provider id it used, alias
 * attribution is exact with no extra bookkeeping.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import type { UsageConfig } from "../config.ts";
import type { Account } from "../types.ts";

type RegisteredProvider = NonNullable<ReturnType<ExtensionContext["modelRegistry"]["getProvider"]>>;
type RefreshContext = Parameters<NonNullable<RegisteredProvider["refreshModels"]>>[0];

/**
 * Ollama Cloud accounts are a namespace: any `ollama-<label>` provider id is a
 * local label for the same ollama.com service. The suffix is never sent to the
 * host and is validated against nothing. `ollama-cloud` is the default member.
 */
export function isOllamaProviderId(id: string): boolean {
  return /^ollama-/.test(id);
}

export interface ResolvedCredential {
  configured: boolean;
  token?: string;
  headers?: Record<string, string>;
  baseUrl?: string;
  /** Human-readable source label, e.g. "OLLAMA_API_KEY" or "OAuth". */
  source?: string;
  error?: string;
}

export class AccountRegistry {
  private readonly byId = new Map<string, Account>();
  accounts: Account[];

  constructor(accounts: Account[]) {
    this.accounts = accounts;
    for (const a of accounts) this.byId.set(a.id, a);
  }

  get(id: string): Account | undefined {
    return this.byId.get(id);
  }

  /**
   * Map a provider id (as recorded on messages/models) to its account.
   * Unknown providers become implicit default accounts on first sight, so
   * local/custom providers always have an identity for display.
   */
  accountForProvider(providerId: string, displayName?: string): Account {
    const existing = this.byId.get(providerId);
    if (existing) return existing;
    const implicit: Account = {
      id: providerId,
      name: displayName ?? providerId,
      base: providerId,
      isAlias: false,
    };
    this.accounts.push(implicit);
    this.byId.set(providerId, implicit);
    return implicit;
  }
}

function displayFor(ctx: ExtensionContext, providerId: string): string {
  try {
    return ctx.modelRegistry.getProviderDisplayName(providerId) || providerId;
  } catch {
    return providerId;
  }
}

/**
 * Build the account list from config. One default account per configured
 * provider (non-alias specs), one alias account per alias spec. Duplicate
 * default accounts for the same provider are dropped (first wins).
 */
export function buildAccounts(ctx: ExtensionContext, config: UsageConfig, warnings: string[]): AccountRegistry {
  const accounts: Account[] = [];
  const seenDefault = new Set<string>();

  for (const spec of config.accounts) {
    if (spec.alias) {
      if (seenDefault.has(spec.alias)) {
        warnings.push(`usage.json: duplicate account id "${spec.alias}"`);
        continue;
      }
      seenDefault.add(spec.alias);
      accounts.push({
        id: spec.alias,
        name: spec.name ?? spec.alias,
        base: spec.provider,
        isAlias: true,
      });
    } else {
      if (seenDefault.has(spec.provider)) {
        warnings.push(`usage.json: multiple default accounts for "${spec.provider}"; keeping the first`);
        continue;
      }
      seenDefault.add(spec.provider);
      accounts.push({
        id: spec.provider,
        name: spec.name ?? displayFor(ctx, spec.provider),
        base: spec.provider,
        isAlias: false,
      });
    }
  }

  return new AccountRegistry(accounts);
}

interface CloneInput {
  specEnv?: string;
}

interface ProviderClone {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  models?: unknown[];
  refreshModels?: (context: RefreshContext) => Promise<unknown>;
}

/**
 * Copy the base provider's effective shape (name, baseUrl, models, api,
 * headers, and catalog refresh) into a provider registration config. `apiKey`
 * is deliberately NOT copied: the clone resolves its own credential for its
 * own id from auth.json / env (see resolveCredential).
 *
 * The refresh wrapper calls through to the base and returns the base's
 * refreshed models, so the clone's catalog swaps live; the base's callback
 * persists the catalog under the clone's own models-store key, which is why
 * each member gets its own `models-store.json` entry and 4h cooldown.
 */
function cloneProviderShape(base: RegisteredProvider, name: string): ProviderClone {
  const models = base.getModels();
  const first = models[0];
  const clone: ProviderClone = {
    name,
    baseUrl: base.baseUrl,
    // Model objects satisfy the config model shape structurally.
    models: models.length > 0 ? (models as unknown[]) : undefined,
  };
  if (first?.api) clone.api = first.api as string;
  if (base.headers) clone.headers = nonNullHeaders(base.headers);
  if (base.refreshModels) {
    const refresh = base.refreshModels.bind(base);
    clone.refreshModels = async (context: RefreshContext) => {
      await refresh(context);
      return base.getModels();
    };
  }
  return clone;
}

/**
 * Read the top-level keys of `<agentDir>/auth.json`. Keys are provider ids —
 * values are credentials and are never read, logged, returned, or hashed.
 * A missing file is ordinary (no credentials yet); malformed or non-object
 * content yields one warning and no ids, never a throw.
 */
export function loadAuthProviderIds(agentDir: string): { ids: string[]; warning?: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(agentDir, "auth.json"), "utf8");
  } catch {
    return { ids: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ids: [],
      warning: `auth.json: invalid JSON (${(error as Error).message}); ollama-* providers not auto-registered`,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ids: [], warning: "auth.json: top level must be an object; ollama-* providers not auto-registered" };
  }
  return { ids: Object.keys(parsed as Record<string, unknown>) };
}

/**
 * Register a clone provider for every credentialed `ollama-*` id that is not
 * already a provider. Idempotent across session_start (`new`/`fork`/`resume`/
 * `reload`): an id that already has a provider definition is left alone.
 */
export function registerOllamaNamespaceProviders(
  ctx: ExtensionContext,
  agentDir: string,
  warnings: string[],
): void {
  const base = ctx.modelRegistry.getProvider("ollama-cloud");
  if (!base) {
    warnings.push('ollama providers: base "ollama-cloud" is not registered; ollama-* providers skipped');
    return;
  }

  const auth = loadAuthProviderIds(agentDir);
  if (auth.warning) warnings.push(auth.warning);

  const members = new Set<string>();
  for (const id of [...auth.ids, ...ctx.modelRegistry.getRegisteredProviderIds()]) {
    if (id === "ollama-cloud") continue;
    if (isOllamaProviderId(id)) members.add(id);
  }

  for (const id of members) {
    if (ctx.modelRegistry.getProvider(id)) continue;
    const label = id.slice("ollama-".length);
    const clone = cloneProviderShape(base, `${base.name || "Ollama Cloud"} (${label})`);
    try {
      ctx.modelRegistry.registerProvider(id, clone as never);
    } catch (error) {
      warnings.push(`${id}: registration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Register alias providers for alias accounts. Idempotent and non-destructive:
 * if a provider with the alias id already exists (e.g. the user defined it in
 * models.json or another package registered it), the existing definition wins
 * and the clone is skipped.
 *
 * The clone copies the base provider's effective shape (name, baseUrl, models)
 * so /model and Ctrl+P work for the alias exactly like the base.
 */
export function registerAliasProviders(
  ctx: ExtensionContext,
  registry: AccountRegistry,
  config: UsageConfig,
  warnings: string[],
): void {
  for (const account of registry.accounts) {
    if (!account.isAlias) continue;
    if (ctx.modelRegistry.getProvider(account.id)) {
      warnings.push(`alias "${account.id}" already exists as a provider; using the existing definition`);
      continue;
    }
    const base = ctx.modelRegistry.getProvider(account.base);
    if (!base) {
      warnings.push(`alias "${account.id}": base provider "${account.base}" is not registered; alias skipped (add it via models.json or a package)`);
      continue;
    }

    const clone = cloneProviderShape(base, `${base.name || account.base} (${account.name})`);

    const spec = config.accounts.find((s) => s.alias === account.id);
    if (spec?.env) {
      clone.apiKey = `$${spec.env}`;
      // Env-keyed clones are plain bearer providers.
      clone.authHeader = true;
    } else if (!ctx.modelRegistry.getProviderAuthStatus(account.id).configured) {
      // No key yet: the user completes setup with /login for the alias.
      // Leave apiKey unset so /login offers the right flow for the base kind.
      warnings.push(`alias "${account.id}" has no credential yet — run /login and select it to add a key`);
    }

    try {
      ctx.modelRegistry.registerProvider(account.id, clone as never);
    } catch (error) {
      warnings.push(`alias "${account.id}": registration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Resolve the current credential for an account through pi's registry
 * (auth.json first, then env, then provider config — pi's own priority).
 * Never throws; returns `configured: false` when the account has no key.
 */
export async function resolveCredential(ctx: ExtensionContext, account: Account): Promise<ResolvedCredential> {
  const status = ctx.modelRegistry.getProviderAuthStatus(account.id);
  if (!status.configured) {
    return { configured: false, source: status.label };
  }
  let resolved;
  try {
    resolved = await ctx.modelRegistry.getProviderAuth(account.id);
  } catch (error) {
    return { configured: true, error: `auth resolution failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!resolved) return { configured: false };

  let token: string | undefined = resolved.auth.apiKey;
  if (!token) {
    const auth = resolved.auth.headers?.Authorization ?? resolved.auth.headers?.authorization;
    if (typeof auth === "string" && auth.startsWith("Bearer ")) token = auth.slice("Bearer ".length);
  }
  if (!token) {
    return {
      configured: true,
      error: "configured authentication did not resolve a key",
      source: status.label ?? resolved.source,
    };
  }
  return {
    configured: true,
    token,
    headers: resolved.auth.headers ? nonNullHeaders(resolved.auth.headers) : undefined,
    baseUrl: resolved.auth.baseUrl ?? ctx.modelRegistry.getProvider(account.id)?.baseUrl,
    source: status.label ?? resolved.source,
  };
}

function nonNullHeaders(headers: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== null) out[key] = value;
  }
  return out;
}
