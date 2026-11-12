# NovaKube / Mirantis Lens 2026.10 — visual parity evidence

Reference: the user's locally installed Mirantis Lens **2026.10.261408**, Dark theme. The reference screenshot was inspected locally. This is a **visual parity audit, not a certification of pixel-identical UI/UX**: NovaKube and Lens have different navigation/features, cluster data, and window content.

## Scope

NovaKube's theme is opt-in and scoped to `body.theme-novakube`. Cursor remains the default. No source changes to Lens, no copied proprietary binaries, no account credentials or production-cluster network requests.

- Lens-like typography: Open Sans, regular/medium weights, 8px spacing unit, 3px radius.
- Top bar 40px, workspace tabs 36px, navigator approximately 308px, pin rail 60px, compact namespace combobox 220×26px.
- Lens Dark core palette and secondary UI tokens, including Helm Markdown, dock, controls, charts, selection, links and focus. Production/cluster environment and incident severity colors remain NovaKube-specific.
- Pods: toolbar layout, 34px header, row/cell backgrounds, selected/hover colors and neutral text.
- Dock: neutral graphite tab, magenta terminal glyph, terminal context and black canvas.
- Terminal search: official Lens-style 36px inline bar **above** the context header, search controls before the text, Lens wording; the original floating search remains for all non-NovaKube themes, and sessions/PTY are unchanged.
- Navigator: a compact 26px cluster-root row now shows the actual active cluster name, matches its pin color, and displays a green connection indicator only when the existing Cluster model reports both online and ready. The row collapses/expands resources by mouse or keyboard; a 1px guide reuses the active color (including custom/environment/hash fallbacks), with no fixed color imposed on all clusters.
- Every Kubernetes resource list: 40px toolbar with no wrapping title at desktop width, title-case 34px table headers, reference idle/hover row surface, and responsive wrapping without removing CSV, namespace, filter, search or Add actions.
- Scrollbars: 16px track with padded 6px thumb.
- Demo-only fixture repaired: `metrics.k8s.io/v1beta1` now returns local, synthetic `PodMetrics`/`NodeMetrics`, instead of ordinary Pod/Node objects, while all mutating HTTP operations remain rejected. The fixture enabled real-Electron rendering with CPU, memory, two Pods and a working terminal.

## Reproduce

Start the isolated Electron development preview with its local demo cluster open on **Pods** and CDP listening on `127.0.0.1:9223`.

From the repository root:

```bash
node docs/evidence/novakube-lens-2026-visual-parity/audit.mjs
```

The audit restores the original viewport, validates 1440×900, 900×700, 700×700 and 700×500, checks Pods and dock appearance, and writes local screenshots and `evidence.json` to:

`~/Documents/lens/qa-profiles/lens-2026-live-preview/evidence/`

**2026-11-12 result:** **44/44 real-Electron checks PASS** across the same four window sizes, covering Pods, Deployments, terminal search, keyboard-visible control geometry, Navigator pin-color guide and absence of page-wide horizontal overflow. Separate Jest regression check: **55/55 PASS across 10 suites**, including native terminal search, both theme variants, production terminal gating, sidebar filters, screenshots snapshot and demo fixtures. Changed TypeScript files pass targeted ESLint; core renderer/main development webpack bundles compile. Mirantis Lens itself was only inspected/read-only (temporary window resize restored), and the installed NovaKube bundle was not modified.

## Build / release caveat

Development webpack core main/renderer bundles compiled successfully with `SKIP_TS_CHECK=1` (a repository-supported development flag). Independent project-wide `tsc --noEmit` is **not green**: 123 errors remain in unrelated existing code after eliminating 110 theme declaration warnings. No production release or claim of comprehensive app parity should be made until unrelated type errors are addressed and a release candidate is rebuilt and audited.

## Outstanding visible differences and constraints

1. The official Lens screenshot shows a live K3s cluster with 23 Pods; the safe NovaKube demo has two synthetic Pods. Screenshots cannot be subtracted pixel-for-pixel without identical data/viewport/setup.
2. NovaKube intentionally retains its own branding, Incident Center, Kubetail, DevOps controls, environment chips and safety functionality. Official Lens has proprietary account/premium/AI controls that are not replicated.
3. Navigation trees and toolbar actions differ as products; visual token parity is substantially improved but **the full UI and UX are not identical**.
4. Product-wide compilation remains blocked by existing TypeScript errors. A final distributable should be built only after type-check and full functional/release regression gates pass.

The purpose of this checkpoint is to establish a reproducible, safe basis for subsequent pixel-by-pixel comparisons with identical content, not to imply that all Lens and NovaKube screens already match.
