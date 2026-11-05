# GEMINI.md — OpenLens DevOps H7 / RC4

This is the project-local instruction file for Gemini. It is intentionally specific to the current Mac workspace. Read docs/GEMINI_HANDOFF_OPENLENS_H7_RC4_2026-11-04.md before changing code. Read the authoritative final milestone reports rather than relying only on Engram's older observations.

## 1. Canonical workspace — non-negotiable

- Absolute repository/worktree: /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections
- Git branch: feature/global-docking-h7
- Git remote: git@github.com:drko-dev/lens.git
- HEAD at handoff: 02caa15 (2026-11-04); always recheck instead of assuming.
- Current Git worktrees: ONE, the path above. Inspect with git worktree list --porcelain. Other Git branches are refs, not separate worktrees.
- This is NOT /Users/gustavomarcon/Documents/lens and NOT /Users/gustavomarcon/Documents/lens/kubetail. Kubetail is a separate sibling Git repository. Never choose it when asked which project to use.
- Do not clone or create a worktree automatically. Never change branches, pull, push, merge, rebase, reset --hard or git clean without explicit authorization.
- Do not add unrelated untracked .omc, .codebase-memory, images, scratch scripts, backups or files from odd/tasks. Stage explicit paths only.
- The local branch is ahead of origin; commits have NOT been pushed or merged. Remote default is develop: do not touch it.
- Safe launcher: scripts/ai/start-gemini-h7.sh. Always launch from the repository root (not from its parent). Do not use Gemini's --worktree flag by default.

## 2. Engram — canonical memory only

- Canonical Engram project key: lens-v6-ui-corrections.
- Project-local .gemini/settings.json launches Engram MCP with --project lens-v6-ui-corrections and ENGRAM_PROJECT set to the same key.
- Before reading or saving project memory, check mem_current_project: expected project lens-v6-ui-corrections, project_source process_override, cwd equal to this exact repository root, and available_projects empty/null.
- If Engram shows kubetail or asks to choose between repositories, STOP: the agent was started from the wrong directory or an outdated MCP process is still running. Restart Gemini using the launcher. Do not choose kubetail, guess or use an all-projects memory search.
- The Engram database also contains historical OpenLens observations under the older project key lens. Do not merge/delete/relabel other projects automatically. This handoff consolidates essential current context under the canonical project.
- Memory is useful context, not authority over live Git status, source code or the dated release reports.

## 3. Current product status — source of truth

- H7.1–H7.8 completed. H7.8 RC4 is PASS for INTERNAL QA ONLY, not a public release.
- Last approved H7 functional regression: 186 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED on code commit 6504144 (documented in docs/H7_7_PERSISTENCIA_Y_RESTAURACION.md).
- Packaged RC4 smoke: 13/13 PASS, run outside DEV from read-only mounted DMG, with isolated QA profile. RC3 rollback PASS. No orphan processes after smoke.
- Current HEAD 02caa15 adds the RC4 closure report and packaged harness; inspect git log to confirm newer changes.
- RC4: open-lens/dist/rc4/OpenLens DevOps-6.5.3-dev-arm64-RC4.dmg
- RC4 SHA256: 1a4e9979adc79f17209b9d7a9775a09683fd6ba2a4bbe76114fdb8124c35fc92
- RC3 rollback reference: /Users/gustavomarcon/Documents/lens/releases/rc3-pre-h7-2026-11-02/OpenLens DevOps-6.5.3-dev-arm64-RC3.dmg
- RC3 SHA256: 805972f6e58e476a840536e3ae4bb1a9817d6f27d33af27ae97131f7206c3197
- Preserve RC2, BOTH RC3 copies, RC4, manifests, accepted evidence and user QA profiles.
- Signing is ad-hoc; no Apple Developer ID or notarization. Not ready for public distribution.

## 4. Architecture and critical invariants

- Electron 45.2.0, Node 24.22.2, macOS Apple Silicon M4, Kubernetes/Lens monorepo.
- Global Docking feature flag: localStorage openlens:global-docking, default OFF. Preserve classic navigation with flag OFF.
- Reuse the existing SplitPanelStore / panel host engine; no second docking engine.
- One cluster per cluster workspace; separate root host for Settings and Catalog, without fake clusterId.
- Stable session ownership: existing stores for Logs, Monaco Editor, PTY Terminal in Electron Main, and Kubetail; no duplicated watchers/streams/processes.
- Session restoration is INERT for terminal, pod logs, editor and Kubetail. Never restore PROD authorization, PTY, unsaved drafts, credentials, logs buffers or live connections from layout JSON.
- Production Terminal authorization must be validated in Main, one-time and scoped to clusterId/tabId; never bypass.
- Keep Cursor/Midnight Graphite UI, 28px headers, 2px cluster identity stripe. Do not redesign UI without request.
- Never use real Kubernetes clusters or real kubeconfigs for tests or write operations. QA profile: /Users/gustavomarcon/Documents/lens/qa-profiles/h7-dev, using isolated HOME, CICD, KUBECONFIG and synthetic API.

