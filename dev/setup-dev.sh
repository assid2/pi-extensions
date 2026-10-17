#!/usr/bin/env bash
# setup-dev.sh — one-command, idempotent developer setup for this monorepo.
#
#   ./dev/setup-dev.sh
#
# Brings a machine to "just work on the extensions": dependencies, the compiled
# workflows entrypoint, the git hooks, the global dev-watch extension (auto
# rebuild + hot reload), and the pi packages pointed at this live checkout.
#
# Safe to re-run. Self-locating; no hardcoded home directory.

set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
DEV_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
ROOT="$(cd "$DEV_DIR/.." && pwd)"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

say() { printf '\n== %s\n' "$*"; }
die() { echo "setup-dev: ERROR: $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is required"
command -v npm >/dev/null 2>&1 || die "npm is required"
command -v pi >/dev/null 2>&1 || die "pi is required (install it first)"

say "dependencies"
npm install --prefix "$ROOT" --no-audit --no-fund
(cd "$ROOT/pi-usage" && npm ci --no-audit --no-fund)
(cd "$ROOT/pi-commandcode-cloud" && npm ci --no-audit --no-fund)
(cd "$ROOT/pi-dynamic-workflows" && npm ci --no-audit --no-fund)

say "build pi-dynamic-workflows (committed dist/)"
(cd "$ROOT/pi-dynamic-workflows" && npm run build)

say "git hooks"
git -C "$ROOT" config core.hooksPath "$ROOT/.githooks"
chmod +x "$ROOT/.githooks/"* 2>/dev/null || true
echo "core.hooksPath -> $ROOT/.githooks (pre-commit rebuilds dist/, pre-push verifies + tests)"

say "global dev-watch extension (auto rebuild + hot reload)"
mkdir -p "$AGENT_DIR/extensions"
ln -sfn "$ROOT/dev/dev-watch.ts" "$AGENT_DIR/extensions/pi-extensions-dev-watch.ts"
echo "$AGENT_DIR/extensions/pi-extensions-dev-watch.ts -> $ROOT/dev/dev-watch.ts"

say "point pi at this live checkout"
pi install "$ROOT/pi-usage"
pi install "$ROOT/pi-commandcode-cloud"
pi install "$ROOT/pi-ollama-cloud"
pi install "$ROOT/pi-dynamic-workflows"
"$ROOT/deploy/apply.sh"
"$ROOT/deploy/host-setup.sh"

say "done"
cat <<EOF
Dev loop: edit sources under this checkout — pi rebuilds pi-dynamic-workflows and
hot-reloads itself; pi-usage and pi-commandcode-cloud are loaded straight from
TypeScript. Verify with
\`./deploy/apply.sh --check\`, commit/push with plain git (hooks keep dist/ and
release tags honest).
EOF
