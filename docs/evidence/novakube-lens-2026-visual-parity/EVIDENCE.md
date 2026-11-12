# NovaKube / Mirantis Lens 2026.10 — visual parity evidence

Reference: the user's locally installed Mirantis Lens **2026.10.261408**, Dark theme. The reference screenshot was inspected locally. This is a **visual parity audit, not a certification of pixel-identical UI/UX**: NovaKube and Lens have different navigation/features, cluster data, and window content.

## Scope

NovaKube's theme is opt-in and scoped to `body.theme-novakube`. Cursor remains the default. No source changes to Lens, no copied proprietary binaries, no account credentials or production-cluster network requests.

- Lens-like typography: Open Sans, regular/medium weights, 8px spacing unit, 3px radius.
- Top bar 40px, workspace tabs 36px, navigator approximately 308px, pin rail 60px, compact namespace combobox 220×26px.
- Lens Dark core palette and secondary UI tokens, including Helm Markdown, dock, controls, charts, selection, links and focus. Production/cluster environment and incident severity colors remain NovaKube-specific.
- Pods: toolbar layout, 34px header, row/cell backgrounds, selected/hover colors and neutral text.
- Dock: neutral graphite tab, magenta terminal glyph, terminal context and black canvas.
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

**2026-11-11 result:** **21/21 checks PASS**, zero document-wide horizontal overflow at all four sizes. Separate Jest regression check: **39/39 PASS across 6 suites**. Theme files pass targeted ESLint. Electron macOS real window verified; no merge/push and no changes to the installed NovaKube bundle.

## Build / release caveat

Development webpack core main/renderer bundles compiled successfully with `SKIP_TS_CHECK=1` (a repository-supported development flag). Independent project-wide `tsc --noEmit` is **not green**: 123 errors remain in unrelated existing code after eliminating 110 theme declaration warnings. No production release or claim of comprehensive app parity should be made until unrelated type errors are addressed and a release candidate is rebuilt and audited.

## Outstanding visible differences and constraints

1. The official Lens screenshot shows a live K3s cluster with 23 Pods; the safe NovaKube demo has two synthetic Pods. Screenshots cannot be subtracted pixel-for-pixel without identical data/viewport/setup.
2. NovaKube intentionally retains its own branding, Incident Center, Kubetail, DevOps controls, environment chips and safety functionality. Official Lens has proprietary account/premium/AI controls that are not replicated.
3. Navigation trees and toolbar actions differ as products; visual token parity is substantially improved but **the full UI and UX are not identical**.
4. Product-wide compilation remains blocked by existing TypeScript errors. A final distributable should be built only after type-check and full functional/release regression gates pass.

The purpose of this checkpoint is to establish a reproducible, safe basis for subsequent pixel-by-pixel comparisons with identical content, not to imply that all Lens and NovaKube screens already match.
