#!/usr/bin/env bash
# check-pi-color.sh — report the colour mode Pi resolves in THIS pane, using Pi's own detector
# (pi-tui detectCapabilities / getTerminalColorMode) rather than guessing from the environment.
#
#   check-pi-color.sh                   probe the current environment
#   check-pi-color.sh --with-colorterm  same, with COLORTERM=truecolor injected
#
# Report only; exits 0. Resolution of pi-tui: $PI_TUI, then a scan of the agent dir, the pi-node
# store, and ~/.nvm (which covers nvm-installed pi-coding-agent nested node_modules).
#
# Invariant "one source, one answer": the file-backed rows (settings.json trueColor, the glyph
# state) must agree with host-setup.sh's CONFIG section - the glyph row is delegated to the same
# fix-remote-pi-glyph.sh --check. Only the live tmux rows (default-terminal, COLORTERM, pane TERM)
# may legitimately lag, since tmux applies them to new panes only.
#
# Tested against pi-tui 1.0.0 (nvm install), which exports getTerminalColorMode; other builds
# export only detectCapabilities. The probe tolerates both and WARNs if the two disagree.

set -uo pipefail

SELF_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

PI_TUI="${PI_TUI:-}"
if [ -z "$PI_TUI" ]; then
  PI_TUI="$(find "$HOME/.pi/agent" "$HOME/.local/share/pi-node" "$HOME/.nvm" \
    -type d -path '*@earendil-works/pi-tui' 2>/dev/null | head -1 || true)"
fi

echo "TERM=${TERM:-<unset>}  COLORTERM=${COLORTERM:-<unset>}  TMUX=${TMUX:+set}"
if command -v tmux >/dev/null 2>&1 && [ -n "${TMUX:-}" ]; then
  client_name="$(tmux display-message -p '#{client_termname}' 2>/dev/null || true)"
  [ -n "$client_name" ] || client_name="no attached client"
  client_feat="$(tmux display-message -p '#{client_termfeatures}' 2>/dev/null || true)"
  [ -n "$client_feat" ] || client_feat="(none reported)"
  echo "tmux client: $client_name"
  echo "tmux client features: $client_feat"
  echo "tmux default-terminal: $(tmux show -g default-terminal 2>/dev/null || echo '?')"
  echo "tmux COLORTERM: $(tmux show-environment -g COLORTERM 2>/dev/null || echo '<unset>')"
fi

SETTINGS="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"
if [ -f "$SETTINGS" ]; then
  echo "settings terminal.trueColor: $(node -e 'try{const j=require(process.argv[1]);process.stdout.write(String(j.terminal?.trueColor))}catch(e){process.stdout.write("?")}' "$SETTINGS" 2>/dev/null || echo '?')"
fi

# Single source of truth: ask the glyph patch script (same is_patched rule as CONFIG),
# so the LIVE section can never contradict the CONFIG section in the same run.
FOOTER="$(find "$HOME/.pi/agent" "$HOME/.local/share/pi-node" -type f -path '*/remote-pi/dist/ui/footer.js' 2>/dev/null | head -1 || true)"
FIX_GLYPH="$SELF_DIR/fix-remote-pi-glyph.sh"
if [ -x "$FIX_GLYPH" ]; then
  glyph_out="$("$FIX_GLYPH" --check 2>&1 || true)"
  case "$glyph_out" in
    *"not found"*) : ;; # remote-pi not installed - say nothing
    *"relay glyph patched"*) echo "remote-pi relay glyph: patched" ;;
    *) echo "remote-pi relay glyph: NOT patched or drifted — run deploy/lib/fix-remote-pi-glyph.sh --check" ;;
  esac
elif [ -n "$FOOTER" ]; then
  if { grep -qF 'pi-extensions-glyph-patch' "$FOOTER" 2>/dev/null || grep -qF 'LOCAL PATCH' "$FOOTER" 2>/dev/null; } \
     && { grep -qF '●' "$FOOTER" 2>/dev/null || grep -qF 'u25cf' "$FOOTER" 2>/dev/null; }; then
    echo "remote-pi relay glyph: patched"
  else
    echo "remote-pi relay glyph: NOT patched or drifted — run deploy/lib/fix-remote-pi-glyph.sh --check"
  fi
fi

if [ -n "$PI_TUI" ] && [ -f "$PI_TUI/dist/terminal-image.js" ]; then
  PROBE="$(mktemp "${TMPDIR:-/tmp}/pi-color-probe.XXXXXX.mjs")"
  cat > "$PROBE" <<'NODE'
const m = await import(globalThis.process.env.PI_TUI + '/dist/terminal-image.js');
const c = m.detectCapabilities();
const derived = c && c.trueColor ? 'truecolor' : 'no-truecolor';
let mode = derived;
if (typeof m.getTerminalColorMode === 'function') {
  mode = m.getTerminalColorMode(c);
  if (mode !== derived) console.error('WARN: getTerminalColorMode=' + mode + ' disagrees with derived=' + derived);
}
console.log(JSON.stringify({ mode, ...c }));
NODE
  export PI_TUI
  if [ "${1:-}" = "--with-colorterm" ]; then
    printf 'with COLORTERM=truecolor : '
    COLORTERM=truecolor node "$PROBE" 2>/dev/null || echo 'probe failed'
  else
    printf 'as Pi detects it now     : '
    node "$PROBE" 2>/dev/null || echo 'probe failed'
    echo
    echo "Note: this reads the environment only. A terminal.trueColor setting in"
    echo "settings.json overrides this detection inside Pi, and is applied at Pi"
    echo "startup — so 'mode: 256color' here does not necessarily mean Pi is drawing"
    echo "in 256 colours."
  fi
  rm -f "$PROBE"
else
  echo "pi-tui detector not found (set PI_TUI) — reporting the environment only"
fi

exit 0
