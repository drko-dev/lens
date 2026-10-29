# OpenLens DevOps — Estado canónico del proyecto

**Actualizado:** 2026-10-29. **Workspace único:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`.

## Ramas, desarrollo y release

- **Rama principal de desarrollo:** `develop` (este repositorio NO utiliza `main`). Este documento prevalece sobre rutas y nombres de worktree históricos presentes en informes de R4–R9.
- **Estado de código:** integrable en la rama `develop` local como base de DESARROLLO después de la compilación de 40 proyectos y pruebas focalizadas de 105/105. Integrar NO implica dar de alta una release.
- **Distribución pública:** **NO AUTORIZADA**. No hay certificación integral y siguen abiertos los gates de QA descritos abajo.
- **Git remoto:** `origin` apunta a GitHub; no se debe publicar, forzar push ni modificar `origin/develop` como parte de una limpieza local sin comprobaciones y autorización específica.
- **Memoria Engram:** un solo proyecto `lens`. Las rutas antiguas `lens-r4`, `lens-r7-09-consolidation`, `lens-v6-final`, etc. son HISTÓRICAS y no deben usarse como workspace ni resucitarse como worktrees. Usar siempre el directorio único citado arriba.

## Funcionalidad integrada y comprobaciones

R4–R9 / V6 y las correcciones del Hotbar, Home, temas, RBAC, watchers, terminal, Kubernetes, branding, seguridad y E2E se encuentran en el historial consolidado.

- Comparación R7-05 / NetworkPolicy: 36/43 archivos del commit original idénticos a `86d5662`; las restantes diferencias son documentos, capturas y utilidades del harness. Sin pérdida de código funcional identificado.
- R7-06 / RBAC: 25/27 archivos idénticos a `86d5662`; dos diferencias documentales.
- Merge temporal R4 `bc60ec4`: 47/47 archivos equivalentes al merge definitivo `75abba6`.
- R7-07 (Helm) y R7-08 (Pods): los commits originales tienen equivalentes de patch ya presentes.
- **Build total:** 40 proyectos PASS, 2026-10-29, `NX_DAEMON=false NX_SKIP_NX_CACHE=true`. Log externo: `/var/tmp/lens-mainline-integration-build-20261029.log`.
- **Jest focalizado:** 105/105 PASS en 6 suites de NetworkPolicy, RBAC y Port Forward. Evidencia `open-lens/qa/2026-10-29/branch-reconciliation/jest-r7-r4-20261029.log`.

## Pendientes que NO bloquean guardar código, pero SÍ bloquean la release

1. **Hotbar/UI-04:** completar el set de fixtures para 25 y 35 pines, drag/persistencia, alternancia entre clústeres QA, menú/tooltip, PROD y accesibilidad. La última medición documentada del candidato de espaciado tuvo 27 PASS / 5 BLOCKED, pero no valida automáticamente versiones posteriores.
2. **Terminal:** reconexión/desconexión explícita con aislamiento real; la emulación CDP offline anterior no activó el estado.
3. **RDD/Gentle AI:** revisión independiente nativa pendiente por cuota. Ningún resultado de revisión implica acuse de aprobación.
4. **R8/R9:** validación integral Electron y entorno Kubernetes, paridad visual final, y estabilidad continua de 30 minutos aún no demostradas globalmente sobre un único artefacto final. Distintos informes históricos reflejan estados parciales/candidatos diferentes.
5. **Empaquetado/release:** falta validación en el mismo hash de candidato final, firma/notarización de distribución cuando corresponda, pruebas de seguridad y decisión GO explícita. Un build ad-hoc ARM64 no es una release.

**Nunca reinterpretar las aprobaciones parciales de documentos anteriores como cierre total.**

## Artefactos QA protegidos

Conservar sin sobrescribir hasta decisión posterior:

- `open-lens/dist-stage-uiux-home-badge-final-r3-20261029/mac-arm64/OpenLens DevOps.app` (candidato visual más reciente al crear este documento).
- `open-lens/dist-stage-uiux-branding-validation-03-rerun-20261028/mac-arm64/OpenLens DevOps.app` (baseline de QA, SHA `77880f86cceb7736ae88361545ed90adfb0649c0314fbf2f006d18950feaff22`).
- `open-lens/dist-stage-uiux-hotbar-spacing-rebuild-20261028/mac-arm64/OpenLens DevOps.app` (hay un proceso `lens-k8s-proxy` en ejecución que depende del paquete; no borrar ni cerrar sin revisar).

Los binarios `dist-stage-*` están ignorados por Git; no deben añadirse a commits.

## Documentación/evidencias pendientes de curaduría

Las capturas PNG, logs, JSON y actas históricas de `docs/revival` y `open-lens/qa` pueden incluir referencias a worktrees ya archivados, hallazgos parciales y detalles del laboratorio. **Preservar bytes y contexto**, pero no subir indiscriminadamente al repositorio remoto. Revisar datos sensibles y elegir evidencias por hash/candidato antes de publicar.

Documentos previos de auditoría: `docs/revival/LENS_CLEANUP_PENDING_MAIN_AUDIT_20261029.md`, `LENS_COMMIT_PREPARATION_20261029.md` y `ENGRAM_GIT_WORKTREE_CONSOLIDATION_20261029.md` (históricos; no son fuente de estado actual).

## Recuperación

Respaldo Git completo, verificado antes de consolidar:
`/Users/gustavomarcon/Documents/lens/_backups/LENS_ALL_BRANCHES_20261029_BEFORE_DEVELOP.bundle`.

Archivos originales sin commit y detalles de auditoría:
`/Users/gustavomarcon/Documents/lens/_backups/commit-batches-20261029/`,
`/Users/gustavomarcon/Documents/lens/_backups/worktree-unification-20261029/`.

## Cómo continuar

Trabajar únicamente en `develop` una vez actualizada. Mantener tareas pendientes en documentos/checklists y evitar generar otra bifurcación o worktree salvo que haya una necesidad técnica explícita. Para una nueva release, crear un candidato nuevo, verificar hash, terminar los QA gates y obtener aprobación específica.
