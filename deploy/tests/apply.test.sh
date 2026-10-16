#!/usr/bin/env bash
# apply.test.sh — regression tests for deploy/apply.sh's monorepo self-entry handling.
#
# Bug under test: apply.sh used to always install the self-entry with the manifest's
# hardcoded SSH URL (`ssh://git@ssh.github.com:443/...`), even when the machine already
# had the same repo installed over HTTPS. A pin bump then installed a *second* clone at
# `git/ssh.github.com/` and could leave two settings entries. The fix must reuse the
# URL/scheme the machine already resolves to (or the documented PI_EXTENSIONS_SELF_URL
# override) and stay a NOOP afterwards.
#
# Everything runs against a fake `pi` that mutates a scratch settings.json — no network.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY="$HERE/../apply.sh"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
MANIFEST="$REPO_ROOT/deployment.json"
VERSION="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version)' "$MANIFEST")"
FAILS=0

fail() { echo "  FAIL: $*" >&2; FAILS=$((FAILS + 1)); }
ok()   { echo "  ok: $*"; }
TMPROOT="$(mktemp -d "${TMPDIR:-/tmp}/apply-test.XXXXXX")"
trap 'rm -rf "$TMPROOT"' EXIT

# --- scratch environment ----------------------------------------------------
new_env() {
  ENV_DIR="$(mktemp -d "$TMPROOT/env.XXXXXX")"
  AGENT_DIR="$ENV_DIR/agent"; mkdir -p "$AGENT_DIR"
  BIN_DIR="$ENV_DIR/bin";  mkdir -p "$BIN_DIR"
  FAKE_LOG="$ENV_DIR/pi.log"; : > "$FAKE_LOG"
  write_fake_pi
}

# A fake pi CLI. It keys entries by the URL the way pi keys clone paths (the literal
# host is significant), so installing an SSH spec while an HTTPS entry exists really
# does produce a second entry — exactly the bug we are guarding against.
write_fake_pi() {
  cat > "$BIN_DIR/pi" <<'FAKEPI'
#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const agent = process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME, ".pi", "agent");
const settingsPath = path.join(agent, "settings.json");
const logPath = process.env.FAKE_PI_LOG;
function log(line) { fs.appendFileSync(logPath, line + "\n"); }
function load() { try { const j = JSON.parse(fs.readFileSync(settingsPath, "utf8")); return Array.isArray(j.packages) ? j.packages : []; } catch { return []; } }
function save(pkgs) { let j = {}; try { j = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch {} j.packages = pkgs; fs.mkdirSync(path.dirname(settingsPath), { recursive: true }); fs.writeFileSync(settingsPath, JSON.stringify(j, null, 2) + "\n"); }
function splitRef(spec) {
  if (spec.startsWith("npm:")) return { base: spec.slice(4), ref: null };
  const s = spec.startsWith("git:") ? spec.slice(4) : spec;
  const i = s.lastIndexOf("@");
  const scheme = s.indexOf("://");
  const authEnd = scheme < 0 ? -1 : (s.indexOf("/", scheme + 3) < 0 ? s.length : s.indexOf("/", scheme + 3));
  if (i > 0 && (authEnd < 0 ? s.indexOf(":") < i : i > authEnd)) return { base: s.slice(0, i), ref: s.slice(i + 1) };
  return { base: s, ref: null };
}
function key(spec) { return splitRef(spec).base.replace(/\.git$/, ""); }
const argv = process.argv.slice(2);
const cmd = argv[0];
if (cmd === "--version") { console.log("9.9.9"); process.exit(0); }
if (cmd === "install") { const spec = argv[1]; log("install\t" + spec); save(load().filter((p) => key(p) !== key(spec)).concat([spec])); process.exit(0); }
if (cmd === "remove")  { const spec = argv[1]; log("remove\t" + spec);  save(load().filter((p) => key(p) !== key(spec))); process.exit(0); }
if (cmd === "update")  { log("update\t" + argv[1]); process.exit(0); }
process.exit(0);
FAKEPI
  chmod +x "$BIN_DIR/pi"
}

run_apply() { env PI_CODING_AGENT_DIR="$AGENT_DIR" FAKE_PI_LOG="$FAKE_LOG" PI_EXTENSIONS_LATEST_TAG="$VERSION" PATH="$BIN_DIR:$PATH" bash "$APPLY" "$@"; }
run_apply_override() { env PI_CODING_AGENT_DIR="$AGENT_DIR" FAKE_PI_LOG="$FAKE_LOG" PI_EXTENSIONS_LATEST_TAG="$VERSION" PI_EXTENSIONS_SELF_URL="$1" PATH="$BIN_DIR:$PATH" bash "$APPLY" "${@:2}"; }
seed_settings() { node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ packages: JSON.parse(process.argv[2]) }, null, 2) + "\n")' "$AGENT_DIR/settings.json" "$1"; }
self_entries() { node -e 'const j = require(process.argv[1]); console.log(j.packages.filter((p) => String(p).includes("assid2/pi-extensions")).join("\n"))' "$AGENT_DIR/settings.json"; }
log_has() { grep -qF "$(printf '%s\t%s' "$1" "$2")" "$FAKE_LOG"; }
count_log() { grep -cF "$(printf '%s\t' "$1")" "$FAKE_LOG" || true; }

