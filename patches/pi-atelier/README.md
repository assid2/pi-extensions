# pi-atelier patches

Local changes to the vendored `pi-atelier` source live here as `*.patch`
files. `scripts/pi-atelier/update.sh` applies them in filename order to a
scratch copy of `vendor/pi-atelier/` before compiling.

There are **no patches** at present: `vendor/pi-atelier/` is pristine upstream
source (commit pinned in its `UPSTREAM` file), and `pi-atelier/` is the compiled
artifact of that source.

## Adding a patch

```bash
cp -a vendor/pi-atelier /tmp/work && cd /tmp/work
git init -q && git add -A && git commit -qm base

# edit extensions/ or src/
git add -A && git diff --cached -- extensions src > \
  "$REPO/patches/pi-atelier/0001-<name>.patch"   # REPO=/path/to/pi-extensions

# from the repo root
scripts/pi-atelier/update.sh
```

Name patches `NNNN-short-name.patch`; they apply in lexical order. A rejected
hunk stops the build and prints the rebase steps.

## Updating upstream

```bash
scripts/pi-atelier/update.sh --sync    # fetch main, vendor it, reapply, compile
scripts/pi-atelier/update.sh --check   # pre-push: artifact must be current
```

`--sync` refreshes `vendor/pi-atelier/` (source of truth, tracked in this
repository) and rewrites its `UPSTREAM` file with the new commit. Remote
installations then get both: the compiled `pi-atelier/dist/index.js` they load,
and the full vendored source under `vendor/pi-atelier/`.
