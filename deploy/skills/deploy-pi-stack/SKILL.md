---
name: deploy-pi-stack
description: Deploys or updates the shared pi extension stack (the assid2/pi-extensions full-stack deployment) on this machine. Use when the user asks to "deploy my pi stack", "bring my pi up to the current deployment", "update my extensions", "update my assid2/pi-extensions", "update the pi-extension stack", "converge my pi stack", or to install the shared pi extension set.
---

# Deploy the pi extension stack

Converge this machine's pi to the extension stack declared by the `assid2/pi-extensions`
repository. **Additive by default**: packages the user already has that are not in the stack are
left alone and reported as drift. An exact mirror (removing them) happens **only** on explicit
request.

## Procedure

1. **Locate the deployment package.** Run `pi list` and find the `assid2/pi-extensions` entry;
   use the path it prints. A git install lives at
   `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/git/<host>/assid2/pi-extensions`, where `<host>` is the
   literal host of the source URL (`ssh.github.com` for the SSH self-entry, `github.com` for an
   `https://github.com/...` origin). Do **not** assume the host — resolve the clone from `pi list`
   (or `git -C <candidate> remote get-url origin`).

2. **Fresh machine (no `assid2/pi-extensions` entry) — model-free bootstrap.** Use
   `deploy/bootstrap.sh`. It is plain shell: it resolves the newest release tag with
   `git ls-remote`, `pi install`s the monorepo at it, locates the clone via `pi list`, and runs
   the clone's `deploy/apply.sh` and `deploy/host-setup.sh`. No model or provider is needed, so
   it also works on a pi that has not been set up yet. From a clone:

   ```bash
   deploy/bootstrap.sh
   ```

   or on a bare machine straight from GitHub:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/assid2/pi-extensions/main/deploy/bootstrap.sh | bash
   ```

   `PI_EXTENSIONS_SELF_URL` overrides the install URL/scheme and
   `PI_EXTENSIONS_SKIP_HOST_SETUP=1` skips the host stage. Relay its full output; then continue
   at step 7.

3. **Existing install — float the repository to the newest release.** `apply.sh` floats the
   self-entry itself: it resolves the newest `v*` tag with `git ls-remote` (model-free), moves the
   self clone to it — reusing the URL/scheme already installed, so an https machine stays https —
   and re-execs itself once from the updated clone so the new `deployment.json` converges in the
   same run. No manual `pi install` is normally needed. `PI_EXTENSIONS_LATEST_TAG=<tag>` overrides
   the resolved tag (offline/CI/tests) and `PI_EXTENSIONS_NO_REEXEC=1` suppresses the re-exec.

   **Manual install path** (only when `apply.sh` cannot resolve the tag or the user must install
   by hand): resolve the newest tag yourself —

   ```bash
   git ls-remote --tags ssh://git@ssh.github.com:443/assid2/pi-extensions.git \
     | awk -F'\t' '$2 ~ /^refs\/tags\/v[0-9]/ { t = $2; sub(/^refs\/tags\//, "", t); sub(/\^\{\}$/, "", t); print t }' \
     | sort -uV | tail -1
   ```

   then `pi install <existing-url>@<tag>`, reusing the URL/scheme step 1 found (`pi list` /
   `git -C <clone> remote get-url origin`) — **not** the manifest's SSH default. Installing the
   SSH URL while an HTTPS entry exists fetches a second clone under `git/ssh.github.com/`. On a
   first manual install use `ssh://git@ssh.github.com:443/assid2/pi-extensions.git` (or
   `${PI_EXTENSIONS_SELF_URL}`). If `pi install` fails, **stop** and relay the error.

   Verify the clone is actually at the newest tag: a settings entry can read `@<tag>` while the
   clone is a commit or more *past* it (for example `v1.0.2-1-g39ed164`); `apply.sh` compares
   settings identities, not working-tree content, so it cannot see that drift.
   ```bash
   git -C <clone> fetch --tags --quiet
   [ "$(git -C <clone> describe --tags --exact-match HEAD 2>/dev/null)" = "<tag>" ] \
     || echo "WARNING: <clone> is not exactly at <tag>; re-clone/reset it before applying"
   ```
   If it is not exact, re-clone or hard-reset the clone to `<tag>` and tell the user.

   > `pi-commandcode-cloud` and `pi-ollama-cloud` are provided by this repository itself
   > (declared in the root `package.json` `pi.extensions`), so the repo update in this step is
   > what installs them. They are not separate manifest packages.
   >
   > Every entry in `deployment.json` is unversioned — the self-entry floats to the newest release
   > tag and third-party entries float to their latest release on every apply (see
   > `reference.md`).