THIRD_PARTY='"npm:@tintinweb/pi-subagents","npm:@monotykamary/pi-tps","git:github.com/obra/superpowers","npm:remote-pi"'

# --- tests ------------------------------------------------------------------
test_local_npm_duplicate_retired() {
  echo "A8 a local copy of a managed npm package is retired in favour of the npm entry"
  new_env
  local rp="$ENV_DIR/remote-pi"; mkdir -p "$rp"
  printf '{"name":"remote-pi","version":"0.0.0"}\n' > "$rp/package.json"
  seed_settings "$(node -e 'console.log(JSON.stringify([process.argv[1], "https://github.com/assid2/pi-extensions.git@" + process.argv[2], "npm:@tintinweb/pi-subagents", "npm:@monotykamary/pi-tps", "git:github.com/obra/superpowers"]))' "$rp" "$VERSION")"
  run_apply > "$ENV_DIR/apply.out" 2>&1 || fail "apply exited non-zero: $(cat "$ENV_DIR/apply.out")"
  log_has remove "$rp" || fail "local remote-pi copy not retired (log: $(grep remove "$FAKE_LOG" || true))"
  log_has install "npm:remote-pi" || fail "managed npm:remote-pi not installed"
  run_apply --check >/dev/null 2>&1 || fail "--check not converged after retiring the local copy"
}

test_bad_override_rejected() {
  echo "A7 an override for a different repo is rejected before any install"
  new_env
  seed_settings "[$THIRD_PARTY]"
  if run_apply_override "https://github.com/example/other.git" > "$ENV_DIR/override.out" 2>&1; then
    fail "apply accepted an override for a different repository"
  fi
  grep -qF "PI_EXTENSIONS_SELF_URL does not point at this repository" "$ENV_DIR/override.out" \
    || fail "wrong error for a bad override: $(cat "$ENV_DIR/override.out")"
  [ ! -s "$FAKE_LOG" ] || fail "pi was invoked despite a bad override: $(cat "$FAKE_LOG")"
}

test_git_shorthand_self_reused() {
  echo "A6 a git:-shorthand self entry is reused with its prefix intact"
  new_env
  seed_settings "[\"git:github.com/assid2/pi-extensions@v0.0.0\",$THIRD_PARTY]"
  run_apply > "$ENV_DIR/apply.out" 2>&1 || fail "apply exited non-zero: $(cat "$ENV_DIR/apply.out")"
  log_has install "git:github.com/assid2/pi-extensions@$VERSION" \
    || fail "did not reuse the git: shorthand self URL (log: $(grep install "$FAKE_LOG" || true))"
  if grep -qF "ssh.github.com" "$FAKE_LOG"; then fail "used SSH instead of the git: shorthand"; fi
  run_apply --check >/dev/null 2>&1 || fail "--check not converged after bump"
}

test_git_duplicate_self_retired() {
  echo "A5 a duplicate git self-entry (both schemes) is retired, keeping one"
  new_env
  seed_settings "[\"https://github.com/assid2/pi-extensions.git@$VERSION\",\"ssh://git@ssh.github.com:443/assid2/pi-extensions.git@$VERSION\",$THIRD_PARTY]"
  run_apply > "$ENV_DIR/apply.out" 2>&1 || fail "apply exited non-zero: $(cat "$ENV_DIR/apply.out")"
  log_has remove "ssh://git@ssh.github.com:443/assid2/pi-extensions.git@$VERSION" \
    || fail "duplicate ssh self-entry not retired (log: $(grep remove "$FAKE_LOG" || true))"
  local n; n="$(self_entries | grep -c .)"
  [ "$n" -eq 1 ] || fail "expected one self entry after dedup, got $n: $(self_entries)"
  self_entries | grep -q '^https://' || fail "retired the https entry instead of the duplicate ssh one: $(self_entries)"
  run_apply --check >/dev/null 2>&1 || fail "--check not converged after retiring the duplicate"
}

