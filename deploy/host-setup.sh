#!/usr/bin/env bash
# host-setup.sh — converge the invoking user's terminal environment for full 24-bit colour.
#
# Part of the assid2/pi-extensions stack. apply.sh converges the *packages*; this script
# converges the *host* pieces those packages need but cannot express as packages. It is
# idempotent, backs up every file it touches (<file>.pi-extensions.bak), never uses sudo,
# never writes /etc, and never kills a tmux server or restarts pi.
#
# Usage: host-setup.sh [--dry-run | --check | --apply | --revert]
#   (no flag)   apply: converge every target
#   --dry-run   print the per-file plan (diff); change nothing
#   --check     exit non-zero unless every target is already converged
#   --revert    restore every target from its .pi-extensions.bak (if present)
#
# Owns:
#   1. ${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json   terminal.trueColor = true
#   2. tmux config   default-terminal "tmux-direct", terminal-features *:RGB, COLORTERM
#   3. shell rc (~/.bashrc, ~/.zshrc)   colour gate accepts *-direct
#   4. remote-pi footer glyph   delegated to lib/fix-remote-pi-glyph.sh
#   5. colour diagnostic        delegated to lib/check-pi-color.sh
#
# tmux reads its config once at server start and default-terminal is fixed at session
# creation: the change lands on NEW sessions, never by killing the server.

set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

MODE="apply"
CONVERGED=1

usage() {
  sed -n '2,18p' "$SCRIPT_PATH" | sed 's/^# \{0,1\}//'
}

case "${1:-}" in
  --dry-run) MODE="dry-run" ;;
  --check)   MODE="check" ;;
  --apply)   MODE="apply" ;;
  --revert)  MODE="revert" ;;
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) echo "host-setup: unknown option: $1 (expected --dry-run, --check, --apply, --revert)" >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { echo "host-setup: at most one option allowed" >&2; exit 2; }

HOME_DIR="${HOME:?HOME is not set}"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME_DIR/.pi/agent}"

say() { printf '  %s\n' "$*"; }

# ---------------------------------------------------------------- shared tail
finish_file() { # TARGET TMP LABEL
  local target="$1" tmp="$2" label="$3" orig="$1"
  [ -f "$target" ] || orig="/dev/null"
  if [ -f "$target" ] && cmp -s "$target" "$tmp"; then
    say "[OK]      $label"
    rm -f "$tmp"
    return 0
  fi
  case "$MODE" in
    dry-run)
      diff -u "$orig" "$tmp" | tail -n +3 | sed 's/^/    /' || true
      say "[PLAN]    $label"
      rm -f "$tmp"
      ;;
    check)
      say "[PENDING] $label"
      CONVERGED=0
      rm -f "$tmp"
      ;;
    apply)
      if [ -f "$target" ] && [ ! -f "$target.pi-extensions.bak" ]; then
        cp -p "$target" "$target.pi-extensions.bak"
      fi
      mkdir -p "$(dirname "$target")"
      [ -f "$target" ] && { chmod --reference="$target" "$tmp" 2>/dev/null || true; }
      mv "$tmp" "$target"
      say "[CHANGED] $label"
      ;;
  esac
}

converge_cmd() { # TARGET LABEL CMD...   (CMD reads stdin, writes desired content)
  local target="$1" label="$2"
  shift 2
  local dir tmp
  dir="$(dirname "$target")"
  mkdir -p "$dir"
  tmp="$(mktemp "$dir/.host-setup.XXXXXX")"
  if [ -f "$target" ]; then
    "$@" < "$target" > "$tmp"
  else
    "$@" < /dev/null > "$tmp"
  fi
  finish_file "$target" "$tmp" "$label"
}

revert_file() { # TARGET
  local t="$1"
  if [ -f "$t.pi-extensions.bak" ]; then
    cp -p "$t.pi-extensions.bak" "$t"
    say "[REVERTED] $t"
  else
    say "[SKIP]    $t (no backup)"
  fi
}

pick_tmux_conf() {
  local x="${XDG_CONFIG_HOME:-$HOME_DIR/.config}/tmux/tmux.conf"
  local f
  for f in "$HOME_DIR/.tmux.conf" "$x" "$HOME_DIR/.config/tmux/tmux.conf"; do
    [ -f "$f" ] && { printf '%s\n' "$f"; return; }
  done
  printf '%s\n' "$HOME_DIR/.tmux.conf"
}

