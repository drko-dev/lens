# OpenLens DevOps Revival — R6-02 Validación de Branding Integral

**Hito:** R6-02 — Identidad de marca completa
**Estado:** **DONE / CERTIFIED**
**Rama:** `feat/midnight-graphite-branding`
**HEAD:** `676d1e286aee7e01414f1570607e7bde9a07698f` (commit local R6-01)
**Autor del fork:** Gustavo Marcon
**Release protegida:** R5-09; commit base `6012f4ac52da8c620d3fcae71d4fc406baa27081`.

## 1. Diseño e identidad de marca

Se mantuvo el isotipo geométrico original de R6-01 y se generaron versiones coherentes mediante el script reproducible `docs/revival/scripts/generate-r6-02-branding.cjs`:

- SVG principal y un ícono nativo macOS con fondo grafito: `docs/revival/branding/openlens-devops-symbol.svg`, `openlens-devops-app-icon.svg`.
- Variantes horizontales vectoriales para tema claro y oscuro y SVG monocromático para tamaños pequeños.
- Variante separada `openlens-devops-tray.svg` diseñada para iconos template de macOS (no usar el multicolor en la menu bar).
- PNG preview de 16, 24, 32, 64, 128, 256, 512 y 1024 píxeles, `icon.icns` real producido por `iconutil` y `icon.ico` con siete tamaños.
- Entradas coherentes `open-lens/build/icon.png`, `build/icon.icns`, `build/icon.ico`, `build/icons/` y `packages/core/build/icons/`.
- `open-lens/package.json`: iconos explícitos para macOS/Windows/Linux; fuente de tray monocromático; autor `Gustavo Marcon`, manteniendo copyright original y licencia MIT.
- `open-lens/static/splash.html`: icono local, nombre OpenLens DevOps, gráfica de progreso minimalista sin glow y alternativa para reduced-motion.
- `top-bar.tsx`: isotipo visible y accesible de 23px con ancho reservado de 26px; sin ocultar la navegación, sin añadir interacciones riesgosas.
- Welcome muestra la identidad del fork tanto en Dark, Midnight Graphite como Light; deja de depender del tema para mostrar la marca.
- About: identifica al autor del fork y la procedencia OpenLens/MIT sin retirar créditos originales.
- Tipografía de sistema para Midnight Graphite (macOS San Francisco vía `-apple-system`), números tabulares; no se añaden fuentes redistribuidas ni cambian las fuentes de terminal/Monaco.

**Importante:** R6-02 no cambia densidad de tablas ni arquitectura de paneles; la compactación profunda de UI/UX queda planificada para R6-03 y R6-04.

## 2. Compilación y verificación estática

- **Node:** 20.20.2.
- **TypeScript:** 0 errores en `packages/core` y `open-lens`.
- **ESLint:** 0 errores y 0 advertencias en TS/TSX modificados (se corrigió la disposición JSX de props).
- **Jest:** 6 suites / **35 tests PASS**, incluidos TopBar, Welcome, Midnight Graphite, Appearance y VirtualList/table density, PROD guard.
- **Core Webpack:** completó; emitió una advertencia de configuración de dependencia dinámica de Webpack (sin error), registrada como warning, no como PASS limpio absoluto.
- **App Webpack:** completó sin errores.
- **electron-builder:** completó empaquetado ARM64 en directorio experimental `open-lens/dist-r6-02-stage/mac-arm64/OpenLens DevOps.app`. Firma local de desarrollo presente; **no se afirma notarización ni distribución final**.

## 3. Checksums de build experimental

| Artefacto | SHA-256 |
|---|---|
| R6-02 `app.asar` | `dd392e5d2321b90564da3045067ae288b7c168223f298135895c170ddd3deb58` |
| R6-02 ejecutable macOS | `9ee8c7700473489fb10b302cf673830ab0a51315de766a153183c4d5cc23546b` |
| R6-02 `icon.icns` (bundle y fuente idénticos) | `645be78fc3cd7eb54ceee7a7d0333be19f12387ff85f44c3dee043178aa5d26c` |
| R5-09 `app.asar` protegido e intacto | `f6c55cb56db6326b60318b4c586f692809f45e5ec89ff6bbce426e011a0d595a` |

## 4. Playwright: aplicación empaquetada, perfil aislado

Script: `docs/revival/scripts/verify-r6-02-branding.cjs`
Resultado final: **7/7 checks PASS**, `docs/revival/R6_02_VERIFICATION.json`.

1. `nativeFinderDockIcon`: `CFBundleIconFile` apunta a la referencia correcta y el `icon.icns` empaquetado es idéntico al generado.
2. `menuBarTemplateAssets`: templates monocromáticos e indicadores de actualización disponibles **también dentro de app.asar**.
3. `brandedSplashAndForkCredits`: HTML/SVG splash y metadatos autor/Gustavo Marcon + copyright original verificados en paquete.
4. `brandedWelcomeAndHeader`: Welcome y TopBar presentan el logo del fork incluso en Dark clásico.
5. `midnightTypographyAndProdSafety`: al seleccionar el tema desde Preferences, `#0D1117` y tipografía de sistema activos; PROD mantiene `#EF4444`.
6. `compactDensityAndProdLock`: Compact conserva su clase/preview de 33px, indicador PROD bloqueado visible.
7. `brandedLightTheme`: logo visible en modo Light, sin obligar al tema Midnight Graphite.

Capturas nuevas en `docs/revival/evidence/r6-02/`:
- `01-branded-welcome-classic-dark.png`
- `02-branded-welcome-midnight.png`
- `03-appearance-and-prod-lock.png`
- `04-branded-welcome-light.png`

El primer borrador del test había asumido que un perfil sintético con `colorTheme=Midnight Graphite` forzaba el tema ya al iniciar. Se sustituyó esa suposición por la **selección visible desde Preferences** (flujo de usuario validado); no se modificó código de tema ni se volvió a compilar por ese ajuste. La persistencia a través de un reinicio no se reevalúa como parte de este hito.

## 5. Límites y pendientes conocidos

- **No realizado:** firma de distribución/notarización pública; se conserva una build de pruebas ARM64.
- **No realizado:** verificación visual del icono en el Dock de macOS, ni prueba en Windows/Linux reales. Se verificaron formato, Info.plist, checksums y assets empaquetados, pero no se confunden con pruebas GUI nativas de esos sistemas.
- **No realizado:** rediseño compacto global de tablas/sidebar/dock; corresponde a R6-03.
- No se detectaron regresiones en las pruebas dirigidas. No se modificaron APIs Kubernetes, permisos RBAC, Secrets, PTY, port-forward ni extensiones.
- Git permanece **sin commit ni staging para R6-02** y sin push. R6-01 sí está consolidado en `676d1e2`.
- Binario R5-09 y checkpoint R5-09 intactos. Espacio libre al concluir: ~16 GiB.

**Criterio de cierre:** implementación y smoke experimental aprobados; solicitar autorización antes del commit local de R6-02 o de iniciar R6-03.
