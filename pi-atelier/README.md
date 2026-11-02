# pi-atelier (generated)

This directory is a **build artifact** of `scripts/pi-atelier/update.sh`.
Do not edit it by hand.

- Source: `vendor/pi-atelier/` (pristine upstream snapshot)
- Changes: `patches/pi-atelier/*.patch` (none by default; applied in filename order)
- Output: `dist/index.js` — one ESM bundle; pi host modules are external, so no
  runtime `node_modules` is needed.

Rebuild after updating upstream:

```bash
scripts/pi-atelier/update.sh --sync   # fetch newest main, apply patches, rebuild
scripts/pi-atelier/update.sh --check  # verify the committed artifact is current
```

A patch that no longer applies stops the run and prints the rebase/regenerate
commands; the script never writes a half-patched build.
