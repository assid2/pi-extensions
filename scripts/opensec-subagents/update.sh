#!/usr/bin/env bash
# update.sh — rebuild the vendored, TPS-patched opensec-pi-subagents package.
#
# The npm package ships only a prebuilt Bun bundle, so the TPS change cannot be
# applied to it. Instead:
#
#   vendor/opensec-pi-subagents/          pristine upstream source (pinned)
#   patches/opensec-pi-subagents/*.patch  the durable TPS change
#   opensec-pi-subagents/                 the generated, loadable package
#
# This script copies the pristine tree to a scratch dir, applies the patch,
# typechecks, compiles with tsc, bundles with Bun (so croner/nanoid need no
# runtime node_modules), runs the patch's tests, and writes the package. It
# never edits vendor/ in place.
#
# Usage:
#   scripts/opensec-subagents/update.sh              # rebuild from current vendor/
#   scripts/opensec-subagents/update.sh --sync       # fetch upstream master, then rebuild
#   scripts/opensec-subagents/update.sh --sync --ref <commit-or-branch>
#   scripts/opensec-subagents/update.sh --check      # fail if the committed package is stale
#
# Prerequisites (maintainer machine only): git, node/npm, bun, tar.
# Deployed machines only consume the committed opensec-pi-subagents/ output.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENDOR="$ROOT/vendor/opensec-pi-subagents"
PATCH="$ROOT/patches/opensec-pi-subagents/0001-tps.patch"
OUT="$ROOT/opensec-pi-subagents"
UPSTREAM_URL="https://github.com/opensec-git/opensec-pi-subagents.git"

SYNC=0
CHECK=0
REF="master"
while [ $# -gt 0 ]; do
  case "$1" in
    --sync) SYNC=1 ;;
    --check) CHECK=1 ;;
    --ref)
      [ $# -ge 2 ] || { echo "update.sh: --ref needs a value" >&2; exit 2; }
      REF="$2"; shift ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "update.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "update.sh: ERROR: $*" >&2; exit 1; }
step() { echo "update.sh: $*"; }

for tool in git node npm bun tar; do
  command -v "$tool" >/dev/null 2>&1 || die "missing required tool: $tool"
done
[ -f "$PATCH" ] || die "missing patch: $PATCH"
[ -f "$VENDOR/package.json" ] || die "missing vendored source: $VENDOR"
[ "$CHECK" -eq 0 ] || [ -d "$OUT" ] || die "--check needs an existing $OUT to compare against"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/opensec-subagents.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

copy_source() { # <src> <dst> — exclude VCS, install and build output, docs media
  mkdir -p "$2"
  tar -C "$1" --exclude=.git --exclude=node_modules --exclude=dist --exclude=dist-bun --exclude=media \
    -cf - . | tar -C "$2" -xf -
}

# ---- optional: refresh the pristine vendor tree from upstream -----------------
if [ "$SYNC" -eq 1 ]; then
  step "fetching $UPSTREAM_URL @ $REF"
  git clone --quiet --depth 1 --branch "$REF" "$UPSTREAM_URL" "$TMP/upstream" 2>/dev/null \
    || { # --branch does not accept raw commit SHAs; clone then check out.
      rm -rf "$TMP/upstream"
      git clone --quiet "$UPSTREAM_URL" "$TMP/upstream" || die "cannot clone $UPSTREAM_URL"
      git -C "$TMP/upstream" checkout --quiet "$REF" || die "cannot check out $REF"
    }
  COMMIT="$(git -C "$TMP/upstream" rev-parse HEAD)"
  REF_LABEL="$(git -C "$TMP/upstream" symbolic-ref --short -q HEAD 2>/dev/null || echo "$REF")"
  VERSION="$(node -p 'require(process.argv[1]).version' "$TMP/upstream/package.json")"
  step "vendoring $VERSION ($COMMIT)"
  find "$VENDOR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  copy_source "$TMP/upstream" "$VENDOR"
  cat > "$VENDOR/UPSTREAM" <<EOF
repository: $UPSTREAM_URL
branch: $REF_LABEL
commit: $COMMIT
version: $VERSION
license: Apache-2.0
vendored_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)

This directory is a pristine source snapshot. Do not edit it directly.
TPS changes live in patches/opensec-pi-subagents/0001-tps.patch and are
applied to a temporary copy by scripts/opensec-subagents/update.sh.

The npm package (opensec-pi-subagents) ships only a prebuilt Bun bundle; it
has no source. The GitHub tree above is the newest publicly available source
and is what the patch is written against.
EOF
fi

COMMIT="$(sed -n 's/^commit: //p' "$VENDOR/UPSTREAM")"
VERSION="$(node -p 'require(process.argv[1]).version' "$VENDOR/package.json")"
if command -v sha256sum >/dev/null 2>&1; then
  PATCH_SHA="$(sha256sum "$PATCH" | awk '{print $1}')"
else
  PATCH_SHA="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
fi

