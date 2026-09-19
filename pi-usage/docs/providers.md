# Provider usage endpoints

All adapters send `Authorization: Bearer <account key>` unless noted. Every
endpoint can be overridden with an env var; the extension reads them from the
process environment at fetch time.

| Provider | Default endpoint | Env override |
|---|---|---|
| anthropic | `https://api.anthropic.com/api/oauth/usage` (+ header `anthropic-beta: oauth-2025-04-20`) | `PI_CLAUDE_USAGE_ENDPOINT` |
| openai-codex | `https://chatgpt.com/backend-api/wham/usage` | `PI_CODEX_USAGE_ENDPOINT` |
| openrouter | `https://openrouter.ai/api/v1/credits` + `/key` | `PI_OPENROUTER_CREDITS_ENDPOINT`, `PI_OPENROUTER_KEY_ENDPOINT` |
| deepseek | `https://api.deepseek.com/user/balance` | `PI_DEEPSEEK_BALANCE_ENDPOINT` |
| moonshotai | `https://api.moonshot.ai/v1/users/me/balance` | `PI_MOONSHOT_BALANCE_ENDPOINT` |
| moonshotai-cn | `https://api.moonshot.cn/v1/users/me/balance` | `PI_MOONSHOT_CN_BALANCE_ENDPOINT` |
| baseten | `https://api.baseten.co/v1/billing/usage_summary` (start_date = 1st of month, end_date = now) | `PI_BASETEN_USAGE_ENDPOINT` |
| zai | `https://api.z.ai/api/monitor/usage/quota/limit` | `PI_ZAI_USAGE_ENDPOINT` |
| zai-coding-cn | `https://open.bigmodel.cn/api/monitor/usage/quota/limit` | `PI_ZAI_CODING_CN_USAGE_ENDPOINT` |
| kimi-coding | `https://api.kimi.com/coding/v1/usages` (+ `User-Agent: KimiCLI/1.5`) | `PI_KIMI_USAGE_ENDPOINT` |
| minimax | `https://api.minimax.io/v1/token_plan/remains` (+ legacy `/v1/api/openplatform/coding_plan/remains`) | `PI_MINIMAX_USAGE_ENDPOINT`, `PI_MINIMAX_LEGACY_USAGE_ENDPOINT` |
| minimax-cn | `https://api.minimaxi.com/v1/token_plan/remains` (+ legacy) | `PI_MINIMAX_CN_USAGE_ENDPOINT`, `PI_MINIMAX_CN_LEGACY_USAGE_ENDPOINT` |
| ollama-cloud | `https://ollama.com/api/usage` | `PI_OLLAMA_USAGE_ENDPOINT` |
| commandcode-cloud | `https://api.commandcode.ai/alpha/whoami` + `/billing/credits` + `/billing/subscriptions` + `/usage/summary` | `PI_COMMANDCODE_USAGE_ENDPOINT` |
| opencode-go | `https://opencode.ai/zen/go/v1/usage` | `PI_OPENCODE_GO_USAGE_ENDPOINT` |
| opencode | `https://opencode.ai/zen/v1/usage` | `PI_OPENCODE_USAGE_ENDPOINT` |

## Response shapes

### ollama-cloud (`/api/usage`)

```json
{
  "limits": {
    "session": { "usage": 0.42, "models": [{ "name": "qwen3.5:397b", "request_count": 3 }] },
    "weekly":  { "usage": 0.61, "models": [] }
  },
  "activity": { "cost": "$12.34" }
}
```

`usage` is a 0-1 fraction of the plan's REQUEST cap (5-hour and 7-day
windows). `activity.cost` is the 4-week spend string.

### commandcode-cloud (`/alpha/*`)

The account/quota API lives at the host root (`https://api.commandcode.ai`,
not `/provider/v1`) and uses the same `user_…` key as the Command Code
Provider API. `PI_COMMANDCODE_USAGE_ENDPOINT` overrides the origin. Every call
sends `Authorization: Bearer <key>`, `x-command-code-version`,
`x-cli-environment: production`, and `x-cmd-zdr: 1` when `CMD_ZDR` /
`COMMANDCODE_ZDR` is enabled.

```jsonc
// GET /alpha/whoami?limits=1
{ "success": true,
  "org": null | { "id": "org_…", "login": "…" },
  "orgLimits": [ { "scope": "model", "model": "deepseek/deepseek-v4.1-flash", "spent": 1.2, "limit": 5, "exceeded": false } ] }

// GET /alpha/billing/credits?orgId=org_…
{ "credits": { "monthlyCredits": 12.0, "purchasedCredits": 3.0, "freeCredits": 1.0, "planId": "individual-provider" },
  "windowLimits": {
    "limited": false, "exceeded": null,
    "fiveHour": { "used": 2.25, "cap": 3, "exceeded": false, "resetAt": 1786091731770 },
    "weekly":   { "used": 6.24, "cap": 12, "exceeded": false, "resetAt": 1786603898869 } } }

// GET /alpha/billing/subscriptions?orgId=org_…
{ "success": true, "data": { "planId": "individual-provider", "status": "active",
  "currentPeriodStart": "2026-09-01T00:00:00.000Z", "currentPeriodEnd": "2026-10-01T00:00:00.000Z" } }

// GET /alpha/usage/summary?orgId=org_…&since=2026-09-01T00:00:00.000Z
{ "totalCount": 17641, "totalCost": 67.68, "totalCredits": 67.68, "successRate": 100, "periodBasis": "billing-period" }
```

Lanes: `5h` = `windowLimits.fiveHour`, `Weekly` = `windowLimits.weekly`
(percent = `used/cap`; `resetAt` is epoch **milliseconds** and is omitted when
`<= 0` or the window is `0/0`). `Monthly` is **derived**, not a `windowLimits`
key: used = `summary.totalCredits ?? summary.totalCost`, remaining =
`credits.monthlyCredits`, cap = used + remaining (plan-nominal fallback from
the `planId` when no `usage/summary` total is available). Balances are
`monthlyCredits` / `purchasedCredits` / `freeCredits`, and `spend.monthly` is
the derived used total. Provider/pay-as-you-go plans have no rolling windows,
so they render Monthly-only (or no lanes). A failed section is reported as
unavailable, never as `0`.

The request order is `whoami` → (`credits` + `subscriptions` in parallel) →
`usage/summary`; `orgId` and `since` are omitted when unavailable, and a 401
is returned to pi-usage as an error with `status: 401` for backoff.

### opencode-go (`/zen/go/v1/usage`)

Documented limits (opencode.ai/docs/go): **5-hour $12, weekly $30, monthly
$60**. The authenticated response shape is not publicly documented; the parser
accepts, in order:

1. a `windows`/`limits`/`usage` array with `{ name, limit?, spent|used|amount,
   percent? }` entries;
2. object windows keyed `five_hour`/`weekly`/`monthly` (or camelCase), each a
   number (spent USD) or `{ spent, limit, percent }`;
3. a single total spend.

Where a percent is absent but a dollar amount and a limit are known, the
percent is computed against the documented limits. If you have a real response
that fails to parse, open an issue with a redacted sample.
