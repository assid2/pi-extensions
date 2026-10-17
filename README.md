# pi-extensions

Monorepo of pi extensions with a **single-command full-stack deployment**: one install gives you
the extension stack declared in [`deployment.json`](deployment.json) — including extensions not
authored here — on any machine running [pi](https://pi.dev). The repository tracks its own newest
release tag (an unpinned self-entry that floats on every apply); **third-party packages are
likewise unpinned and always float to their latest release**.

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
| [`pi-ollama-cloud/`](pi-ollama-cloud/) | Patched fork of `pi-ollama-cloud` (upstream `fgrehm/pi-ollama-cloud`, MIT), merged with upstream v0.12.1. The patch makes the package prefix-aware: its status bar, `/ollama-cloud-usage`, and web tools follow **any** active `ollama-*` provider and use that member's own key (TypeScript source, loaded directly) |
| [`deployment.json`](deployment.json) | The stack manifest: an **unversioned** self-entry plus the third-party packages to install. Every entry is unversioned — `apply.sh` floats the self-entry to the newest release tag and third-party entries to their latest release on every apply. Portable — no local paths |
| [`deploy/apply.sh`](deploy/apply.sh) | Idempotent converger: brings any pi install in line with `deployment.json` (`--dry-run`, `--check` for CI, `--prune` for an exact mirror) |
| [`deploy/host-setup.sh`](deploy/host-setup.sh) | Host terminal converger: 24-bit colour for pi + tmux (`terminal.trueColor`, `tmux-direct`, `COLORTERM`, shell colour gate, remote-pi relay glyph) — in-place, idempotent, backed up, `--dry-run`/`--check`/`--revert` |
| [`pi-commandcode-cloud/`](pi-commandcode-cloud/) | `@assid2/pi-commandcode-cloud` — Command Code model provider (OpenAI/Anthropic-compatible) with `/login`, an opt-in usage footer, and a `pi-usage` adapter (TypeScript source, loaded directly) |
| [`deploy/skills/deploy-pi-stack/`](deploy/skills/deploy-pi-stack/) | The skill that lets you *ask your pi* to run the deployment (`SKILL.md` + `reference.md`) |

`pi-commandcode-cloud` registers the `commandcode-cloud` provider so you can run Command Code
(`commandcode.ai`) models in pi. Sign in with `/login commandcode-cloud` (API-key paste or browser
loopback), or set `COMMAND_CODE_API_KEY` (aliases `COMMANDCODE_API_KEY` / `CMD_API_KEY`). It ships
the four helper commands `/commandcode-usage`, `/commandcode-usage-status`, `/commandcode-status`,
and `/commandcode-refresh`, and an **opt-in** quota footer (`usageStatus`, default off). The same
data is exposed to `pi-usage` through the `commandcode-cloud` adapter id, gated to the active
provider. See [`pi-commandcode-cloud/README.md`](pi-commandcode-cloud/README.md).

## Installing the stack

### Model-free — one command, no provider configured

A brand-new pi has no provider or model configured yet, so it cannot be *asked* to install
anything. `deploy/bootstrap.sh` closes that catch-22: it is plain shell, resolves the newest
release tag, `pi install`s the monorepo at it, then runs the installed clone's own
`deploy/apply.sh` (and `deploy/host-setup.sh` — skip with `PI_EXTENSIONS_SKIP_HOST_SETUP=1`). No
model or provider is needed at any point. From a clone:

```bash
deploy/bootstrap.sh
```

or straight from GitHub on a bare machine:

```bash
curl -fsSL https://raw.githubusercontent.com/assid2/pi-extensions/main/deploy/bootstrap.sh | bash
```

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

- **Additive by default:** installs anything from the manifest that's missing; floats the
  repository's own self-entry to the **newest release tag** and every unpinned third-party entry
  to its **latest release** (`pi update`). It also removes entries the manifest explicitly
  **retires** (one-time migrations, e.g. `npm:pi-ollama-cloud` now that the fork is vendored
  here), hand-added local-path entries that point at a *different* checkout of this repository,
  duplicate git self-entries (an SSH copy left beside an HTTPS one), and local-path copies of a
  managed npm package (a global `remote-pi` beside `npm:remote-pi`). Anything else you already
  have that is not in the manifest is **left alone** and reported as drift.
- **`apply.sh --prune`** additionally removes non-manifest packages → an *exact mirror* of the
  stack. Use only when you deliberately want your stack replaced.
- **`apply.sh --dry-run`** prints the per-entry plan and changes nothing; **`apply.sh --check`**
  exits non-zero when the machine is not *structurally* converged (CI-friendly). It is
  offline-tolerant: if the newest release tag can't be resolved, a present self-entry is enough;
  if it is resolved, the self entry must be at that tag. It cannot see whether a newer upstream
  release exists for third-party entries, since latest moves.
- It converges only through pi's own CLI (`pi install` / `pi remove` / `pi update`), touches only the
  `packages` key, and never opens, rewrites, or reorders `auth.json`, model/provider config,
  `AGENTS.md`, or any other file.
- **Host terminal setup is a separate stage.** `deploy/host-setup.sh` — run by the deploy skill
  right after `apply.sh` — converges the 24-bit-colour pieces `apply.sh` cannot own: it merges
  `terminal.trueColor` into `settings.json`, sets `tmux-direct` + `*:RGB` + `COLORTERM` in the tmux
  config, extends the `~/.bashrc` / `~/.zshrc` colour gate to `*-direct`, and patches remote-pi's
  relay glyph. It edits in place, backs up each file once (`.pi-extensions.bak`), never uses sudo,
  and has its own `--dry-run` / `--check` / `--revert`. tmux changes land on a new session and the
  settings override needs a pi restart — it never kills the tmux server for you.
- **Security:** pi packages run with full system access. Only install stacks you trust.

## Bringing a machine up to the current deployment

One command does it:

```bash
<clone>/deploy/apply.sh
```

`apply.sh` resolves the newest `v*` release tag with `git ls-remote`, floats the self clone to it
(reusing the URL/scheme the machine already has, so an https install stays https; set
`PI_EXTENSIONS_SELF_URL` to override), then **re-execs itself once** from the updated clone so the
new `deployment.json` converges in the same invocation. It then refreshes every unpinned
third-party entry to its latest release. The `deploy-pi-stack` skill performs exactly this when
you ask your pi.

**Manual / offline fallback.** To inspect the tag or work offline, resolve it yourself and install
it — reusing the URL/scheme the machine already has (from `pi list`, or
`git -C <clone> remote get-url origin`); on a first install use
`ssh://git@ssh.github.com:443/assid2/pi-extensions.git`. This moves the existing clone to the new
ref. Do **not** install the manifest's SSH URL over an existing https entry — that fetches a
second clone under `git/ssh.github.com/`. Set `PI_EXTENSIONS_LATEST_TAG=<tag>` to override the
tag `apply.sh` resolves (offline/CI/tests).

```bash
# resolve the newest tag, then install the repository at it through its existing URL
TAG="$(git ls-remote --tags ssh://git@ssh.github.com:443/assid2/pi-extensions.git \
  | awk -F'\t' '$2 ~ /^refs\/tags\/v[0-9]/ { t = $2; sub(/^refs\/tags\//, "", t); sub(/\^\{\}$/, "", t); print t }' \
  | sort -uV | tail -1)"
pi install <existing-url>@"$TAG"   # e.g. the https URL from `pi list`
<clone>/deploy/apply.sh
```

On the development checkout itself, updating is just `git pull` (+ `npm ci && npm run build`
inside `pi-dynamic-workflows/`, since its entrypoint is compiled) and `/reload` in pi.

## The stack

| Extension | Source | Ref |
|---|---|---|
| pi-usage + pi-dynamic-workflows + pi-ollama-cloud + pi-commandcode-cloud (this repo) | `ssh://git@ssh.github.com:443/assid2/pi-extensions.git` | newest release tag (floating, auto-tracked) |
| pi-subagents | `npm:@tintinweb/pi-subagents` | latest |
| pi-tps | `npm:@monotykamary/pi-tps` | latest |
| pi-atelier | `npm:pi-atelier` | latest (footer/status-rail + sidebar host) |
| superpowers | `git:github.com/obra/superpowers` | latest |
| remote-pi | `npm:remote-pi` | latest (official npm package; only its relay footer glyph is post-patched by `deploy/host-setup.sh`) |

No versions are present in `deployment.json`: `apply.sh` resolves the newest release tag for the
repository itself and takes whatever npm or GitHub publishes as latest for every third-party
entry — both float on the next `apply.sh`. `npm:remote-pi` is the official npm package, installed
as-is (we do not fork it); only its relay footer glyph is post-patched by `deploy/host-setup.sh`.

### Footer and usage interop

Pi has exactly **one** custom footer slot (`setFooter`) and one editor slot
(`setEditorComponent`); the last extension to set them wins. `pi-atelier` is the single host for
both, and `pi-status-footer` — the former second footer owner that silently fought it — is
**retired** by the manifest and removed on apply, so the two never coexist. `pi-usage` does not
compete for the slot: it contributes one sidebar panel for the **selected** provider+account (the
active model's account, with lanes from that provider's adapter) to Atelier over the public
`pi-atelier:sidebar-panels` channel (no import, so it still works when Atelier is absent). There
are no per-account panels and no hard-coded names, so it scales to any provider or number of
accounts, and the stable panel id keeps a user's show/hide choice across model switches. New
panels start **hidden** — enable it in `/atelier` → Settings → Display. Its footer `setStatus`
line is the always-on fallback; Atelier renders contributed statuses without colour, but the
quota meters survive. Auto-tracked accounts (`ollama-*`, `commandcode-cloud`, `opencode-go`, …)
need no `usage.json`.

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

1. Commit the stack changes and bump `deployment.json`'s `version` field to the new release label.
   The monorepo self-entry stays **unversioned** — leave it as
   `ssh://git@ssh.github.com:443/assid2/pi-extensions.git` (the pre-commit hook enforces this).
2. If workflows sources changed: `npm ci && npm run build` in `pi-dynamic-workflows/` and
   re-commit the rebuilt `dist/`.
3. `git tag v1.x.0 && git push origin main v1.x.0` (the pre-push hook verifies the tag equals
   `deployment.json` `version`).
4. Machines converge by re-running `deploy/apply.sh` — or just asking their pi. A release bumps
   the manifest's `version` only; every entry stays unversioned.
