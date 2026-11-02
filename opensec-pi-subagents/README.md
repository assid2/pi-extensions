# opensec-pi-subagents (generated)

This directory is a **build artifact** of `scripts/opensec-subagents/update.sh`.
Do not edit it by hand.

- Source: `vendor/opensec-pi-subagents/` (pristine upstream snapshot)
- Change: `patches/opensec-pi-subagents/0001-tps.patch`
  (per-agent + aggregate output tokens/second in the Agents widget and the
  workflow card/inspector)
- Output: `dist-bun/index.js` — one ESM bundle; `croner`/`nanoid` embedded,
  pi host modules external, so no runtime `node_modules` is needed.
- Skills: `skills/workflow-authoring/` and `skills/workflow-patterns/`, copied from
  the repository root so a local-path install gets the same guidance.

Rebuild after updating upstream:

```bash
scripts/opensec-subagents/update.sh --sync   # fetch newest master, reapply, rebuild
scripts/opensec-subagents/update.sh --check  # verify the committed artifact is current
```

If `--sync` reports that the patch no longer applies, rebase it against the new
vendored tree and regenerate it — the script prints the exact commands.
