#!/usr/bin/env bash
# host-setup.test.sh — exercises deploy/host-setup.sh in scratch HOMEs / agent dirs.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SETUP="$HERE/../host-setup.sh"
FAILS=0

fail() { echo "  FAIL: $*" >&2; FAILS=$((FAILS + 1)); }
ok()   { echo "  ok: $*"; }
new_home() { mktemp -d "${TMPDIR:-/tmp}/host-setup-test.XXXXXX"; }
run() { env -u PI_CODING_AGENT_DIR REMOTE_PI_FOOTER="${REMOTE_PI_FOOTER:-/nonexistent}" HOME="$1" bash "$HOST_SETUP" "${@:2}"; }
contains() { grep -qF -- "$2" "$1"; }
fixture() {
  printf 'set -g default-terminal "tmux-256color"\nset -g status on\n' > "$1/.tmux.conf"
  printf 'case "$TERM" in\n    xterm-color|*-256color) color_prompt=yes;;\nesac\n' > "$1/.bashrc"
}
mk_settings() { mkdir -p "$1/.pi/agent"; printf '%s\n' "$2" > "$1/.pi/agent/settings.json"; }

# --- item 2: tmux -----------------------------------------------------------
test_default_terminal_replaced() {
  echo "T1 default-terminal replaced in place, backup made, other lines kept"
  local h; h="$(new_home)"; fixture "$h"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -g default-terminal "tmux-direct"' || fail "default-terminal not set"
  contains "$h/.tmux.conf" 'set -g status on' || fail "unrelated line lost"
  [ -f "$h/.tmux.conf.pi-extensions.bak" ] || fail "backup missing"
}
test_rgb_and_colorterm() {
  echo "T2 terminal-features[3] and COLORTERM converge (legacy append replaced)"
  local h; h="$(new_home)"; printf 'set -as terminal-features ",*:RGB"\n#set -g COLORTERM truecolor\n' > "$h/.tmux.conf"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -s terminal-features[3] "*:RGB"' || fail "indexed RGB missing"
  contains "$h/.tmux.conf" 'set-environment -g COLORTERM truecolor' || fail "COLORTERM missing"
  if grep -qF 'set -as terminal-features' "$h/.tmux.conf"; then fail "legacy append not replaced"; fi
  if grep -qF '#set -g COLORTERM' "$h/.tmux.conf"; then fail "legacy commented COLORTERM not replaced"; fi
}
test_conflicting_value_replaced() {
  echo "T6 conflicting default-terminal value replaced"
  local h; h="$(new_home)"; printf 'set -g default-terminal "screen"\n' > "$h/.tmux.conf"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -g default-terminal "tmux-direct"' || fail "conflict not replaced"
}
test_creates_when_absent() {
  echo "T7 creates ~/.tmux.conf when none exists"
  local h; h="$(new_home)"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -g default-terminal "tmux-direct"' || fail "config not created"
  contains "$h/.tmux.conf" 'set-environment -g COLORTERM truecolor' || fail "COLORTERM not created"
}
test_idempotent_tmux() {
  echo "T3 second run is a byte-for-byte no-op"
  local h; h="$(new_home)"; fixture "$h"
  run "$h" >/dev/null
  local after; after="$(cksum "$h/.tmux.conf")"
  run "$h" >/dev/null
  [ "$after" = "$(cksum "$h/.tmux.conf")" ] || fail "second run changed tmux.conf"
  [ "$(grep -cF 'terminal-features' "$h/.tmux.conf")" -eq 1 ] || fail "terminal-features duplicated"
}
test_dry_run_inert() {
  echo "T4 --dry-run changes nothing and makes no backup"
  local h; h="$(new_home)"; fixture "$h"
  local before; before="$(cksum "$h/.tmux.conf")"
  run "$h" --dry-run >/dev/null
  [ "$before" = "$(cksum "$h/.tmux.conf")" ] || fail "dry-run modified the file"
  [ ! -f "$h/.tmux.conf.pi-extensions.bak" ] || fail "dry-run created a backup"
}
test_check_mode() {
  echo "T5 --check fails before, passes after"
  local h; h="$(new_home)"; fixture "$h"; mk_settings "$h" '{}'
  if run "$h" --check >/dev/null 2>&1; then fail "--check passed on unconverged target"; fi
  run "$h" >/dev/null
  run "$h" --check >/dev/null || fail "--check failed on converged target"
}
test_preserves_mode() {
  echo "T9 mode 0600 preserved through rewrite"
  local h; h="$(new_home)"; fixture "$h"; chmod 600 "$h/.tmux.conf"
  run "$h" >/dev/null
  [ "$(stat -c %a "$h/.tmux.conf")" = "600" ] || fail "mode not preserved"
}
test_xdg_target() {
  echo "T10 XDG config used when ~/.tmux.conf absent"
  local h; h="$(new_home)"; mkdir -p "$h/.config/tmux"
  printf 'set -g default-terminal "tmux-256color"\n' > "$h/.config/tmux/tmux.conf"
  run "$h" >/dev/null
  contains "$h/.config/tmux/tmux.conf" 'set -g default-terminal "tmux-direct"' || fail "XDG config not edited"
  [ ! -e "$h/.tmux.conf" ] || fail "created ~/.tmux.conf despite existing XDG config"
}

