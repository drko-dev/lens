# H7.6.3C — Monaco Editor in GlobalPanelHost
Objective: docked Editor keeps model, draft, undo and releases resources on confirmed close.
Branch: feature/global-docking-h7 | Delivery: local commits, no push | Runner: jest (packages/core) + Playwright (open-lens)

## Specs
S1. Stable document identity (not the random panel id): clusterId + selfLink -> `docked-edit:<cluster>:<selfLink>`.
S2. A docking move creates no new Monaco model; collapse keeps the draft; tab switch keeps undo.
S3. No duplicate models per session; no mixing of clusters.
S4. Docking never saves to Kubernetes.
S5. Cancelled close leaves editor, model and changes intact.
S6. Confirmed close releases model, view state and EditResourceModel only when no legitimate consumer remains.
S7. Reuse the original EditResource view. No second YAML editor. No docking engine change.
S8. Unit tests (RED->GREEN) + Playwright ED01-ED12 with real mouse/keyboard.

## Tasks
- T1 (S6) release in edit-resource tab-data clearer — inline — pending
- T2 (S1,S2,S3) descriptor + openEditorPanel + BoundEditor + resolver case — inline — pending
- T3 (S5,S6) async close veto + docked-aware InfoPanel close — inline — pending
- T4 menu item "Edit (docked)" — inline — pending
- T5 (S8) unit tests — inline — pending
- T6 (S8) mock + ED01-ED12, build, regression — inline — pending
- T7 docs + commit — inline — pending

## Log
L1. Original request: prompt "H7.6.3C: Editor Monaco, conservación de borradores y liberación de recursos" (see conversation).
L2. Audit: InfoPanel.close -> dockStore.closeTab(tabId) is a no-op without a Dock tab; clearer only clears data (leaks ITextModel, monacoViewStates, EditResourceModel singleton).
