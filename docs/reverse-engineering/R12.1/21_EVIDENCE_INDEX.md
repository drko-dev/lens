# R12.1 — Índice Maestro de Evidencias

## 1. Evidencias REA (`rea-agents@6.5.0`)
- `ev_8f0bf42c91ce1af68f0850eec7fe19c923f544b391d20d140ff9e91fb623acd7` (`inspect_electron_fuses` `/Applications/Lens.app`)
- `ev_3b1b7f21ee10c1d7c0c1148ee89c72aa2acc3306ebb1fbdb02a7c92828881ecb` (`inspect_plist` `Info.plist`)
- `ev_dedb14cf32991cf0ef0057f90651c3077df67b7526e348f84973e27c5c1069c5` (`inspect_signature` `MacOS/Lens`)
- `ev_a9535b14c25ac02873e17aca4a92ec906be42fd25b86218b84ec448f844cb967` (`inspect_artifact` `app.asar`)
- `ev_80ef46d8c061eaa51109315873604c01ad297e9a18705976b8a0168177570e4d` (`analyze_javascript_application` entrypoints)
- `ev_a53b49b12f6d33ed0b7eafd4a9c6e8f264fe0d0b8f77e4518a04fc6be8e7d9e5` (`analyze_javascript_application` `main.js` OOM)
- `ev_867bdd2c2ec8bc88376491f7bf1765798d8f09dcaa54be67cb121bec6064815f` (`list_electron_targets` `:9224`)

## 2. Evidencias Estructurales & Dinámicas R12.1
- Inventario bundle & ASAR (`16,888` files, `285` unpacked, `33` native binaries) -> [03_ASAR_AND_BUNDLE_INVENTORY.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/03_ASAR_AND_BUNDLE_INVENTORY.md)
- Extracción IPC `main.js` (`275` canales) y fábrica `BrowserWindow` -> [15_IPC_CHANNEL_CATALOG.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/15_IPC_CHANNEL_CATALOG.md)
- Extracción renderer `lens.js` (`ephemeralTabId`, `tab-groups-reactive`, `36+` shortcuts) -> [09_WORKSPACE_TABS_AND_SPLIT.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/09_WORKSPACE_TABS_AND_SPLIT.md), [13_KEYBOARD_AND_FOCUS.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/13_KEYBOARD_AND_FOCUS.md)
- Experimento dinámico & persistencia en disco `:9225` -> [16_STATE_AND_PERSISTENCE.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/16_STATE_AND_PERSISTENCE.md), [17_RESTART_AND_RECOVERY.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/17_RESTART_AND_RECOVERY.md), [18_DYNAMIC_OBSERVATIONS.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/18_DYNAMIC_OBSERVATIONS.md)
