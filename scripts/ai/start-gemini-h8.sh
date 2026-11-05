#!/usr/bin/env bash
set -euo pipefail

# Canonical OpenLens DevOps H8 workspace; the parent directory contains unrelated repositories.
REPO="/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections"
EXPECTED_BRANCH="feature/h8-ai-incident-workbench"
if [[ ! -d "$REPO/.git" ]]; then
  printf 'OpenLens workspace not found: %s\n' "$REPO" >&2
  exit 1
fi
cd "$REPO"
if [[ "$(git branch --show-current)" != "$EXPECTED_BRANCH" ]]; then
  printf 'Expected branch %s, found %s. Refusing to switch automatically.\n' "$EXPECTED_BRANCH" "$(git branch --show-current)" >&2
  exit 2
fi
export ENGRAM_PROJECT="lens-v6-ui-corrections"
printf 'OpenLens H8 workspace: %s\n' "$PWD"
printf 'Git branch: %s\n' "$EXPECTED_BRANCH"
printf 'Engram project: %s\n' "$ENGRAM_PROJECT"
exec gemini "$@"
