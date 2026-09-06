# @assid2/pi-usage

Per-account provider quota/balance/spend **and** per-agent token usage for the
[Pi](https://pi.dev) coding agent. A modular replacement for
`@hk_net/pi-usage-bars` that adds:

- **Per-account usage** — multiple accounts of the same provider (e.g. two
  Ollama Cloud keys) are modeled as alias providers; each account's quota,
  balance, and spend is fetched and displayed separately.
- **Per-agent usage** — the main session **and** every subagent (pi-subagents,
  pi-dynamic-workflows) with its own provider/account: tokens in/out/cache,
  cost, status, and duration.
- **New providers** — `ollama-cloud` (request-count 5h/7d limits + 4-week
  spend) and `opencode-go` (dollar-denominated 5h/$12 · weekly/$30 ·
  monthly/$60 limits) plus `opencode` (Zen, spend-only).
- **Custom/local providers** — anything without a usage endpoint (your local
  vLLM, llama.cpp, unknown models.json entries) still shows session/agent
  usage; attach a generic endpoint in config to get quota bars for it.

## Install

```bash
pi install npm:@assid2/pi-usage   # or: pi install /path/to/pi-usage
```

## What you get

- **Footer status line** — the active account's quota lanes + live subagent
  count: `Go(personal) 5h ██░░ 43% ⟳ 2h · W 21% · M 8% · ⧉3`
- **`/usage`** — interactive dialog with three sections:
  1. **This session** — agent tree (main + subagents, per-agent usage)
  2. **Accounts** — per-account quota lanes / balance / spend
  3. **Totals** — time-window rollup per account × provider × role
- **`pi --usage`** — same data as JSON, one shot, exits (scripting)

## Configuration

`~/.pi/agent/usage.json` — **key-free by design**; credentials live in pi's
`auth.json` (set per account with `/login`) or env vars.

```json
{
  "accounts": [
    { "provider": "ollama-cloud", "name": "work" },
    { "provider": "ollama-cloud", "name": "personal", "alias": "ollama-cloud-personal" },
    { "provider": "opencode-go", "name": "go" }
  ],
  "adapters": {
    "vllm": { "usageEndpoint": "http://127.0.0.1:18020/metrics/usage" }
  },
  "rollupWindow": "1d",
  "pollIntervalMs": 120000
}
```

### Accounts

- The **first** entry per provider is its default account (no alias).
- **Extra accounts** declare an `alias` — a clone provider id. The extension
  registers it (same models, same endpoint) so `/model`, Ctrl+P, the
  pi-subagents `model` parameter, and workflow `model`/`tier` can all select
  it. Because every session message records the provider id it used, usage is
  attributed to the right account automatically.
- **Keys**: run `/login` and select the alias to store its key in `auth.json`
  (single source of truth), or set `"env": "MY_KEY_ENV_VAR"` on the account
  spec to bind it to an environment variable.
- OAuth providers (Claude/Codex): a second subscription = a second `/login`
  under the alias id. Best-effort — depends on the provider tolerating two
  tokens.

### Generic adapters

Attach a usage endpoint to any provider (absolute URL, or a path relative to
the provider's `baseUrl`; `!command` runs a shell command whose stdout is the
JSON):

```json
{ "adapters": { "my-gateway": { "usageEndpoint": "/v1/usage" } } }
```

The parser heuristically recognizes percent/fraction fields, spent-vs-limit
windows, balances, and spend breakdowns.

## Providers

| Provider id | What's shown | Endpoint |
|---|---|---|
| `anthropic` | 5h + weekly %, extra-usage credits | `api.anthropic.com/api/oauth/usage` |
| `openai-codex` | 5h + weekly % + resets | `chatgpt.com/backend-api/wham/usage` |
| `openrouter` | balance, daily/week/month/lifetime spend, key limit | `openrouter.ai/api/v1/{credits,key}` |
| `deepseek` | balance (topped-up + granted) | `api.deepseek.com/user/balance` |
| `moonshotai` / `moonshotai-cn` | balance (cash + voucher) | `api.moonshot.{ai,cn}/v1/users/me/balance` |
| `baseten` | monthly credits used | `api.baseten.co/v1/billing/usage_summary` |
| `zai` / `zai-coding-cn` | 5h + weekly % + resets | `api.z.ai` / `open.bigmodel.cn` monitor endpoints |
| `kimi-coding` | 5-hour + weekly % + resets | `api.kimi.com/coding/v1/usages` |
| `minimax` / `minimax-cn` | interval + weekly % + credit balance | `api.minimax.io` / `api.minimaxi.com` token-plan endpoints |
| `ollama-cloud` | 5h + 7d **request** % + 4-week spend | `ollama.com/api/usage` |
| `opencode-go` | 5h/$12 · weekly/$30 · monthly/$60 (dollar-based) | `opencode.ai/zen/go/v1/usage` |
| `opencode` | spend rows (credit-billed) | `opencode.ai/zen/v1/usage` |
| anything else | session/agent usage only (fallback) | — |

Endpoint overrides: `PI_*_USAGE_ENDPOINT` env vars (see
[docs/providers.md](docs/providers.md)).

## How agent usage works

- pi-subagents persists top-level subagent sessions with a `parentSession`
  header pointing at the parent session file; the scanner walks that graph
  (any project directory) and sums per-message `usage` (assistant + tool +
  compaction) incrementally (byte-offset tails, mtime-window prefilter).
- Live status comes from the in-process event bus (`subagents:*`,
  `pi-dynamic-workflows:lifecycle`).
- pi-dynamic-workflows agents are in-memory by default; their usage is visible
  live via the bus, and on disk only when `persistAgentSessions` is enabled.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test "tests/*.test.ts"
```

## License

MIT. Portions of the provider adapters are derived from
[@hk_net/pi-usage-bars](https://github.com/hknet/pi-usage-bars) (MIT).