# --- item 3: shell rc -------------------------------------------------------
test_bash_gate_extended() {
  echo "T11 bash colour gate accepts *-direct, idempotently"
  local h; h="$(new_home)"; fixture "$h"
  run "$h" >/dev/null; run "$h" >/dev/null
  contains "$h/.bashrc" 'xterm-color|*-256color|*-direct) color_prompt=yes;;' || fail "gate not extended"
  [ "$(grep -cF '*-direct)' "$h/.bashrc")" -eq 1 ] || fail "gate duplicated"
}
test_zsh_gate_extended() {
  echo "T18 zsh gate extended when ~/.zshrc exists"
  local h; h="$(new_home)"; printf 'case $TERM in\n  xterm-color|*-256color) color_prompt=yes;;\nesac\n' > "$h/.zshrc"
  run "$h" >/dev/null
  contains "$h/.zshrc" 'xterm-color|*-256color|*-direct)' || fail "zsh gate not extended"
}
test_no_gate_warns_and_skips() {
  echo "T12 unrecognized rc is warned about and left alone"
  local h; h="$(new_home)"; printf 'export FOO=bar\n' > "$h/.bashrc"
  local before; before="$(cksum "$h/.bashrc")"
  run "$h" >/dev/null 2>&1 || fail "non-zero exit on unrecognized rc"
  [ "$before" = "$(cksum "$h/.bashrc")" ] || fail "unrecognized rc modified"
}

# --- item 1: settings.json --------------------------------------------------
test_settings_adds_truecolor() {
  echo "T13 settings.json gains terminal.trueColor without losing keys"
  local h; h="$(new_home)"; mk_settings "$h" '{ "defaultProvider": "x", "packages": ["npm:a"] }'
  run "$h" >/dev/null
  node -e 'const j=require(process.argv[1]); if(j.terminal?.trueColor!==true||j.defaultProvider!=="x"||j.packages[0]!=="npm:a") process.exit(1)' "$h/.pi/agent/settings.json" || fail "settings merge wrong"
  [ -f "$h/.pi/agent/settings.json.pi-extensions.bak" ] || fail "settings backup missing"
}
test_settings_idempotent() {
  echo "T14 trueColor already true -> byte-identical, no backup"
  local h; h="$(new_home)"; mk_settings "$h" '{ "terminal": { "trueColor": true } }'
  local before; before="$(cksum "$h/.pi/agent/settings.json")"
  run "$h" >/dev/null
  [ "$before" = "$(cksum "$h/.pi/agent/settings.json")" ] || fail "rewrote converged settings"
  [ ! -f "$h/.pi/agent/settings.json.pi-extensions.bak" ] || fail "backup on no-op"
}
test_settings_preserves_siblings() {
  echo "T15 existing terminal subkeys preserved"
  local h; h="$(new_home)"; mk_settings "$h" '{ "terminal": { "showImages": false } }'
  run "$h" >/dev/null
  node -e 'const j=require(process.argv[1]); if(j.terminal.trueColor!==true||j.terminal.showImages!==false) process.exit(1)' "$h/.pi/agent/settings.json" || fail "terminal siblings lost"
}
test_settings_malformed_untouched() {
  echo "T16 malformed settings.json warned and untouched"
  local h; h="$(new_home)"; mkdir -p "$h/.pi/agent"; printf '{ not json\n' > "$h/.pi/agent/settings.json"
  local before; before="$(cksum "$h/.pi/agent/settings.json")"
  run "$h" >/dev/null 2>&1 || fail "non-zero exit on malformed settings"
  [ "$before" = "$(cksum "$h/.pi/agent/settings.json")" ] || fail "malformed settings modified"
}
test_revert_restores() {
  echo "T19 --revert restores backups"
  local h; h="$(new_home)"; fixture "$h"; mk_settings "$h" '{}'
  local before; before="$(cksum "$h/.tmux.conf")"
  run "$h" >/dev/null
  run "$h" --revert >/dev/null
  [ "$before" = "$(cksum "$h/.tmux.conf")" ] || fail "tmux.conf not restored"
}
test_skips_without_tmux() {
  echo "T8 no tmux on PATH -> tmux skipped, exit 0"
  local h; h="$(new_home)"; fixture "$h"
  local stub; stub="$(mktemp -d)"
  local c
  for c in bash sh env node awk sed grep cmp diff cp mv rm mkdir dirname readlink chmod cat tail mktemp printf stat cksum; do
    command -v "$c" >/dev/null 2>&1 && ln -sf "$(command -v "$c")" "$stub/$c"
  done
  env -u PI_CODING_AGENT_DIR HOME="$h" PATH="$stub" bash "$HOST_SETUP" >/dev/null 2>&1 || fail "did not exit 0 without tmux"
  contains "$h/.tmux.conf" 'tmux-256color' || fail "tmux.conf touched without tmux"
}

