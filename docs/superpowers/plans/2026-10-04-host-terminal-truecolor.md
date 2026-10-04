# Host Terminal Truecolor Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `deploy/host-setup.sh`, an idempotent in-place converger that gives every machine running the pi-extensions stack 24-bit terminal color — tmux `tmux-direct` + RGB passthrough + `COLORTERM`, a `*-direct` bash prompt gate, and pi's own `terminal.trueColor = true` — wire it into the `deploy-pi-stack` skill, and apply it to the dev machine so a tmux/pi restart lands in a working state.

**Architecture:** One self-locating bash script reads each target config, computes the desired content, and rewrites the file atomically **only if it differs** (that comparison is what makes it idempotent). Dotfiles use a text transform; `settings.json` uses a semantic JSON merge. `apply.sh` stays untouched and packages-only; the skill invokes `host-setup.sh` as an announced step after `apply.sh`.

**Tech Stack:** Bash, GNU coreutils (`mktemp`, `cmp`, `diff`, `cp -p`), `awk`/`sed`, `node` (JSON merge), tmux 3.5a with the stock ncurses `tmux-direct` entry, `~/.tmux.conf`, `~/.bashrc`, and `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json`.

**Spec:** `docs/superpowers/specs/2026-10-04-host-terminal-truecolor-design.md`

## Global Constraints

- Never use `sudo`; never write `/etc` or any path outside the two targets below.
- Exact canonical tmux lines:
  - `set -g default-terminal "tmux-direct"`
  - `set -s terminal-features[3] "*:RGB"`
  - `set-environment -g COLORTERM truecolor`
- Bash gate: on the line that sets `color_prompt=yes`, replace the token `*-256color)` with `*-256color|*-direct)`. Touch no other `case "$TERM"` block.
- Marker before any appended tmux lines: `# pi-extensions: 24-bit truecolor`.
- tmux target = **first existing** of `$HOME/.tmux.conf`, `${XDG_CONFIG_HOME:-$HOME/.config}/tmux/tmux.conf`, `$HOME/.config/tmux/tmux.conf`; if none exist, `$HOME/.tmux.conf` — only when `tmux` is on `PATH`. Never `/etc/tmux.conf`.
- Bash target = `$HOME/.bashrc`.
- pi settings target = `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json`. Set `terminal.trueColor` to the boolean `true`, preserve every other key, re-serialize with `JSON.stringify(obj, null, 2) + "\n"`, and skip the write when the value is already `true` (semantic idempotence). Malformed JSON → warn and leave unchanged.
- Backup is `<file>.pi-extensions.bak`, created once and only if absent. Writes are atomic (temp file in the same directory, then `mv`); the file's mode is preserved.
- No bash gate found → warn and skip (not an error). No tmux → skip tmux, exit 0.
- `deployment.json` is unchanged; the script ships inside the repo tag.
- Flag contract: default = apply; `--dry-run` changes nothing and exits 0; `--check` exits 1 when any target is not converged; `-h`/`--help` prints usage; unknown flag exits 2.

## Review Focus

The spec implies these conditions that no single happy-path test covers; each is pinned to a task below.

1. tmux config living at an XDG path (`~/.config/tmux/tmux.conf`) — must edit the file tmux actually reads, not blindly `~/.tmux.conf`. (Task 1)
2. `$XDG_CONFIG_HOME` set vs unset — the two XDG candidates can resolve to the same path; must not edit twice. (Task 1)
3. File mode preserved through the atomic rewrite (e.g. a `0600` tmux config stays `0600`). (Task 1)
4. A shell rc with no stock Debian gate — must warn and leave it alone, not corrupt or hang. (Task 3)
5. Re-running after a manual partial edit — must stay idempotent and must not clobber the first backup. (Tasks 1–3)
6. A `settings.json` whose `terminal` key is absent, a non-object, or the file malformed — the merge must preserve all other keys, and malformed JSON must be left untouched. (Task 4)

---

### Task 1: Script skeleton, target/mode machinery, and `default-terminal`

**Files:**
- Create: `deploy/host-setup.sh`
- Test: `deploy/tests/host-setup.test.sh`

