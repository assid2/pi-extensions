# Changelog

All notable changes to `pi-commandcode-cloud` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 (2026-09-19)

Initial release.

### Added

- `commandcode-cloud` model provider: one provider id routing per model to
  Command Code's OpenAI-compatible (`/provider/v1/chat/completions`) or
  Anthropic-compatible (`/provider/v1/messages`) transport, including the
  8 Claude models whose catalog entry supports only `/messages`.
- Live public model catalog (`GET /provider/v1/models`, no credential), merged
  with checked-in per-model metadata (reasoning, effort levels, input
  modalities, max output tokens, pricing) and a baked `GENERATED_MODELS`
  offline fallback. `refreshModels` honors `allowNetwork:false` as a pure read,
  never returns `[]`, persists only on full success, and advances `checkedAt`
  on a partial refresh.
- Native `/login commandcode-cloud`: synthesized API-key paste plus an optional
  browser loopback login (`127.0.0.1`, ports 5959–5968 with ephemeral
  fallback, one-shot, state-checked, origin-allowlisted, 10 KB body cap, 120 s
  timeout), validating the key against `GET /alpha/whoami`.
- Credential resolution with pi-registry precedence and env aliases
  `COMMAND_CODE_API_KEY` / `COMMANDCODE_API_KEY` / `CMD_API_KEY`, read-only
  interop with `~/.commandcode/auth.json`, pasted-key sanitization, and
  placeholder rejection.
- Opt-in (default off) quota footer with `5h` / `Weekly` / derived `Monthly`
  lanes, balances, colors, a 5-minute refresh with a 60-second fast path near
  exhaustion, and active-provider gating.
- Account API data plane against `GET /alpha/{whoami,billing/credits,billing/subscriptions,usage/summary}`
  with per-endpoint degradation, ZDR support (`CMD_ZDR`/`COMMANDCODE_ZDR`), and
  `Bearer`/`user_`/`cc_` redaction on every surfaced string.
- Commands: `/commandcode-usage`, `/commandcode-usage-status`,
  `/commandcode-status`, `/commandcode-refresh`.
- Configuration `usageStatus` (default `false`) and `usageRefreshMs` (default
  `300000`) with global/project/env precedence.
- `pi-usage` integration: a `commandcode-cloud` adapter (registered in the
  `KNOWN` map) exposing the same lanes, balances, and spend to the pi-usage
  footer and `/usage` dialog.
- Network-free unit tests (injected `fetchFn`) and a Biome config; TypeScript
  ESM with explicit `.ts` import specifiers and `erasableSyntaxOnly`.
