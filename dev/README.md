# Development automation

Everything here exists so that working on the extensions is **edit → (nothing) → it
is live in pi**, and **ask pi to commit/push → it lands on GitHub correctly**.

## One-time setup (per machine)

```bash
./dev/setup-dev.sh
```

Idempotent. It installs dependencies, builds `pi-dynamic-workflows/dist`, points
`core.hooksPath` at `.githooks/`, symlinks `dev/dev-watch.ts` into
`~/.pi/agent/extensions/`, and converges the pi packages to this live checkout
(`pi install <subdir>` + `deploy/apply.sh`, which dedups away the managed clone).

## The dev loop

| Change | What happens automatically |
|---|---|
| `pi-dynamic-workflows/src/**` | `npm run build` (tsc) → pi hot-reloads via `/dev-reload` |
| `pi-dynamic-workflows/package.json`, `tsconfig*.json` | rebuild + reload |
| `pi-dynamic-workflows/skills/**`, `deploy/skills/**` | reload (no build step) |
| `pi-commandcode-cloud/*.ts` (TypeScript, loaded directly) | reload |
| `pi-usage/extensions/**` (TypeScript, loaded directly) | reload |

- A **failed build does not reload** — pi keeps the last working code and shows the
  compiler error.
- Edits made while pi was not running are picked up on the next session start
  (`dist/` older than `src/` triggers a rebuild).
- Commands: `/dev-reload` (rebuild if needed + reload now), `/dev-watch on|off|status`.
- Env: `PI_EXTENSIONS_DEV_ROOT` (default: the watched checkout this file belongs to),
  `PI_EXTENSIONS_DEV_WATCH=0` to disable, `PI_EXTENSIONS_DEV_QUIET=1` for silence.

## Committing and pushing

Just ask pi (or run git yourself). The hooks in `.githooks/` guarantee correctness:

- **pre-commit** — if `pi-dynamic-workflows` sources are staged, rebuilds `dist/` and
  stages it, so the committed artifact always matches the source. Also rejects a
  `deployment.json` whose monorepo self-entry carries a version/tag — it must stay
  unversioned, because `apply.sh` floats it to the newest release tag.
- **pre-push** — rebuilds and fails if `dist/` is stale, runs the `pi-usage` and
  `pi-commandcode-cloud` checks (typecheck + tests + Biome) and the
  `pi-dynamic-workflows` unit tests, and for a pushed `v*` tag verifies that the
  tag equals `deployment.json` `version` (the self-entry is unversioned, so there is
  no self-pin check).

Escape hatches: `git commit --no-verify`, `git push --no-verify`.

## Releasing (unchanged from the root README)

1. Bump `deployment.json` `version` to the new release label. The monorepo self-entry stays
   **unversioned** — leave it as `ssh://git@ssh.github.com:443/assid2/pi-extensions.git` (the
   pre-commit hook enforces this).
2. `git tag v1.x.0 && git push origin main v1.x.0` (pre-push verifies tag == `version`).
3. Other machines converge with `deploy/apply.sh` or by asking their pi.
