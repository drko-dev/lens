# OpenLens DevOps Revival — R5-05 Validation

## Details drawer header, owner state and image provenance

- Date: 2026-10-22
- Base: `8587912` (R5-04)
- Build: `scratchpad/r505-build/out/mac-arm64/OpenLens DevOps.app` (ARM64, unsigned),
  `app.asar` sha256 `a435404fbafcf3f3beced436722598d956f4fcd8c1cb3b637e577200631756e4`
- Verdict: **done** — every details drawer gets a shared header (kind, name, namespace, status, actions); owners and image
  provenance are shown without ambiguity. Kubernetes logic, RBAC, confirmations and API requests unchanged.

## Changes

| Area | File(s) | Change |
|---|---|---|
| Header | new `kube-object-details/details-header.tsx` (+ module scss, test), `kube-object-details.tsx` | Drawer title is now a header: kind kicker with icon, full selectable name, namespace chip, status chip (text + `--ok/--warn/--err`) derived only from the object (`readyReplicas/replicas` → "N/M ready", else `status.phase`). Cluster-scoped objects without status show neither chip. No extra env badge (env already in tab, sidebar, status bar). |
| Drawer shell | `drawer/drawer.tsx`, `drawer.scss` | Title area `--surface-1` / `--text-1` (was blue), bottom border, sticky. Toolbar icons: fixed size, `--sp-1` gap, `--surface-2` hover, focus-visible ring. New optional `copyText` prop keeps the copy button when `title` is not a string (string titles unchanged). |
| Rows | `drawer/drawer-item.scss` | Label `--fs-sm` / `--text-2`, value `--text-1`, token padding and `--border-1` separators. |
| Owners | `kube-object-meta/kube-object-meta.tsx` (+ new scss), R4-07 test | "Controlled By" chip per owner: **verified** (resolver `verified`, UID match, link), **stale** (resolver `stale`, UID differs), **not found** (resolver `missing` and the owner store is loaded), **unknown** (resolver `missing` but no store for the kind or store not loaded — covers no access/RBAC; never reported as missing). R4-07 resolver untouched; `data-owner-state`/testids kept. |
| Image provenance | `workloads-pods/pod-details-container.tsx` (+ scss), R4-07 test | "Image" row with a collapsed `<details>`: chevron + one-line summary (image ref, declared digest if pinned, runtime digest or "runtime not resolved yet", mismatch flag). Expanded: Declared, Kind, Running digest, "Registry metadata not verified". No registry requests; manifest data never labelled runtime/verified. |

Snapshots: 9 suites updated after per-suite marker triage (only R5-01..R5-05 intentional changes: drawer header, hotbar
`isCollapsed`, DevOps group, Export CSV/quick-filters). Two of them (`pods`, `edit-namespace-from-previously-opened-tab`)
only gained previously missing snapshots (pure insertions, reviewed).

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit -p packages/core` | 0 errors |
| ESLint changed/new files | 0 errors |
| Jest: details-header, drawer, kube-object-meta, pod container image, 9 updated suites | 18 suites, 148 tests, 53 snapshots pass |
| Builds | 2 (second after the image-row fix; first temp build replaced) |
| Screenshots (synthetic API, PROD cluster, dark + light) | before (R5-04 release) / after |

Visual review (Opus): header readable in dark and light, status as text + colour, toolbar aligned; owner chips correct for
verified / stale / not found; image provenance collapsed by default with label and chevron, expands to aligned fields;
cluster-scoped Namespace drawer has no namespace/owner noise.

Defects found and fixed: copy-title button lost with a non-string title (→ `copyText`); collapsed image line had no label or
disclosure affordance (→ "Image" row + chevron).

## Evidence

`docs/revival/evidence/r5-05/`: `b-*` (R5-04 release) and `a-*` (R5-05): pod/deployment details dark+light, owner
verified/stale/missing, image collapsed (dark/light) and expanded, cluster-scoped details.

## Pending

- Name/Namespace/Status also appear as `KubeObjectMeta` rows under the header. Kept on purpose: `KubeObjectMeta` is shared by ~54
  detail views and extensions (`hideFields`); removing rows would churn many snapshots. Revisit with a header-aware meta variant.
- "unknown" owner state is derived from store availability; a real RBAC denial is not covered by an automated test.
- Expanded image fields are indented one column right of normal values (readable; cosmetic).
- Legacy failing suites unchanged: `edit-namespace-from-new-tab` (JSON-patch `op: test` expectations, YAMLException text) and
  `installing-helm-chart-from-new-tab` (YAMLException text + unattributed drift) — R4 debt, not R5-05.
- Kind icon is a generic material icon; per-kind icons deferred.

## Known `git diff --check` exception

`packages/core/src/features/cluster/workloads/__snapshots__/pods.test.tsx.snap:543` is reported as trailing whitespace.
It is a real `" "` text node rendered by the component between two `<span>` elements of the pod status chip. Removing it
was tested once and makes the `pods` snapshot fail (1 test, 1 snapshot), so the file was restored unchanged. Accepted as a
known formatting warning; the component is not changed to silence it.
