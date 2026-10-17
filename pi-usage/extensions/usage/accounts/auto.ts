/**
 * Auto-tracked usage accounts.
 *
 * A user should not need a `usage.json` just to see the providers they are
 * already logged into. Any provider id that resolves to a *specialized* usage
 * adapter — every `ollama-*` id, `commandcode-cloud`, `opencode-go`, and the
 * other known providers — is added to the account registry, so its quota lane
 * is fetched and shown next to the active account. Providers that fall back to
 * session-only usage (local/custom servers) stay opt-in through `usage.json`.
 */
import type { UsageConfig } from "../config.ts";
import { resolveAdapter } from "../adapters/index.ts";
import type { AccountRegistry } from "./registry.ts";

export function addSpecializedAccounts(
  registry: AccountRegistry,
  providerIds: Iterable<string>,
  config: UsageConfig,
  nameFor: (id: string) => string = (id) => id,
): string[] {
  const added: string[] = [];
  for (const id of providerIds) {
    if (!id || registry.get(id)) continue;
    if (resolveAdapter(id, config).id === "fallback") continue;
    registry.accountForProvider(id, nameFor(id));
    added.push(id);
  }
  return added;
}
