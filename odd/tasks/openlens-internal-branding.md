# Objective: replace the non-approved internal Lens-style mark with the exact approved blue OpenLens DevOps mark across splash, Welcome, and the top bar.
Branch: `develop` | Delivery: `ask-on-risk` | Runner: focused Jest + Node 20 build + isolated Playwright/Electron screenshots.
The Engram mirror is pending because this runtime has no registered session identity.

## Specs

### S1 — Replace visible internal branding with the approved mark
User requirement: “Reemplazar el logo viejo por el nuevo logo aprobado en: Splash screen; Home / Welcome page; Header / top bar / toolbar, si todavía aparece el logo viejo; Cualquier vista interna donde siga apareciendo branding viejo; Revisar también About / empty states / placeholders / assets estáticos si aplica”.
- Use the exact approved blue/white PNG already integrated as the blue app-icon variant, not the repository's old “Timón Moderno D” SVG; do not redraw or alter the PNG.
- Splash, default Welcome/Home, and branded topbar render the approved symbol. Inspect About/empty states/placeholders and change only visible legacy product marks.
- Keep text wordmark and current layout sizing unless necessary to display the source asset correctly.
- Check: targeted component tests, package TypeScript/build, visual screenshots of splash, Welcome/Home, and topbar.

### S2 — Preserve scope and current application behavior
User requirement: “No tocar /Applications/Lens.app ni la app oficial de Lens. - Trabajar solamente sobre OpenLens DevOps.”
- Do not modify external installed applications, application data, cluster state, credentials, or preferences. Preserve the existing app icon selector behavior.
- Keep any legacy icon registrations needed by consumers; no call-site removal without evidence.
- Check: diff scope and existing icon selector regression test or packaged smoke test.

### S3 — Build and visual proof
User requirement: “TypeScript / build sin errores; arranque de la app; verificar visualmente: splash con nuevo logo; welcome/home con nuevo logo; header o top section con nuevo logo; settings selector sigue funcionando; generar evidencia simple de qué pantallas quedaron actualizadas.”
- Build a new ARM64 candidate in an unused staging directory after source changes; hash the candidate `app.asar`.
- Launch exactly that candidate with an isolated temporary profile; capture screenshots/evidence for the three branded screens and confirm the Settings icon selector still renders.
- Do not claim release readiness.
- Check: TypeScript/build, app launch, screenshots, SHA-256, and clean close.

## Tasks

- T1 (S1-S2): Map current brand entry points and approved-asset identity; inline; COMPLETE — CodeGraph + read-only source mapping found current SVG mark differs from approved PNG; exact PNG hashes match app selector asset.
- T2 (S1-S2): Replace the non-approved mark in renderer and splash; inline; COMPLETE — copied the byte-identical approved blue PNG into core's renderer asset boundary and switched Welcome, topbar, and splash to it.
- T3 (S1-S3): Add focused regression checks and run targeted validation; inline; COMPLETE — prior filesystem blocker resolved (the two restricted injectable files are readable again). Focused Jest runs: welcome + top-bar suites 17/17 PASS, added Appearance gallery test (absolute asset path survives nested routes) for 8/8 PASS in that suite; `tsc --noEmit --project packages/core/tsconfig.json` PASS (exit 0).
- T4 (S3): Build new ARM64 candidate, run isolated Electron visual smoke, collect screenshots/hash; inline; COMPLETE — required an asset-emit fix (see L5/L6). Final candidate `open-lens/dist-stage-internal-branding-fixed-20261030/mac-arm64/OpenLens DevOps.app`, `app.asar` SHA-256 `b81fdc640a4c701ddaa7d4f59e0dc7dd3b03bbdd18e68abbbdf48be9b8de9523`; isolated visual smoke PASS (splash live-captured with approved mark, welcome approved mark, top-bar brand mark, Settings gallery shows all 11 approved presets). Screenshots: `open-lens/qa/2026-10-30/internal-branding/screenshots/01..05*.png`; machine result: `open-lens/qa/2026-10-30/internal-branding/visual-evidence.json`.

## Log

