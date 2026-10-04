#!/usr/bin/env bash
# fix-remote-pi-glyph.sh — replace remote-pi's bare emoji relay glyphs with an SGR-coloured ●.
#
# Upstream remote-pi sets the relay status to the bare emoji U+1F7E2 / U+1F7E1. Pi passes status
# text through unstyled, so the colour comes from the *client's* emoji font; on a client without a
# colour-emoji font they render grey and look like the relay is down — no amount of truecolor fixes
# that. The patch swaps in ● (U+25CF, 1 cell for Pi's width maths; emoji are 2) coloured with the
# catppuccin-mocha truecolor SGR already used in ~/.tmux.conf, which Pi emits and tmux forwards
# (terminal-features *:RGB).
#
# The patch lives inside a package install, so any remote-pi update/reinstall silently reverts it.
# Re-run on every apply and every upgrade; --check reports the drift. A pristine copy is kept at
# <footer.js>.orig.
#
# Usage: fix-remote-pi-glyph.sh [--apply | --check | --dry-run | --revert]
#
# Target resolution: $REMOTE_PI_FOOTER, then the path pi reports for the remote-pi package
# (`pi list`), then a scan of the agent dir and the pi-node store. No hardcoded package path.

set -euo pipefail

MARKER="pi-extensions-glyph-patch v1"
MODE="${1:---apply}"
case "$MODE" in
  --apply|--check|--dry-run|--revert) ;;
  -h|--help) echo "usage: fix-remote-pi-glyph.sh [--apply|--check|--dry-run|--revert]"; exit 0 ;;
  *) echo "fix-remote-pi-glyph: unknown option: $1" >&2; exit 2 ;;
esac
MODE="${MODE#--}"

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
is_patched() {
  grep -qF "$MARKER" "$1" 2>/dev/null || return 1
  grep -qF '●' "$1" 2>/dev/null || grep -qF 'u25cf' "$1" 2>/dev/null
}

FOOTER="$(resolve_footer || true)"
if [ -z "$FOOTER" ] || [ ! -f "$FOOTER" ]; then
  say "[SKIP]    remote-pi footer.js not found"
  exit 0
fi

PKG_JSON="$(dirname "$(dirname "$(dirname "$FOOTER")")")/package.json"
VERSION="$(node -e 'try{process.stdout.write(require(process.argv[1]).version)}catch(e){}' "$PKG_JSON" 2>/dev/null || true)"
EXPECTED="${REMOTE_PI_GLYPH_VERIFIED_AGAINST:-0.7.0}"
if [ -n "$VERSION" ] && [ "$VERSION" != "$EXPECTED" ]; then
  say "[WARN]    remote-pi $VERSION is not the verified $EXPECTED — the patch may need review"
fi

patch_node() {
  TARGET="$FOOTER" MARKER="$MARKER" node <<'NODE'
const fs = require('fs');
const cp = require('child_process');
const p = process.env.TARGET, marker = process.env.MARKER;
const src = fs.readFileSync(p, 'utf8');

// The shipped relay block in remote-pi 0.7.0 (and any release that keeps it).
const re = /if \(state\.relayOn\) \{\s*\n\s*ctx\.ui\.setStatus\(K_RELAY, state\.hasPairings \? "[\s\S]*?" : "[\s\S]*?"\);\s*\n\s*\}/;
if (!re.test(src)) {
  console.error('could not find the relay setStatus block — upstream changed the code, edit by hand.');
  process.exit(1);
}
const replacement = [
  'if (state.relayOn) {',
  '        // ' + marker + ' — re-apply after a package update with deploy/host-setup.sh',
  '        // U+1F7E2/U+1F7E1 are bare emoji Pi does not colour, so a client without a',
  '        // colour-emoji font draws them grey. U+25CF is 1 cell for Pi\'s width maths',
  '        // (emoji are 2) and the SGR codes travel through tmux (*:RGB).',
  '        const GREEN = "\\u001b[38;2;166;227;161m";',
  '        const AMBER = "\\u001b[38;2;249;226;175m";',
  '        const RESET = "\\u001b[0m";',
  '        const dot = state.hasPairings ? `${GREEN}\u25cf${RESET}` : `${AMBER}\u25cf${RESET}`;',
  '        ctx.ui.setStatus(K_RELAY, `${dot} relay${state.hasPairings ? "" : " waiting for pairing"}`);',
  '    }',
].join('\n');

fs.writeFileSync(p, src.replace(re, replacement));
cp.execSync(`node --check ${JSON.stringify(p)}`); // corrupt patch fails here, not at Pi startup
NODE
}

case "$MODE" in
  check)
    if is_patched "$FOOTER"; then
      say "[OK]      $FOOTER: relay glyph patched"
      exit 0
    fi
    if has_emoji "$FOOTER"; then
      say "[PENDING] $FOOTER: relay glyph not patched (a remote-pi update may have reverted it)"
      exit 1
    fi
    say "[PENDING] $FOOTER: neither the patch marker nor the emoji is present — upstream changed the glyph; review by hand"
    exit 1
    ;;
  dry-run)
    if is_patched "$FOOTER"; then
      say "[OK]      $FOOTER: relay glyph already patched"
    else
      say "[PLAN]    $FOOTER: patch relay glyph (U+1F7E2/U+1F7E1 -> SGR ●)"
    fi
    ;;
  revert)
    if [ -f "$FOOTER.orig" ]; then
      cp -p "$FOOTER.orig" "$FOOTER"
      say "[REVERTED] $FOOTER"
    else
      say "[SKIP]    $FOOTER (no .orig)"
    fi
    ;;
  apply)
    if is_patched "$FOOTER"; then
      say "[OK]      $FOOTER: relay glyph already patched"
      exit 0
    fi
    [ -f "$FOOTER.orig" ] || cp -p "$FOOTER" "$FOOTER.orig"
    if ! patch_node; then
      say "[FAIL]    $FOOTER: relay block not found — upstream changed the code; patch by hand"
      exit 1
    fi
    say "[CHANGED] $FOOTER: relay glyph patched"
    ;;
esac
