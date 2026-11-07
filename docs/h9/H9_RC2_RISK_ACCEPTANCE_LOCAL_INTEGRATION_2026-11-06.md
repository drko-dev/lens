# H9 — Aceptación de riesgo RC2 e integración local de NovaKube

**Fecha:** 2026-11-06
**Alcance de autorización:** integración **local por fast-forward a develop**, no distribución, push, publicación, borrado de artefactos ni aceptación de QA pendiente.

## Decisión del usuario

Tras la auditoría independiente `docs/h9/H9_INDEPENDENT_FINAL_AUDIT_2026-11-06.md`, se ofrecieron dos alternativas: **buscar y restaurar RC2** o **avanzar aceptando que RC2 ya no está disponible como rollback**. El usuario respondió **«Avanzamos»**. Se interpreta como aceptación del riesgo de rollback para proceder con la integración local H9 y H8.7; **no** implica autorización de push ni publicación.

## Verificaciones independientes que sustentan la integración

- Rama `feature/h9-brand-identity` en commit auditado `2474b085`, informe independiente `5a25e557`.
- Regresión Jest ampliada: 75/75 suites, 655/655 tests, 3/3 snapshots PASS (Node v24.22.2).
- Smoke Electron DEV y smoke de `mac-arm64/OpenLens DevOps.app` empaquetado: exit 0, perfiles HOME/CICD/KUBECONFIG sintéticos y mock Keychain.
- Selector real: click de NovaKube en `/preferences/app`, persistencia verificada tras reinicio en frío con el mismo perfil, reversión a Cursor desde UI real.
- Los 22 archivos del directorio canónico de NovaKube coinciden byte por byte con el Brand Kit oficial; nota: la documentación original decía 16.
- DMG H9 SHA-256: `5b0b79ae91c4cddab56c0820854e9d7d650962ccdf655736d92c92831fa4fc46`.
- ZIP H9 SHA-256: `eb24367dc41dc5bc6667aca457abae8345c21bda6bfc9d4d7296748580b4071a`.
- `shasum -a 256 --check SHA256SUMS`, `hdiutil verify`, `codesign --verify --deep --strict` PASS; icono firmado idéntico al original.
- Aproximadamente 38 GiB disponibles antes de integrar.

## Riesgo conocido aceptado

`open-lens/dist/h8-mvp-rc2/` **NO contiene el DMG, el ZIP ni el .app RC2**. Solo permanecen manifiestos, blockmaps y un `.DS_Store`. La pérdida se constató en la auditoría; causa y momento desconocidos. No existe un rollback RC2 instalable confirmado en esa carpeta.

Hashes históricos que deberían comprobarse **si se recuperan originales**, sin inventar ni sustituir archivos:
- DMG RC2: `b9ae0fb74ac0372a466365461dc017154f63b0b0f12bcd9d6a906d0cb611d9a1`.
- ZIP RC2: `209d9da9bb8547df4f2dc437a2012610a428d0fce33a9b919f6bdeecd0a5e681`.

**Mitigación:** preservar intactos H9 RC1 DMG/ZIP/.app y sus hashes; checkpoints del estado anterior de `develop` y de H9; no sobrescribir instaladores ni borrar datos; volver a preparar/validar un rollback antes de una publicación general si se exige política de recuperación.

## Alcance de QA no cubierto totalmente

- Validaciones H9-05 de identidad multiclúster y payload de ventanas desacopladas están respaldadas por unit tests, pero no por una prueba E2E completa con dos clústeres reales y detach/redock en el binario. Hacerla antes de publicación o declarar alcance reducido.
- Reglas WCAG AA comprobadas sobre pares de colores; no representan escaneo exhaustivo de todos los elementos.
- La firma Apple Development con Hardened Runtime **no equivale** a notarización de distribución pública.

## Procedimiento local autorizado

1. Confirmar worktree versionado limpio, rama y ascendencia `develop` → `feature/h9-brand-identity`, hashes H9 RC1 válidos.
2. Crear checkpoint `checkpoint/develop-pre-h9-2026-11-06` en el último `develop` y checkpoint `checkpoint/h9-novakube-approved-local-2026-11-06` del HEAD aprobado.
3. Guardar esta decisión y corregir las afirmaciones falsas de la documentación en la rama H9, en un commit documental separado.
4. `git switch develop && git merge --ff-only feature/h9-brand-identity`. **No push, no release, no rebase ni eliminación de branches/checkpoints.**
5. Verificar que `develop` y la rama H9 apunten al mismo commit, estado versionado limpio, los archivos untracked preservados y H9 RC1 disponible.

## Estado

**Aprobado para integración local aceptando riesgo RC2; no confundir con autorización de producción ni de distribución.** La realización y hashes finales del FF deben verificarse y agregarse en el reporte de operación, no asumirse por la presente autorización.
