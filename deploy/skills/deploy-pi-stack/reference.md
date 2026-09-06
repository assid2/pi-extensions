# deploy-pi-stack — reference

## What the stack is

The single source of truth is `deployment.json` at the root of the `assid2/pi-extensions`
repository. At release `v1.0.0` it declares:

| Package | Pin | What it provides |
|---|---|---|
| this repository (`ssh://git@ssh.github.com:443/assid2/pi-extensions.git`) | its own tag | `pi-usage` (provider quota/balance/spend, per-agent token usage) and `pi-dynamic-workflows` (dynamic workflows, patched fork of `@quintinshaw/pi-dynamic-workflows`) |
| `npm:@tintinweb/pi-subagents` | `0.19.0` | subagent orchestration tools |
| `npm:pi-ollama-cloud` | `0.9.0` | Ollama Cloud provider |
| `npm:@monotykamary/pi-tps` | `1.3.9` | tokens/second display |
| `git:github.com/obra/superpowers` | `v6.3.0` | superpowers skill suite |

The repository's *tag* is what pins the whole self-hosted part of the stack; the npm/git pins are
exact. Any machine, any day, same tag → same `packages` list.

## The reproducibility contract

- **Frozen self-pin.** A machine bootstrapped at `vX` converges to `vX` forever; `apply.sh` never
  moves the monorepo entry to a newer tag on its own. "Bring me up to date" is therefore an
  explicit two-step: (1) resolve the highest release tag and `pi install ...@<new-tag>` (which
  moves the clone and rewrites the pinned settings entry), then (2) run `apply.sh` **from the
  updated clone** so the new `deployment.json` governs.
- **No unpinned "latest" ever lands in settings.** Every entry pi writes is pinned.
- **`deployment.json` release rule** (enforced as a check inside `apply.sh`, not prose): the file's
  `version` field must equal the ref its own monorepo entry pins.

## What `apply.sh` guarantees

- Additive by default; `--prune` is the only mode that removes anything, and it is never implied.
- `--dry-run` prints the plan and changes nothing. `--check` exits non-zero if not converged
  (CI-friendly).
- It converges only through pi's own CLI (`pi install` / `pi remove`), touches only the
  `packages` key, and never opens, rewrites, or reorders `auth.json`, `models.json`,
  `models-store.json`, `AGENTS.md`, or any other file.
- **Dev-checkout dedup rule:** if settings contains a *local-path* package whose resolved git
  origin is the same repository as the monorepo entry (matched on normalized host/path, ignoring
  URL scheme and host variants such as `ssh://git@ssh.github.com:443` vs `github.com`), the
  monorepo entry counts as satisfied and the git package is not installed — so a live dev
  checkout and a cloned copy are never loaded simultaneously. If both are present, `apply.sh`
  removes the redundant git entry (that state would double-load the extensions).
- Preflight (clear error + non-zero exit, never a stack trace): `pi` on PATH and loadable;
  `git`/`node` present; `deployment.json` parses; the release-rule check; the clone contains a
  root `package.json` and every path its `pi` manifest declares.

## Prerequisites on a fresh machine

- pi is already installed (this deployment converges the extension stack; it does not install or
  upgrade pi itself).
- Outbound SSH on port 443 (`ssh://git@ssh.github.com:443/...`) or, if the user's ssh client
  prefers the classic port, any equivalent way for `git` to reach the repository — `apply.sh`
  itself performs no git network operations; pi's `pi install` does the cloning using whatever
  SSH setup the user has.
- Write access is only needed if you are the one *releasing* new stack versions
  (commit + tag + push). Installing/refreshing is read-only.

## Troubleshooting

- **`pi install` of the monorepo fails on SSH:** check `ssh -v -p 443 git@ssh.github.com` and
  `~/.ssh/config`; GitHub's ssh.github.com:443 is the fallback for networks that block port 22.
- **Clone path:** pi clones git packages to `$PI_CODING_AGENT_DIR/git/<host>/<path>` — for this
  repository that is `$PI_CODING_AGENT_DIR/git/ssh.github.com/assid2/pi-extensions` (host is the
  literal URL host; `ssh.github.com` is *not* normalized to `github.com`).
- **`apply.sh: ERROR: release rule violated`:** the checkout's `deployment.json` is internally
  inconsistent (version field vs self-pin). Refuse to run; this is a broken release, report it.
- **Post-condition MISMATCH after a pin bump:** the clone was not actually moved (a failed
  `pi install`); re-run step 3 and check its exit status before applying.