**Interfaces:**
- Produces: `deploy/host-setup.sh` — `host-setup.sh [--dry-run | --check | -h]`; exit 0 on success/converged, 1 on not-converged (`--check`) or I/O error, 2 on usage error.
- Produces (test): `new_home()`, `run <home> [args…]`, `contains <file> <string>`, and a `FAILS` counter that the script exits non-zero on.
- Produces (script internals to be used by Tasks 2–4): `converge <target> <transform-cmd> <label>` where `<transform-cmd>` reads the current file on stdin and writes desired content on stdout, and its reusable tail `finish_file <target> <tmp> <label>` (compare / diff / backup / atomic write / status report).

- [ ] **Step 1: Write the failing test harness and the first tests**

Create `deploy/tests/host-setup.test.sh`:

```bash
#!/usr/bin/env bash
# host-setup.test.sh — exercises deploy/host-setup.sh in scratch HOMEs.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SETUP="$HERE/../host-setup.sh"
FAILS=0

fail() { echo "  FAIL: $*" >&2; FAILS=$((FAILS + 1)); }
new_home() { mktemp -d "${TMPDIR:-/tmp}/host-setup-test.XXXXXX"; }
run() { env -u PI_CODING_AGENT_DIR HOME="$1" bash "$HOST_SETUP" "${@:2}"; }
contains() { grep -qF -- "$2" "$1"; }
fixture() {  # $1=home
  printf 'set -g default-terminal "tmux-256color"\nset -g status on\n' > "$1/.tmux.conf"
  printf 'case "$TERM" in\n    xterm-color|*-256color) color_prompt=yes;;\nesac\n' > "$1/.bashrc"
}

test_default_terminal_replaced() {
  echo "T1 default-terminal replaced in place, backup made, other lines kept"
  local h; h="$(new_home)"; fixture "$h"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -g default-terminal "tmux-direct"' || fail "default-terminal not set"
  contains "$h/.tmux.conf" 'set -g status on' || fail "unrelated line lost"
  [ -f "$h/.tmux.conf.pi-extensions.bak" ] || fail "backup missing"
}

test_conflicting_value_replaced() {
  echo "T9 conflicting default-terminal value is replaced"
  local h; h="$(new_home)"
  printf 'set -g default-terminal "screen"\n' > "$h/.tmux.conf"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -g default-terminal "tmux-direct"' || fail "conflicting value not replaced"
}

test_creates_when_absent() {
  echo "T7 creates ~/.tmux.conf when no tmux config exists"
  local h; h="$(new_home)"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -g default-terminal "tmux-direct"' || fail "config not created"
}

test_dry_run_inert() {
  echo "T4 --dry-run changes nothing"
  local h; h="$(new_home)"; fixture "$h"
  local before; before="$(cksum "$h/.tmux.conf")"
  run "$h" --dry-run >/dev/null
  [ "$before" = "$(cksum "$h/.tmux.conf")" ] || fail "dry-run modified the file"
  [ ! -f "$h/.tmux.conf.pi-extensions.bak" ] || fail "dry-run created a backup"
}

test_check_mode() {
  echo "T5 --check fails before, passes after"
  local h; h="$(new_home)"; fixture "$h"
  if run "$h" --check >/dev/null; then fail "--check passed on unconverged target"; fi
  run "$h" >/dev/null
  run "$h" --check >/dev/null || fail "--check failed on converged target"
}

test_idempotent() {
  echo "T3 second run is a byte-for-byte no-op"
  local h; h="$(new_home)"; fixture "$h"
  run "$h" >/dev/null
  local after; after="$(cksum "$h/.tmux.conf")"
  run "$h" >/dev/null
  [ "$after" = "$(cksum "$h/.tmux.conf")" ] || fail "second run changed the file"
}

test_preserves_mode() {
  echo "T3 mode 0600 preserved through rewrite"
  local h; h="$(new_home)"; fixture "$h"
  chmod 600 "$h/.tmux.conf"
  run "$h" >/dev/null
  [ "$(stat -c %a "$h/.tmux.conf")" = "600" ] || fail "mode not preserved"
}

test_skips_without_tmux() {
  echo "T8 no tmux on PATH -> skip, exit 0, file untouched"
  local h; h="$(new_home)"; fixture "$h"
  local before; before="$(cksum "$h/.tmux.conf")"
  local empty; empty="$(mktemp -d)"
  HOME="$h" PATH="$empty" bash "$HOST_SETUP" >/dev/null || fail "did not exit 0 without tmux"
  [ "$before" = "$(cksum "$h/.tmux.conf")" ] || fail "file changed without tmux"
}

test_xdg_target() {
  echo "T1 XDG config path is used when ~/.tmux.conf is absent"
  local h; h="$(new_home)"; mkdir -p "$h/.config/tmux"
  printf 'set -g default-terminal "tmux-256color"\n' > "$h/.config/tmux/tmux.conf"
  run "$h" >/dev/null
  contains "$h/.config/tmux/tmux.conf" 'set -g default-terminal "tmux-direct"' || fail "XDG config not edited"
  [ ! -e "$h/.tmux.conf" ] || fail "created ~/.tmux.conf despite existing XDG config"
}

test_default_terminal_replaced
test_conflicting_value_replaced
test_creates_when_absent
test_dry_run_inert
test_check_mode
test_idempotent
test_preserves_mode
test_skips_without_tmux
test_xdg_target

if [ "$FAILS" -eq 0 ]; then echo "PASS (host-setup)"; else echo "$FAILS check(s) failed"; exit 1; fi
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash deploy/tests/host-setup.test.sh`
Expected: FAIL — `deploy/host-setup.sh` does not exist.