### L1 — Original user request
```text
Continuá sobre el repositorio:

~/Documents/lens/lens-v6-ui-corrections

Objetivo:
Completar la aplicación de la nueva identidad visual de OpenLens DevOps dentro de la app. Ya existe el nuevo icono aprobado y el selector de iconos en Settings, pero TODAVÍA falta reemplazar el logo viejo en las pantallas internas.

Qué hay que corregir:
1. Reemplazar el logo viejo por el nuevo logo aprobado en:
   - Splash screen
   - Home / Welcome page
   - Header / top bar / toolbar, si todavía aparece el logo viejo
   - Cualquier vista interna donde siga apareciendo branding viejo
   - Revisar también About / empty states / placeholders / assets estáticos si aplica

2. Usar como logo principal el aprobado azul/blanco de OpenLens DevOps.
   - No redibujar otro logo.
   - Reutilizar los assets ya guardados en la identidad visual aprobada.
   - Mantener consistencia visual con el icono principal ya integrado.

3. No tocar /Applications/Lens.app ni la app oficial de Lens.
   - Trabajar solamente sobre OpenLens DevOps.

4. Validar dónde está referenciado el logo viejo:
   - buscar imports de logos, svg, png, icns, branding assets, splash assets, welcome assets, product logos, etc.
   - identificar todos los puntos de entrada de branding antes de modificar.

5. Hacer los cambios primero.
   Después recién ejecutar validaciones y generar binario nuevo.

Validaciones mínimas obligatorias:
- TypeScript / build sin errores
- arranque de la app
- verificar visualmente:
  - splash con nuevo logo
  - welcome/home con nuevo logo
  - header o top section con nuevo logo
  - settings selector sigue funcionando
- generar evidencia simple de qué pantallas quedaron actualizadas

Entregables:
1. lista de archivos modificados
2. explicación breve de dónde se reemplazó el branding
3. ruta exacta del nuevo binario .app compilado
4. SHA-256 de app.asar
5. aclarar si quedó algún lugar con branding viejo pendiente

Importante:
- no declarar release ready
- no mezclar esto con otros pendientes como terminal reconnect, UI-04, cluster fixtures, etc.
- foco exclusivo: branding interno faltante (splash, home, etc.)
```

### L2 — Mapped source identity and test-first baseline
- CodeGraph mapping found Welcome, topbar, and splash use the same “Timón Moderno D” SVG, not the approved blue/white symbol. The internal icon variant `open-lens/static/branding/app-icons/azul.png` is byte-identical to the approved 512px finalist; the source/finalist PNGs also match exactly.
- About has OpenLens DevOps naming but no logo; empty-state logo call sites were not found. Legacy Lens SVGs remain registered in the icon map but have no visible UI call sites, so they are retained for compatibility.
- Added RED assertions to existing Welcome and topbar tests for the exact approved PNG asset. The focused Jest run is currently blocked before test execution because restricted filesystem access hides `packages/core/src/common/front-end-routing/routes/cluster/config/secrets/{navigate-to-secrets.injectable.ts,secrets-route.injectable.ts}`; `getDiForUnitTesting` dynamically loads all renderer injectables and reports `Cannot find module`. This is an environment restriction, not a product regression.
- Next: use the approved PNG as an asset-resource import for renderer views and the existing packaged static PNG for splash; then continue with focused verification and isolated packaged visual evidence.

### L3 — Implementation complete; validation underway
- Replaced Welcome and topbar marks with the exact approved PNG and updated Welcome sizing; splash now loads the existing `static/branding/app-icons/azul.png`. The renderer copy hash matches the selector's source asset (`87b6043fa99f7999d2109e346cfc0048c634633c88822687e8ee01bdfc49cba2`).
- Added exact-asset assertions to existing Welcome and topbar tests. `git diff --check` passes for the branding files. Existing full-build/QA dirty files remain untouched.
- Selected fresh output `open-lens/dist-stage-internal-branding-approved-blue-20261030` after confirming it did not exist. Node 20.20.2 is available via temporary PATH; RDD mode status is global/on. Continue with build/test, then assess the source diff under the native RDD contract if applicable.