test_tf_existing_index_kept() {
  echo "T22 existing terminal-features[3] *:RGB + [4] hyperlinks -> no-op"
  local h; h="$(new_home)"
  printf 'set -s terminal-features[3] "*:RGB"\nset -s terminal-features[4] "xterm*:hyperlinks"\nset -g default-terminal "tmux-direct"\nset-environment -g COLORTERM truecolor\n' > "$h/.tmux.conf"
  local before; before="$(cksum "$h/.tmux.conf")"
  run "$h" >/dev/null
  [ "$before" = "$(cksum "$h/.tmux.conf")" ] || fail "changed an already-converged config"
  contains "$h/.tmux.conf" 'terminal-features[4] "xterm*:hyperlinks"' || fail "hyperlinks entry lost"
}
test_tf_duplicates_collapsed() {
  echo "T23 duplicate *:RGB entries collapse and --check flags them"
  local h; h="$(new_home)"
  printf 'set -s terminal-features[3] "*:RGB"\nset -s terminal-features[4] "*:RGB"\n' > "$h/.tmux.conf"
  if run "$h" --check >/dev/null 2>&1; then fail "--check passed with duplicates"; fi
  run "$h" >/dev/null
  [ "$(grep -cF '*:RGB' "$h/.tmux.conf")" -eq 1 ] || fail "duplicates not collapsed"
}
test_tf_lowest_free_index() {
  echo "T24 picks lowest free index >=3 when 3 is a non-RGB entry"
  local h; h="$(new_home)"
  printf 'set -s terminal-features[3] "xterm*:hyperlinks"\nset -as terminal-features ",*:RGB"\n' > "$h/.tmux.conf"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -s terminal-features[4] "*:RGB"' || fail "did not pick index 4"
  contains "$h/.tmux.conf" 'terminal-features[3] "xterm*:hyperlinks"' || fail "clobbered index 3"
}

test_tmux_preserves_inline_comment() {
  echo "T27 a canonical directive with a trailing inline comment is left byte-identical"
  local h; h="$(new_home)"
  printf 'set -g default-terminal "tmux-direct"   # truecolour passthrough\nset -s terminal-features[3] "*:RGB"            # and -as piled up copies\nset-environment -g COLORTERM truecolor  # env\n' > "$h/.tmux.conf"
  local before; before="$(cksum "$h/.tmux.conf")"
  run "$h" >/dev/null
  [ "$before" = "$(cksum "$h/.tmux.conf")" ] || fail "stripped an inline comment from a converged directive"
  run "$h" --check >/dev/null || fail "--check not converged for a commented canonical config"
}

