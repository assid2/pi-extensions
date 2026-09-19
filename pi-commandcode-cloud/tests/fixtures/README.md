# Test fixtures

Recorded and hand-authored payloads for the `pi-commandcode-cloud` unit tests.
The machine-readable provenance (kind, HTTP method/status, source, redactions) is
in [`provenance.json`](./provenance.json); `provenance.json` itself is asserted to
be complete by `tests/usage-parse.test.ts`.

| File | Kind | Method / status | Purpose |
|---|---|---|---|
| `models.json` | **captured** (trimmed) | `GET /provider/v1/models` · 200 | Public catalog envelope; 2 `claude-*` (`["/messages"]`) + 6 slash-containing OpenAI-wire ids |
| `whoami.json` | synthetic | `GET /alpha/whoami?limits=1` · 200 | Identity, org id (feeds `orgId`), `orgLimits` with slash ids |
| `credits.json` | synthetic | `GET /alpha/billing/credits` · 200 | `credits` balances + `windowLimits.fiveHour|weekly` (epoch-ms `resetAt`) |
| `subscriptions.json` | synthetic | `GET /alpha/billing/subscriptions` · 200 | `currentPeriodStart` (feeds `since`) + `currentPeriodEnd` (Monthly reset) |
| `summary.json` | synthetic | `GET /alpha/usage/summary` · 200 | Period spend (`totalCredits ?? totalCost`) for the derived Monthly lane |
| `unauthorized.json` | synthetic | `GET /alpha/whoami` · **401** | The `{success:false,error:{code:"UNAUTHORIZED",…}}` envelope |
| `credits-provider-plan.json` | synthetic | `GET /alpha/billing/credits` · 200 | Provider/pay-as-you-go account: **no `windowLimits`** |

"Captured" means the body was recorded from a real HTTP response
(`models.json` comes from the live unauthenticated catalog snapshot checked into
`scripts/models.snapshot.json`, trimmed to representative entries).
"Synthetic" means no credential was available to capture a real response, so the
body was hand-authored from the verified contract in
`docs/plans/pi-commandcode-cloud.md` §6.2/§6.3. Synthetic fixtures redact
identity fields (`u_Redacted…`, `org_Redacted…`); no real API key appears in any
fixture.

Unit tests are network-free: the account-API tests inject `fetchFn`, and the
catalog-refresh tests stub `globalThis.fetch`. The only socket opened by the
suite is the `127.0.0.1` loopback login server in `oauth.test.ts`, which is the
unit under test.
