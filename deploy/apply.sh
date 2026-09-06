#!/usr/bin/env bash
# apply.sh — converge a pi install to the extension stack declared in ../deployment.json.
#
# Usage:
#   apply.sh             additive apply: install/move manifest entries to their pins;
#                        packages not in the manifest are left alone and reported as drift
#   apply.sh --dry-run   print the per-entry plan; change nothing; exit 0
#   apply.sh --check     exit non-zero if the target is not currently converged; print what differs
#   apply.sh --prune     exact mirror: also remove settings entries not in the manifest
#
# Guarantees:
#   - Self-locating: reads ../deployment.json relative to this script (BASH_SOURCE), never cwd.
#   - Machine-independent: no hardcoded home dir, username, or absolute path. The target
#     agent dir is PI_CODING_AGENT_DIR (pi's own override) or ~/.pi/agent.
#   - Converges exclusively through pi's own CLI (pi install / pi remove). It never writes
#     or rewrites any JSON file, never hand-edits settings, and touches only the `packages`
#     key — never auth.json, models.json, models-store.json, AGENTS.md, or any other file.
#   - Sequential, one entry at a time; the first failure stops the run with a non-zero exit
#     and the full per-entry status table.
#   - Post-condition (apply mode): after converging, the settings `packages` list is
#     re-read and asserted entry-by-entry equal to the manifest (plus reported drift),
#     modulo the dev-checkout dedup rule.

set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$(dirname "$SCRIPT_DIR")" && pwd)"
MANIFEST="$REPO_ROOT/deployment.json"

MODE="apply"
if [ "$#" -gt 1 ]; then
  echo "apply.sh: at most one option allowed (--dry-run, --check, or --prune)" >&2
  exit 2
fi
case "${1:-}" in
  --dry-run) MODE="dry-run" ;;
  --check)   MODE="check" ;;
  --prune)   MODE="prune" ;;
  -h|--help) echo "Usage: apply.sh [--dry-run | --check | --prune]"; echo "  (no option)  additive apply; --dry-run print plan only; --check exit non-zero if not converged; --prune exact mirror"; exit 0 ;;
  "") ;;
  *) echo "apply.sh: unknown option: $1 (expected --dry-run, --check, or --prune)" >&2; exit 2 ;;
esac

die() { echo "apply.sh: ERROR: $*" >&2; exit "${2:-1}"; }

# ---------------------------------------------------------------- preflight

command -v pi >/dev/null 2>&1 \
  || die "pi not found on PATH. Prerequisite: pi must already be installed on this machine."
pi --version >/dev/null 2>&1 \
  || die "pi is on PATH but not loadable ('pi --version' failed). Fix the pi installation and retry."
command -v git >/dev/null 2>&1 || die "git not found on PATH (required)."
command -v node >/dev/null 2>&1 || die "node not found on PATH (required — pi runs on node)."

[ -f "$MANIFEST" ] || die "manifest not found: $MANIFEST"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$MANIFEST" \
  || die "manifest is not valid JSON: $MANIFEST"

ORIGIN_URL="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
[ -n "$ORIGIN_URL" ] \
  || die "cannot determine this checkout's origin remote (git remote get-url origin failed). Expected a git clone of the monorepo."

# The clone must contain a root package.json, and every path its pi manifest declares.
node - "$REPO_ROOT" <<'EOF' || exit 1
const fs = require("fs"), path = require("path");
const root = process.argv[2];
const missing = [];
let pkg;
try { pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); }
catch { console.error("apply.sh: ERROR: clone has no root package.json (expected at " + path.join(root, "package.json") + ")"); process.exit(1); }
for (const key of ["extensions", "skills", "prompts", "themes"]) {
  const list = pkg.pi?.[key];
  if (!Array.isArray(list)) continue;
  for (const entry of list) {
    if (entry.includes("*") || entry.includes("?") || entry.includes("[")) {
      // glob entry: require the containing directory to exist
      const dir = path.dirname(entry.replace(/[*?[\]!+\\]/g, ""));
      if (!fs.existsSync(path.join(root, dir))) missing.push(entry);
    } else if (!fs.existsSync(path.join(root, entry))) {
      missing.push(entry);
    }
  }
}
if (missing.length) {
  console.error("apply.sh: ERROR: root pi manifest declares missing path(s): " + missing.join(", "));
  process.exit(1);
}
EOF

