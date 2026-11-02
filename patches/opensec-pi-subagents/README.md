# TPS patch — opensec-pi-subagents

This directory is the durable home of the tokens/second (TPS) change that the
`opensec-pi-subagents` build carries. It is applied on top of the pristine
upstream source in `vendor/opensec-pi-subagents/`, never committed into that
tree.

| File | Purpose |
|---|---|
| `0001-tps.patch` | per-agent + aggregate **output** tok/s in the Agents widget, plus the rolling sampler (`src/token-rate.ts`) and its tests |

## Why a patch and not an npm package

`npm:opensec-pi-subagents` ships only a prebuilt Bun bundle (`dist-bun/index.js`
and a large `core.cjs`) with **no TypeScript source**. There is nothing to
compile and no durable place to put the change. The GitHub source also has no
tags, so the vendor snapshot is pinned by commit in
`vendor/opensec-pi-subagents/UPSTREAM`.

## Build

```bash
# rebuild from the current vendor snapshot (what .githooks/pre-commit runs)
scripts/opensec-subagents/update.sh

# fetch upstream master, vendor it, reapply this patch, compile + bundle
scripts/opensec-subagents/update.sh --sync

# CI / pre-push: fail if opensec-pi-subagents/ is stale
scripts/opensec-subagents/update.sh --check
```

The script copies `vendor/` to a scratch directory, applies this patch with
`git apply --3way`, runs `npm ci`, `tsc --noEmit`, `npm run build`, bundles with
Bun (host modules external, `croner`/`nanoid` embedded), runs the patch tests,
and replaces `opensec-pi-subagents/`.

If the patch is rejected, upstream moved the code it touches. Rebase it:

```bash
cp -a vendor/opensec-pi-subagents /tmp/work && cd /tmp/work
git init -q && git add -A && git commit -qm base
# edit src/ui/agent-widget.ts (and src/token-rate.ts), then
git add -A && git diff --cached -- src test > \
  /home/satish/pi-extensions/patches/opensec-pi-subagents/0001-tps.patch
```

Keep the patch header's base commit current when you regenerate it.

## What it changes

- `src/token-rate.ts` — rolling 10 s sampler over cumulative **output** tokens.
  Input and cache-read tokens are excluded: they step at API-call boundaries and
  produce implausible spikes.
- `src/ui/agent-widget.ts` — samples every running agent on each widget frame,
  shows `N tok/s` beside its token count, and puts the aggregate on the
  `Agents` heading.
- `test/token-rate.test.ts` — sampler unit tests.
- `test/agent-widget-tps.test.ts` — widget-level per-agent + aggregate rates.

The same algorithm was previously carried by the `pi-dynamic-workflows` fork
(`src/token-rate.ts`), which this patch replaces.