## 5. Paths to read before implementation

- docs/GEMINI_HANDOFF_OPENLENS_H7_RC4_2026-11-04.md — handoff, navigation, Git, worktree and release constraints.
- docs/H7_8_RC4_CIERRE.md — authoritative final internal RC4 status.
- docs/H7_7_PERSISTENCIA_Y_RESTAURACION.md — schema, safe restore, tested limitations.
- docs/H7_6_3_COMPONENTES_CON_ESTADO.md — Details, Logs, Editor, Terminal, Kubetail.
- docs/H7_6_4_VISTAS_GLOBALES.md — Settings, Catalog; extensions deferred.
- docs/H7_RUNBOOK_DOCKING_GLOBAL_MVP_2026-11-02.md — original plan: some historical prompts/checkboxes are stale; consult newer closure reports.
- docs/H7_QA_PLAYWRIGHT_ELECTRON.md — historical QA evolution.
- docs/H6_BUILD_MACOS_ARM64.md — build notes; use RC4 closure report for the corrected signing sequence.
- packages/core/src/features/global-docking/ — Global Docking product implementation.
- packages/core/src/renderer/components/split-panel/ — shared layout engine.
- packages/core/src/renderer/components/dock/ — classic Dock/Logs/Editor/Terminal.
- packages/core/src/renderer/components/kubetail/ — Kubetail store and view.
- open-lens/integration/h7-docking-e2e.mjs, open-lens/integration/h7/ — Playwright harness and synthetic API.

## 6. Workflow / test budget

- User prefers Sonnet 5.5 coordinator with independent Sonnet subagents and Haiku for focused Playwright QA, when available.
- Maximize development progress; do NOT automatically repeat the 186-test E2E or 4,039 Core tests. Execute changed-module unit tests and limited smoke; save a complete regression for an explicitly agreed final candidate.
- Read historical failures and their context; do not mass-update snapshots just to turn failures green.
- One heavy build and one Electron QA instance at a time. Check disk and RAM first; no arbitrary 20/25 GiB hard stop if actual headroom is sufficient.
- Do not run npm run clean (would remove dist/rc2 and dist/rc3). No DMG rebuild unless requested.
- No manual tests required from the user; automated focused tests in the isolated environment only.
- Do not restart the Mac, delete swap/snapshots, kill unrelated processes, or delete project artifacts without permission.
- Do not attribute AI in Git commits. Use scoped conventional commits, stage explicit paths; never push or merge automatically.

## 7. Start-of-session procedure

1. pwd, git rev-parse --show-toplevel, git branch --show-current, git status --short --branch, git worktree list --porcelain, git remote -v.
2. Verify Engram mem_current_project returns the canonical project and cwd, without ambiguity.
3. Read this file and the handoff plus the relevant source/closure documents.
4. State current task and scope. RC4 internal QA is already approved; do not invent pending functional work. Ask the user what to change next if no task was supplied.
5. Implement only the requested change, validate minimally, document results and preserve unrelated files.
## 8. H8 — AI Incident Center PLANNING (new 2026-11-04)

- The user supplied a conceptual architecture document stored OUTSIDE the repo at /Users/gustavomarcon/Documents/lens/OPENLENS_AI_ARCHITECTURE_DECISIONS.md. Verified byte-identical to the uploaded document by SHA-256. Treat later decisions in that document as superseding earlier proposals.
- H8 is PLANNED, not coded or accepted; H7.8/RC4 stays frozen. Read docs/H8_AI_INCIDENTES_ROADMAP_2026-11-04.md and docs/H8_AI_INCIDENTES_HISTORIAS_2026-11-04.md before proposing any new AI feature.
- New work includes a local Incident Center, secure restricted read-only evidence broker, optional on-demand AI diagnoses, ephemeral user-uploaded context, and later opt-in local deterministic monitoring. Do not promise 24/7, access to PRD, or free provider API usage.
- Reuse existing packages/core/src/main/mcp/mcp-server.ts and MCP settings after a real security/backend audit; do not build a duplicate MCP service or claim its current status UI proves backend readiness.
- Proposed H8 branch: feature/h8-ai-incident-workbench (NOT created; wait for approval). No production traffic, source edits, tests or builds authorized by creating the planning docs alone.