# ---------------------------------------------------------------- state

AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
SETTINGS="$AGENT_DIR/settings.json"

# Advisory: is this checkout tagged at the manifest's version? (informational only)
HEAD_TAG="$(git -C "$REPO_ROOT" describe --tags --exact-match HEAD 2>/dev/null || true)"
HEAD_SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"

# ---------------------------------------------------------------- plan

# The node planner:
#  - parses manifest + settings, normalizes identities (npm name; git domain/path with
#    scheme/host-variant-insensitive normalization — ssh.github.com:443 == github.com)
#  - verifies the release rule: manifest.version == the monorepo self-entry's pin
#  - resolves the dev-checkout dedup rule: a local-path settings entry whose git origin is
#    the same repository as the monorepo entry satisfies it
#  - emits TSV lines:  M <idx> <ACTION> <spec> <detail>   (one per manifest entry)
#                      D <idx> <spec> <detail>            (one per non-manifest entry)
#                      N <msg>                            (advisory notes)
#                      S <0|1>                            (1 = currently converged in this mode)
# Post mode (first arg "post"): re-reads settings and prints "Post-condition: PASS|FAIL"
# plus one "  MISSING/MISMATCH/EXTRA ..." line per problem.

NODE_PLANNER='
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const mode = process.argv[1];
const manifestPath = process.argv[2];
const originUrl = process.argv[3];
const agentDir = process.argv[4];
const settingsPath = process.argv[5];
const prune = process.argv[6] === "1";
const headTag = process.argv[7];
const headShort = process.argv[8];

const CANON_DOMAINS = { "ssh.github.com": "github.com", "github.com": "github.com" };

function normGitUrl(u) {
  let host = "", p = "";
  let m;
  if ((m = u.match(/^git@([^:]+):(.+)$/))) { host = m[1]; p = m[2]; }
  else if (u.includes("://")) {
    try {
      const parsed = new URL(u);
      host = parsed.hostname;
      p = parsed.pathname.replace(/^\/+/, "");
    } catch { return null; }
  } else if ((m = u.match(/^([^\/:]+):(.+)$/))) { host = m[1]; p = m[2]; }
  else {
    const i = u.indexOf("/");
    if (i < 0) return null;
    host = u.slice(0, i); p = u.slice(i + 1);
  }
  host = (host || "").toLowerCase().replace(/:\d+$/, "");
  p = p.replace(/^\/+/, "").replace(/\.git$/, "");
  const dom = CANON_DOMAINS[host] || host;
  if (!dom || !p || !p.includes("/")) return null;
  return { dom, path: p };
}

// Split an @ref suffix off a git-style spec. A ref @ must appear after the first colon
// (so "git@host:path" is not misread) and after "://" for protocol URLs.
function splitRef(spec) {
  const colon = spec.indexOf(":");
  const at = spec.lastIndexOf("@");
  if (at > 0 && (colon < 0 || at > colon)) return { url: spec.slice(0, at), ref: spec.slice(at + 1) };
  return { url: spec, ref: null };
}

