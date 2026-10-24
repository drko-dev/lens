# R7-09 — Authorized Global Jest Runbook

## Purpose and current execution boundary

The previous global Jest run in this worktree is **invalid as a code-regression baseline**: the local sandbox prevented a shared DI bootstrap import. Do not work around that restriction with stubs, skipped suites, alternate fixtures, or policy changes.

The authorized Mac is online, but this session's Remote Desktop Commander `start_process` call returned `MCP tool call requires approval, but approval policy is never`. No process started. Per instruction, do not retry that call unless the authorization state changes. The user reports a separate Node 20.20.2 `api-manager.test.ts` run with 1 suite / 8 tests passing and exit code 0; that result is external to this session and no raw JSON/log was supplied here.

## Full global Jest command

Run only from an already-authorized Mac process context. This command pins Node 20.20.2, uses `--ci` (no snapshot updates), runs serially, writes a unique JSON/log pair, and returns Jest's exact exit code. It refuses a timestamp collision rather than overwriting evidence.

```zsh
ROOT=/Users/gustavomarcon/Documents/lens/lens-r7-09-consolidation
NODE_BIN=/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin
export PATH="$NODE_BIN:$PATH"
test "$(node --version)" = "v20.20.2" || exit 78

STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
JSON="$ROOT/docs/revival/evidence/r7-09/R7_09_GLOBAL_JEST_${STAMP}.json"
LOG="$ROOT/docs/revival/logs/R7_09_GLOBAL_JEST_${STAMP}.log"
test ! -e "$JSON" && test ! -e "$LOG" || exit 73

cd "$ROOT/packages/core" || exit 72
set +e
{
  printf 'COMMAND: ../../node_modules/.bin/jest --ci --runInBand --cacheDirectory /tmp/r7-09/jest-cache --json --outputFile=%s src\n' "$JSON"
  printf 'NODE: '; node --version
  ../../node_modules/.bin/jest --ci --runInBand \
    --cacheDirectory /tmp/r7-09/jest-cache \
    --json --outputFile="$JSON" src
  rc=$?
  printf '\nJEST_EXIT_CODE=%s\n' "$rc"
} > "$LOG" 2>&1
printf 'JSON=%s\nLOG=%s\nEXIT_CODE=%s\n' "$JSON" "$LOG" "$rc"
exit "$rc"
```

Keep both files even when Jest exits nonzero. Record the resulting commit SHA and classify every failure against the historical report of **69 failed suites / 318 failed tests**; do not assume the counts or failure identities match. Review snapshots individually and update only those proven stale against intended behavior.

This runbook does not authorize or certify TypeScript, ESLint, packaging, or Electron E2E. Those gates remain pending their own permitted execution and evidence.
