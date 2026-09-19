# Changelog

## Unreleased

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
