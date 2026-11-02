#!/usr/bin/env bash
# update.sh — rebuild the vendored pi-atelier package from upstream source.
#
# pi-atelier ships TypeScript source and loads it through jiti. This repository
# keeps a pristine copy under vendor/ and compiles it to one ESM bundle so a
# remote install loads frozen bytes, while the source (and any future patches)
# stays in the repository.
#
#   vendor/pi-atelier/          pristine upstream source (commit in UPSTREAM)
#   patches/pi-atelier/*.patch  future local changes, applied in filename order
#   pi-atelier/                 the generated, loadable package
#
# Usage:
#   scripts/pi-atelier/update.sh              # rebuild from current vendor/
#   scripts/pi-atelier/update.sh --sync       # fetch upstream main, then rebuild
#   scripts/pi-atelier/update.sh --sync --ref <commit-or-branch>
#   scripts/pi-atelier/update.sh --check      # fail if the committed package is stale
#
# Prerequisites (maintainer machine only): git, node/npm, bun, tar.
# Deployed machines only consume the committed pi-atelier/ output.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENDOR="$ROOT/vendor/pi-atelier"
PATCH_DIR="$ROOT/patches/pi-atelier"
OUT="$ROOT/pi-atelier"
UPSTREAM_URL="https://github.com/michaelmjhhhh/pi-atelier.git"

SYNC=0
CHECK=0
REF="main"
while [ $# -gt 0 ]; do
  case "$1" in
    --sync) SYNC=1 ;;
    --check) CHECK=1 ;;
    --ref)
      [ $# -ge 2 ] || { echo "update.sh: --ref needs a value" >&2; exit 2; }
      REF="$2"; shift ;;
    -h|--help) sed -n '2,28p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "update.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "update.sh: ERROR: $*" >&2; exit 1; }
step() { echo "update.sh: $*"; }

for tool in git node npm bun tar; do
  command -v "$tool" >/dev/null 2>&1 || die "missing required tool: $tool"
done
[ -f "$VENDOR/package.json" ] || die "missing vendored source: $VENDOR"
[ "$CHECK" -eq 0 ] || [ -d "$OUT" ] || die "--check needs an existing $OUT to compare against"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/pi-atelier.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

copy_source() { # <src> <dst> — exclude VCS, install output, docs media
  mkdir -p "$2"
  tar -C "$1" --exclude=.git --exclude=node_modules --exclude=dist --exclude=assets \
    --exclude=docs --exclude=.agents --exclude=.claude -cf - . | tar -C "$2" -xf -
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
license: MIT
vendored_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)

