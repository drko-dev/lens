# H9 — Auditoría independiente de NovaKube RC1 (06/11/2026)

**Rama:** `feature/h9-brand-identity`.
**HEAD auditado:** `2474b085`.
**Resultado:** **PASS funcional del código y binario H9 RC1; BLOCKED la aprobación incondicional de H9-08 por ausencia de RC2 como rollback.** No hacer merge/push/publicación ni borrar artefactos.

## Evidencia confirmada por ejecución independiente

- Repositorio sin modificaciones versionadas pendientes. `develop` no fue fusionado en esta auditoría.
- Brand Kit original ZIP verificado: SHA-256 `33471dcd7c15217769f2fbf4f230602b8d563f61f34d87ac76ec617c00480bfc`.
- **22 archivos originales** en `packages/core/src/renderer/themes/novakube/`, todos comparados byte por byte contra su entrada de origen del ZIP (22/22 PASS). El informe previo habla de **16 assets**, cifra incorrecta para esta carpeta; corregir el inventario sin alterar los assets.
- Icono de `open-lens/build/icon.icns` y `Contents/Resources/icon.icns` del .app coinciden con el Brand Kit: SHA-256 `4d085208fa4169233b84a83d6ca2b878e04715e416e1a8c612c1d1ca4682c443`. `icon.ico` y `openlens-devops-symbol.svg` también coinciden con los originales.
- DMG H9 RC1 SHA-256 `5b0b79ae91c4cddab56c0820854e9d7d650962ccdf655736d92c92831fa4fc46`. ZIP H9 RC1 SHA-256 `eb24367dc41dc5bc6667aca457abae8345c21bda6bfc9d4d7296748580b4071a`. Ambos pasan el manifiesto `SHA256SUMS`.
- `hdiutil verify` del DMG: VALID. Binario de app: Mach-O arm64. `codesign --verify --deep --strict`: PASS, identidad Apple Development, Hardened Runtime `runtime` presente; esto no equivale a notarización/Apple Gatekeeper de publicación.
- **Jest independiente ampliado:** Node v24.22.2, filtro `(themes|documentation|welcome|split-panel|incident|ai-diagnostics|detached|versioned-persistence)`: **75/75 suites, 655/655 tests, 3/3 snapshots PASS**, exit 0, ~60 s. Registro `/tmp/h9-novakube-independent-jest-20261106.log`.
- **Smoke empaquetado** sobre `open-lens/dist/h9-novakube-rc1/mac-arm64/OpenLens DevOps.app` (no DEV server), perfil sintético HOME/CICD/KUBECONFIG, mock Keychain: exit 0, ~19 s. Se comprobó Welcome, Documentación H8.7, NovaKube, clúster demo y reversión a Cursor. Cuatro capturas auténticas en directorio temporal externo al repo, cuatro hashes únicos. Tres SHA iguales a capturas entregadas; la de clúster demo varió de forma no determinista. Registro `/tmp/h9-novakube-independent-packaged-qa-20261106.log`.
- **Smoke Electron DEV** repetido con perfil sintético y capturas no versionadas: exit 0, ~23 s. Welcome, NovaKube, ratios de contraste reportados, Documentación H8.7, clúster demo, Incidentes, Kubetail y reversión a Cursor; seis capturas únicas. Registro `/tmp/h9-novakube-independent-dev-qa-20261106.log`.
- **Prueba EXTRA de interacción real de preferencias:** navegación a `/preferences/app`, clic Playwright verdadero en `#theme-input` y opción `NovaKube`, comprobar CSS/estado, cierre de .app y reapertura fría con el **mismo perfil sintético**; `colorTheme=NovaKube` y `body.theme-novakube` se restauraron. Después se seleccionó `Cursor` con clic real y se limpió la clase NovaKube. **PASS**. Registro `/tmp/h9-novakube-independent-ui-selector-persistence-20261106.log`.
- Estado de disco en reauditoría ~38–39 GiB disponibles, sin nuevos builds ni limpiezas.

## H9-INDEPENDENT-01 — RC2 NO está intacto (BLOCKER del gate de rollback)

La carpeta `open-lens/dist/h8-mvp-rc2/` **no contiene** `OpenLens DevOps-6.5.3-dev-arm64.dmg` ni `OpenLens DevOps-6.5.3-dev-arm64-mac.zip`. `mac-arm64/` solo contiene `.DS_Store` (aprox. 8 KB); **la app RC2 no está**. Permanecen `SHA256SUMS`, manifiestos YAML y blockmaps.

Hashes históricos RC2 conocidos, para una eventual recuperación sin inventar artefactos:
- DMG `b9ae0fb74ac0372a466365461dc017154f63b0b0f12bcd9d6a906d0cb611d9a1`;
- ZIP `209d9da9bb8547df4f2dc437a2012610a428d0fce33a9b919f6bdeecd0a5e681`.

Una búsqueda Spotlight por nombre encontró el DMG de H9 y los .blockmap, pero no una copia RC2 lista para recuperar. **No se sabe por qué faltan ni quién los retiró.** No fueron borrados ni reconstruidos por esta auditoría.

El informe `H9_NOVAKUBE_DELIVERY.md` afirma RC2 preservado y H9-08 100 % PASS: **esa afirmación es falsa en el disco actualmente inspeccionado**. Corregir documentación antes de aprobar H9-08. Opciones: localizar/restaurar y comprobar SHA de originales RC2, o aceptación explícita del usuario del riesgo de no tener rollback, sin fingir que RC2 existe.

## H9-INDEPENDENT-02 — Alcance adicional del QA (NO BLOQUEA PASS FUNCIONAL)

- El E2E entregado activa/revierte el tema por DI en lugar de usar la UI: la auditoría adicional corrigió la evidencia del selector real y la persistencia en reinicio frío.
- El test H9-05 de multiclúster verifica tokens de entorno y payload de ventana desacoplada; **no levanta dos clústeres ni hace detach/redock real con dos ventanas**. Su PASS es real para invariantes de datos, pero no constituye cobertura E2E de multiclúster/multiventana. Se recomienda una corrida real específica en el binario antes de publicarlo a usuarios finales.
- Los ratios WCAG AA calculados por los scripts contrastan pares de tokens conocidos; no equivalen a una auditoría automatizada de contraste de todos los píxeles y estados UI.

## Estado de integración

**Aprobación funcional NovaKube en H9 RC1: PASS.**
**Gate H9-08 sin observaciones / rollback preservado: BLOCKED.**

No merge a `develop`, no push, no publicación, no eliminación/overwrite de RC2 o H9, no acceso a clusters reales, Keychain real ni proveedores externos. Se preservan commits, screenshots, assets y datos personales. Próximo paso: restaurar el rollback RC2 o registrar aceptación expresa del riesgo, corregir el informe de entrega y considerar QA multiventana real para release público.
