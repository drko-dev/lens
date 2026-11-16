# Mirantis Lens 2026.11 — Índice de Evidencias (R12)

## 1. Evidencias de REA (`reverse-engineer-anything` MCP v6.5.0)

| Evidence ID | Operación REA | Target | Hallazgo Principal |
|---|---|---|---|
| `ev_8f0bf42c91ce1af68f0850eec7fe19c923f544b391d20d140ff9e91fb623acd7` | `inspect_electron_fuses` | `/Applications/Lens.app` (`Electron Framework` arm64) | `EnableNodeCliInspectArguments: enabled`, `RunAsNode: enabled`, `EnableEmbeddedAsarIntegrityValidation: disabled`, `OnlyLoadAppFromAsar: disabled` |
| `ev_3b1b7f21ee10c1d7c0c1148ee89c72aa2acc3306ebb1fbdb02a7c92828881ecb` | `inspect_plist` | `/Applications/Lens.app/Contents/Info.plist` | `2026.11.91422-latest`, `com.electron.kontena-lens`, scheme `lens://`, `LSMinimumSystemVersion: 13.0` |
| `ev_dedb14cf32991cf0ef0057f90651c3077df67b7526e348f84973e27c5c1069c5` | `inspect_signature` | `/Applications/Lens.app/Contents/MacOS/Lens` | `Developer ID Application: Kontena Oy (JJ22T2W355)`, hardened runtime, `allow-jit` |
| `ev_a9535b14c25ac02873e17aca4a92ec906be42fd25b86218b84ec448f844cb967` | `inspect_artifact` | `/Applications/Lens.app/Contents/Resources/app.asar` | `18,307` nodos, `21,970` ocurrencias (`16,889` files), `16` contradicciones de firma en `.node`/`.dylib` unpacked |
| `ev_80ef46d8c061eaa51109315873604c01ad297e9a18705976b8a0168177570e4d` | `analyze_javascript_application` | Entrypoints (`package.json`, `start-main.js`, `start-window.js`, `index.html`, `sub-window.html`) | IPC `lens:window-bundle`, V8 code cache, `sub-window.html` |
| `ev_a53b49b12f6d33ed0b7eafd4a9c6e8f264fe0d0b8f77e4518a04fc6be8e7d9e5` | `analyze_javascript_application` | `static/build/main.js` (18 MB) | Limitación documentada: worker AST de 2 GB agotó heap en bundle minificado de 18 MB; complementado con análisis estructural |
| `ev_867bdd2c2ec8bc88376491f7bf1765798d8f09dcaa54be67cb121bec6064815f` | `list_electron_targets` | `http://127.0.0.1:9224` | Limitación documentada: filtro `file://` excluyó `https://lens.app:<port>/` (`unsupported_url: 1`); complementado con Playwright CDP |

## 2. Capturas Visuales de Referencia

- [r12-lens-welcome.png](file:///Users/gustavomarcon/.gemini/antigravity-cli/brain/b09f544a-d5df-46b5-ae53-41a194291c21/r12-lens-welcome.png) — Root layout, TopBar, Hotbar, Navigator (`Home v` + lupa), Release Notes 2026.11 y modal de activación en perfil aislado (`:9224`).
- [r12-lens-preferences-real.png](file:///Users/gustavomarcon/.gemini/antigravity-cli/brain/b09f544a-d5df-46b5-ae53-41a194291c21/r12-lens-preferences-real.png) — Preferences abierto como tab de `MainView` con las 9 categorías (`App` .. `External Tools`).
- [r8-1-topbar-lens.png](file:///Users/gustavomarcon/.gemini/antigravity-cli/brain/b09f544a-d5df-46b5-ae53-41a194291c21/r8-1-topbar-lens.png) — TopBar autenticado (`Send Feedback`, `[ AI | v ]`, bell, `UPGRADE`, avatar `KO`) + StatusBar.
- [r8-2-navigator-lens.png](file:///Users/gustavomarcon/.gemini/antigravity-cli/brain/b09f544a-d5df-46b5-ae53-41a194291c21/r8-2-navigator-lens.png) — Cluster Navigator con `< cluster ● >`, `Admission Policies [NEW]` y dropdown + lupa.
- [r8-4-overview-lens.png](file:///Users/gustavomarcon/.gemini/antigravity-cli/brain/b09f544a-d5df-46b5-ae53-41a194291c21/r8-4-overview-lens.png) — Cluster Overview, TabBar con barra de color del clúster y Dock inferior.
