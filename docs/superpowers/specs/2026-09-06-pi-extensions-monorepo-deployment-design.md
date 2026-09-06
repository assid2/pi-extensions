# Design: `assid2/pi-extensions` monorepo + full-stack deployment

- **Date:** 2026-09-06
- **Status:** Approved in chat (2026-09-06), pending user review of this document
- **Owner:** satish

## 1. Purpose

Two goals, in order:

1. **Repo migration.** Two pi-extension projects currently kept as standalone checkouts under
   `~/pi-dev/` become sub-projects of the (currently empty) GitHub repository
   `assid2/pi-extensions`, accessed via **SSH over port 443**
   (`ssh://git@ssh.github.com:443/assid2/pi-extensions.git`). The single local working tree is
   `~/pi-dev/pi-extensions/`.
2. **Full-stack deployment.** A reproducible "extension stack" that anyone can ask their own pi to
   install, such that the result is *exactly* the extension set satish currently runs — including
   extensions not authored by satish (installed from their original third-party sources). A fresh
   machine can be brought up to the current deployment; optionally it can be made to *mirror* it
   exactly.

The deployment **never installs or upgrades the pi binary itself** — the target machine is assumed
to already run pi. It converges only the `packages` list in the user's pi settings.

## 2. Current state (verified inventory)

`~/.pi/agent/settings.json` → `packages`:

| Spec in settings | Installed version/ref | Author |
|---|---|---|
| `npm:@tintinweb/pi-subagents` | 0.19.0 | third-party |
| `npm:pi-ollama-cloud` | 0.9.0 | third-party |
| `npm:@monotykamary/pi-tps` | 1.3.9 | third-party |
| `git:github.com/obra/superpowers` | v6.3.0 (commit `b36e082`) | third-party |
| `../../../../srv/web/pi-usage` | **path does not exist** | satish |
| `../../../../srv/web/pi-dynamic-workflows` | **path does not exist** | satish (fork) |

> **Bug this work fixes:** the two local-path entries resolve to `/srv/web/pi-usage` and
> `/srv/web/pi-dynamic-workflows`, which do not exist (`/srv/web` contains only `io`,
> `ionjewels`, `tickets`). Satish's own two extensions are therefore **not loaded at all** right now.
> The `~/pi-dev/*` copies are orphans of those dead paths.

Project facts:

- **`pi-usage`** — `@assid2/pi-usage` v0.1.0. No git remote configured. 2 commits (release +
  rounding fix). Zero runtime dependencies. `pi` manifest: `extensions` only. Tests: 95/95 passing,
  typecheck clean.
- **`pi-dynamic-workflows`** — `@quintinshaw/pi-dynamic-workflows` v3.10.0, a fork of
  `QuintinShaw/pi-dynamic-workflows`. **5 local commits ahead of origin** (per-agent/aggregate
  tok/s in the task panel and `/workflows` navigator, plus the shared `token-rate.ts` sampler).
  Runtime dependency: `acorn ^8.16.0`. `pi` manifest: `extensions` + 2 skills
  (`workflow-authoring`, `workflow-patterns`) + gallery image.
- Environment: git 2.47.3 with `git subtree` available; `assid2/pi-extensions` exists and is
  **empty**; `PI_CODING_AGENT_DIR` can override pi's config dir (default `~/.pi/agent`) for
  isolated testing.

## 3. Target repository layout

```
~/pi-dev/pi-extensions/                  ← single checkout of assid2/pi-extensions (branch: main)
├── package.json                        ← ROOT pi-package manifest (what fresh machines load)
├── README.md                           ← bootstrap one-liner + "ask your pi" instructions
├── deployment.json                     ← the full-stack manifest: pinned specs, portable
├── deploy/
│   ├── apply.sh                        ← idempotent converger for any pi install
│   └── skills/deploy-pi-stack/SKILL.md ← the ask-pi skill (shipped via the root manifest)
├── docs/superpowers/specs/             ← this design document
├── pi-usage/                           ← full history; keeps @assid2/pi-usage identity
└── pi-dynamic-workflows/               ← full history + `upstream` remote; keeps @quintinshaw name
```

**Root `package.json`** (makes the monorepo itself an installable pi package):

- `name: "pi-extensions"`, `private: true`, `keywords: ["pi-package"]`
- `dependencies`: `{ "acorn": "^8.16.0" }` — the only runtime dep across both sub-projects
  (pi-usage has none)
- `peerDependencies`: `"*"` for the pi core packages (`@earendil-works/pi-coding-agent`, `pi-tui`,
  `typebox`) — per pi packaging rules these are provided by pi and must not be bundled
- `pi` manifest lists, by path: `pi-usage/extensions`, `pi-dynamic-workflows/extensions`,
  `pi-dynamic-workflows/skills` (both workflow skills), `deploy/skills` (the deploy skill)

**Nested `package.json`s are not modified** (no rebrand, no manifest edits). The two sub-projects
stay byte-identical to their current projects except for their location in the tree.