- [ ] **Step 3: Implement the script**

Create `deploy/host-setup.sh` (executable). Approach:

1. `set -euo pipefail`; self-locate via `SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"`.
2. Parse one mode argument: `--dry-run`, `--check`, `-h`/`--help`; unknown → usage on stderr, exit 2.
3. `HOME="${HOME:?HOME is not set}"`; `RC=0`.
4. Define `converge TARGET TRANSFORM LABEL`:
   - `dir="$(dirname "$TARGET")"`; `mkdir -p "$dir"` when creating.
   - `tmp="$(mktemp "$dir/.host-setup.XXXXXX")"`.
   - `if [ -f "$TARGET" ]; then $TRANSFORM < "$TARGET" > "$tmp"; else $TRANSFORM < /dev/null > "$tmp"; fi`.
   - `if [ -f "$TARGET" ] && cmp -s "$TARGET" "$tmp"; then echo "  [OK]      $LABEL"; rm -f "$tmp"; return 0; fi`.
   - Print `diff -u` of original (or `/dev/null`) vs `$tmp`, keeping only `+`/`-` lines.
   - `dry-run`: echo `  [PLAN]    $LABEL (dry-run: no changes made)`; `rm -f "$tmp"`.
   - `check`: echo `  [PENDING] $LABEL`; `rc=1` (use a global `CONVERGED=0`); `rm -f "$tmp"`.
   - apply: `[ -f "$TARGET" ] && [ ! -f "$TARGET.pi-extensions.bak" ] && cp -p "$TARGET" "$TARGET.pi-extensions.bak"`; `if [ -f "$TARGET" ]; then chmod --reference="$TARGET" "$tmp" 2>/dev/null || true; fi`; `mv "$tmp" "$TARGET"`; echo `  [CHANGED] $LABEL`.
   - Put the compare/diff/backup/write/report tail in a separate `finish_file TARGET TMP LABEL` function; `converge` produces `TMP` and calls it. Task 4's settings merge reuses `finish_file`.
5. Resolve the tmux target: `command -v tmux` else `echo "  [SKIP]    tmux not installed"`; else first existing among the three candidates, deduping the two XDG paths (`[ "$a" = "$b" ]`), falling back to `$HOME/.tmux.conf`.
6. Transform (awk, all three directives; Task 1 only needs `default-terminal` but write the full program now — Task 2 adds assertions, not code):

```awk
BEGIN { dt=0; tf=0; ce=0 }
{
  if (!dt && $0 ~ /^[ \t]*(set|set-option)[ \t].*default-terminal([ \t]|$)/) { print "set -g default-terminal \"tmux-direct\""; dt=1; next }
  if (!tf && $0 ~ /^[ \t]*(set|set-option)[ \t].*terminal-features.*RGB/)        { print "set -s terminal-features[3] \"*:RGB\""; tf=1; next }
  if (!ce && $0 ~ /^[ \t]*(set-environment|setenv)[ \t].*COLORTERM/)             { print "set-environment -g COLORTERM truecolor"; ce=1; next }
  print
}
END {
  if (!dt || !tf || !ce) {
    print "# pi-extensions: 24-bit truecolor"
    if (!dt) print "set -g default-terminal \"tmux-direct\""
    if (!tf) print "set -s terminal-features[3] \"*:RGB\""
    if (!ce) print "set-environment -g COLORTERM truecolor"
  }
}
```

   Call `converge "$tmux_target" 'awk PROGRAM' "$tmux_target"`. The comparison against the original is what makes the canonical lines (which match their own patterns and are re-printed identically) a no-op on the second run.
