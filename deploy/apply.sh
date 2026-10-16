#!/usr/bin/env bash
# apply.sh — converge a pi install to the extension stack declared in ../deployment.json.
#
# Usage:
#   apply.sh             additive apply: install/move manifest entries, float the monorepo
#                        self-entry to the newest release tag, refresh unpinned third-party
#                        entries to their latest release (`pi update`), and remove entries the
#                        manifest explicitly retires (one-time migrations); other packages not
#                        in the manifest are left alone (drift)
#   apply.sh --dry-run   print the per-entry plan; change nothing; exit 0
#   apply.sh --check     exit non-zero if the target is not currently converged; print what differs
#   apply.sh --prune     exact mirror: also remove settings entries not in the manifest
#
# Env:
#   PI_EXTENSIONS_SELF_URL   override the self-entry URL/scheme (must resolve to this repo)
#   PI_EXTENSIONS_LATEST_TAG  override the resolved newest release tag (CI/offline/tests)
#   PI_EXTENSIONS_NO_REEXEC   set to 1 to forbid the post-self-update re-exec (internal guard)
#
# Guarantees:
#   - Self-locating: reads ../deployment.json relative to this script (BASH_SOURCE), never cwd.
#   - The monorepo self-entry is never frozen: apply resolves the newest `v*` release tag
#     (git ls-remote) and moves the self clone to it (re-running itself once from the updated
#     clone so the new manifest converges in the same invocation). The manifest self-entry is
#     therefore unversioned — the release tag, not the manifest, is the moving fixed point.
#   - Never installs the monorepo self-entry through the manifest's hardcoded URL when the
#     target already resolves this repo another way: the existing settings entry's URL/scheme
#     is reused, so an https-installed machine stays https and never grows a second clone
#     under git/ssh.github.com/. PI_EXTENSIONS_SELF_URL overrides the URL (same-repo validated).
#   - Machine-independent: no hardcoded home dir, username, or absolute path. The target
#     agent dir is PI_CODING_AGENT_DIR (pi's own override) or ~/.pi/agent.
#   - Converges exclusively through pi's own CLI (pi install / pi remove / pi update). It never
#     writes or rewrites any JSON file, never hand-edits settings, and touches only the `packages`
#     key — never auth.json, models.json, models-store.json, AGENTS.md, or any other file.
#   - Removes manifest-declared retired entries, local-path entries that are a duplicate
#     checkout of this same repo, and local copies of a manifest npm package, with `pi remove`
#     even in additive mode; `--prune` is still required to remove unrelated drift.
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

# Advisory: is this checkout tagged at the newest release? (informational only)
HEAD_TAG="$(git -C "$REPO_ROOT" describe --tags --exact-match HEAD 2>/dev/null || true)"
HEAD_SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"

# Newest release tag of this repository, resolved model-free. PI_EXTENSIONS_LATEST_TAG
# overrides it (CI, offline, tests). If ls-remote fails we keep it empty: --check falls
# back to structural, apply leaves the self-entry where it is and warns.
if [ -n "${PI_EXTENSIONS_LATEST_TAG:-}" ]; then
  LATEST_TAG="$PI_EXTENSIONS_LATEST_TAG"
else
  LATEST_TAG="$(git ls-remote --tags "$ORIGIN_URL" 2>/dev/null \
    | awk -F'\t' '$2 ~ /^refs\/tags\/v[0-9]/ { t = $2; sub(/^refs\/tags\//, "", t); sub(/\^\{\}$/, "", t); print t }' \
    | sort -uV | tail -1 || true)"
fi

# ---------------------------------------------------------------- plan

# The node planner:
#  - parses manifest + settings, normalizes identities (npm name; git domain/path with
#    scheme/host-variant-insensitive normalization — ssh.github.com:443 == github.com)
#  - floats the monorepo self-entry to PI_EXTENSIONS_LATEST_TAG (the newest release tag)
#  - resolves the dev-checkout dedup rule: a local-path settings entry whose git origin is
#    the same repository as the monorepo entry satisfies it
#  - resolves the self-entry install URL: PI_EXTENSIONS_SELF_URL, else the existing settings
#    git entry URL/scheme, else the manifest URL — never the manifest URL over an
#    already-installed different scheme
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
const repoRoot = process.argv[9];
let selfUrlOverride = (process.argv[10] || "").trim();
const latestTag = (process.argv[11] || "").trim();

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
// (so "git@host:path" is not misread) and, for protocol URLs, after the authority —
// the userinfo "@" in "ssh://git@host/..." is never a ref separator.
function splitRef(spec) {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { url: spec, ref: null };
  const scheme = spec.indexOf("://");
  if (scheme >= 0) {
    const slash = spec.indexOf("/", scheme + 3);
    const authEnd = slash < 0 ? spec.length : slash;
    if (at < authEnd) return { url: spec, ref: null };
    return { url: spec.slice(0, at), ref: spec.slice(at + 1) };
  }
  const colon = spec.indexOf(":");
  if (colon >= 0 && at < colon) return { url: spec, ref: null };
  return { url: spec.slice(0, at), ref: spec.slice(at + 1) };
}