This directory is a pristine source snapshot. Do not edit it directly.
Future changes live in patches/pi-atelier/*.patch (applied in filename order)
and are applied to a temporary copy by scripts/pi-atelier/update.sh.

The npm package ships the same TypeScript source and loads it through jiti;
this repository additionally compiles it to a single ESM bundle so remote
installs load frozen bytes while the source stays available in vendor/.
EOF
fi

COMMIT="$(sed -n 's/^commit: //p' "$VENDOR/UPSTREAM")"
[ -n "$COMMIT" ] || die "UPSTREAM has no commit line"
VERSION="$(node -p 'require(process.argv[1]).version' "$VENDOR/package.json")"

shopt -s nullglob
PATCHES=("$PATCH_DIR"/*.patch)

# ---- scratch build ------------------------------------------------------------
WORK="$TMP/work"
copy_source "$VENDOR" "$WORK"
if [ ${#PATCHES[@]} -gt 0 ]; then
  for patch in "${PATCHES[@]}"; do
    step "applying $(basename "$patch")"
    (
      cd "$WORK"
      if ! git apply --check -p1 "$patch" 2>/dev/null; then
        echo "update.sh: ERROR: $(basename "$patch") no longer applies to upstream $COMMIT." >&2
        echo "  Upstream probably moved the code it patches. Rebase it against" >&2
        echo "  $VENDOR and regenerate the file:" >&2
        echo "    cp -a vendor/pi-atelier /tmp/work && cd /tmp/work" >&2
        echo "    git init -q && git add -A && git commit -qm base" >&2
        echo "    # edit the sources, then:" >&2
        echo "    git add -A && git diff --cached -- extensions src > $ROOT/patches/pi-atelier/<name>.patch" >&2
        exit 1
      fi
      git apply -p1 "$patch"
    ) || exit 1
  done
else
  step "no patches in ${PATCH_DIR#"$ROOT"/} — building pristine upstream"
fi

step "installing dependencies"
(cd "$WORK" && npm ci --silent)

step "typechecking"
(cd "$WORK" && npm run typecheck --silent)

step "unit tests"
(cd "$WORK" && npx vitest run 2>&1 | tail -4)

step "bundling (ESM, host modules external)"
(cd "$WORK" && bun build extensions/index.ts --target node --format esm \
  --outfile dist/index.js --external '@earendil-works/*' >/dev/null)
(cd "$WORK" && NODE_NO_WARNINGS=1 node -e '
  import("./dist/index.js").then((m) => {
    if (typeof m.default !== "function") throw new Error("default export is not the extension factory");
  }).catch((e) => { console.error(e); process.exit(1); });
')

# ---- assemble the loadable package -------------------------------------------
STAGE="$TMP/out"
mkdir -p "$STAGE/dist"
cp "$WORK/dist/index.js" "$STAGE/dist/index.js"
cp "$WORK/LICENSE" "$STAGE/"
node - "$WORK/package.json" "$STAGE/package.json" <<'NODE'
const fs = require("node:fs");
const [src, dst] = process.argv.slice(2);
const upstream = JSON.parse(fs.readFileSync(src, "utf8"));
const pkg = {
  name: "pi-atelier",
  version: upstream.version,
  private: true,
  type: "module",
  description:
    "A responsive status rail and live activity sidebar for Pi, compiled from vendored upstream source.",
  license: upstream.license,
  repository: upstream.repository,
  homepage: upstream.homepage,
  pi: { extensions: ["./dist/index.js"] },
  peerDependencies: upstream.peerDependencies,
  ...(upstream.peerDependenciesMeta ? { peerDependenciesMeta: upstream.peerDependenciesMeta } : {}),
};
fs.writeFileSync(dst, JSON.stringify(pkg, null, 2) + "\n");
NODE
{
  echo "generated: do not edit"
  echo "upstream: $UPSTREAM_URL"
  echo "commit: $COMMIT"
  echo "upstream_version: $VERSION"
  if [ ${#PATCHES[@]} -gt 0 ]; then
    for patch in "${PATCHES[@]}"; do
      if command -v sha256sum >/dev/null 2>&1; then
        sha="$(sha256sum "$patch" | awk '{print $1}')"
      else
        sha="$(shasum -a 256 "$patch" | awk '{print $1}')"
      fi
      echo "patch: patches/pi-atelier/$(basename "$patch") sha256: $sha"
    done
  else
    echo "patches: none"
  fi
  echo "build: npm ci && npm run typecheck && vitest run && bun build (ESM)"
  echo
  echo "Rebuild with scripts/pi-atelier/update.sh"
} > "$STAGE/BUILD"
cat > "$STAGE/README.md" <<'EOF'
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
EOF

if [ "$CHECK" -eq 1 ]; then
  step "checking committed artifact is current"
  if ! diff -r "$STAGE" "$OUT" >"$TMP/check.diff" 2>&1; then
    echo "update.sh: ERROR: $OUT is stale or differs from a fresh build:" >&2
    sed 's/^/  /' "$TMP/check.diff" >&2
    exit 1
  fi
  step "up to date ($VERSION @ ${COMMIT:0:12})"
else
  rm -rf "$OUT"
  mv "$STAGE" "$OUT"
  step "wrote $OUT ($VERSION @ ${COMMIT:0:12})"
fi
