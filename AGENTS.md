# NovaKube (lens-v6-ui-corrections) — Agent Rules & Testing Policy

## Testing & Resource Coordination Policy (MANDATORY)

To prevent macOS CPU/RAM/disk saturation and avoid locking up the workstation:

### PROHIBITED
- Running all Jest suites in parallel.
- Running multiple E2E runners simultaneously.
- Launching full test suites concurrently from multiple subagents.
- Duplicating test runs against the same Electron/CDP instance.
- Saturating CPU, RAM, or disk (`< 5Gi` free triggers immediate cleanup).
- Running the full H7 E2E suite after every small edit.

### MANDATORY
- **Single Test Coordinator**: Only the main orchestrator schedules and runs heavy test suites (Jest / E2E / builds).
- **Serial Heavy Execution**: At most **one** heavy runner active at a time. Subagents may research, inspect, and design tests in parallel, but heavy execution MUST run exclusively in series.
- **Focused Jest**: Run targeted Jest test paths with `--maxWorkers=2` during active milestones.
- **Sequential Isolated E2E**: Run E2E suites one at a time using isolated `--user-data-dir` profiles; never touch the user's real Lens/OpenLens profile or `/Applications/Lens.app`.
- **Full Suites at Final Checkpoints Only**: Reserve full `h7-docking-e2e.mjs` and multi-suite runs for milestone/final checkpoints.
- **Resource Monitoring**: Check `df -h` / active processes before heavy builds or suites, and cancel/clean up stalled processes.
- **Preserve Electron DEV & Hot Reload**: Keep the single Electron DEV instance (`--remote-debugging-port=9223`) and webpack dev servers healthy across edits; never use the standalone `.app` as a DEV environment.

## Mandatory frontend skill — GoogleChrome Modern Web Guidance

**Cross-project policy (2026-11-22):** before changing any web frontend, including Electron renderer UI, agents MUST consult the vendored [Modern Web Guidance skill](.agents/skills/modern-web-guidance/SKILL.md) from https://github.com/GoogleChrome/modern-web-guidance (Apache-2.0). Scope: HTML/CSS, browser-side JavaScript/DOM, UI components, forms, visual states, a11y, browser security, compatibility, and performance—not backend, CI/CD, Git, Kubernetes, or unrelated test/config changes.

Required workflow: (1) search for a focused 2–5 word English UI topic, e.g. `npx -y modern-web-guidance@latest search "responsive data table" --skill-version 2026_11_10-47b4c80e`; (2) retrieve relevant IDs using `npx -y modern-web-guidance@latest retrieve "<guide-id>"`; (3) follow supported-runtime compatibility and fallback guidance, and verify behavior/tests; (4) summarize relevant guide-driven decisions. Follow the complete SKILL.md and do not invent guide IDs.

Preserve all existing NovaKube/Lens product rules, branding/tokens, es-AR/en-US localization, Electron test scheduling/resource controls, contracts, and security boundaries. Do not add dependencies, run global legacy scans, or broaden milestones just to apply this policy. Google Antigravity may additionally install the official plugin with `agy plugin install https://github.com/GoogleChrome/modern-web-guidance`.

- **Canonical governance standard:** `NovaKube-Workspace/docs/standards/FRONTEND_ENGINEERING_STANDARD.md`.
- **Runtime target:** **Electron 45.2.0 / bundled Chromium** (React + Webpack). Still avoid unstable/experimental APIs and Origin Trials without explicit authorization and compatibility review.
- **Gemini CLI extension:** `gemini extensions install https://github.com/GoogleChrome/modern-web-guidance --auto-update`. Group queries by feature rather than per file.
