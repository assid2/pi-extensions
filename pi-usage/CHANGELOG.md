# Changelog

## Unreleased

- Atelier: contribute a single sidebar panel for the **selected**
  provider+account (the active model's account, lanes from that provider's
  adapter) instead of one panel per account — no per-account sections, no
  hard-coded names, so it scales to any provider or number of accounts. The
  panel id is stable, so a user's show/hide choice survives a model switch, and
  only the active account is polled (the `/usage` dialog still fetches the
  rest).
- Treat `ollama-*` provider ids as a namespace: every credential-bearing
  `ollama-*` key in `auth.json` is auto-registered as a clone of `ollama-cloud`
  (live catalog, own `models-store.json` entry, own quota line), and any
  `ollama-*` id resolves to the Ollama Cloud usage adapter. `ollama-cloud`
  remains the default member and clone base.
- Add the `commandcode-cloud` adapter (Command Code `api.commandcode.ai/alpha/*`):
  `5h` + `Weekly` rolling credit windows, a derived `Monthly` billing-period
  lane, `monthlyCredits`/`purchasedCredits`/`freeCredits` balances, and
  `spend.monthly` from `usage/summary` (`totalCredits ?? totalCost`).
  Multi-request flow (`whoami` → `credits` + `subscriptions` parallel →
  `usage/summary`) with per-endpoint degradation; endpoint override
  `PI_COMMANDCODE_USAGE_ENDPOINT`; ZDR via `CMD_ZDR`/`COMMANDCODE_ZDR`;
  `user_…`-key and `Bearer` redaction; pasted-key sanitization.

## 0.1.0 (2026-09-02)

Initial release.

- Per-account provider usage via alias providers (multi-account support).
- Agent usage: session tree (main + subagents) and time-window rollup.
- Adapters: claude, codex, zai±cn, kimi, minimax±cn, openrouter, deepseek,
  moonshot±cn, baseten (ported from @hk_net/pi-usage-bars, MIT), plus
  ollama-cloud, opencode-go, opencode, generic, and fallback.
- Footer status line, `/usage` dialog, `--usage` JSON flag.
- opencode-go provider registration (static catalog + live refresh).