7. After both targets, print the latch caveat: tmux reads its config once at server start and `default-terminal` is fixed at session creation, so already-running sessions keep their old `TERM`; a new session is required.
8. Exit: apply → 0; dry-run → 0; check → `CONVERGED`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash deploy/tests/host-setup.test.sh`
Expected: `PASS (host-setup)`.

- [ ] **Step 5: Commit**

```bash
chmod +x deploy/host-setup.sh
git add deploy/host-setup.sh deploy/tests/host-setup.test.sh
git commit -m "feat(host-setup): converge tmux default-terminal to tmux-direct"
```

---

### Task 2: `terminal-features[3] "*:RGB"` and `COLORTERM`

The transform in Task 1 Step 6 already emits these; this task proves them and covers the legacy append line.

**Files:**
- Modify: `deploy/tests/host-setup.test.sh`

**Interfaces:**
- Consumes: `converge`, `test_*` harness from Task 1.

- [ ] **Step 1: Add failing/again-red tests for the two directives**

Add before the runner block:

```bash
test_rgb_and_colorterm() {
  echo "T2 terminal-features[3] and COLORTERM converge"
  local h; h="$(new_home)"
  printf 'set -as terminal-features ",*:RGB"\n' > "$h/.tmux.conf"
  run "$h" >/dev/null
  contains "$h/.tmux.conf" 'set -s terminal-features[3] "*:RGB"' || fail "indexed RGB missing"
  contains "$h/.tmux.conf" 'set-environment -g COLORTERM truecolor' || fail "COLORTERM missing"
  if grep -qF 'set -as terminal-features' "$h/.tmux.conf"; then fail "legacy append line not replaced"; fi
}

test_rgb_idempotent() {
  echo "T2 re-run does not grow terminal-features"
  local h; h="$(new_home)"; printf 'set -as terminal-features ",*:RGB"\n' > "$h/.tmux.conf"
  run "$h" >/dev/null; run "$h" >/dev/null
  [ "$(grep -cF 'terminal-features' "$h/.tmux.conf")" -eq 1 ] || fail "terminal-features duplicated"
}

test_rgb_and_colorterm
test_rgb_idempotent
```

- [ ] **Step 2: Run to verify they pass**

Run: `bash deploy/tests/host-setup.test.sh`
Expected: `PASS (host-setup)`. (They were red before Task 1 Step 6 existed; if any fail now the transform is wrong — fix the awk program.)

- [ ] **Step 3: Commit**

```bash
git add deploy/tests/host-setup.test.sh
git commit -m "test(host-setup): pin RGB passthrough and COLORTERM convergence"
```

---

### Task 3: Bash prompt gate

**Files:**
- Modify: `deploy/host-setup.sh`
- Modify: `deploy/tests/host-setup.test.sh`

**Interfaces:**
- Consumes: `converge`.
- Produces: the script now also handles `$HOME/.bashrc`.

- [ ] **Step 1: Add failing tests**

```bash
test_bash_gate_extended() {
  echo "T6 color gate accepts *-direct"
  local h; h="$(new_home)"; fixture "$h"
  run "$h" >/dev/null
  contains "$h/.bashrc" 'xterm-color|*-256color|*-direct) color_prompt=yes;;' || fail "gate not extended"
}

test_bash_gate_idempotent() {
  echo "T6 gate not double-extended"
  local h; h="$(new_home)"; fixture "$h"
  run "$h" >/dev/null; run "$h" >/dev/null
  [ "$(grep -cF '*-direct)' "$h/.bashrc")" -eq 1 ] || fail "gate duplicated"
}

test_bash_no_gate_warns_and_skips() {
  echo "T4 (Review Focus) unrecognized rc warns and is left alone"
  local h; h="$(new_home)"
  printf 'export FOO=bar\n' > "$h/.bashrc"
  local before; before="$(cksum "$h/.bashrc")"
  run "$h" >/dev/null 2>&1 || fail "non-zero exit on unrecognized rc"
  [ "$before" = "$(cksum "$h/.bashrc")" ] || fail "unrecognized rc was modified"
}

