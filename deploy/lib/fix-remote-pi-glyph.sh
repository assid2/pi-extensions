#!/usr/bin/env bash
# fix-remote-pi-glyph.sh — replace remote-pi's emoji relay glyphs (U+1F7E2 / U+1F7E1) with
# an SGR-coloured U+25CF, so the relay dot renders in colour instead of depending on the
# client's colour-emoji font (where it shows grey and looks like the relay is down).
#
# This patches a file inside a package install, so any remote-pi update/reinstall silently
# reverts it: the deployment must run this on every apply AND every upgrade, and --check
# must report drift. A pristine copy is kept at <footer.js>.orig.
#
# Usage: fix-remote-pi-glyph.sh [--apply | --check | --dry-run | --revert]
#
# Target resolution order: $REMOTE_PI_FOOTER, then the path pi reports for the remote-pi
# package (`pi list`), then a scan of the agent dir and pi-node store.

set -euo pipefail

MODE="apply"
case "${1:-}" in
  --apply|"") MODE="apply" ;;
  --check)    MODE="check" ;;
  --dry-run)  MODE="dry-run" ;;
  --revert)   MODE="revert" ;;
  -h|--help)  echo "usage: fix-remote-pi-glyph.sh [--apply|--check|--dry-run|--revert]"; exit 0 ;;
  *) echo "fix-remote-pi-glyph: unknown option: $1" >&2; exit 2 ;;
esac

say() { printf '  %s\n' "$*"; }

resolve_footer() {
  if [ -n "${REMOTE_PI_FOOTER:-}" ]; then printf '%s\n' "$REMOTE_PI_FOOTER"; return 0; fi
  local p=""
  if command -v pi >/dev/null 2>&1; then
    p="$(pi list 2>/dev/null | grep -oE '^[[:space:]]+/[^[:space:]]*remote-pi' | head -1 | tr -d '[:space:]' || true)"
  fi
  if [ -z "$p" ]; then
    p="$(find "$HOME/.pi/agent" "$HOME/.local/share/pi-node" -type d -path '*/remote-pi' 2>/dev/null | head -1 || true)"
  fi
  [ -n "$p" ] && printf '%s\n' "$p/dist/ui/footer.js"
}

has_emoji() { grep -qP '\x{1F7E2}|\x{1F7E1}' "$1" 2>/dev/null; }

FOOTER="$(resolve_footer || true)"
if [ -z "$FOOTER" ] || [ ! -f "$FOOTER" ]; then
  say "[SKIP]    remote-pi footer.js not found"
  exit 0
fi

case "$MODE" in
  check)
    if has_emoji "$FOOTER"; then
      say "[PENDING] $FOOTER: relay glyph not patched (a remote-pi update may have reverted it)"
      exit 1
    fi
    say "[OK]      $FOOTER: relay glyph patched"
    ;;
  dry-run)
    if has_emoji "$FOOTER"; then
      say "[PLAN]    $FOOTER: replace U+1F7E2/U+1F7E1 with SGR-coloured U+25CF"
    else
      say "[OK]      $FOOTER: relay glyph already patched"
    fi
    ;;
  apply)
    if ! has_emoji "$FOOTER"; then
      say "[OK]      $FOOTER: relay glyph already patched"
      exit 0
    fi
    [ -f "$FOOTER.orig" ] || cp -p "$FOOTER" "$FOOTER.orig"
    perl -CSD -i -pe 's/\x{1F7E2}/\\x1b[32m\x{25CF}\\x1b[39m/g; s/\x{1F7E1}/\\x1b[33m\x{25CF}\\x1b[39m/g;' "$FOOTER"
    say "[CHANGED] $FOOTER: relay glyph patched"
    ;;
  revert)
    if [ -f "$FOOTER.orig" ]; then
      cp -p "$FOOTER.orig" "$FOOTER"
      say "[REVERTED] $FOOTER"
    else
      say "[SKIP]    $FOOTER (no .orig)"
    fi
    ;;
esac
