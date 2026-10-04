# Design: host terminal truecolor convergence (`deploy/host-setup.sh`)

- **Date:** 2026-10-04
- **Status:** Approved in chat (2026-10-04), pending user review of this document
- **Owner:** satish

## 1. Purpose

The extension stack renders correctly only when the terminal chain actually carries 24-bit
color. `pi`, `vim`, and `opencode` all consult `COLORTERM`; tools that trust terminfo alone
need a terminfo entry whose `setaf` emits direct RGB (`tmux-direct`); and tmux must be told to
pass RGB through to the outer terminal (`terminal-features … :RGB`).

Today that setup lives only in satish's hand-edited `~/.tmux.conf` and `~/.bashrc`. This design
makes it part of **every install/upgrade of the stack**, so any machine that runs the deployment
converges to a correct 24-bit terminal environment for the invoking user.

It also removes the remaining ambiguity on pi's side: pi auto-detects true-color support
(`terminal.trueColor` defaults to `"auto"`), and the deployment pins it to `true` so pi renders
24-bit even where detection is uncertain (inside tmux, over SSH, in IDE terminals).

This is the first non-package convergence the deployment performs. Section 7 of the
monorepo-deployment design deliberately scoped v1 to `packages`-only; this document extends that
scope for the terminal environment specifically, without disturbing `apply.sh`'s contract.

## 2. Current state (verified on the dev machine, 2026-10-04)

- tmux 3.5a, with a live server holding several sessions. `tmux-direct` is present in the system
  terminfo database (`infocmp tmux-direct` succeeds; `setaf` emits `38:2::…`).
- `~/.tmux.conf` sets `set -g default-terminal "tmux-256color"` and appends
  `set -as terminal-features ",*:RGB"`. Because the running server's config has been re-sourced,
  the append has landed four times in memory — `tmux show -s terminal-features` lists `*:RGB` at
  indices 3, 4, 5, and 6. The file holds a single append line; the duplication is runtime state.
- `~/.bashrc:43` carries the stock Debian color gate:
  `xterm-color|*-256color) color_prompt=yes;;`. `tmux-direct` does not match it, so the prompt
  silently drops to monochrome.
- There is no `/etc/tmux.conf`, and `/etc` is not writable without sudo.
- tmux's config precedence is `~/.tmux.conf` → `$XDG_CONFIG_HOME/tmux/tmux.conf` →
  `~/.config/tmux/tmux.conf` → `/etc/tmux.conf`; the **first existing file wins entirely**.
- Verified against an isolated tmux server: `set -s terminal-features[3] "*:RGB"` and
  `set-environment -g COLORTERM truecolor` both apply as intended.

## 3. Decisions taken in brainstorming

- **Separate script, not `apply.sh`.** Host convergence lives in a new `deploy/host-setup.sh`,
  invoked by the `deploy-pi-stack` skill as its own step. `apply.sh` keeps its documented
  guarantee: it converges only through pi's CLI and touches only the settings `packages` key.
- **Default-on, in-place edits.** The skill announces the host step rather than asking; the
  script edits the user's existing config in place. This honors "part of any install/upgrade"
  while remaining idempotent and reversible.
- **Per-user, never `/etc`.** Writing `/etc/tmux.conf` would require sudo on every machine and
  would be shadowed by the user's own `~/.tmux.conf` anyway. The script targets the first config
  tmux actually reads for the invoking user. "System-wide" here means "every machine that runs
  the stack."
- **One pi settings key moves into `host-setup.sh`.** `terminal.trueColor = true` is the sole
  non-package pi setting the deployment converges. It cannot go in `apply.sh`, whose contract is
  to touch only the settings `packages` key; there is no scriptable `pi config set` (the `pi config`
  TUI is interactive). `host-setup.sh` therefore also merges this one key into the global
  `settings.json`, with the same backup/atomic/idempotent discipline as the dotfiles.
- **`deployment.json` is unchanged.** The script ships inside the repository, so it versions with
  the monorepo tag like the rest of the deployment machinery.

## 4. `deploy/host-setup.sh`

A self-locating, idempotent Bash script (`readlink -f "${BASH_SOURCE[0]}"`, no hardcoded home).
It converges the invoking user's terminal environment and reports every change.

### 4.1 Targets

| Target | Rule |
|---|---|
| tmux config | first existing of `$HOME/.tmux.conf`, `${XDG_CONFIG_HOME:-$HOME/.config}/tmux/tmux.conf`, `$HOME/.config/tmux/tmux.conf`; if none exists and tmux is installed, `$HOME/.tmux.conf` |
| shell rc | `$HOME/.bashrc` |
| pi settings | `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json` (user scope) |

### 4.2 tmux convergence (only when `tmux` is on `PATH`)

Each directive is matched as a whole line and rewritten; an absent directive is appended with a
`# pi-extensions: 24-bit truecolor` marker.