**Dual install modes from one codebase:**

- **Dev machine (satish):** `settings.json` `packages` entries are *local paths* into the checkout
  (e.g. `/home/satish/pi-dev/pi-extensions/pi-usage`). Pi reads each subdirectory's **own** `pi`
  key → live development, hot-reloadable, no copies.
- **Fresh machine:** one `pi install` of the monorepo git package; pi clones it, runs `npm install`
  at the root, and loads everything via the **root** `pi` manifest.

No npm publishing is required for either mode. (Publishing the patched workflows fork remains a
separate, future decision; keeping the `@quintinshaw` name avoids recurring package-name conflicts
on upstream pulls.)

**Upstream tracking for `pi-dynamic-workflows`** (verified workflow, `git subtree`):

| Need | Command (in the monorepo) |
|---|---|
| Absorb upstream updates | `git subtree pull --prefix=pi-dynamic-workflows upstream main` |
| Send our patches upstream | `git subtree split --prefix=pi-dynamic-workflows -b <pr-branch>` → push to a fork → PR |

`upstream` remote = `ssh://git@ssh.github.com:443/QuintinShaw/pi-dynamic-workflows.git`.
Clean upstream-only changes merge automatically; overlapping edits produce ordinary conflict
markers inside `pi-dynamic-workflows/`.

## 4. Migration procedure (this machine)

1. Clone the empty monorepo → `~/pi-dev/pi-extensions` (done; branch `main`).
2. **Initial commit** before any `subtree add` (verified gotcha: `subtree add` requires a
   non-empty repository): this spec document + a placeholder README.
3. `git subtree add --prefix=pi-usage ~/pi-dev/pi-usage main` (2 commits, full history).
4. `git subtree add --prefix=pi-dynamic-workflows ~/pi-dev/pi-dynamic-workflows main`
   (full upstream history + the 5 local commits).
5. Add the `upstream` remote (Section 3).
6. Create the root `package.json`, `deployment.json`, and `deploy/` contents per Sections 3–5.
7. Update `~/.pi/agent/settings.json`:
   - replace the two dead `../../../../srv/web/…` entries with absolute paths
     `/home/satish/pi-dev/pi-extensions/pi-usage` and
     `/home/satish/pi-dev/pi-extensions/pi-dynamic-workflows`;
   - pin the four third-party entries to their currently installed versions, so the dev machine
     matches `deployment.json` exactly and `apply.sh --dry-run` reports zero changes:
     `npm:@tintinweb/pi-subagents@0.19.0`, `npm:pi-ollama-cloud@0.9.0`,
     `npm:@monotykamary/pi-tps@1.3.9`, `git:github.com/obra/superpowers@v6.3.0`. Consequence (by
     design): `pi update --extensions` no longer moves unpinned third-party packages; updates are
     deliberate pin bumps, which is the reproducibility the deployment exists to provide.
8. Verify both extensions load (`/reload`, then check the loaded extensions / run a subagent or
   `/usage`), **then** remove the old standalone dirs `~/pi-dev/pi-usage` and
   `~/pi-dev/pi-dynamic-workflows` (backed up to a tarball outside the tree first).
9. Push `main` to origin and create tag **`v1.0.0`** — the first deployment release.

## 5. The full-stack deployment

### 5.1 `deployment.json` — the single source of truth

Portable (no local paths), every entry pinned exactly:

```json
{
  "version": "v1.0.0",
  "packages": [
    "ssh://git@ssh.github.com:443/assid2/pi-extensions.git@v1.0.0",
    "npm:@tintinweb/pi-subagents@0.19.0",
    "npm:pi-ollama-cloud@0.9.0",
    "npm:@monotykamary/pi-tps@1.3.9",
    "git:github.com/obra/superpowers@v6.3.0"
  ]
}
```

The first entry is the monorepo itself — one pinned ref covers both of satish's extensions *and*
the deployment machinery (including this file, the apply script, and the skill), so a fresh
install always gets a self-consistent stack.

**Release rule:** the `version` field must equal the monorepo ref it pins. Cutting a new deployment
release = commit changes, update `version` + the monorepo ref in `deployment.json` together, tag
that commit (e.g. `v1.1.0`), push.

### 5.2 `deploy/apply.sh` — idempotent convergence

Reads `deployment.json` from its own checkout (self-locating via its own path), compares against
the `packages` list in the target pi's user settings, and converges using **pi's own CLI**
(`pi install` / `pi remove`) so it can never corrupt settings:

| Manifest entry vs. target settings | Action (default mode) |
|---|---|
| absent | `pi install <spec>` |
| present, identical spec | no-op |
| present, different ref/version | `pi install <spec>` — moves the existing package to the pinned ref (documented pi behavior: settings updated, clone reset to ref, `npm install` re-run) |
| in settings but **not** in manifest | **reported as drift only — never removed by default** |
| in settings but not in manifest, with `--prune` | `pi remove <spec>` — exact-mirror mode, opt-in only |

