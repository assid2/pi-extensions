# pi-extensions

Monorepo of pi extensions with a **reproducible full-stack deployment**: one install gives you
exactly the extension stack declared in [`deployment.json`](deployment.json) — including
extensions not authored here — on any machine running [pi](https://pi.dev). Same tag, any machine,
any day → the same `packages` list.

## Prerequisites (target machine)

- pi is already installed (this deployment converges the extension stack; it does not install or
  upgrade pi itself).
- Network access to the npm registry and to GitHub (the monorepo is fetched over
  `ssh://git@ssh.github.com:443/…`; if your network blocks that, point `apply.sh`'s target pi at
  an equivalent fetch method for the same repository).
- Write access to the repository is only needed if you are *releasing* a new stack version
  (commit + tag + push). Installing or refreshing is read-only.

## Contents

| Path | What it is |
|---|---|
| [`pi-usage/`](pi-usage/) | `@assid2/pi-usage` — per-account provider quota/balance/spend (footer + `/usage` dialog) and per-agent token usage (TypeScript source, loaded directly) |
| [`pi-dynamic-workflows/`](pi-dynamic-workflows/) | Patched fork of `@quintinshaw/pi-dynamic-workflows` (per-agent + aggregate tok/s), merged with upstream v3.10.1. Its compiled entrypoint `dist/pi-extension.js` is **committed here** (it is gitignored upstream) so a fresh install loads frozen bytes; rebuild with `npm run build` after source changes |
| [`deployment.json`](deployment.json) | The stack manifest: the repository's self-pin plus exact pins for every third-party package. Portable — no local paths |
| [`deploy/apply.sh`](deploy/apply.sh) | Idempotent converger: brings any pi install in line with `deployment.json` (`--dry-run`, `--check` for CI, `--prune` for an exact mirror) |
| [`deploy/skills/deploy-pi-stack/`](deploy/skills/deploy-pi-stack/) | The skill that lets you *ask your pi* to run the deployment (`SKILL.md` + `reference.md`) |

## Installing the stack

### Easiest — ask your pi

Paste this into any pi session:

```
Install ssh://git@ssh.github.com:443/assid2/pi-extensions.git at its latest release tag,
then read the installed package's deploy/skills/deploy-pi-stack/SKILL.md and follow it
exactly — it shows you the plan before changing anything.
```

The prompt is deliberately this small: it only bootstraps. The whole procedure (resolving the
latest tag, dry-run first, additive apply, never prune, relay the output) lives in the repo
itself — `deploy/skills/deploy-pi-stack/SKILL.md` + `reference.md` — and ships with every
release, so the prompt and the procedure can never drift apart. After that one install the
skill is part of the machine, and from then on a plain **“deploy my pi stack”** or **“bring
my pi up to the current deployment”** is all that's needed.

### Manual, equivalent

```bash
# <latest-tag> — resolved with the command in "Bringing a machine up to the current deployment"
pi install ssh://git@ssh.github.com:443/assid2/pi-extensions.git@<latest-tag>
$PI_CODING_AGENT_DIR/git/ssh.github.com/assid2/pi-extensions/deploy/apply.sh
# (default agent dir: ~/.pi/agent)
```

### What it does — and what it never does

- **Additive by default:** installs anything from the manifest that's missing; moves entries to
  the pinned ref/version when they differ. Anything you already have that is not in the manifest
  is **left alone** and reported as drift.
- **`apply.sh --prune`** additionally removes non-manifest packages → an *exact mirror* of the
  stack. Use only when you deliberately want your stack replaced.
- **`apply.sh --dry-run`** prints the per-entry plan and changes nothing; **`apply.sh --check`**
  exits non-zero when the machine is not converged (CI-friendly).
- It converges only through pi's own CLI (`pi install` / `pi remove`), touches only the
  `packages` key, and never opens, rewrites, or reorders `auth.json`, model/provider config,
  `AGENTS.md`, or any other file.
- **Security:** pi packages run with full system access. Only install stacks you trust.

## Bringing a machine up to the current deployment

The monorepo entry pins *itself* (frozen), so a machine bootstrapped at `vX` stays at `vX` until
you explicitly update it. The update is a **two-step, always-pinned** flow (never install an
unpinned "latest"):

1. Resolve the highest release tag at run time:

   ```bash
   git ls-remote --tags ssh://git@ssh.github.com:443/assid2/pi-extensions.git \
     | awk -F'\t' '$2 ~ /^refs\/tags\/v[0-9]/ { t = $2; sub(/^refs\/tags\//, "", t); sub(/\^\{\}$/, "", t); print t }' \
     | sort -uV | tail -1
   ```

2. `pi install ssh://git@ssh.github.com:443/assid2/pi-extensions.git@<new-tag>` — moves the
   existing clone to the new ref and rewrites the pinned settings entry.
3. Run `deploy/apply.sh` **from the updated clone**, so the new `deployment.json` governs.

The `deploy-pi-stack` skill performs exactly these steps when you ask your pi.

On the development checkout itself, updating is just `git pull` (+ `npm ci && npm run build`
inside `pi-dynamic-workflows/`, since its entrypoint is compiled) and `/reload` in pi.

## The stack (v1.0.0)

| Extension | Source | Pin |
|---|---|---|
| pi-usage + pi-dynamic-workflows (this repo) | `ssh://git@ssh.github.com:443/assid2/pi-extensions.git` | `v1.0.0` |
| pi-subagents | `npm:@tintinweb/pi-subagents` | `0.19.0` |
| pi-ollama-cloud | `npm:pi-ollama-cloud` | `0.9.0` |
| pi-tps | `npm:@monotykamary/pi-tps` | `1.3.9` |
| superpowers | `git:github.com/obra/superpowers` | `v6.3.0` |

## Development

- Each sub-project is a complete project with its own full git history
  (`pi-dynamic-workflows` is a `git subtree` over the upstream project's history).
- **Live development:** the dev machine's `~/.pi/agent/settings.json` points `packages` entries at
  the sub-project directories (local paths). Pi loads each sub-project's *own* `pi` manifest from
  the live checkout — no copies, hot-reloadable with `/reload`. `apply.sh` detects this and never
  installs a second (cloned) copy on the same machine (dev-checkout dedup rule).
- **After pulling:** `pi-usage` needs nothing (pure TS). `pi-dynamic-workflows` compiles its
  entrypoint: `npm ci && npm run build` in its directory (the compiled `dist/` is what its own
  manifest declares).
- **Upstream tracking for `pi-dynamic-workflows`** — add the remote once per checkout
  (remote config is local, not pushed):

  ```bash
  git remote add upstream ssh://git@ssh.github.com:443/QuintinShaw/pi-dynamic-workflows.git
  git config remote.upstream.fetch "+refs/heads/main:refs/remotes/upstream/main"  # branch only —
                                                                                 # keeps upstream's npm release tags out of this repo's tag namespace
  git subtree pull --prefix=pi-dynamic-workflows upstream main     # absorb upstream
  git subtree split --prefix=pi-dynamic-workflows -b <branch>      # extract for an upstream PR
  ```

  Keep the sub-project's `package.json` name matching upstream (`@quintinshaw/…`) so pulls stay
  conflict-free.
- **Working from another machine:** clone this repo (write access via your own SSH key or a
  token), bring that machine's pi up to date (the Installing flow above, or just `apply.sh`), then
  point its `packages` entries at the subdirectories of *your own* clone for live development.
  Commit, push, and cut release tags from there — every other machine converges by re-running
  `apply.sh`. Don't develop inside pi's managed clone (`$PI_CODING_AGENT_DIR/git/…`): pi resets
  it on each update.

## Releasing a new deployment

1. Commit the stack changes. In the release commit, `deployment.json`'s `version` field and its
   monorepo ref pin are the *same new tag* (apply.sh enforces this as a check, not prose).
2. If workflows sources changed: `npm ci && npm run build` in `pi-dynamic-workflows/` and
   re-commit the rebuilt `dist/`.
3. `git tag v1.x.0 && git push origin main v1.x.0`
4. Machines converge by re-running `deploy/apply.sh` — or just asking their pi.
