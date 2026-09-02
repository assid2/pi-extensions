# Changelog

## 0.1.0 (2026-09-02)

Initial release.

- Per-account provider usage via alias providers (multi-account support).
- Agent usage: session tree (main + subagents) and time-window rollup.
- Adapters: claude, codex, zai±cn, kimi, minimax±cn, openrouter, deepseek,
  moonshot±cn, baseten (ported from @hk_net/pi-usage-bars, MIT), plus
  ollama-cloud, opencode-go, opencode, generic, and fallback.
- Footer status line, `/usage` dialog, `--usage` JSON flag.
- opencode-go provider registration (static catalog + live refresh).