# --- item 4: remote-pi relay glyph -----------------------------------------
test_glyph_patch() {
  echo "T20 relay glyph: check fails -> apply -> check passes -> revert"
  local h; h="$(new_home)"; mkdir -p "$h/rp/dist/ui"
  printf 'const K_RELAY = "remote-pi:relay";\nfunction render(state, ctx) {\n    if (state.relayOn) {\n        ctx.ui.setStatus(K_RELAY, state.hasPairings ? "\xf0\x9f\x9f\xa2 relay" : "\xf0\x9f\x9f\xa1 relay waiting for pairing");\n    } else {\n        ctx.ui.setStatus(K_RELAY, undefined);\n    }\n}\n' > "$h/rp/dist/ui/footer.js"
  local lib="$HERE/../lib/fix-remote-pi-glyph.sh" f="$h/rp/dist/ui/footer.js"
  if REMOTE_PI_FOOTER="$f" bash "$lib" --check >/dev/null 2>&1; then fail "--check passed unpatched"; fi
  REMOTE_PI_FOOTER="$f" bash "$lib" --apply >/dev/null || fail "apply failed"
  REMOTE_PI_FOOTER="$f" bash "$lib" --check >/dev/null || fail "--check failed patched"
  [ -f "$f.orig" ] || fail "no pristine .orig copy"
  contains "$f" 'pi-extensions-glyph-patch' || fail "marker not written"
  contains "$f" '38;2;166;227;161' || fail "truecolor green not written"
  node --check "$f" 2>/dev/null || fail "patched footer.js fails node --check"
  REMOTE_PI_FOOTER="$f" bash "$lib" --revert >/dev/null
  cmp -s "$f" "$f.orig" || fail "revert did not restore"
}
test_glyph_hard_fail() {
  echo "T25 relay glyph hard-fails when the upstream block is missing"
  local h; h="$(new_home)"; mkdir -p "$h/rp/dist/ui"; printf 'export const x = 1;\n' > "$h/rp/dist/ui/footer.js"
  if REMOTE_PI_FOOTER="$h/rp/dist/ui/footer.js" bash "$HERE/../lib/fix-remote-pi-glyph.sh" --apply >/dev/null 2>&1; then fail "apply did not hard-fail on a missing block"; fi
}
test_glyph_foreign_marker() {
  echo "T26 a footer already hand-patched with the peer marker (real shape) is a no-op"
  local h; h="$(new_home)"; mkdir -p "$h/rp/dist/ui"
  printf 'const K_RELAY = "remote-pi:relay";\nfunction render(state, ctx) {\n    if (state.relayOn) {\n        // LOCAL PATCH (2026-10-04) \xe2\x80\x94 re-apply after a package update with:\n        //   ~/.pi/agent/bin/fix-remote-pi-glyph.sh\n        const GREEN = "\\u001b[38;2;166;227;161m";\n        const AMBER = "\\u001b[38;2;249;226;175m";\n        const RESET = "\\u001b[0m";\n        const dot = state.hasPairings ? `${GREEN}\xe2\x97\x8f${RESET}` : `${AMBER}\xe2\x97\x8f${RESET}`;\n        ctx.ui.setStatus(K_RELAY, `${dot} relay`); // \xe2\x97\x8f\n    }\n}\n' > "$h/rp/dist/ui/footer.js"
  local before; before="$(cksum "$h/rp/dist/ui/footer.js")"
  REMOTE_PI_FOOTER="$h/rp/dist/ui/footer.js" bash "$HERE/../lib/fix-remote-pi-glyph.sh" --apply >/dev/null || fail "apply failed"
  [ "$before" = "$(cksum "$h/rp/dist/ui/footer.js")" ] || fail "double-patched a hand-patched footer"
  REMOTE_PI_FOOTER="$h/rp/dist/ui/footer.js" bash "$HERE/../lib/fix-remote-pi-glyph.sh" --check >/dev/null || fail "--check not OK on hand-patched footer"
}
test_diag_runs() {
  echo "T21 check-pi-color diagnostic runs and exits 0"
  bash "$HERE/../lib/check-pi-color.sh" >/dev/null 2>&1 || fail "diagnostic exited non-zero"
}
test_diag_agrees_on_foreign_marker() {
  echo "T28 diagnostic agrees with the patch script on a foreign-marker footer"
  local h; h="$(new_home)"; mkdir -p "$h/.local/share/pi-node/x/node_modules/remote-pi/dist/ui"
  local f="$h/.local/share/pi-node/x/node_modules/remote-pi/dist/ui/footer.js"
  printf 'if (state.relayOn) {\n  // LOCAL PATCH (2026-10-04) \xe2\x80\x94 x\n  ctx.ui.setStatus(K_RELAY, "\\u001b[38;2;1m\xe2\x97\x8f\\u001b[0m relay");\n}\n' > "$f"
  local out; out="$(HOME="$h" REMOTE_PI_FOOTER="$f" bash "$HERE/../lib/check-pi-color.sh" 2>&1)"
  echo "$out" | grep -q 'relay glyph: patched' || fail "diagnostic disagreed with a patched footer"
  if echo "$out" | grep -q 'NOT patched'; then fail "diagnostic reported drift for a patched footer"; fi
}

test_glyph_patch
test_glyph_hard_fail
test_glyph_foreign_marker
test_diag_runs
test_diag_agrees_on_foreign_marker
test_tf_existing_index_kept
test_tf_duplicates_collapsed
test_tf_lowest_free_index
test_tmux_preserves_inline_comment
test_default_terminal_replaced
test_rgb_and_colorterm
test_conflicting_value_replaced
test_creates_when_absent
test_idempotent_tmux
test_dry_run_inert
test_check_mode
test_preserves_mode
test_xdg_target
test_bash_gate_extended
test_zsh_gate_extended
test_no_gate_warns_and_skips
test_settings_adds_truecolor
test_settings_idempotent
test_settings_preserves_siblings
test_settings_malformed_untouched
test_revert_restores
test_skips_without_tmux

if [ "$FAILS" -eq 0 ]; then
  echo "PASS (host-setup)"
else
  echo "$FAILS check(s) failed"
  exit 1
fi
