# deploy-pi-stack — reference

## What the stack is

The single source of truth is `deployment.json` at the root of the `assid2/pi-extensions`
repository. It declares:

| Package | Ref | What it provides |
|---|---|---|
| this repository (`ssh://git@ssh.github.com:443/assid2/pi-extensions.git`) | its own release tag (frozen) | `pi-usage` (provider quota/balance/spend, per-agent token usage), `pi-dynamic-workflows` (dynamic workflows, patched fork of `@quintinshaw/pi-dynamic-workflows`), and `pi-ollama-cloud` (patched fork of `pi-ollama-cloud`: prefix-aware Ollama Cloud namespace so the status bar, `/ollama-cloud-usage`, and web tools follow any `ollama-*` provider) |
| `npm:@tintinweb/pi-subagents` | latest (unpinned) | subagent orchestration tools |
| `npm:@monotykamary/pi-tps` | latest (unpinned) | tokens/second display |
| `git:github.com/obra/superpowers` | latest (unpinned) | superpowers skill suite |

The repository's *tag* is the only fixed point: it pins the self-hosted part of the stack. The
third-party entries deliberately carry no version — a machine converges to whatever npm/GitHub
publishes as latest at apply time. Two machines applying the same tag on different days can hold
different third-party versions; that is by design.

## The deployment contract

- **Frozen self-pin.** A machine bootstrapped at `vX` converges to `vX` forever; `apply.sh` never
  moves the monorepo entry to a newer tag on its own. "Bring me up to date" is therefore an
  explicit two-step: (1) resolve the highest release tag and `pi install ...@<new-tag>` (which
  moves the clone and rewrites the pinned settings entry), then (2) run `apply.sh` **from the
  updated clone** so the new `deployment.json` governs.
- **Third-party float.** Non-self entries in `deployment.json` are unversioned. `apply.sh` installs
  them unpinned and runs `pi update` for each one on every apply, so they always take the latest
  release. Never add a version to a third-party entry unless you deliberately want to freeze it.
- **`--check` is structural.** It asserts the declared entries are present with the declared pins;
  it cannot detect that upstream has published something newer.
- **`deployment.json` release rule** (enforced as a check inside `apply.sh`, not prose): the file's
  `version` field must equal the ref its own monorepo entry pins.

## What `apply.sh` guarantees

- Additive by default; `--prune` is the only mode that removes anything, and it is never implied.
- `--dry-run` prints the plan and changes nothing. `--check` exits non-zero if not *structurally*
  converged (CI-friendly).
- Unpinned manifest entries are always refreshed to the latest release (`pi update <spec>`): npm
  entries move to the newest published version and settings stay unversioned; a no-ref git entry
  fast-forwards to its default-branch head. The per-entry plan labels these `LATEST`, `UNPIN`
  (present but still versioned — settled and forced to latest in the same run), or `INSTALL-LATEST`
  (absent).
- It converges only through pi's own CLI (`pi install` / `pi remove` / `pi update`), touches only
  the `packages` key, and never opens, rewrites, or reorders `auth.json`, `models.json`,
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
- **A third-party package looks stale:** run `apply.sh` again — it refreshes every unpinned entry
  with `pi update <spec>` (or run that command directly). A bare `pi install` of an unpinned npm
  spec can resolve inside the version range recorded earlier; the explicit `pi update` pass is what
  guarantees the newest release.
- **Upgrading from the npm `pi-ollama-cloud`:** `apply.sh` is additive, so an existing
  `npm:pi-ollama-cloud` entry is left in place as drift — and would double-load `ollama-cloud`
  alongside the vendored fork (duplicate provider, commands, and web tools). Remove it once with
  `pi remove npm:pi-ollama-cloud`, or run `apply.sh --prune` deliberately.
