#!/usr/bin/env bash
# bootstrap.sh — model-free first install of the pi extension stack.
#
# Why this exists: the stack ships the provider/extension set pi needs, but a brand-new pi
# has no model configured yet, so it cannot be asked to install anything (catch-22). pi's
# package commands run *before* first-time setup / model resolution, so plain shell can
# bootstrap the whole stack without a model or provider.
#
# Usage:
#   deploy/bootstrap.sh                          # from a clone
#   curl -fsSL <raw-url>/deploy/bootstrap.sh | bash   # brand-new machine
#
# Env:
#   PI_EXTENSIONS_SELF_URL       repo URL/scheme to install (default ssh://git@ssh.github.com:443/assid2/pi-extensions.git)
#   PI_EXTENSIONS_LATEST_TAG     release tag to install (offline/CI/tests; default newest v* tag)
#   PI_EXTENSIONS_SKIP_HOST_SETUP  set to 1 to skip deploy/host-setup.sh
#
# Idempotent. Resolves the newest release tag, installs the monorepo at it, then runs the
# installed clone's own deploy/apply.sh (which floats every entry to its latest release).

set -euo pipefail

say() { printf '\n== %s\n' "$*"; }
die() { echo "bootstrap: ERROR: $*" >&2; exit 1; }

command -v pi >/dev/null 2>&1 || die "pi is not on PATH. Install it first (no model needed):
    curl -fsSL https://pi.dev/install.sh | sh
  then re-run this bootstrap."
command -v git >/dev/null 2>&1 || die "git is required."
command -v node >/dev/null 2>&1 || die "node is required."

SELF_URL="${PI_EXTENSIONS_SELF_URL:-ssh://git@ssh.github.com:443/assid2/pi-extensions.git}"

TAG="${PI_EXTENSIONS_LATEST_TAG:-}"
if [ -z "$TAG" ]; then
  say "resolving the newest release tag"
  TAG="$(git ls-remote --tags "$SELF_URL" 2>/dev/null \
    | awk -F'\t' '$2 ~ /^refs\/tags\/v[0-9]/ { t = $2; sub(/^refs\/tags\//, "", t); sub(/\^\{\}$/, "", t); print t }' \
    | sort -uV | tail -1 || true)"
fi
[ -n "$TAG" ] || die "could not resolve a release tag for $SELF_URL (offline?). Set PI_EXTENSIONS_LATEST_TAG=<tag> and retry."
echo "  newest release: $TAG"

say "installing $SELF_URL@$TAG"
pi install "$SELF_URL@$TAG"

AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
say "locating the installed clone"
CLONE="$(pi list 2>/dev/null | grep -oE '^[[:space:]]+/[^[:space:]]*assid2/pi-extensions' | head -1 | tr -d '[:space:]' || true)"
if [ -z "$CLONE" ]; then
  for host in ssh.github.com github.com; do
    cand="$AGENT_DIR/git/$host/assid2/pi-extensions"
    [ -d "$cand" ] && { CLONE="$cand"; break; }
  done
fi
[ -n "$CLONE" ] || die "installed, but could not locate the clone. Run 'pi list', then its deploy/apply.sh manually."
echo "  clone: $CLONE"

say "converging the stack (deploy/apply.sh)"
bash "$CLONE/deploy/apply.sh"

if [ "${PI_EXTENSIONS_SKIP_HOST_SETUP:-}" != 1 ] && [ -x "$CLONE/deploy/host-setup.sh" ]; then
  say "converging the host terminal (deploy/host-setup.sh)"
  bash "$CLONE/deploy/host-setup.sh" || true
fi

say "done"
echo "The stack is installed as of $TAG. Restart pi, then configure a provider/model when ready."
