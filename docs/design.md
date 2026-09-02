# pi-usage — design

Date: 2026-09-02 · Status: implemented (v0.1.0)

A modular replacement for `@hk_net/pi-usage-bars` (MIT) that adds per-account
provider usage and per-agent token usage to Pi.

## Goals

1. **Provider usage, per account** — quota lanes / balance / spend for every
   account, including multiple accounts of the same provider.
2. **Agent usage** — the main session and every subagent (pi-subagents,
   pi-dynamic-workflows), each of which may run on its own provider/account:
   tokens in/out/cache, cost, status, duration.
3. **New providers** — `ollama-cloud`, `opencode-go` (+ `opencode` zen).
4. **Custom/local providers** — anything without a usage endpoint (local
   vLLM, unknown models.json entries) still shows session/agent usage.
5. **Portable** — standalone git repo, published as a pi package.

## Key decisions

### Multi-account = alias providers (option A)

Pi resolves exactly one credential per provider id. Multiple accounts of the
same provider are modeled as **alias providers**: the extension registers a
clone provider per extra account (`ollama-cloud-personal`), copying the base
provider's effective shape (name, baseUrl, models). Credentials come from
`/login` against the alias (stored in `auth.json` — the single source of
truth) or an explicit `env` binding. Because every session message records
the provider id it used, alias attribution is exact with zero bookkeeping.

### Two usage data sources

- **Provider-side** (external): per-account quota/balance/spend via each
  provider's usage endpoint, fetched by adapters with a shared
  cross-process cache + 429 backoff (ported from the reference).
- **Agent-side** (local): pi session JSONL files. Subagent sessions carry a
  `parentSession` header (the parent's file path); the scanner walks that
  graph and sums per-message `usage` (assistant + tool + compaction)
  incrementally (byte-offset tails, mtime prefilter). Live status from the
  in-process event bus (`subagents:*`, `pi-dynamic-workflows:lifecycle`).

### Adapter tiers

1. Known adapters (14): claude, codex, zai±cn, kimi, minimax±cn, openrouter,
   deepseek, moonshot±cn, baseten (ported, MIT-attributed), ollama-cloud,
   opencode-go, opencode.
2. Generic adapter: config-attached endpoint (absolute/relative URL or
   `!command`) + heuristic parser (fractions, percents, spent-vs-limit,
   balances, spend).
3. Fallback: no endpoint → session/agent usage only, never an error.

### UI

- Footer: active account's quota lanes + live subagent count (one line; no
  duplication of pi's core footer).
- `/usage`: dialog with three sections — session agent tree, accounts,
  time-window rollup (1d/7d/30d/all).
- `--usage`: JSON one-shot for scripting.

## Module layout

```
extensions/usage/
  index.ts            wiring: events, commands, flags, poll loop
  types.ts            domain types
  format.ts           presentation helpers (theme-free)
  config.ts           usage.json loader (key-free)
  accounts/registry.ts  accounts, alias registration, credential resolution
  adapters/           http.ts (cache/backoff), types.ts, 14 adapters,
                      generic.ts, fallback.ts, index.ts (registry)
  agents/             scanner.ts (session files), events.ts (bus),
                      tree.ts (session tree), rollup.ts (windows)
  ui/                 footer.ts, dialog.ts
  providers/          opencode-go.ts (provider registration + catalog)
```

## Safety

- Keys only via `modelRegistry` resolution; never logged or written.
- `usage.json` is key-free; we never read/write `auth.json` or `models.json`.
- Per-account fetch isolation; 12s timeouts; abort on shutdown.
- Coexistence: startup notice if `@hk_net/pi-usage-bars` is still installed.

## Testing

`node --test` (Node 22 native type-stripping), no network: parser fixtures
per adapter, synthetic session-tree scanner tests, mock-registry alias tests,
formatter/config tests. 95 tests.
