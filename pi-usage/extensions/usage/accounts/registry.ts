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
import type { UsageConfig } from "../config.ts";
import type { Account } from "../types.ts";

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

    const models = base.getModels();
    const first = models[0];
    const clone: {
      name: string;
      baseUrl?: string;
      apiKey?: string;
      api?: string;
      headers?: Record<string, string>;
      authHeader?: boolean;
      models?: unknown[];
    } = {
      name: `${base.name || account.base} (${account.name})`,
      baseUrl: base.baseUrl,
      // Model objects satisfy the config model shape structurally.
      models: models.length > 0 ? (models as unknown[]) : undefined,
    };
    if (first?.api) clone.api = first.api as string;
    if (base.headers) clone.headers = nonNullHeaders(base.headers);

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