function parseSpec(spec, baseDir) {
  const out = { kind: "unknown", identity: null, pin: null, spec, display: spec, resolved: null, originIdentity: null };
  if (spec.startsWith("npm:")) {
    const { url, ref } = splitRef(spec.slice(4));
    out.kind = "npm"; out.identity = "npm:" + url; out.pin = ref;
  } else if (spec.startsWith("git:") || /^(https?|ssh|git):\/\//.test(spec)) {
    const { url, ref } = splitRef(spec.startsWith("git:") ? spec.slice(4) : spec);
    const n = normGitUrl(url);
    if (n) { out.kind = "git"; out.identity = "git:" + n.dom + "/" + n.path; out.pin = ref; }
  } else {
    const abs = path.resolve(baseDir, spec);
    out.kind = "local"; out.identity = "local:" + abs; out.pin = null; out.resolved = abs;
    try {
      const top = execFileSync("git", ["-C", abs, "rev-parse", "--show-toplevel"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      const url = execFileSync("git", ["-C", top, "remote", "get-url", "origin"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      const n = normGitUrl(url);
      if (n) out.originIdentity = "git:" + n.dom + "/" + n.path;
    } catch {}
  }
  return out;
}

function loadSettings() {
  try {
    const j = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return Array.isArray(j.packages) ? j.packages : [];
  } catch { return []; }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (typeof manifest.version !== "string" || !manifest.version) {
  console.error("apply.sh: ERROR: manifest has no version field"); process.exit(1);
}
if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
  console.error("apply.sh: ERROR: manifest has no packages array"); process.exit(1);
}

const originN = normGitUrl(originUrl);
const selfIdentity = originN ? "git:" + originN.dom + "/" + originN.path : null;

const manifestEntries = manifest.packages.map((s) => parseSpec(s, agentDir));
for (const e of manifestEntries) {
  if (!e.identity) { console.error("apply.sh: ERROR: cannot parse manifest entry: " + e.spec); process.exit(1); }
}

// Release rule (a check, not prose): the monorepo self-entry must pin exactly the version.
const self = manifestEntries.find((e) => e.identity === selfIdentity);
if (!self) {
  console.error("apply.sh: ERROR: no manifest entry matches this repository ('" + originUrl + "') — is this the right checkout?");
  process.exit(1);
}
if (self.pin !== manifest.version) {
  console.error("apply.sh: ERROR: release rule violated — deployment.json version (" + manifest.version + ") != monorepo self-pin (" + String(self.pin) + ")");
  process.exit(1);
}

const settings = loadSettings().map((s) => parseSpec(typeof s === "string" ? s : s.source, agentDir));

// ---- plan mode -------------------------------------------------------------
if (mode === "plan") {
  const matchedSettings = new Set();
  let converged = 1;

  const notes = [];
  if (headTag !== manifest.version) {
    notes.push("N\tadvisory: this checkout is " + (headShort ? "at " + headShort : "uncommitted") + ", not tagged " + manifest.version + "; applying the manifest as written");
  }

  const lines = [];
  manifestEntries.forEach((e, i) => {
    let action, detail;
    if (e === self) {
      const dedup = settings.find((s) => s.kind === "local" && s.originIdentity === e.identity);
      const gitEntry = settings.find((s) => s.kind === "git" && s.identity === e.identity);
      if (dedup) {
        if (gitEntry) {
          action = "FIX";
          detail = "dedup: dev checkout " + dedup.resolved + " satisfies this entry; removing the redundant git package so both are never loaded simultaneously";
          matchedSettings.add(gitEntry);
          converged = 0;
        } else {
          action = "SATISFIED";
          detail = "dev checkout " + dedup.resolved + " satisfies this entry (dedup rule; git package not installed)";
          matchedSettings.add(dedup);
        }
      } else if (gitEntry) {
        matchedSettings.add(gitEntry);
        if (gitEntry.pin === e.pin) { action = "NOOP"; detail = "already at pin " + e.pin; }
        else { action = "MOVE"; detail = "move " + String(gitEntry.pin) + " -> " + String(e.pin); converged = 0; }
      } else {
        action = "INSTALL"; detail = "install " + e.spec; converged = 0;
      }
    } else {
      const cur = settings.find((s) => s.identity === e.identity);
      if (cur) {
        matchedSettings.add(cur);
        const curPin = cur.pin === null ? "(unpinned)" : cur.pin;
        if (cur.pin === e.pin) { action = "NOOP"; detail = "already at pin " + (e.pin === null ? "(unpinned)" : e.pin); }
        else { action = "MOVE"; detail = "move " + curPin + " -> " + (e.pin === null ? "(unpinned)" : e.pin); converged = 0; }
      } else { action = "INSTALL"; detail = "install " + e.spec; converged = 0; }
    }
    lines.push("M\t" + i + "\t" + action + "\t" + e.spec + "\t" + detail);
  });

  settings.forEach((s) => {
    if (matchedSettings.has(s)) return;
    const isSelfSatisfier = s.kind === "local" && s.originIdentity === selfIdentity;
    if (isSelfSatisfier) return; // matched the self entry via dedup, not drift
    if (prune) { matchedSettings.add(s); converged = 0; }
    lines.push(prune ? "D\t" + s.display + "\tremove (not in manifest) --prune"
                     : "D\t" + s.display + "\tnot in manifest — left as-is (drift)");
  });

  for (const n of notes) lines.push(n);
  lines.push("S\t" + converged);
  process.stdout.write(lines.join("\n") + "\n");
}

// ---- post mode (assert the post-condition) ---------------------------------
else {
let failures = [];
manifestEntries.forEach((e) => {
  if (e === self) {
    const dedup = settings.find((s) => s.kind === "local" && s.originIdentity === e.identity);
    const cur = settings.find((s) => s.kind === "git" && s.identity === e.identity);
    if (dedup) return;
    if (!cur) { failures.push("  MISSING: " + e.spec); return; }
    if (cur.pin !== e.pin) failures.push("  MISMATCH: " + e.spec + " — settings has ref " + String(cur.pin) + ", manifest pins " + e.pin);
  } else {
    const cur = settings.find((s) => s.identity === e.identity);
    if (!cur) { failures.push("  MISSING: " + e.spec); return; }
    if (cur.pin !== e.pin) failures.push("  MISMATCH: " + e.spec + " — settings has " + (cur.pin === null ? "(unpinned)" : cur.pin) + ", manifest pins " + (e.pin === null ? "(unpinned)" : e.pin));
  }
});
if (prune) {
  const manIds = new Set(manifestEntries.map((e) => e.identity));
  settings.forEach((s) => {
    const isSelfSatisfier = s.kind === "local" && s.originIdentity === selfIdentity;
    if (!manIds.has(s.identity) && !isSelfSatisfier) failures.push("  EXTRA: " + s.display + " (still present in --prune mode)");
  });
}
if (failures.length) {
  console.error("Post-condition: FAIL");
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log("Post-condition: PASS (" + manifestEntries.length + " manifest entries all satisfied" + (prune ? ", exact mirror verified" : "") + ")");
}
';

run_planner() {
  node -e "$NODE_PLANNER" "$1" "$MANIFEST" "$ORIGIN_URL" "$AGENT_DIR" "$SETTINGS" "${PRUNE_FLAG:-0}" "$HEAD_TAG" "$HEAD_SHORT"
}

PRUNE_FLAG=0
[ "$MODE" = "prune" ] && PRUNE_FLAG=1

PLAN="$(run_planner plan)"

S_LINE="$(printf '%s\n' "$PLAN" | grep -E '^S	' || true)"
CONVERGED="$(printf '%s\n' "$S_LINE" | cut -f2 || true)"
[ -n "$CONVERGED" ] || die "internal error: planner produced no status line"

print_plan() {
  echo "pi-extensions stack: $(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version)' "$MANIFEST")"
  echo "target agent dir:    $AGENT_DIR"
  echo "mode:                $MODE"
  echo
  printf '%s\n' "$PLAN" | while IFS=$'\t' read -r kind a b c d; do
    case "$kind" in
      M) printf '  [%-12s] %s\n      %s\n' "$b" "$c" "$d" ;;
      D) printf '  [DRIFT     ] %s\n      %s\n' "$a" "$b" ;;
      N) printf '  note: %s\n' "$a" ;;
    esac
  done
  if [ "$MODE" = "prune" ]; then
    n_drift="$(printf '%s\n' "$PLAN" | grep -cE '^D	' || true)"
    echo
    echo "summary: $n_drift drift entr$( [ "$n_drift" = 1 ] && echo y || echo ies ) would be removed (--prune)"
  fi
}

# ---------------------------------------------------------------- modes

case "$MODE" in
  dry-run)
    print_plan
    echo
    echo "dry-run: no changes made"
    exit 0
    ;;
  check)
    if [ "$CONVERGED" = 1 ]; then
      echo "converged: all manifest entries satisfied in $AGENT_DIR ($MODE mode, prune=${PRUNE_FLAG})"
      exit 0
    fi
    print_plan
    echo
    echo "NOT converged — run apply.sh (or apply.sh --prune for an exact mirror) to fix"
    exit 1
    ;;
