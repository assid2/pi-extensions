---
name: deploy-pi-stack
description: Deploys or updates the shared pi extension stack (the assid2/pi-extensions full-stack deployment) on this machine. Use when the user asks to "deploy my pi stack", "bring my pi up to the current deployment", "update my extensions", or to install the shared pi extension set.
---

# Deploy the pi extension stack

Converge this machine's pi to the extension stack declared by the `assid2/pi-extensions`
repository. **Additive by default**: packages the user already has that are not in the stack are
left alone and reported as drift. An exact mirror (removing them) happens **only** on explicit
request.

## Procedure

1. **Locate the deployment package.** Run `pi list` and look for the `assid2/pi-extensions`
   entry. Its clone lives at `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/git/ssh.github.com/assid2/pi-extensions`.

2. **Resolve the latest release at run time** (never hardcode a version — this file must not go
   stale between releases):

   ```bash
   git ls-remote --tags ssh://git@ssh.github.com:443/assid2/pi-extensions.git \
     | sed -n 's#refs/tags/\(v[0-9][0-9.]*\)\^{}$#\1#p' | sort -uV | tail -1
   ```

3. **Bootstrap or update (two-step, always pinned — never install an unpinned spec):**
   - Package absent → `pi install ssh://git@ssh.github.com:443/assid2/pi-extensions.git@<tag>`
   - Package present at a ref older than `<tag>` → same command; it moves the existing clone to
     the new ref and rewrites the pinned entry in settings.
   - If `pi install` fails, **stop**: relay the error and do not continue.

4. **Show the plan first — always, before any change.** Run

   ```bash
   <clone>/deploy/apply.sh --dry-run
   ```

   from the **updated** clone (step 3's result) and show its full output to the user verbatim.

5. **Apply.**
   - Default: `<clone>/deploy/apply.sh` (additive).
   - Only if the user explicitly asks for an exact mirror ("exactly", "mirror", "replace my
     stack"): `<clone>/deploy/apply.sh --prune`.
   - Never prune implicitly. Never apply without having printed the step-4 plan first.

6. **Report.** Relay `apply.sh`'s full output and exit status verbatim — do not summarise it away.
   `Post-condition: PASS` with exit 0 means the machine now runs exactly the declared stack (plus
   any reported drift). On any non-zero exit: show the per-entry status table and ask the user how
   to proceed.

See `reference.md` (this directory) for the reproducibility contract, what the stack contains, and
troubleshooting.