| Desired line | Match / replacement rule |
|---|---|
| `set -g default-terminal "tmux-direct"` | replace any `set[-option] … [-g] default-terminal …` line (report old→new); append if absent |
| `set -s terminal-features[N] "*:RGB"` | collapse every active `terminal-features … RGB` line to a single entry; keep an existing `*:RGB` entry's index, else take the lowest free index ≥ 3 (never clobber a user's other `terminal-features[N]`, e.g. `[4] xterm*:hyperlinks`); append if absent |
| `set-environment -g COLORTERM truecolor` | replace any `set-environment … COLORTERM …` line; append if absent |

### 4.3 shell convergence

On `~/.bashrc`, extend only the Debian color gate:
`xterm-color|*-256color)` → `xterm-color|*-256color|*-direct)`, on the line that sets
`color_prompt=yes`. The unrelated `xterm*|rxvt*)` window-title case is left alone.

If no such gate is found, the script **warns and skips** rather than appending prompt logic: an
unrecognized rc means the color prompt is computed differently and a blind append would duplicate
or drift. tmux directives are safe to append because the last setting wins; shell prompt logic is
not.

### 4.4 pi settings convergence

On `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json`:

- If the file is absent, skip with a note (do not synthesize pi's config).
- If it does not parse as JSON, warn and leave it unchanged (never corrupt pi's config).
- Otherwise merge `terminal.trueColor = true`: parse, replace `terminal` with an object only if it
  is missing or not an object, set `trueColor` to the boolean `true`, and re-serialize with
  `JSON.stringify(obj, null, 2) + "\n"`. Every other key is preserved.
- Idempotence is **semantic**: if `terminal.trueColor` is already `true`, report `[OK]` and write
  nothing (so a file whose formatting already differs from `JSON.stringify` is not needlessly
  rewritten). Only when the value must change is the file re-serialized.

The same `[OK]` / `[PLAN]` / `[PENDING]` reporting, `.pi-extensions.bak` backup, and atomic
replace apply as for the dotfiles.

### 4.5 Flags

- `--dry-run` — print the planned per-target changes and modify nothing.
- `--check` — the deploy **post-condition**. It gates only on **CONFIG** state (settings key,
  canonical tmux lines with no duplicate `*:RGB`, the `*-direct` gate, the glyph marker) and prints
  `Post-condition: PASS|FAIL`, mirroring `apply.sh`. **LIVE** state (tmux server `COLORTERM` /
  `default-terminal`, pane `TERM`) is printed **advisory only** — it can only reflect panes created
  afterwards, so it never fails the check.
- `--apply` (default) — converge.
- `--revert` — restore every `<file>.pi-extensions.bak`.
- `-h` / `--help`.

### 4.6 Safety and idempotency

- Never uses `sudo`; never writes `/etc` or any path outside the two targets above.
- Before a file is changed, copy it once to `<file>.pi-extensions.bak` if that backup does not
  already exist; write the new content to a temp file in the same directory and `mv` it into
  place (atomic, preserves the original file mode).
- Idempotent: a converged file matches every rule and is reported `[OK]` with no write; a second
  run is a no-op.
- A conflicting non-canonical value (e.g. `default-terminal "screen"`) is replaced and reported
  loudly with the old value.
- No tmux on `PATH` → skip the tmux part with a note, exit 0. No `~/.bashrc` → skip that part with
  a note. Exit non-zero only on real errors (unreadable/unwritable target, failed write).
- On success the script prints the latch caveat: **already-running tmux sessions keep their old
  `TERM`; the change applies to newly created sessions** (tmux reads its config once at server
  start, and `default-terminal` is fixed at session creation).

### 4.7 Delegated stages

Two host concerns ship as standalone scripts under `deploy/lib/`, invoked by `host-setup.sh` for
every mode:

- **`fix-remote-pi-glyph.sh` — remote-pi relay glyph.** Upstream renders the relay dot with the bare
  emoji `U+1F7E2` / `U+1F7E1`; pi passes status text through unstyled, so the colour comes from the
  *client's* emoji font and shows grey on clients without a colour-emoji font — the "relay looks
  down" symptom that truecolor cannot fix. The script resolves `remote-pi/dist/ui/footer.js` from
  `pi list` (fallbacks: a package scan, `$REMOTE_PI_FOOTER`), keeps a pristine `.orig`, and rewrites
  the emoji to an SGR-coloured `U+25CF` (one cell). The patch is anchored (it matches the whole
  `if (state.relayOn) { … setStatus … }` block) and marker-based (`pi-extensions-glyph-patch v1`),
  runs `node --check` on the result so a corrupt patch fails at apply time, and hard-fails with a
  "patch by hand" message when upstream changes the block. `deployment.json` records
  `remotePiGlyphPatch.verifiedAgainst` and `--check` warns on a version mismatch. target resolution
  is dynamic: `$REMOTE_PI_FOOTER`, then the path `pi list` reports, then a scan — never hardcoded.
  Known-remaining, same unstyled-emoji class but not state indicators: `K_SESSION`'s 📡 and
  `K_PEER`'s 📱. Because it edits a package install, `--check` reports drift after any remote-pi
  update and every apply re-patches it. `is_patched` accepts **either** marker
  (`pi-extensions-glyph-patch` or the earlier hand patch's `LOCAL PATCH`), so an
  already-hand-tweaked host is a no-op rather than a double patch. Glyph state is decided by
  `is_patched` (marker + `U+25CF`), never by scanning the file for the emoji: an explanatory
  comment *about* the emoji contains the emoji, so a whole-file text scan cannot tell a drawn
  glyph from a merely discussed one. (This bit us once: preserving user comments — the T27 fix —
  kept a comment that contains 🟢/🟡, and an emoji-absence heuristic then misread the patched file
  as UNPATCHED.) The diagnostic tolerates pi-tui builds that do not export
  `getTerminalColorMode` and warns if that function and the capability-derived value disagree.
- **`check-pi-color.sh` — diagnostic.** Prints `TERM` / `COLORTERM`, the tmux client identity and
  features, `tput colors`, the `settings.json` `terminal.trueColor` value, the glyph patch state,
  and pi-tui's own `detectCapabilities` when resolvable. Report-only; never gates.

## 5. Integration

- **`deploy/skills/deploy-pi-stack/SKILL.md`** — a new step after `apply.sh`: run
  `<clone>/deploy/host-setup.sh --dry-run`, show it, then run it; relay the output and the
  new-session caveat. Announced, not gated.
- **`deploy/skills/deploy-pi-stack/reference.md`** — document what host setup converges, the
  latch caveat, and the per-user/never-`/etc` rule.
- **`README.md`** — extend "What it does — and what it never does": `apply.sh` still touches only
  the `packages` key; `host-setup.sh` is the separate, in-place dotfile step, with backup and
  `--check`/`--dry-run`.
- **`dev/setup-dev.sh`** — invoke `deploy/host-setup.sh` so the dev machine has parity (the file
  is currently untracked in git, so it is edited locally only).
- **`deployment.json`** — a top-level `hostSetup` block declares the tweaks machine-readably
  (`settings`, `tmux`, `shellRc`, `remotePiGlyphPatch`) so `--check` can report drift without a
  human diffing hosts. `apply.sh`'s planner reads only `version`/`packages`/`retired`, so the extra
  key does not affect it.

## 6. Verification

1. **Before/after check:** `deploy/host-setup.sh --check` exits non-zero on the current machine;
   after `deploy/host-setup.sh` it exits 0, and a second run reports all `[OK]` (idempotent).
2. **Dry run is inert:** `--dry-run` output lists exactly the tmux `default-terminal`,
   `terminal-features`, and `COLORTERM` changes plus the `~/.bashrc` gate change; file mtimes are
   unchanged.
3. **tmux effect, isolated:** with a scratch `HOME` and a scratch tmux socket (`tmux -L …`), a
   **new** session reports `TERM=tmux-direct` and `COLORTERM=truecolor`, and
   `tmux show -s terminal-features` shows the indexed `*:RGB`; the script's replacement prevents
   the re-sourcing growth seen today (the stale in-memory entries at higher indices clear when the
   server is restarted).
4. **bash effect:** `TERM=tmux-direct bash -ic 'echo "$PS1"'` in the scratch home yields the
   colored prompt; `TERM=dumb` does not.
5. **Backup/reversibility:** the first run creates `<file>.pi-extensions.bak`; restoring it plus
   deleting the appended lines returns the files to their pre-run content.
6. **Absent-tool behavior:** with `PATH` lacking tmux, the script notes the skip and exits 0.
7. **pi settings override:** a `settings.json` without a `terminal` key gains
   `"terminal": { "trueColor": true }` with all other keys intact; a file already carrying
   `trueColor: true` is left byte-identical; malformed JSON is warned about and untouched.

8. **relay glyph + live session:** after apply, a **new** tmux server started against the updated
   config reports `TERM=tmux-direct` and `COLORTERM=truecolor` in a new pane, and
   `remote-pi/dist/ui/footer.js` contains the SGR-coloured `●` (no `U+1F7E2`/`U+1F7E1`); `--check`
   fails again if the emoji return.

## 7. Out of scope

- `/etc/tmux.conf` (root, and shadowed by per-user config).
- Shells beyond bash and zsh: other rc files have no stock gate to extend; a future change can add
  per-shell handlers rather than guess.
- Non-tmux terminals: `COLORTERM` outside tmux is set by the terminal emulator, not by us.
- A 16-colour ANSI fallback for the relay dot: **WON'T DO.** A palette-dependent fallback
  reintroduces the per-client variance this work removes; a genuinely 16-colour client is the thing
  to fix, not a silent downgrade in the patch.
- Converging other pi configuration (AGENTS.md, models, themes, prompts). Only the terminal
  environment is in scope: the `terminal.trueColor` override (§4.4), the tmux and shell settings
  (§4.2–4.3), and the remote-pi relay glyph (§4.7).
