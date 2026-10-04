#!/usr/bin/env bash
# check-pi-color.sh — report the effective 24-bit colour path for pi on this host.
#
# A diagnostic, not a gate: it prints what pi and the terminal chain will actually use, so a
# rollout can self-verify instead of guessing from the environment. Exits 0.
#
# Usage: check-pi-color.sh

set -uo pipefail

say() { printf '%s\n' "$*"; }

say "TERM=${TERM:-<unset>}  COLORTERM=${COLORTERM:-<unset>}"

if command -v tmux >/dev/null 2>&1 && [ -n "${TMUX:-}" ]; then
  say "tmux client: $(tmux display-message -p '#{client_termname}' 2>/dev/null || echo '?')"
  say "tmux client features: $(tmux display-message -p '#{client_termfeatures}' 2>/dev/null || echo '?')"
  say "tmux default-terminal: $(tmux show -g default-terminal 2>/dev/null || echo '?')"
  say "tmux COLORTERM: $(tmux show-environment -g COLORTERM 2>/dev/null || echo '<unset>')"
fi

say "tput colors: $(tput colors 2>/dev/null || echo '?')"

SETTINGS="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"
if [ -f "$SETTINGS" ]; then
  say "settings terminal.trueColor: $(node -e 'try{const j=require(process.argv[1]);process.stdout.write(String(j.terminal?.trueColor))}catch(e){process.stdout.write("?")}' "$SETTINGS" 2>/dev/null || echo '?')"
fi

FOOTER="$(find "$HOME/.pi/agent" "$HOME/.local/share/pi-node" -type f -path '*/remote-pi/dist/ui/footer.js' 2>/dev/null | head -1 || true)"
if [ -n "$FOOTER" ]; then
  if grep -qP '\x{1F7E2}|\x{1F7E1}' "$FOOTER" 2>/dev/null; then
    say "remote-pi relay glyph: UNPATCHED (emoji present — will show grey on clients without a colour-emoji font)"
  else
    say "remote-pi relay glyph: patched"
  fi
fi

# pi's own detector, if it can be resolved and loaded.
PT="$(find "$HOME/.pi/agent" "$HOME/.local/share/pi-node" -type f -path '*pi-tui/dist/index.js' 2>/dev/null | head -1 || true)"
if [ -n "$PT" ]; then
  node -e 'try{const m=require(process.argv[1]); if(typeof m.detectCapabilities==="function"){process.stdout.write("pi-tui detectCapabilities: "+JSON.stringify(m.detectCapabilities())+"\n")}}catch(e){process.stdout.write("pi-tui probe: unavailable ("+e.code||e.message+")"+"\n")}' "$PT" 2>/dev/null || true
fi

exit 0