function parseSpec(spec, baseDir) {
  const out = { kind: "unknown", identity: null, pin: null, spec, display: spec, url: null, localName: null, resolved: null, originIdentity: null, resolvedRoot: null, repoIdentity: null };
  if (spec.startsWith("npm:")) {
    const { url, ref } = splitRef(spec.slice(4));
    out.kind = "npm"; out.identity = "npm:" + url; out.pin = ref; out.url = url;
  } else if (spec.startsWith("git:") || /^(https?|ssh|git):\/\//.test(spec)) {
    const { url, ref } = splitRef(spec.startsWith("git:") ? spec.slice(4) : spec);
    const n = normGitUrl(url);
    if (n) { out.kind = "git"; out.identity = "git:" + n.dom + "/" + n.path; out.pin = ref; out.url = spec.startsWith("git:") ? "git:" + url : url; }
  } else {
    const abs = path.resolve(baseDir, spec);
    out.kind = "local"; out.identity = "local:" + abs; out.pin = null; out.resolved = abs;
    try { const pj = JSON.parse(fs.readFileSync(path.join(abs, "package.json"), "utf8")); out.localName = pj.name || null; } catch {}
    try {
      const top = execFileSync("git", ["-C", abs, "rev-parse", "--show-toplevel"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      out.resolvedRoot = top;
      try {
        const url = execFileSync("git", ["-C", top, "remote", "get-url", "origin"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
        const n = normGitUrl(url);
        if (n) out.originIdentity = "git:" + n.dom + "/" + n.path;
      } catch {}
      // Identify a clone of this same repo even when it has no origin remote (for
      // example a vendored copy): read its own deployment.json monorepo self-pin.
      try {
        const dep = JSON.parse(fs.readFileSync(path.join(top, "deployment.json"), "utf8"));
        const selfSpec = (dep.packages || []).find((p) => typeof p === "string" && p.includes("assid2/pi-extensions"));
        if (selfSpec) {
          const { url } = splitRef(selfSpec.startsWith("git:") ? selfSpec.slice(4) : selfSpec);
          const n = normGitUrl(url);
          if (n) out.repoIdentity = "git:" + n.dom + "/" + n.path;
        }
      } catch {}
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

// PI_EXTENSIONS_SELF_URL lets a machine pin the self-entry to a non-default transport
// (for example an https origin). It only replaces the URL; the manifest release tag
// is still appended, and it must resolve to this same repository.
if (selfUrlOverride) {
  const n = normGitUrl(selfUrlOverride.replace(/^git:/, ""));
  if (!n || ("git:" + n.dom + "/" + n.path) !== selfIdentity) {
    console.error("apply.sh: ERROR: PI_EXTENSIONS_SELF_URL does not point at this repository (" + originUrl + "): " + selfUrlOverride);
    process.exit(1);
  }
}

const manifestEntries = manifest.packages.map((s) => parseSpec(s, agentDir));
for (const e of manifestEntries) {
  if (!e.identity) { console.error("apply.sh: ERROR: cannot parse manifest entry: " + e.spec); process.exit(1); }
}
const retiredEntries = (Array.isArray(manifest.retired) ? manifest.retired : []).map((s) => parseSpec(s, agentDir));
const retiredIdentities = new Set(retiredEntries.map((e) => e.identity));

// The monorepo self-entry is identified by this checkout origin; its manifest ref is
// ignored (the entry is unversioned and apply floats it to PI_EXTENSIONS_LATEST_TAG).
const self = manifestEntries.find((e) => e.identity === selfIdentity);
if (!self) {
  console.error("apply.sh: ERROR: no manifest entry matches this repository ('" + originUrl + "') — is this the right checkout?");
  process.exit(1);
}

// npm packages declared by the manifest, for retiring a local copy of the same package.
const manifestNpmNames = new Set(manifestEntries.filter((e) => e.kind === "npm").map((e) => e.identity.slice(4)));

const settings = loadSettings().map((s) => parseSpec(typeof s === "string" ? s : s.source, agentDir));

// ---- plan mode -------------------------------------------------------------
if (mode === "plan") {
  const matchedSettings = new Set();
  let converged = 1;
  let unpinnedCount = 0;
  let selfChanged = 0;

  const notes = [];
  const selfHasDedup = settings.some((s) => s.kind === "local" && s.originIdentity === selfIdentity);
  if (latestTag && !selfHasDedup && headTag !== latestTag) {
    notes.push("N\tadvisory: this checkout is " + (headShort ? "at " + headShort : "uncommitted") + ", not at the newest release " + latestTag + "; apply moves the self clone");
  }
  if (!latestTag) {
    notes.push("N\tadvisory: could not resolve the newest release tag (offline?); the self-entry is left where it is");
  }

  const lines = [];
  manifestEntries.forEach((e, i) => {
    let action, detail, spec = e.spec;
    if (e === self) {
      const dedup = settings.find((s) => s.kind === "local" && s.originIdentity === e.identity);
      const gitEntry = settings.find((s) => s.kind === "git" && s.identity === e.identity);
      // Never re-install the self-entry through the manifest hardcoded URL when the
      // machine already resolves this repo through another one: reuse the installed
      // URL/scheme (or an explicit PI_EXTENSIONS_SELF_URL override) and rebase the tag,
      // so an https-installed machine stays https and no second clone appears under
      // git/ssh.github.com/.
      const selfUrl = selfUrlOverride || (gitEntry && gitEntry.url) || e.url;
      if (dedup) {
        if (gitEntry) {
          action = "FIX";
          spec = gitEntry.spec; // remove the exact entry that is present
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
        if (latestTag) {
          spec = selfUrl + "@" + latestTag;
          if (gitEntry.pin === latestTag) { action = "NOOP"; detail = "already at the newest release " + latestTag; }
          else { action = "MOVE"; detail = "move " + String(gitEntry.pin) + " -> " + latestTag + " (newest release; keeping " + (selfUrlOverride ? "PI_EXTENSIONS_SELF_URL" : "the installed URL") + ")"; converged = 0; selfChanged = 1; }
        } else {
          action = "NOOP";
          detail = "newest release tag unresolved (offline?); keeping " + String(gitEntry.pin);
        }
      } else {
        if (latestTag) {
          spec = selfUrl + "@" + latestTag;
          action = "INSTALL"; detail = "install " + spec + " (newest release)" + (selfUrlOverride ? " (PI_EXTENSIONS_SELF_URL)" : ""); converged = 0; selfChanged = 1;
        } else {
          spec = selfUrl;
          action = "INSTALL"; detail = "install " + spec + " (newest release tag unresolved; installing unpinned)"; converged = 0; selfChanged = 1;
        }
      }
    } else {
      const cur = settings.find((s) => s.identity === e.identity);
      if (cur) {
        matchedSettings.add(cur);
        const curPin = cur.pin === null ? "(unpinned)" : cur.pin;
        if (e.pin === null && cur.pin === null) {
          // Already unpinned: always take whatever upstream publishes latest.
          unpinnedCount += 1;
          action = "LATEST";
          detail = "unpinned in the manifest — apply runs `pi update` to take the latest release";
        } else if (cur.pin === e.pin) {
          action = "NOOP";
          detail = "already at pin " + e.pin;
        } else if (e.pin === null) {
          unpinnedCount += 1;
          action = "UNPIN";
          detail = "unpin " + curPin + " and take the latest release (install + `pi update`)";
          converged = 0;
        } else {
          action = "MOVE";
          detail = "move " + curPin + " -> " + e.pin;
          converged = 0;
        }
      } else if (e.pin === null) {
        unpinnedCount += 1;
        action = "INSTALL-LATEST";
        detail = "install " + e.spec + " and take the latest release";
        converged = 0;
      } else {
        action = "INSTALL";
        detail = "install " + e.spec;
        converged = 0;
      }
    }
    lines.push("M\t" + i + "\t" + action + "\t" + spec + "\t" + detail);
  });

  settings.forEach((s) => {
    if (matchedSettings.has(s)) return;
    const isSelfSatisfier = s.kind === "local" && s.originIdentity === selfIdentity;
    if (isSelfSatisfier) return; // matched the self entry via dedup, not drift
    const isLocalNpmDup = s.kind === "local" && s.localName && manifestNpmNames.has(s.localName);
    if (isLocalNpmDup) {
      converged = 0;
      lines.push("R\t" + s.display + "\tlocal copy of the managed npm package " + s.localName + " — apply runs `pi remove`");
      return;
    }
    const isDuplicateGit = s.kind === "git" && s.identity === selfIdentity;
    if (isDuplicateGit) {
      converged = 0;
      lines.push("R\t" + s.display + "\ta duplicate git entry for this repo — apply runs `pi remove`");
      return;
    }
    if (retiredIdentities.has(s.identity)) {
      converged = 0;
      lines.push("R\t" + s.display + "\tretired by the manifest — apply runs `pi remove`");
      return;
    }
    const isDuplicateCheckout = s.kind === "local" && s.repoIdentity === selfIdentity && s.resolvedRoot && s.resolvedRoot !== repoRoot;
    if (isDuplicateCheckout) {
      converged = 0;
      lines.push("R\t" + s.display + "\tduplicate checkout of this repo (" + s.resolvedRoot + ") — apply runs `pi remove`");
      return;
    }
    if (prune) { matchedSettings.add(s); converged = 0; }
    lines.push(prune ? "D\t" + s.display + "\tremove (not in manifest) --prune"
                     : "D\t" + s.display + "\tnot in manifest — left as-is (drift)");
  });

  for (const n of notes) lines.push(n);
  if (unpinnedCount > 0) {
    lines.push("N\t" + unpinnedCount + " unpinned entr" + (unpinnedCount === 1 ? "y takes" : "ies take") + " the latest release at apply time (`pi update`); --check verifies structure only, so it cannot see a newer upstream release");
  }
  lines.push("C\t" + selfChanged);
  lines.push("S\t" + converged);
  process.stdout.write(lines.join("\n") + "\n");
}

// ---- post mode (assert the post-condition) ---------------------------------
else {
let failures = [];
manifestEntries.forEach((e) => {
  if (e === self) {
    const dedup = settings.find((s) => s.kind === "local" && s.originIdentity === e.identity);
    const gitEntries = settings.filter((s) => s.kind === "git" && s.identity === e.identity);
    if (dedup) {
      if (gitEntries.length) failures.push("  DUPLICATE: " + gitEntries.map((s) => s.display).join(", ") + " (redundant git entry beside a dev checkout)");
      return;
    }
    if (gitEntries.length === 0) { failures.push("  MISSING: " + e.spec); return; }
    if (gitEntries.length > 1) { failures.push("  DUPLICATE: " + gitEntries.map((s) => s.display).join(", ") + " (multiple git entries for this repo)"); return; }
    if (latestTag && gitEntries[0].pin !== latestTag) failures.push("  MISMATCH: " + e.spec + " — settings has ref " + String(gitEntries[0].pin) + ", newest release is " + latestTag);
  } else {
    const cur = settings.find((s) => s.identity === e.identity);
    if (!cur) { failures.push("  MISSING: " + e.spec); return; }
    if (cur.pin !== e.pin) failures.push("  MISMATCH: " + e.spec + " — settings has " + (cur.pin === null ? "(unpinned)" : cur.pin) + ", manifest pins " + (e.pin === null ? "(unpinned)" : e.pin));
  }
});
settings.forEach((s) => {
  if (retiredIdentities.has(s.identity)) { failures.push("  RETIRED: " + s.display + " (still present after apply)"); return; }
  if (s.kind === "local" && s.localName && manifestNpmNames.has(s.localName)) { failures.push("  DUPLICATE: " + s.display + " (local copy of managed npm package " + s.localName + " still present)"); return; }
  if (s.kind === "local" && s.repoIdentity === selfIdentity && s.resolvedRoot && s.resolvedRoot !== repoRoot) failures.push("  DUPLICATE: " + s.display + " (still present after apply)");
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
  node -e "$NODE_PLANNER" "$1" "$MANIFEST" "$ORIGIN_URL" "$AGENT_DIR" "$SETTINGS" "${PRUNE_FLAG:-0}" "$HEAD_TAG" "$HEAD_SHORT" "$REPO_ROOT" "${PI_EXTENSIONS_SELF_URL:-}" "$LATEST_TAG"
}

PRUNE_FLAG=0
[ "$MODE" = "prune" ] && PRUNE_FLAG=1

PLAN="$(run_planner plan)"

S_LINE="$(printf '%s\n' "$PLAN" | grep -E '^S	' || true)"
CONVERGED="$(printf '%s\n' "$S_LINE" | cut -f2 || true)"
[ -n "$CONVERGED" ] || die "internal error: planner produced no status line"
C_LINE="$(printf '%s\n' "$PLAN" | grep -E '^C	' || true)"
SELF_CHANGED="$(printf '%s\n' "$C_LINE" | cut -f2 || true)"

print_plan() {
  echo "pi-extensions stack: $(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version)' "$MANIFEST")${LATEST_TAG:+  (newest release: $LATEST_TAG)}"
  echo "target agent dir:    $AGENT_DIR"
  echo "mode:                $MODE"
  echo
  printf '%s\n' "$PLAN" | while IFS=$'\t' read -r kind a b c d; do
    case "$kind" in
      M) printf '  [%-12s] %s\n      %s\n' "$b" "$c" "$d" ;;
      D) printf '  [DRIFT     ] %s\n      %s\n' "$a" "$b" ;;
      R) printf '  [RETIRE    ] %s\n      %s\n' "$a" "$b" ;;
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

declare -a RETIRE_SPECS
while IFS=$'\t' read -r kind spec detail; do
  [ "$kind" = R ] || continue
  RETIRE_SPECS+=("$spec")
done < <(printf '%s\n' "$PLAN" | grep -E '^R	')

print_plan
echo

failed=0
for i in "${!ACTIONS[@]}"; do
  action="${ACTIONS[$i]}"; spec="${SPECS[$i]}"
  case "$action" in
    NOOP|SATISFIED) continue ;;
    LATEST)
      # Unpinned manifest entry already in settings: pi update moves npm to the
      # latest version and fast-forwards a no-ref git clone to its default branch head.
      if ! out="$(pi update "$spec" 2>&1)"; then
        echo "FAILED: pi update $spec" >&2
        [ -n "$out" ] && echo "$out" | sed 's/^/    /' >&2
        failed=1; break
      fi
      echo "ok: pi update $spec (latest)"
      ;;
    UNPIN|INSTALL-LATEST)
      # Unpinned manifest entry: settle settings, then force the latest release.
      # (A bare install can resolve within a previously recorded range — the explicit
      #  update pass is what actually guarantees "latest".)
      if ! out="$(pi install "$spec" 2>&1)"; then
        echo "FAILED: pi install $spec" >&2
        [ -n "$out" ] && echo "$out" | sed 's/^/    /' >&2
        failed=1; break
      fi
      if ! out="$(pi update "$spec" 2>&1)"; then
        echo "FAILED: pi update $spec" >&2
        [ -n "$out" ] && echo "$out" | sed 's/^/    /' >&2
        failed=1; break
      fi
      echo "ok: pi install+update $spec (unpinned, latest)"
      ;;
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

# Retired entries (formerly-manifest packages and duplicate checkouts of this repo)
# are removed even in additive mode: they are one-time migrations, not unrelated drift.
retired=0
for spec in "${RETIRE_SPECS[@]}"; do
  if ! out="$(pi remove "$spec" 2>&1)"; then
    echo "FAILED: pi remove $spec (retired/duplicate)" >&2
    [ -n "$out" ] && echo "$out" | sed 's/^/    /' >&2
    failed=1; break
  fi
  echo "ok: pi remove $spec (retired/duplicate — no longer in the manifest)"
  retired=$((retired + 1))
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
      R) printf '  [RETIRE    ] %s\n' "$a" ;;
    esac
  done >&2
  exit 1
fi

if [ "$MODE" = "prune" ]; then
  echo
  echo "removed $removed non-manifest package(s)"
fi

# The self-entry moved to a newer release: the clone now carries a newer deployment.json
# and apply.sh. Re-exec once from the updated clone so that manifest converges in this same
# invocation. PI_EXTENSIONS_NO_REEXEC guards against a tag that keeps moving.
if [ "${SELF_CHANGED:-0}" = 1 ] && [ "${PI_EXTENSIONS_NO_REEXEC:-}" != 1 ]; then
  echo
  echo "self-entry updated to ${LATEST_TAG:-the current ref}; re-running apply.sh from the updated clone to converge the new manifest"
  exec env PI_EXTENSIONS_NO_REEXEC=1 bash "$SCRIPT_PATH" "$@"
fi

run_planner post
exit 0
