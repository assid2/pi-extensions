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
# Tested against pi-tui 1.0.0 (nvm install), which exports getTerminalColorMode; other builds
# export only detectCapabilities. The probe tolerates both and WARNs if the two disagree.

set -uo pipefail

PI_TUI="${PI_TUI:-}"
if [ -z "$PI_TUI" ]; then
  PI_TUI="$(find "$HOME/.pi/agent" "$HOME/.local/share/pi-node" "$HOME/.nvm" \
    -type d -path '*@earendil-works/pi-tui' 2>/dev/null | head -1 || true)"
fi

echo "TERM=${TERM:-<unset>}  COLORTERM=${COLORTERM:-<unset>}  TMUX=${TMUX:+set}"
if command -v tmux >/dev/null 2>&1 && [ -n "${TMUX:-}" ]; then
  echo "tmux client: $(tmux display-message -p '#{client_termname}' 2>/dev/null || echo '?')"
  echo "tmux client features: $(tmux display-message -p '#{client_termfeatures}' 2>/dev/null || echo '?')"
  echo "tmux default-terminal: $(tmux show -g default-terminal 2>/dev/null || echo '?')"
  echo "tmux COLORTERM: $(tmux show-environment -g COLORTERM 2>/dev/null || echo '<unset>')"
fi

SETTINGS="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"
if [ -f "$SETTINGS" ]; then
  echo "settings terminal.trueColor: $(node -e 'try{const j=require(process.argv[1]);process.stdout.write(String(j.terminal?.trueColor))}catch(e){process.stdout.write("?")}' "$SETTINGS" 2>/dev/null || echo '?')"
fi

FOOTER="$(find "$HOME/.pi/agent" "$HOME/.local/share/pi-node" -type f -path '*/remote-pi/dist/ui/footer.js' 2>/dev/null | head -1 || true)"
if [ -n "$FOOTER" ]; then
  if grep -qF 'pi-extensions-glyph-patch' "$FOOTER" 2>/dev/null; then
    echo "remote-pi relay glyph: patched"
  elif grep -qP '\x{1F7E2}|\x{1F7E1}' "$FOOTER" 2>/dev/null; then
    echo "remote-pi relay glyph: UNPATCHED (emoji present — grey on clients without a colour-emoji font)"
  else
    echo "remote-pi relay glyph: unknown (no marker, no emoji — review by hand)"
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