# ---- scratch build ------------------------------------------------------------
WORK="$TMP/work"
step "applying $(basename "$PATCH")"
copy_source "$VENDOR" "$WORK"
(
  cd "$WORK"
  if ! git apply --check -p1 "$PATCH" 2>/dev/null; then
    echo "update.sh: ERROR: the TPS patch no longer applies to upstream $COMMIT." >&2
    echo "  Upstream probably moved the widget code. Rebase the patch against" >&2
    echo "  $VENDOR and regenerate it:" >&2
    echo "    cp -a vendor/opensec-pi-subagents /tmp/work && cd /tmp/work" >&2
    echo "    git init -q && git add -A && git commit -qm base" >&2
    echo "    # edit src/ui/agent-widget.ts (and src/token-rate.ts), then:" >&2
    echo "    git add -A && git diff --cached > patches/opensec-pi-subagents/0001-tps.patch" >&2
    exit 1
  fi
  git apply -p1 "$PATCH"
) || exit 1

step "installing dependencies"
(cd "$WORK" && npm ci --silent)

step "typechecking"
(cd "$WORK" && npm run typecheck --silent)

step "compiling with tsc"
(cd "$WORK" && npm run build --silent)

step "bundling (ESM, host modules external, croner/nanoid embedded)"
mkdir -p "$WORK/dist-bun"
(
  cd "$WORK"
  bun build dist/index.js --target node --format esm --outfile dist-bun/index.js \
    --external '@earendil-works/*' --external 'typebox' --external 'typebox/*' >/dev/null
)
NODE_NO_WARNINGS=1 node -e '
  import(process.argv[1]).then((m) => {
    if (typeof m.default !== "function") throw new Error("default export is not the extension factory");
  }).catch((e) => { console.error(e); process.exit(1); });
' "$WORK/dist-bun/index.js"

step "patch tests"
(cd "$WORK" && npx vitest run \
  test/token-rate.test.ts \
  test/agent-widget-tps.test.ts \
  test/agent-widget.test.ts \
  test/agent-widget-rows.test.ts \
  test/agent-widget-redraw.test.ts \
  test/agent-widget-idle.test.ts 2>&1 | tail -4)

# ---- assemble the loadable package -------------------------------------------
STAGE="$TMP/out"
mkdir -p "$STAGE/dist-bun" "$STAGE/skills"
cp "$WORK/dist-bun/index.js" "$STAGE/dist-bun/index.js"
cp "$WORK/LICENSE" "$WORK/NOTICE" "$STAGE/"
# The workflow skills are authored at the repo root (source of truth) and copied
# into the loadable package so a dev local-path install gets them too; the
# monorepo root manifest points at the same two directories on deployed machines.
cp -a "$ROOT/skills/workflow-authoring" "$ROOT/skills/workflow-patterns" "$STAGE/skills/"
node - "$WORK/package.json" "$STAGE/package.json" <<'NODE'
const fs = require("node:fs");
const [src, dst] = process.argv.slice(2);
const upstream = JSON.parse(fs.readFileSync(src, "utf8"));
const pkg = {
  name: "opensec-pi-subagents",
  version: upstream.version,
  private: true,
  type: "module",
  description:
    "OpenSec subagents for pi, built from vendored source with the TPS patch: per-agent and aggregate output tok/s.",
  license: upstream.license,
  repository: upstream.repository,
  homepage: upstream.homepage,
  pi: { extensions: ["./dist-bun/index.js"], skills: ["./skills/workflow-authoring", "./skills/workflow-patterns"] },
  peerDependencies: upstream.peerDependencies,
};
fs.writeFileSync(dst, JSON.stringify(pkg, null, 2) + "\n");
NODE
cat > "$STAGE/BUILD" <<EOF
generated: do not edit
upstream: $UPSTREAM_URL
commit: $COMMIT
upstream_version: $VERSION
patch: patches/opensec-pi-subagents/0001-tps.patch
patch_sha256: $PATCH_SHA
build: npm ci && npm run build (tsc) && bun build (ESM)

Rebuild with scripts/opensec-subagents/update.sh
EOF
cat > "$STAGE/README.md" <<'EOF'
# opensec-pi-subagents (generated)

This directory is a **build artifact** of `scripts/opensec-subagents/update.sh`.
Do not edit it by hand.

- Source: `vendor/opensec-pi-subagents/` (pristine upstream snapshot)
- Change: `patches/opensec-pi-subagents/0001-tps.patch`
  (per-agent + aggregate output tokens/second in the Agents widget)
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
EOF

if [ "$CHECK" -eq 1 ]; then
  step "checking committed artifact is current"
  if ! diff -r "$STAGE" "$OUT" >/tmp/opensec-subagents.check.$$ 2>&1; then
    echo "update.sh: ERROR: $OUT is stale or differs from a fresh build:" >&2
    sed 's/^/  /' /tmp/opensec-subagents.check.$$ >&2
    rm -f /tmp/opensec-subagents.check.$$
    exit 1
  fi
  rm -f /tmp/opensec-subagents.check.$$
  step "up to date ($VERSION @ ${COMMIT:0:12})"
else
  rm -rf "$OUT"
  mv "$STAGE" "$OUT"
  step "wrote $OUT ($VERSION @ ${COMMIT:0:12})"
fi
