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
   literal host of the source URL (`ssh.github.com` for the SSH self-pin, `github.com` for an
   `https://github.com/...` origin). Do **not** assume the host — resolve the clone from `pi list`
   (or `git -C <candidate> remote get-url origin`).

2. **Resolve the latest release at run time** (never hardcode a version — this file must not go
   stale between releases):

   ```bash
   git ls-remote --tags ssh://git@ssh.github.com:443/assid2/pi-extensions.git \
     | awk -F'\t' '$2 ~ /^refs\/tags\/v[0-9]/ { t = $2; sub(/^refs\/tags\//, "", t); sub(/\^\{\}$/, "", t); print t }' \
     | sort -uV | tail -1
   ```

3. **Bootstrap or update the repository (two-step, always pinned — never install *this repo*
   unpinned):**
   - Package absent → `pi install ssh://git@ssh.github.com:443/assid2/pi-extensions.git@<tag>`
   - Package present at a ref older than `<tag>` → same command; it moves the existing clone to
     the new ref and rewrites the pinned entry in settings.
   - If `pi install` fails, **stop**: relay the error and do not continue.
   - **Verify the working tree is actually at `<tag>`.** A settings pin can read `@<tag>` while
     the clone is a commit or more *past* it (for example `v1.0.2-1-g39ed164`); `apply.sh`
     compares settings identities, not working-tree content, so it cannot see that drift:
     ```bash
     git -C <clone> fetch --tags --quiet
     [ "$(git -C <clone> describe --tags --exact-match HEAD 2>/dev/null)" = "<tag>" ] \
       || echo "WARNING: <clone> is not exactly at <tag>; re-clone/reset it before applying"
     ```
     If it is not exact, re-clone or hard-reset the clone to `<tag>` and tell the user.

   > `pi-commandcode-cloud` and `pi-ollama-cloud` are provided by this repository itself
   > (declared in the root `package.json` `pi.extensions`), so the repo update in this step is
   > what installs them. They are not separate manifest packages.

4. **Show the plan first — always, before any change.** Run

   ```bash
   <clone>/deploy/apply.sh --dry-run
   ```

   from the **updated** clone (step 3's result) and show its full output to the user verbatim.

5. **Apply.** `apply.sh` installs/moves the declared entries, refreshes every unpinned
   third-party entry to its latest release (`pi update`), and removes entries the manifest
   explicitly retires — so a run is expected to touch the network and may print `LATEST` /
   `UNPIN` / `INSTALL-LATEST` / `RETIRE` actions. `RETIRE` covers two cases:
   - a package the manifest lists under `retired` (for example `npm:pi-ollama-cloud`, now vendored
     into this repository);
   - a hand-added local-path entry that points at a *different* checkout of this repository (a
     duplicate copy that would otherwise double-load its extensions).

   Both are removed with `pi remove` even in additive mode: they are one-time migrations, not
   unrelated drift. Unrelated packages you installed yourself are still left alone.
   - Default: `<clone>/deploy/apply.sh` (additive).
   - Only if the user explicitly asks for an exact mirror ("exactly", "mirror", "replace my
     stack"): `<clone>/deploy/apply.sh --prune`.
   - Never prune implicitly. Never apply without having printed the step-4 plan first.

6. **Report.** Relay `apply.sh`'s full output and exit status verbatim — do not summarise it away.
   `Post-condition: PASS` with exit 0 means the machine now runs exactly the declared stack — the
   repository at its pinned tag, every third-party package at the latest release available at that
   moment (plus any reported drift). On any non-zero exit: show the per-entry status table and ask the user how
   to proceed.

See `reference.md` (this directory) for the reproducibility contract, what the stack contains, and
troubleshooting.