test_bash_gate_extended
test_bash_gate_idempotent
test_bash_no_gate_warns_and_skips
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash deploy/tests/host-setup.test.sh`
Expected: FAIL on `gate not extended`; the warn-and-skip test passes only once the warning path exists (before that the file may be appended to).

- [ ] **Step 3: Implement the bash transform and wire it in**

In `deploy/host-setup.sh`, after the tmux block, when `[ -f "$HOME/.bashrc" ]`:

- If `grep -q 'color_prompt=yes' "$HOME/.bashrc"`, call
  `converge "$HOME/.bashrc" 'sed -E /color_prompt=yes/s/\*-256color\)/*-256color|*-direct)/' "$HOME/.bashrc"`.
  The `sed` address restricts the substitution to the `color_prompt` line; because the extended token is `*-256color|…` (no closing `)` right after `256color`), the pattern no longer matches, so a converged line is a no-op.
- Else print `  [WARN]    ~/.bashrc: no color_prompt gate found — left unchanged` and do not treat it as an error.
- If `$HOME/.bashrc` is absent, print `  [SKIP]    ~/.bashrc not found`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash deploy/tests/host-setup.test.sh`
Expected: `PASS (host-setup)`.

- [ ] **Step 5: Commit**

```bash
git add deploy/host-setup.sh deploy/tests/host-setup.test.sh
git commit -m "feat(host-setup): extend bash color gate to *-direct"
```

---

### Task 4: pi `settings.json` — `terminal.trueColor`

**Files:**
- Modify: `deploy/host-setup.sh`
- Modify: `deploy/tests/host-setup.test.sh`

**Interfaces:**
- Consumes: `finish_file <target> <tmp> <label>` from Task 1.
- Produces: global-settings convergence; tests T10–T14.

- [ ] **Step 1: Add the failing tests**

Add before the runner block:

```bash
mk_settings() { mkdir -p "$1/.pi/agent"; printf '%s\n' "$2" > "$1/.pi/agent/settings.json"; }

test_settings_adds_truecolor() {
  echo "T10 settings.json gains terminal.trueColor without losing keys"
  local h; h="$(new_home)"
  mk_settings "$h" '{ "defaultProvider": "x", "packages": ["npm:a"] }'
  run "$h" >/dev/null
  node -e 'const j=require(process.argv[1]); if(j.terminal?.trueColor!==true||j.defaultProvider!=="x"||j.packages[0]!=="npm:a") process.exit(1)' "$h/.pi/agent/settings.json" || fail "settings merge wrong"
  [ -f "$h/.pi/agent/settings.json.pi-extensions.bak" ] || fail "settings backup missing"
}

test_settings_idempotent() {
  echo "T11 trueColor already true -> byte-identical, no backup"
  local h; h="$(new_home)"
  mk_settings "$h" '{ "terminal": { "trueColor": true } }'
  local before; before="$(cksum "$h/.pi/agent/settings.json")"
  run "$h" >/dev/null
  [ "$before" = "$(cksum "$h/.pi/agent/settings.json")" ] || fail "rewrote converged settings"
  [ ! -f "$h/.pi/agent/settings.json.pi-extensions.bak" ] || fail "backup created on no-op"
}

test_settings_preserves_terminal_siblings() {
  echo "T12 existing terminal subkeys preserved"
  local h; h="$(new_home)"
  mk_settings "$h" '{ "terminal": { "showImages": false } }'
  run "$h" >/dev/null
  node -e 'const j=require(process.argv[1]); if(j.terminal.trueColor!==true||j.terminal.showImages!==false) process.exit(1)' "$h/.pi/agent/settings.json" || fail "terminal siblings lost"
}

test_settings_malformed_untouched() {
  echo "T13 malformed settings.json warned and untouched"
  local h; h="$(new_home)"; mkdir -p "$h/.pi/agent"; printf '{ not json\n' > "$h/.pi/agent/settings.json"
  local before; before="$(cksum "$h/.pi/agent/settings.json")"
  run "$h" >/dev/null 2>&1 || fail "non-zero exit on malformed settings"
  [ "$before" = "$(cksum "$h/.pi/agent/settings.json")" ] || fail "malformed settings modified"
}

test_settings_check() {
  echo "T14 --check covers settings.json"
  local h; h="$(new_home)"; mk_settings "$h" '{}'
  if run "$h" --check >/dev/null; then fail "--check passed without trueColor"; fi
  run "$h" >/dev/null
  run "$h" --check >/dev/null || fail "--check failed with trueColor"
}

test_settings_adds_truecolor
test_settings_idempotent
test_settings_preserves_terminal_siblings
test_settings_malformed_untouched
test_settings_check
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash deploy/tests/host-setup.test.sh`
Expected: FAIL on T10 (`settings merge wrong`).

