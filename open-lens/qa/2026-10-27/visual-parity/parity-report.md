# Visual Parity Report — OpenLens DevOps (Hito 01) vs Lens 2026 official (2026-10-28)

- Candidate: `dist-stage-v6-ui-corrections-20261027/mac-arm64/OpenLens DevOps.app` (fork side) vs `/Applications/Lens.app` 2026.10.121159-latest (official side).
- Official-Lens evidence was captured **manually** (`screencapture -x -R 240,30,1440,900`, 2880×1800 retina) against a live instance with an isolated CICD profile (`HOME`,`KUBECONFIG`,`CICD` env), because automated Playwright launch of the official app is blocked (see B1).
- Real cluster names visible in the official Navigator are redacted (black boxes) in the evidence copies; unredacted originals remain only in the temporary `parity/` workspace and are never committed.
- Fork side: `evidence/s7-pods-qa-ns.png`, `evidence/s8-terminal.png` (same cluster, minikube `qa` v1.34.0, ns `qa`).

## Side-by-side comparison

| Area | OpenLens DevOps (fork) | Lens 2026 official | Parity verdict |
| --- | --- | --- | --- |
| Boot / window | Boots straight to cluster UI, no dialogs, playwright-launchable | **D1 (launch gate)**: crash dialog `listen EACCES: permission denied …/.k8s/lens/cl.sock` on first run in isolated env; main window hidden until dismissed; blocks `_electron.launch` — B1 below. Official-specific regression, fork unaffected. | Divergent (fork is more robust here) |
| Catalog/navigation | In-cluster full sidebar (Cluster, Nodes, Workloads→7 pages, Config, Network, Storage, Namespaces, Events, Helm, DevOps, Access Control, Custom Resources); pods reachable in 2 clicks | `Navigator` panel pinned inside every view: `Home` select + `KUBERNETES CLUSTERS` tree (AKS/EKS/GKE + Local Kubeconfigs); pods open as a browser-style **tab** ("Pods - qa") with × close | Divergent by design (fork's v6 corrections replaced this flow) |
| Top area | Tab bar: workspace selector + cluster tab, back/forward, icon rail (Home/Catalog) left | Tab bar: ephemeral "Release Notes" tab + persistent "Pods - qa" tab; gear (`Configure…`) top-right; no workspace selector visible | Divergent |
| Pods list header | `Pods • 5 items`, `Namespace: qa` select, **Export CSV**, `Status: Running (5)` quick filter, `Filter label (key=value)…`, `+ Add`, search right | single `namespace` select (`qa`), unified `Aa /.*` **Search Pods…** box, `↓ 5 items` counter; **no Export CSV button, no status/label quick filters, no + Add** | Divergent — fork adds v6 features missing in official |
| Pods columns | NAME, NAMESPACE, CONTAINERS, RESTARTS, CONTROLLED BY, NODE, QOS, AGE, STATUS — no CPU/Memory (KPI removal shipped in v6) | checkbox, Name, warn-icon, Namespace, **CPU, Memory**, Container(s), Restarts, Controlled By, Node, QoS, Status, Age, kebab | Divergent — official keeps CPU/Memory KPIs; fork drop is intentional v6 behavior |
| Row rendering | subtle hover/selection background; green container dot; links (ns) | near-identical row anatomy: green/red status squares, blue ns links, hovered-row highlight; Failed=red / Running=green in both | **Parity visually confirmed** (p02 vs s7) |
| Row data note | fork capture (22m): all 5 Running | official capture (4h26m later): busybox/hello now `Failed` (jobs completed) — same 5 pods, same QoS/ControlledBy | Data-state difference only; not a defect |
| Hotbar / favorites | Vertical hotbar rewritten in Hito 01 (35 favorites, scroll, drag reorder) with side pager | Official 2026 kept old-style **empty icon rail** (gray squares) bottom-left pager `1 ▶`; no favorites were pinned in the isolated profile | Divergent by design (fork's feature) |
| Trial banner | None | `GO PREMIUM with LENS — 2 weeks remaining — Discover` banner pinned at sidebar bottom (trial profile) | Official-only |
| Bottom dock | Terminal tab + `+` + maximize/chevron; Terminal(2) search widget with Match counter, `Active` pill | Terminal tab + `+` + maximize/chevron; adds `Kubernetes cluster qa in context.` hint line above terminal; search field present but no Match widget wired to visible DOM | **Parity (dock anatomy)**; fork shows richer search UI |
| Integrated terminal | native pty, prompt `gustavomarcon@…`, echo executed (s8) | native pty, same prompt, `echo OPENLENS_PARITY_TERMINAL_42` executed and echoed (p03) | **Parity functionally confirmed** |
| Footer | blue strip / window chrome only | `qa (v1.34.0)` context footer + `Support` link | Divergent — official adds context footer |
| Theme tokens | dark `#00060c`-family, blue accents `#4485f2`-family (v6 CSS vars) | near-identical dark palette; accents indigo/blue; green ok / red failed match fork tokens. **No programmatic dump possible** (playwright blocked) — assessment is visual | Approximate parity |

## Verdict

**No fork defects found.** Every observable difference vs Lens 2026 is a documented, intentional Hito-01 divergence (v6 UI corrections: KPI removal, Export CSV + quick filters, hotbar rewrite, in-cluster sidebar flow) or an official-only add-on (trial banner, context footer, Release Notes tab). Fork terminal parity with the official native-pty behavior is proven end-to-end.

## Blockers & notes

- **B1 — cannot automate official Lens 2026 launch**: Lens 2026 binds a UNIX socket at `<HOME>/.k8s/lens/cl.sock` on startup; in the CICD env the bind raises `EACCES` (`address …/cl.sock, port -1, listenIncluster (node:net:2437:12)`), the main process shows a native crash dialog and the main window never registers, so Playwright `_electron.launch` times out on the `/lens[.-]app/` poll. The splash stays up and the window exists but is excluded from `app.windows()` until the dialog is dismissed with a keystroke. Node can bind that path directly, so the failure is app-specific and not reproducible in the fork. Workaround used: direct launch + manual dialog dismissal + `screencapture`/`cliclick` interaction. `--integration-testing` does not prevent the dialog.
- **B2 — official Lens scans the real `~/.kube`** via `userInfo().homedir`, so the isolated-session Navigator lists real kubeconfig contexts (k3s…/cloud providers) read-only despite `HOME`/`KUBECONFIG` isolation; fork behavior: catalog is built strictly from `KUBECONFIG` (S2/S3 in qa-report). Real names redacted in committed evidence (`p01..p04`); grep of the isolated userData shows 0 real-context references.
- Reported as informational parity findings; no code change to the fork was requested or made.

## Evidence index

- `p01-official-pods-all.png` — Lens 2026, clusters view, `All namespaces`, 12 rows (kube-system + qa).
- `p02-official-pods-qa.png` — Lens 2026, `Pods - qa` tab, ns `qa`, 5 items (matches fork s7 data).
- `p03-official-terminal.png` — Lens 2026 terminal with `echo OPENLENS_PARITY_TERMINAL_42` round-trip.
- `p04-official-nsdropdown-open.png` — Lens 2026 namespace select open (options list with `qa`).
- Fork side: `../evidence/s7-pods-qa-ns.png`, `../evidence/s8-terminal.png`.
