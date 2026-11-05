#!/usr/bin/env bash
set -euo pipefail

# Always open the canonical OpenLens DevOps H7 Git worktree, never its parent
# directory (which also contains the independent Kubetail repository).
REPO="/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections"
if [[ ! -d "$REPO/.git" ]]; then
  printf 'OpenLens workspace not found: %s\n' "$REPO" >&2
  exit 1
fi
cd "$REPO"
export ENGRAM_PROJECT="lens-v6-ui-corrections"
if [[ "$(git branch --show-current)" != "feature/global-docking-h7" ]]; then
  printf 'Expected feature/global-docking-h7. Current branch: %s\n' "$(git branch --show-current)" >&2
  printf 'Not switching branches automatically.\n' >&2
  exit 2
fi
printf 'OpenLens workspace: %s\n' "$PWD"
printf 'Git branch: %s\n' "$(git branch --show-current)"
printf 'Engram scope: %s\n' "$ENGRAM_PROJECT"
exec gemini "$@"