esac

# ---------------------------------------------------------------- apply

declare -a ACTIONS SPECS
while IFS=$'\t' read -r kind idx action spec detail; do
  [ "$kind" = M ] || continue
  ACTIONS+=("$action"); SPECS+=("$spec")
done < <(printf '%s\n' "$PLAN" | grep -E '^M	')

declare -a DRIFT_SPECS
while IFS=$'\t' read -r kind spec detail; do
  [ "$kind" = D ] || continue
  DRIFT_SPECS+=("$spec")
done < <(printf '%s\n' "$PLAN" | grep -E '^D	')

print_plan
echo

failed=0
for i in "${!ACTIONS[@]}"; do
  action="${ACTIONS[$i]}"; spec="${SPECS[$i]}"
  case "$action" in
    NOOP|SATISFIED) continue ;;
    INSTALL|MOVE|FIX)
      if [ "$action" = FIX ]; then
        # redundant git package alongside a satisfying dev checkout: remove it
        if ! out="$(pi remove "$spec" 2>&1)"; then
          echo "FAILED: pi remove $spec (dedup fix)" >&2
          [ -n "$out" ] && echo "$out" | sed 's/^/    /' >&2
          failed=1; break
        fi
        echo "ok: pi remove $spec (redundant; dev checkout satisfies this entry)"
        continue
      fi
      if ! out="$(pi install "$spec" 2>&1)"; then
        echo "FAILED: pi install $spec" >&2
        [ -n "$out" ] && echo "$out" | sed 's/^/    /' >&2
        failed=1; break
      fi
      echo "ok: pi install $spec"
      ;;
  esac
done

removed=0
if [ "$MODE" = "prune" ] && [ "$failed" = 0 ]; then
  for spec in "${DRIFT_SPECS[@]}"; do
    if ! out="$(pi remove "$spec" 2>&1)"; then
      echo "FAILED: pi remove $spec" >&2
      [ -n "$out" ] && echo "$out" | sed 's/^/    /' >&2
      failed=1; break
    fi
    echo "ok: pi remove $spec"
    removed=$((removed + 1))
  done
fi

# Full per-entry status table (always printed on failure; summary on success).
if [ "$failed" != 0 ]; then
  echo
  echo "=== per-entry status (run stopped; entries after the failure were skipped) ===" >&2
  printf '%s\n' "$PLAN" | while IFS=$'\t' read -r kind a b c d; do
    case "$kind" in
      M) printf '  [%-12s] %s\n' "$b" "$c" ;;
      D) printf '  [DRIFT     ] %s\n' "$a" ;;
    esac
  done >&2
  exit 1
fi

if [ "$MODE" = "prune" ]; then
  echo
  echo "removed $removed non-manifest package(s)"
fi

run_planner post
exit 0