Flags:

- `--dry-run` — print the plan (per-entry status table) and change nothing
- `--prune` — additionally remove non-manifest packages (replace mode)
- `PI_CODING_AGENT_DIR` is respected automatically (it is pi's own override), which is how the
  fresh-install verification runs against a scratch config dir

**Dedup rule (dev-machine safety):** if the target settings contain a *local-path* entry whose
resolved git origin (identity of the repository, ignoring URL scheme/host variants) matches the
monorepo spec, the monorepo entry counts as **satisfied** — the script skips installing the git
package so satish's live checkout and a cloned copy are never loaded simultaneously.

Hard constraints:

- Never touches `auth.json`, `models.json`, `models-store.json`, `AGENTS.md`, or any settings key
  other than `packages`.
- Sequential installs, one entry at a time; any failure stops the run with a non-zero exit and a
  per-entry status report (the calling agent relays this verbatim).

### 5.3 The ask-pi skill: `deploy-pi-stack`

Shipped via the root `pi` manifest, so any machine that has installed the monorepo can use it.
Behavior it instructs the agent to perform:

1. Determine whether the monorepo package is installed (via `pi list`); if not, resolve the latest
   release tag with `git ls-remote --tags ssh://git@ssh.github.com:443/assid2/pi-extensions.git`
   (highest semver) and bootstrap with `pi install ssh://git@ssh.github.com:443/assid2/pi-extensions.git@<latest-tag>`.
   The tag is resolved at run time, so the static skill file never goes stale between releases.
2. Run the installed `deploy/apply.sh --dry-run` and show the resulting plan.
3. **Default: additive** — apply without `--prune` (installs/aligns the manifest; leaves
   anything the user already has untouched, reporting it as drift).
4. Use `--prune` **only when the user explicitly asks for an exact mirror** (phrasings like
   "exactly", "mirror", "replace my stack"). Never prune implicitly.

**First-time bootstrap on a brand-new machine** (no skill present yet) is one sentence, documented
in README and inside the skill: *install the pi package
`ssh://git@ssh.github.com:443/assid2/pi-extensions.git@<tag>` and run its
`deploy/apply.sh`*. After that single step the skill is present and every later deployment is a
plain phrase ("deploy my pi stack" / "bring my pi up to the current deployment").

### 5.4 Bringing a machine up to the current deployment

Two flavors, both documented in README + skill:

- **Fresh/other machines:** the manifest's monorepo ref is bumped to the new release tag (in the
  repo), and `apply.sh` re-run — pi moves the existing clone to the new pinned ref.
- **Satish's dev machine:** the checkout *is* the source; `git pull` in
  `~/pi-dev/pi-extensions` + `/reload` is the whole update.

## 6. Verification

All must pass before tagging `v1.0.0` and pushing:

1. **Sub-project health, from the monorepo paths:** `pi-usage` — typecheck + 95/95 tests;
   `pi-dynamic-workflows` — its full `npm test` (Biome + tsc + unit tests + release checks).
2. **Drift-free on this machine:** `deploy/apply.sh --dry-run` reports all 5 manifest entries
   satisfied (3 npm pins + superpowers v6.3.0 + monorepo via the local-path dedup rule), zero
   planned changes, exit 0.
3. **Fresh-install proof in a scratch environment:** with
   `PI_CODING_AGENT_DIR=$(mktemp -d)` run `apply.sh` end-to-end (no `--prune`); confirm the
   scratch settings.json ends with exactly the 5 pinned entries, the git package is cloned, and
   `pi list` shows the five packages. Structural checks on the clone: root `pi` manifest lists all
   four extension/skill paths and every listed path exists; the deploy skill's `SKILL.md` is among
   them; `npm install` at the clone root succeeded (root `node_modules/acorn` present). Re-run
   `apply.sh` → must be a no-op (idempotence).
4. **Live machine:** after the `settings.json` rewrite, `/reload` in a pi session; both
   extensions demonstrably active (e.g. `/usage` command present, workflow tool present); the two
   old standalone dirs removed only after this succeeds.
5. **Upstream mechanics:** `git subtree pull` against the real `upstream` remote completes clean
   (no upstream movement since the fork point is expected; any movement is merged); `git subtree
   split` of `pi-dynamic-workflows` produces a branch whose tree matches the pre-migration fork
   HEAD.

## 7. Out of scope (future extensions of the manifest, if ever wanted)

- Convergence of non-package pi configuration: `AGENTS.md` global instructions, models/settings
  keys, themes, prompt templates. `deployment.json`'s schema leaves room for extra sections, but
  v1 is packages-only.
- Rebranding/publishing the patched workflows fork to npm (`@assid2/…`).
- Installing or upgrading the pi CLI itself on target machines.
- Project-local (`.pi/settings.json`) deployments — v1 targets user-level (`~/.pi/agent`) only.