4. **Show the plan first — always, before any change.** Run

   ```bash
   <clone>/deploy/apply.sh --dry-run
   ```

   from the **updated** clone (step 3's result) and show its full output to the user verbatim.

5. **Apply.** `apply.sh` installs/moves the declared entries, refreshes every unpinned
   third-party entry to its latest release (`pi update`), and removes entries the manifest
   explicitly retires — so a run is expected to touch the network and may print `LATEST` /
   `UNPIN` / `INSTALL-LATEST` / `RETIRE` actions. `RETIRE` covers four cases:
   - a package the manifest lists under `retired` (for example `npm:pi-ollama-cloud`, now vendored
     into this repository);
   - a hand-added local-path entry that points at a *different* checkout of this repository;
   - a duplicate git self-entry (for example an SSH entry left beside an HTTPS one);
   - a local-path copy of a managed npm package (for example a global `remote-pi` beside
     `npm:remote-pi`).

   All would otherwise double-load the same extensions and are removed with `pi remove` even in
   additive mode: they are one-time migrations, not unrelated drift. Unrelated packages you
   installed yourself are still left alone.
   - Default: `<clone>/deploy/apply.sh` (additive).
   - Only if the user explicitly asks for an exact mirror ("exactly", "mirror", "replace my
     stack"): `<clone>/deploy/apply.sh --prune`.
   - Never prune implicitly. Never apply without having printed the step-4 plan first.

6. **Converge the host terminal (full 24-bit colour).** `apply.sh` cannot carry this — it is
   contract-bound to the `packages` key — so `deploy/host-setup.sh` owns it. Run
   `<clone>/deploy/host-setup.sh --dry-run`, show its output verbatim, then run
   `<clone>/deploy/host-setup.sh` and relay the result. It edits, in place and idempotently:
   - `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json` — merges `terminal.trueColor: true`;
   - the tmux config tmux reads (`~/.tmux.conf` or the XDG path) — `default-terminal "tmux-direct"`,
     `terminal-features[3] "*:RGB"`, `set-environment -g COLORTERM truecolor`;
   - `~/.bashrc` / `~/.zshrc` — extends the stock colour gate to accept `*-direct`;
   - the remote-pi footer relay glyph — remote-pi now arrives as the manifest's `npm:remote-pi`
     (official package, never forked); `deploy/lib/fix-remote-pi-glyph.sh` post-patches only its
     relay glyph (guarded against the emoji that renders grey on clients without a colour-emoji
     font).

   Every file it touches is backed up once as `<file>.pi-extensions.bak`; it never uses sudo, never
   writes `/etc`. Always tell the user that tmux fixes land on **new** sessions only
   (`default-terminal` and `COLORTERM` are read at pane creation) and that the `settings.json`
   override needs a **pi restart** — do **not** kill the tmux server or restart pi for them.
   Then run `<clone>/deploy/host-setup.sh --check` and relay its `Post-condition: PASS|FAIL` (the
   `LIVE` section below it is advisory — tmux server state only materialises in new panes).

7. **Report.** Relay `apply.sh`'s full output and exit status verbatim — do not summarise it away.
   `Post-condition: PASS` with exit 0 means the machine now runs exactly the declared stack — the
   repository at the newest release tag, every third-party package at the latest release available
   at that moment (plus any reported drift). On any non-zero exit: show the per-entry status table and ask the user how
   to proceed.

   Also tell the user: `pi-atelier` now owns pi's single custom footer/editor slot, and
   `pi-usage` contributes one sidebar panel for the **selected** provider+account to it. That panel
   starts **hidden** — enable it in `/atelier` → Settings → Display. The manifest **retires** `pi-status-footer`
   (the former competing footer owner), so it is removed on apply.

See `reference.md` (this directory) for the reproducibility contract, what the stack contains, and
troubleshooting.
