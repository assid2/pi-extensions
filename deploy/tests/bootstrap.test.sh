#!/usr/bin/env bash
# bootstrap.test.sh — the model-free first install must run entirely through the pi CLI,
# with no provider/model. Fake `pi` simulates install + list + the created clone.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP="$HERE/../bootstrap.sh"
FAILS=0
fail() { echo "  FAIL: $*" >&2; FAILS=$((FAILS + 1)); }
ok()   { echo "  ok: $*"; }
TMPROOT="$(mktemp -d "${TMPDIR:-/tmp}/bootstrap-test.XXXXXX")"
trap 'rm -rf "$TMPROOT"' EXIT

new_env() {
  ENV_DIR="$(mktemp -d "$TMPROOT/env.XXXXXX")"
  AGENT_DIR="$ENV_DIR/agent"; mkdir -p "$AGENT_DIR"
  BIN_DIR="$ENV_DIR/bin";  mkdir -p "$BIN_DIR"
  FAKE_LOG="$ENV_DIR/pi.log"; : > "$FAKE_LOG"
  CLONE="$AGENT_DIR/git/ssh.github.com/assid2/pi-extensions"
  cat > "$BIN_DIR/pi" <<FAKEPI
#!/usr/bin/env bash
case "\$1" in
  --version) echo "9.9.9"; exit 0 ;;
  install)
    printf 'install\t%s\n' "\$2" >> "$FAKE_LOG"
    mkdir -p "$CLONE/deploy"
    printf '#!/usr/bin/env bash\necho applied >> "%s"\n' "$FAKE_LOG" > "$CLONE/deploy/apply.sh"
    exit 0 ;;
  list) echo "  ssh://git@ssh.github.com:443/assid2/pi-extensions.git@v9.9.9"; echo "    $CLONE"; exit 0 ;;
  *) exit 0 ;;
esac
FAKEPI
  chmod +x "$BIN_DIR/pi"
}

run_bootstrap() { env PI_CODING_AGENT_DIR="$AGENT_DIR" FAKE_PI_LOG="$FAKE_LOG" PI_EXTENSIONS_LATEST_TAG="${TAG:-v9.9.9}" PI_EXTENSIONS_SKIP_HOST_SETUP=1 PATH="$BIN_DIR:$PATH" bash "$BOOTSTRAP" "$@"; }
log_has() { grep -qF "$(printf '%s\t%s' "$1" "$2")" "$FAKE_LOG"; }

test_bootstrap_installs_latest_tag_model_free() {
  echo "B1 bootstrap installs the newest tag and runs apply.sh with no model"
  new_env
  run_bootstrap > "$ENV_DIR/out" 2>&1 || fail "bootstrap exited non-zero: $(cat "$ENV_DIR/out")"
  log_has install "ssh://git@ssh.github.com:443/assid2/pi-extensions.git@v9.9.9" \
    || fail "did not install the resolved tag (log: $(cat "$FAKE_LOG"))"
  grep -q '^applied$' "$FAKE_LOG" || fail "the clone's deploy/apply.sh was not run"
  grep -q 'installing ssh://git@ssh.github.com:443/assid2/pi-extensions.git@v9.9.9' "$ENV_DIR/out" \
    || fail "did not announce the install"
}

test_bootstrap_honours_self_url() {
  echo "B2 PI_EXTENSIONS_SELF_URL is used for the install"
  new_env
  env PI_CODING_AGENT_DIR="$AGENT_DIR" FAKE_PI_LOG="$FAKE_LOG" PI_EXTENSIONS_LATEST_TAG=v9.9.9 PI_EXTENSIONS_SELF_URL="https://github.com/assid2/pi-extensions.git" PI_EXTENSIONS_SKIP_HOST_SETUP=1 PATH="$BIN_DIR:$PATH" \
    bash "$BOOTSTRAP" > "$ENV_DIR/out" 2>&1 || fail "bootstrap exited non-zero: $(cat "$ENV_DIR/out")"
  log_has install "https://github.com/assid2/pi-extensions.git@v9.9.9" || fail "SELF_URL override not used"
}

test_bootstrap_missing_pi_errors() {
  echo "B3 bootstrap explains how to install pi when it is absent (no stack install attempted)"
  new_env
  local emptybin="$ENV_DIR/emptybin"; mkdir -p "$emptybin"
  env PI_CODING_AGENT_DIR="$AGENT_DIR" FAKE_PI_LOG="$FAKE_LOG" PI_EXTENSIONS_LATEST_TAG=v9.9.9 PATH="$emptybin:/usr/bin:/bin" bash "$BOOTSTRAP" > "$ENV_DIR/out" 2>&1
  local rc=$?
  [ "$rc" -ne 0 ] || fail "bootstrap exited 0 without pi on PATH"
  grep -q 'pi is not on PATH' "$ENV_DIR/out" || fail "did not explain the missing pi: $(cat "$ENV_DIR/out")"
  [ ! -s "$FAKE_LOG" ] || fail "pi was invoked despite being absent"
}

test_bootstrap_installs_latest_tag_model_free
test_bootstrap_honours_self_url
test_bootstrap_missing_pi_errors

if [ "$FAILS" -eq 0 ]; then
  echo "PASS (bootstrap)"
else
  echo "$FAILS check(s) failed"
  exit 1
fi
