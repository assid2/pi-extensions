# pi-extensions

Monorepo of pi extensions with a **reproducible full-stack deployment**: one install gives you
exactly the extension stack defined in [`deployment.json`](deployment.json) — including
extensions not authored here — on any machine running [pi](https://pi.dev).

## Contents

| Path | What it is |
|---|---|
| [`pi-usage/`](pi-usage/) | `@assid2/pi-usage` — per-account provider quota/balance/spend (footer + `/usage` dialog) and per-agent token usage |
| [`pi-dynamic-workflows/`](pi-dynamic-workflows/) | Fork of `@quintinshaw/pi-dynamic-workflows` — Claude-Code-style dynamic workflows for pi (per-agent + aggregate tok/s); tracks upstream, patches on top |
| [`deployment.json`](deployment.json) | The stack manifest: exact pinned specs for every extension in the stack |
| [`deploy/apply.sh`](deploy/apply.sh) | Idempotent converger: brings any pi install in line with `deployment.json` |
| [`deploy/skills/deploy-pi-stack/`](deploy/skills/deploy-pi-stack/) | The skill that lets you *ask your pi* to run the deployment |

## Installing the stack

**Prerequisite:** pi is already installed on the target machine (this deployment converges the
extension stack; it does not install or upgrade pi itself).

### Easiest — ask your pi

> Install `ssh://git@ssh.github.com:443/assid2/pi-extensions.git` at its latest release tag,
> then run its `deploy/apply.sh`.

That one install drops the `deploy-pi-stack` skill into place, and from then on a plain
**“deploy my pi stack”** or **“bring my pi up to the current deployment”** is all that's needed:
the skill resolves the latest release tag itself, runs `apply.sh --dry-run` first, shows the plan,
then applies it.

### Manual, equivalent

```bash
# <latest-tag> from the repo's tags page (e.g. v1.0.0)
pi install ssh://git@ssh.github.com:443/assid2/pi-extensions.git@<latest-tag>
~/.pi/agent/git/ssh.github.com/assid2/pi-extensions/deploy/apply.sh
```

### What it does — and what it never does

- **Additive by default:** installs anything from the manifest that's missing; moves entries to
  the pinned ref/version when they differ. Anything you already have that is *not* in the manifest
  is **left alone** and merely reported as drift.
- **`apply.sh --prune`** additionally removes non-manifest packages → an *exact mirror* of the
  stack. Use only when you deliberately want your stack replaced.
- **`apply.sh --dry-run`** prints the plan and changes nothing.
- It never touches `auth.json`, model/provider config, or any settings key other than the
  `packages` list — all changes go through pi's own `pi install` / `pi remove`.
- **Security:** pi packages run with full system permissions. Only install stacks you trust.

## Updating to the current deployment

- **Machine with the monorepo installed as a git package:** the repo cuts a new release tag;
  re-running `deploy/apply.sh` moves the existing clone to the new ref (pi re-runs `npm install`
  automatically).
- **The development checkout (maintainer's machine):** the checkout *is* the source — `git pull`
  in this directory, then `/reload` in pi.

## The stack (v1.0.0)

| Extension | Source | Pin |
|---|---|---|
| pi-usage + pi-dynamic-workflows (this repo) | `ssh://git@ssh.github.com:443/assid2/pi-extensions.git` | `v1.0.0` |
| pi-subagents | `npm:@tintinweb/pi-subagents` | `0.19.0` |
| pi-ollama-cloud | `npm:pi-ollama-cloud` | `0.9.0` |
| pi-tps | `npm:@monotykamary/pi-tps` | `1.3.9` |
| superpowers | `git:github.com/obra/superpowers` | `v6.3.0` |

## Development

- Each sub-project is a complete project; history is preserved (`pi-dynamic-workflows` is a
  `git subtree` over the upstream project's full history).
- **Live development:** point a `~/.pi/agent/settings.json` `packages` entry at a local path
  (e.g. `/abs/path/to/this/repo/pi-usage`) and pi loads that sub-project's own `pi` manifest from
  your live checkout — no copies, hot-reloadable with `/reload`.
- **Upstream tracking for `pi-dynamic-workflows`** (`upstream` remote →
  `ssh://git@ssh.github.com:443/QuintinShaw/pi-dynamic-workflows.git`):
  - Absorb upstream changes: `git subtree pull --prefix=pi-dynamic-workflows upstream main`
  - Send patches upstream: `git subtree split --prefix=pi-dynamic-workflows -b <branch>`,
    push that branch to a fork, open the PR.
  - Keep the sub-project's `package.json` name matching upstream (`@quintinshaw/…`) so pulls
    don't conflict on the name line.
- **Working from another machine:** clone this repo (write access via your own SSH key or a
  token), bring that machine's pi up to date (the Installing flow above, or just `apply.sh`),
  then point `~/.pi/agent/settings.json` `packages` entries at the subdirectories of *your own*
  clone for live development. Commit, push, and cut release tags from there — every other machine
  converges by re-running `apply.sh`. Don't develop inside pi's managed clone
  (`~/.pi/agent/git/…`): pi resets it on each update.

## Releasing a new deployment

1. Commit the stack changes — bump `version` **and** the monorepo ref in `deployment.json`
   together (they must agree).
2. `git tag v1.x.0 && git push origin main v1.x.0`
3. Machines converge by re-running `deploy/apply.sh` — or just asking their pi.