# ---------------------------------------------------------------- transforms
# tmux: replace the three directives in place; append any that are absent.
TMUX_AWK='
BEGIN{dt=0;tf=0;ce=0;mk=0}
{
 if($0 ~ /pi-extensions: 24-bit truecolor/) mk=1
 if(!dt && $0 ~ /^[[:space:]]*(set|set-option)[[:space:]].*default-terminal([[:space:]]|$)/){print "set -g default-terminal \"tmux-direct\"";dt=1;next}
 if(!tf && $0 ~ /^[[:space:]]*(set|set-option)[[:space:]].*terminal-features.*RGB/){print "set -s terminal-features[3] \"*:RGB\"";tf=1;next}
 if(!ce && $0 ~ /^[[:space:]]*#?[[:space:]]*(set|set-option|set-environment|setenv)[[:space:]].*COLORTERM/){print "set-environment -g COLORTERM truecolor";ce=1;next}
 print
}
END{
 if(!dt||!tf||!ce){
   if(!mk) print "# pi-extensions: 24-bit truecolor"
   if(!dt) print "set -g default-terminal \"tmux-direct\""
   if(!tf) print "set -s terminal-features[3] \"*:RGB\""
   if(!ce) print "set-environment -g COLORTERM truecolor"
 }
}'

# shell rc: extend the stock Debian colour gate (BRE: | and ) are literal, \* is a literal *)
RC_SED='s/xterm-color|\*-256color)/xterm-color|*-256color|*-direct)/'

# settings.json: semantic merge, read from stdin, write to stdout.
SETTINGS_MERGE='
let s="";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (typeof j.terminal !== "object" || j.terminal === null || Array.isArray(j.terminal)) j.terminal = {};
  j.terminal.trueColor = true;
  process.stdout.write(JSON.stringify(j, null, 2) + "\n");
});
'

# ---------------------------------------------------------------- driver
converge_all() {
  # item 2 — tmux
  if command -v tmux >/dev/null 2>&1; then
    converge_cmd "$(pick_tmux_conf)" "$(pick_tmux_conf)" awk "$TMUX_AWK"
  else
    say "[SKIP]    tmux not installed"
  fi

  # item 3 — shell rc (bash and zsh, if present)
  local rc any=0
  for rc in "$HOME_DIR/.bashrc" "$HOME_DIR/.zshrc"; do
    [ -f "$rc" ] || continue
    any=1
    if grep -qF 'xterm-color|*-256color|*-direct)' "$rc"; then
      say "[OK]      $rc (colour gate already accepts *-direct)"
    elif grep -qF 'xterm-color|*-256color)' "$rc"; then
      converge_cmd "$rc" "$rc (colour gate)" sed "$RC_SED"
    else
      say "[WARN]    $rc: no stock colour gate (xterm-color|*-256color) — left unchanged"
    fi
  done
  [ "$any" = 1 ] || say "[SKIP]    no ~/.bashrc or ~/.zshrc"

  # item 1 — pi settings
  local settings="$AGENT_DIR/settings.json"
  if [ ! -f "$settings" ]; then
    say "[SKIP]    $settings not found"
  elif ! node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' < "$settings" 2>/dev/null; then
    say "[WARN]    $settings is not valid JSON — left unchanged"
  elif [ "$(node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(j.terminal&&j.terminal.trueColor===true))' < "$settings")" = "true" ]; then
    say "[OK]      $settings: terminal.trueColor already true"
  else
    converge_cmd "$settings" "$settings: set terminal.trueColor=true" node -e "$SETTINGS_MERGE"
  fi

  # items 4-5 — delegated stages
  local lib
  for lib in fix-remote-pi-glyph check-pi-color; do
    if [ -x "$SCRIPT_DIR/lib/$lib.sh" ]; then
      if ! "$SCRIPT_DIR/lib/$lib.sh" "--$MODE"; then
        [ "$MODE" = "check" ] && CONVERGED=0
      fi
    fi
  done
}

revert_all() {
  revert_file "$(pick_tmux_conf)"
  local rc
  for rc in "$HOME_DIR/.bashrc" "$HOME_DIR/.zshrc"; do
    [ -f "$rc" ] && revert_file "$rc"
  done
  revert_file "$AGENT_DIR/settings.json"
  local lib
  for lib in fix-remote-pi-glyph check-pi-color; do
    if [ -x "$SCRIPT_DIR/lib/$lib.sh" ]; then
      "$SCRIPT_DIR/lib/$lib.sh" --revert || true
    fi
  done
}

if [ "$MODE" = "revert" ]; then
  echo "pi-extensions host-setup: revert"
  revert_all
  exit 0
fi

echo "pi-extensions host-setup: $MODE"
converge_all

if [ "$MODE" = "check" ]; then
  if [ "$CONVERGED" = 1 ]; then
    echo "converged: host terminal setup is complete"
    exit 0
  fi
  echo "NOT converged — run host-setup.sh (or the deploy skill) to fix" >&2
  exit 1
fi

if [ "$MODE" = "apply" ]; then
  echo
  echo "note: tmux fixes apply to NEW sessions only (default-terminal and COLORTERM are read"
  echo "      at pane creation). Start a new tmux session; do not kill the server."
fi
