# H6.1 — Cursor grafito / RC2 macOS ARM64

**Estado:** integrado, aprobado visualmente por el usuario y empaquetado para QA interno (2026-11-02).

## Integración y checkpoints

- Rama de integración: `feature/floating-panels-h6`.
- Commit UI/UX: `d682cb8` — `fix(ui): consolidate Cursor graphite and compact typography`.
- Commit de estado del roadmap previo al build: `8923f15`.
- Merge fast-forward, sin push ni merge hacia `develop`, `main` o `master`.
- Sin cambios visuales después de la aceptación del usuario. Todos los archivos personales y sin seguimiento preservados.

## Apariencia aceptada

- Tema predeterminado: **Cursor**, independiente y distinto de Midnight Graphite.
- Fondos de grafito neutro `#151719`, superficies `#202225`, selección `#373B40`, botones `#41464C`.
- Inter Variable integrada; navegación principal de 30 px / texto de 12,5 px peso 400; submenús de 26 px / 12 px; barras de filtros de 34 px.
- Colores de advertencia, errores y producción mantienen su semántica; el azul no es el acento principal.

## Verificación

- Jest focalizado: **98/98 PASS**, 13 suites.
- Compilación de Core y Renderer de producción: **PASS**.
- Empaquetado nativo macOS ARM64: **PASS**, Electron 45.2.0.
- Inicio del `.app` firmado en perfil de QA aislado: **PASS**.
- Variables CSS y tema Cursor predeterminado en primer inicio: **PASS**.
- Fuente Inter cargada y navegación real de 30 px / 12,5 px: **PASS**.
- El Dev Server Webpack (9191) estaba apagado.
- DMG APFS: integridad `hdiutil verify` **PASS**.
- Bundle extraído del DMG: firma ad-hoc con entitlements `codesign --verify --deep --strict` **PASS**.
- **No** se repitió la matriz completa de 35 escenarios de H6 en RC2. No se acredita ese resultado para RC2.

## Artefacto RC2

Directorio local: `open-lens/dist/rc2/`.

- DMG firmado: `OpenLens DevOps-6.5.3-dev-arm64-RC2.dmg`.
- App de QA: `mac-arm64/OpenLens DevOps.app`.
- Checksum SHA-256 del DMG: `6fb0c1ee9ec055c03bb3f2d492f3110b0dd4bcbf6736124d369deec28e22eb46`.
- Manifiestos locales: `SHA256SUMS` y `RELEASE_MANIFEST.txt`.
- Se descartó el ZIP intermedio creado antes de la firma; el DMG firmado es el único instalador RC2 acreditado.
- **RC1 se preserva** en `open-lens/dist/`.

## Límites para distribución

**RC2 es QA interno.** No tiene firma Developer ID Application ni notarización oficial con Apple, y no debe etiquetarse como release público. Linux y Windows permanecen como validaciones posteriores.

No se requieren más cambios de aspecto ni de tipografía: Cursor grafito es la dirección aprobada por el usuario.