- [ ] **Step 3: Implement `converge_settings`**

Add to `deploy/host-setup.sh` a `converge_settings TARGET` that:

1. `[ -f "$TARGET" ] || { echo "  [SKIP]    $TARGET not found"; return 0; }`.
2. If `node -e 'JSON.parse(fs.readFileSync(process.argv[1],"utf8"))' "$TARGET"` fails, echo
   `  [WARN]    $TARGET is not valid JSON — left unchanged` and return 0.
3. If it parses and already yields `terminal.trueColor === true`, echo
   `  [OK]      $TARGET: terminal.trueColor already true` and return 0 (no write, no backup).
4. Otherwise write the merged JSON to `tmp="$(mktemp "$(dirname "$TARGET")/.host-setup.XXXXXX")"` with:

```bash
node -e '
const fs=require("fs"), p=process.argv[1];
const j=JSON.parse(fs.readFileSync(p,"utf8"));
if(typeof j.terminal!=="object"||j.terminal===null||Array.isArray(j.terminal)) j.terminal={};
j.terminal.trueColor=true;
process.stdout.write(JSON.stringify(j,null,2)+"\n");
' "$TARGET" > "$tmp"
```

   then call `finish_file "$TARGET" "$tmp" "$TARGET: set terminal.trueColor=true"`.

Call it from the driver after the tmux and bash targets, with
`target="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"`. Because `finish_file` reuses the
mode handling, `--dry-run` prints a diff, `--check` marks the run pending, and apply backs up once
and replaces atomically.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash deploy/tests/host-setup.test.sh`
Expected: `PASS (host-setup)`.

- [ ] **Step 5: Commit**

```bash
git add deploy/host-setup.sh deploy/tests/host-setup.test.sh
git commit -m "feat(host-setup): pin pi terminal.trueColor in settings.json"
```

---

### Task 5: Wire into the deploy skill and docs

**Files:**
- Modify: `deploy/skills/deploy-pi-stack/SKILL.md`
- Modify: `deploy/skills/deploy-pi-stack/reference.md`
- Modify: `README.md`
- Modify (local only, currently untracked): `dev/setup-dev.sh`

- [ ] **Step 1: SKILL.md — insert a host-setup step after the apply step, renumber the report step**

After the existing "## Procedure" step 5 (Apply), insert:

```markdown
6. **Converge the host terminal (24-bit color).** Run `<clone>/deploy/host-setup.sh --dry-run` and
   show its output, then run `<clone>/deploy/host-setup.sh` and relay the result. It edits the
   invoking user's tmux config and `~/.bashrc` **in place** and merges `terminal.trueColor: true`
   into the global `settings.json` (a `.pi-extensions.bak` backup is made once per file). It never
   uses sudo and never writes `/etc`. Always tell the user that already-running tmux sessions keep
   their old `TERM` — a **new** session (or a tmux server restart) is required for `tmux-direct`
   and `COLORTERM` to take effect.