### L4 — Validation outcome and environment blocker
- `git diff --check`: PASS for the changed branding files. A static self-check confirmed that all four TSX files parse through SWC, the renderer PNG is byte-identical to the existing approved splash/app-selector PNG, and the splash references that approved asset: PASS. Focused ESLint rules passed when the repo's `header/header` rule was disabled; the unmodified default lint command is BLOCKED because it tries to open unavailable `../../license-header`.
- Targeted Jest and `tsc --noEmit --project packages/core/tsconfig.json`: BLOCKED before assertions/type analysis, as the resolver/compiler cannot stat the restricted `secrets/navigate-to-secrets.injectable.ts` and `secrets-route.injectable.ts` files. Full build with isolated temporary HOME got past initial `.yalc` EPERM but then core Webpack failed with EPERM stat/lstat for the same restricted source files; monorepo build exit 1 and `open-lens:build` was not run. Do not bypass the filesystem boundary.
- No current ARM64 app was produced or launched. Visual screenshots, Settings-selector runtime check, app.asar SHA, and Electron close verification are NOT_RUN. Existing branding candidate directories were left untouched.
- Native review assessment returned unassessable because eligible unrelated untracked QA evidence plus this task's asset/doc require an explicit intended-untracked collection. Selectorless STATUS now exposes `external.select_intended_untracked`; no runtime capture tool is available here, so native review remains pending and no approval is claimed.
- Isolated build HOME left for preservation because shell cleanup (`rm -rf`) was rejected by the runtime safety guard: `/tmp/openlens-branding-home.uaTdXO`. It contains only generated build/linkable state, not Lens profiles or credentials.
### L5 — Continuation: validations after filesystem blocker cleared
- The previously blocked `packages/core/src/common/front-end-routing/routes/cluster/config/secrets/{navigate-to-secrets.injectable.ts,secrets-route.injectable.ts}` are now readable; focused Jest 17/17 and core `tsc --noEmit` PASS without policy bypasses.
- First isolated visual smoke against candidate `f3bba37aca…` exposed a REAL defect: welcome and top-bar `<img src>="/build/images/openlens-devops-approved.png"` 404'ed (broken-image placeholders), although DOM-level assertions passed. Cause: `open-lens` app webpack treats core imports as re-bundled externals and never emitted the PNG into the served `open-lens/static/build` tree.
- Fix 1: added a CopyPlugin pattern in `open-lens/webpack/renderer.ts` mirroring the existing fonts pattern, copying the approved PNG from `@openlens/core/src/renderer/components/icon/` to `images/[name][ext]`. Emitted asset is byte-identical to the approved source (SHA `87b6043f…`).

### L6 — Settings gallery thumbnails and prebuilt bundle chain
- Second visual run exposed that Settings > Appearance > Application Icon thumbnails were ALSO broken images: relative `./branding/app-icons/…` resolves under the `/preferences` SPA route to `/preferences/branding/…` → 404 for all 11 presets. Fixed to absolute `/branding/app-icons/<id>.png` in `application-icon-preferences.tsx` (single relative-branding reference in the codebase) + jest assertion that thumbs are absolute.
- Learned: `open-lens` webpack re-bundles the PREBUILT `packages/core/static/build/library/renderer.js`; source edits require rebuilding core (`npm run build` in packages/core) before the app build, otherwise stale gallery code ships. Rebuilt core (renderer.js at 10:36), then app bundle, repackaged candidate; `lens.js` verified clean of `"./branding/app-icons` (0 occurrences).
- Final evidence (candidate SHA `b81fdc64…`): all PASS; gallery screenshot shows all 11 approved icons rendered; splash live capture shows approved mark with `./branding/app-icons/azul.png`; welcome/top-bar approved mark; isolated temp profile; app closed cleanly.

Risk: item 5 (build/packaging asset emission) — the CopyPlugin and absolute-path changes alter what ships in the bundle; mitigated by the packaged-candidate visual smoke (bro­ken-image regressions would fail it). No data, credentials, permissions, or public APIs changed.