test_https_bump_stays_https() {
  echo "A1 https-installed machine bumps tag: HTTPS install, one entry, NOOP afterwards"
  new_env
  seed_settings "[\"https://github.com/assid2/pi-extensions.git@v0.0.0\",$THIRD_PARTY]"
  run_apply > "$ENV_DIR/apply.out" 2>&1 || fail "apply exited non-zero: $(cat "$ENV_DIR/apply.out")"
  log_has install "https://github.com/assid2/pi-extensions.git@$VERSION" \
    || fail "did not install the existing https URL at $VERSION (log: $(grep install "$FAKE_LOG" || true))"
  if grep -qF "ssh.github.com" "$FAKE_LOG"; then fail "used the hardcoded SSH self URL: $(grep ssh.github.com "$FAKE_LOG")"; fi
  local n; n="$(self_entries | grep -c .)"
  [ "$n" -eq 1 ] || fail "expected exactly one self entry, got $n: $(self_entries)"
  self_entries | grep -q '^https://' || fail "self entry is not https: $(self_entries)"

  run_apply --check >/dev/null 2>&1 || fail "--check not converged after the bump"

  # A second apply must be a NOOP: no further self install, plan says NOOP, --check passes.
  local before; before="$(count_log install)"
  run_apply > "$ENV_DIR/apply2.out" 2>&1 || fail "second apply exited non-zero: $(cat "$ENV_DIR/apply2.out")"
  [ "$(count_log install)" -eq "$before" ] || fail "second apply installed again"
  local plan_out; plan_out="$(run_apply --dry-run 2>&1)"
  grep -q '\[NOOP' <<<"$plan_out" || fail "self entry is not NOOP after the bump: $plan_out"
  run_apply --check >/dev/null 2>&1 || fail "--check not converged after a second apply"
}

test_self_url_override() {
  echo "A2 PI_EXTENSIONS_SELF_URL overrides the fresh-install URL"
  new_env
  seed_settings "[$THIRD_PARTY]"
  run_apply_override "https://github.com/assid2/pi-extensions.git" >/dev/null 2>&1 || fail "apply with override failed"
  log_has install "https://github.com/assid2/pi-extensions.git@$VERSION" \
    || fail "override not used (log: $(grep install "$FAKE_LOG" || true))"
  if grep -qF "ssh.github.com" "$FAKE_LOG"; then fail "SSH used despite the override"; fi
}

test_fix_uses_existing_url() {
  echo "A3 redundant git entry beside a dev checkout is removed by its own URL"
  new_env
  local dev="$ENV_DIR/dev-checkout"; mkdir -p "$dev"
  git -C "$dev" init -q
  git -C "$dev" remote add origin ssh://git@ssh.github.com:443/assid2/pi-extensions.git
  seed_settings "$(node -e 'console.log(JSON.stringify([process.argv[1], "https://github.com/assid2/pi-extensions.git@v1.1.4", "npm:@tintinweb/pi-subagents", "npm:@monotykamary/pi-tps", "git:github.com/obra/superpowers"]))' "$dev")"
  run_apply > "$ENV_DIR/apply.out" 2>&1 || fail "apply exited non-zero: $(cat "$ENV_DIR/apply.out")"
  log_has remove "https://github.com/assid2/pi-extensions.git@v1.1.4" \
    || fail "FIX did not remove the existing https entry (log: $(grep remove "$FAKE_LOG" || true))"
  if grep -qF "ssh.github.com" "$FAKE_LOG"; then fail "FIX used the hardcoded SSH URL"; fi
  self_entries | grep -q '^ssh://' && fail "a redundant ssh entry appeared: $(self_entries)"
}

test_unpinned_ssh_url_recognized() {
  echo "A4 an unpinned ssh self entry (userinfo, no ref) is recognized, not re-installed"
  new_env
  seed_settings "[\"ssh://git@ssh.github.com:443/assid2/pi-extensions.git\",$THIRD_PARTY]"
  run_apply --dry-run > "$ENV_DIR/plan.out" 2>&1 || fail "dry-run failed"
  if grep -qF '[INSTALL' "$ENV_DIR/plan.out"; then fail "unpinned ssh self entry not recognized as the same repo: $(cat "$ENV_DIR/plan.out")"; fi
  grep -q '\[MOVE' "$ENV_DIR/plan.out" || fail "expected MOVE for the unpinned self entry"
}

test_https_bump_stays_https
test_self_url_override
test_fix_uses_existing_url
test_unpinned_ssh_url_recognized
test_git_duplicate_self_retired
test_git_shorthand_self_reused
test_bad_override_rejected
test_local_npm_duplicate_retired

if [ "$FAILS" -eq 0 ]; then
  echo "PASS (apply)"
else
  echo "$FAILS check(s) failed"
  exit 1
fi