```

Renumber the current step 6 ("Report") to 7. Keep its text.

- [ ] **Step 2: reference.md — add a "Host terminal setup" section**

Document: what host-setup converges (the three tmux directives, the bash gate, and the global
`settings.json` `terminal.trueColor` key), that it is per-user and never `/etc`, the
`.pi-extensions.bak` backup, `--dry-run`/`--check`, the warn-and-skip behavior for an unrecognized
bash rc or malformed settings JSON, and the latch caveat.

- [ ] **Step 3: README.md — add `deploy/host-setup.sh` to the Contents table and to "What it does — and what it never does"**

The new paragraph must keep the distinction precise: `apply.sh` still converges only through pi's
CLI and touches only the `packages` key; `host-setup.sh` is the separate, in-place dotfile step
with backup and `--check`/`--dry-run`.

- [ ] **Step 4: dev/setup-dev.sh — invoke it for dev parity**

Add `"$ROOT/deploy/host-setup.sh"` alongside the existing `"$ROOT/deploy/apply.sh"` call. Note:
`dev/` is currently untracked in git, so do **not** stage this file — it is a local-machine parity
edit only.

- [ ] **Step 5: Commit the tracked docs**

```bash
git add deploy/skills/deploy-pi-stack/SKILL.md deploy/skills/deploy-pi-stack/reference.md README.md
git commit -m "docs: document host terminal truecolor setup in the deploy skill"
```

- [ ] **Step 6: Verify the skill's referenced path exists and is executable**

Run: `test -x deploy/host-setup.sh && grep -n 'host-setup.sh' deploy/skills/deploy-pi-stack/SKILL.md`
Expected: exit 0 with the two new step-6 lines.

---

### Task 6: Apply on this machine and verify a fresh session

**Files:** none (execution + verification).

- [ ] **Step 1: Full test suite green**

Run: `bash deploy/tests/host-setup.test.sh`
Expected: `PASS (host-setup)`.

- [ ] **Step 2: Show the plan, then apply**

```bash
deploy/host-setup.sh --dry-run      # expect [CHANGED]/[PLAN] for ~/.tmux.conf (three directives), ~/.bashrc (gate), and ~/.pi/agent/settings.json (terminal.trueColor)
deploy/host-setup.sh                # apply
deploy/host-setup.sh --check        # expect exit 0
```

Capture the diff in the report. Confirm `~/.tmux.conf.pi-extensions.bak` and
`~/.bashrc.pi-extensions.bak` now exist.

- [ ] **Step 3: Verify the tmux effect in a fresh, isolated session against the real HOME**

```bash
SOCK=host-setup-verify
tmux -L "$SOCK" kill-server 2>/dev/null || true
tmux -L "$SOCK" new-session -d 'printf "%s %s\n" "$TERM" "$COLORTERM" > '"$HOME"'/.host-setup-term; sleep 1'
sleep 0.5
cat "$HOME/.host-setup-term"          # expect: tmux-direct truecolor
tmux -L "$SOCK" show -s terminal-features | grep -F 'terminal-features[3] *:RGB'
tmux -L "$SOCK" kill-server
rm -f "$HOME/.host-setup-term"
```

Expected: `tmux-direct truecolor` and a single indexed `*:RGB`.

- [ ] **Step 4: Verify the bash prompt**

Run: `TERM=tmux-direct bash -ic 'echo "$PS1"'`
Expected: the escape-decorated colored PS1 (contains `\033[01;32m` / `[01;32m`), not the plain `\u@\h:\w\$`.

- [ ] **Step 5: Verify the pi setting**

Run: `node -e 'const j=require(process.argv[1]); console.log("terminal.trueColor =", j.terminal?.trueColor)' "$HOME/.pi/agent/settings.json"`
Expected: `terminal.trueColor = true`, with the other top-level keys unchanged from before.

- [ ] **Step 6: Tell the user the restart boundary**

State plainly: the live tmux server's existing sessions still run `TERM=tmux-256color`; the
change is live for **new** sessions, and `pi` inside a new session will see `COLORTERM=truecolor`.

- [ ] **Step 7: Commit any remaining tracked changes and report status**

Run: `git status --porcelain` and `git log --oneline -5`
Expected: only the intended commits above; `deploy/host-setup.sh` and its test are tracked and
committed; `dev/` remains untracked as before.

---

## Self-Review

- **Spec coverage:** §4.1 targets → Task 1 Steps 5–6 and Task 4 Step 3; §4.2 tmux directives →
  Tasks 1–2; §4.3 bash gate and warn/skip → Task 3; §4.4 pi settings → Task 4; §4.5 flags →
  Task 1 Step 3 and tests T4/T5; §4.6 safety, backup, idempotency, no-tmux, latch caveat →
  Tasks 1, 3, 4 and Task 6 Steps 2–5; §5 integration → Task 5; §6 verification → Task 6; §2's
  runtime-duplication nuance → Task 2's idempotency test.
- **Step scan:** each step carries one action and a checkable result; the only code bodies given
  are the awk/sed transforms, which the tests do not fully determine.
- **Type consistency:** `converge`, `new_home`, `run`, `contains`, `FAILS` are used with the same
  names across all tasks.
- **Review Focus:** items 1–6 map to `test_xdg_target`, the XDG dedup in Task 1 Step 5,
  `test_preserves_mode`, `test_bash_no_gate_warns_and_skips`, `test_idempotent`/Task 2
  idempotency, and the Task 4 settings tests respectively.
- **Proportion:** the plan is shorter than the spec; code appears only where the tests do not
  determine it.
