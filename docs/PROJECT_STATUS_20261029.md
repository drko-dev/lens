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

## Limpieza y continuidad de Git (29/10/2026)

- **Única rama local activa: `develop`**, único worktree `lens-v6-ui-corrections`. Se hicieron fast-forward de los 125 commits presentes en la rama consolidada hasta `develop` local, sin reescritura de historial.
- Las **35 etiquetas de ramas locales históricas** (R4/R5/R6/R7/R8/R9/V6 y temporales) fueron eliminadas después de verificar el bundle con todos los refs. **No recrearlas desde el archivo por error.**
- `origin/develop` no fue modificado ni se hizo push. Para publicar cambios, se requiere una revisión explícita de seguridad/QA y una decisión separada; no confundir integración local con release.
- `git status` se dejó limpio sin borrar el trabajo pendiente: **1.301 archivos de documentación/evidencia QA y configuraciones locales**, por 271,1 MiB, permanecen físicamente en sus rutas. Se respaldaron en un tar.zst independiente de 154,5 MiB y se verificó el SHA-256 de cada archivo.
- Solo **esos nombres exactos** están listados en la exclusión local `.git/info/exclude` (no afecta archivos nuevos). Cuando un documento QA pendiente esté aprobado para versión, usar `git add -f -- ruta` tras inspeccionar secretos, o retirar esa línea de la exclusión. No hacer `git clean -fdx`: borraría estos archivos.
- El archivo recuperable con esos originales es `~/Documents/lens-out-of-repo-20261030/_backups/LENS_UNTRACKED_QA_PENDING_20261029.tar.zst`. Índice de rutas, tamaños y SHA: `LENS_UNTRACKED_QA_PENDING_20261029.json`.
- La copia expandida de los worktrees antiguos fue reemplazada por el archivo verificado `~/Documents/lens-out-of-repo-20261030/_backups/LENS_HISTORIC_WORKTREES_20261029.tar.zst`; contiene 16.378 entradas. La estructura Git actual es autónoma.
- Se conservan los **tres candidatos ARM64** detallados arriba; no borrar el del `lens-k8s-proxy` activo hasta resolver esa dependencia. El resto de builds temporales fue depurado anteriormente (15 carpetas, ~9 GB).

**Esta rama representa el estado de desarrollo, no un producto listo para distribución.**

## Auditoría de estabilización del HEAD (2026-10-29)

HEAD auditado: `b02278b277ac25674b9b129745a1115572db0062`, rama `develop`. Esta auditoría **no certifica** que el candidato visual histórico corresponda al HEAD.

| Comprobación | Estado | Evidencia / límite |
|---|---|---|
| Rama, HEAD y worktree único | PASS | `develop`, HEAD indicado; `origin/develop` queda 126 commits atrás, sin push. |
| Preflight QEMU dedicado | BLOCKED | Solo se inspeccionó `/Users/gustavomarcon/.config/openlens-r8r9-test/openlens-qa.kubeconfig`: contexto `openlens-r8r9-qemu`, endpoint `https://localhost:50997`, permisos de archivo 0600. No había listener local; no se hicieron solicitudes al clúster. R10 no se ejecutó. |
| Política de aislamiento del nuevo runner | PASS (unitario) | `node --test open-lens/integration/uiux-audit/head-stabilization.test.cjs`: 5/5. Comprueba separación visual/integración y bloquea el contexto/endpoint antiguo de R10; no ejecuta Electron ni valida la interfaz. |
| Build completo del HEAD / candidato ARM64 nuevo | BLOCKED | `NX_DAEMON=false NX_SKIP_NX_CACHE=true npm_config_ignore_scripts=true npm run build` falló antes de compilar con Node `v26.7.0` (`ReferenceError: require is not defined in ES module scope` en Lerna/yargs). El repo declara Node `>=16 <=20`; no hay runtime compatible disponible. No se creó candidato nuevo. |
| Integridad/hash de candidato actual | NOT_RUN | El candidato histórico `dist-stage-uiux-home-badge-final-r3-20261029` tiene SHA `33f338355e3d1ef51ddece94b883df2cee55ae30164fcfdb48fe52e32df77c61`, pero su correspondencia con este HEAD no está probada; no se usó como sustituto. |
| Geometría Hotbar, Home, badge, foco, drag/persistencia y responsive en Electron | NOT_RUN | No existe candidato ARM64 verificado para este HEAD. El test nuevo solo prueba precondiciones puras; no es evidencia visual. |
| TypeScript, ESLint, Jest y Playwright de este HEAD | NOT_RUN | Bloqueados para una certificación de candidato por falta del build compatible; la suite histórica 105/105 no se atribuye a este candidato. |
| Auditoría de procesos de cierre | NOT_RUN | No se lanzó un candidato de esta auditoría. |
| Integración con Kubernetes QEMU | BLOCKED | Laboratorio inaccesible en `localhost:50997`; no se usó ningún kubeconfig alternativo ni se modificaron recursos. |

**DEVELOPMENT_READY: BLOCKED / no certificado.** Falta compilar el HEAD con un Node soportado y ejecutar sobre ese mismo candidato la prueba visual funcional; el test de preflight 5/5 no demuestra esos requisitos. Esto no equivale a un defecto funcional confirmado.

**RELEASE_READY: NO.** Además de lo anterior, siguen pendientes las pruebas E2E completas, la estabilidad aislada de 30 minutos, seguridad/distribución/firma y aprobación GO explícita.

El nuevo test `open-lens/integration/uiux-audit/head-stabilization.test.cjs` y su módulo `head-stabilization.cjs` no sobrescriben R10 ni los tres candidatos QA protegidos. El módulo implementa únicamente clasificadores de preflight; la automatización visual e integración end-to-end sigue pendiente. No se corrigió código de producto porque no se reprodujo un defecto en un candidato que corresponda al HEAD.

## Validación posterior con Node 20 del HEAD b02278b (29/10/2026)

**Esta sección corrige los bloqueos de ejecución de la auditoría anterior, sin falsear el estado R10 ni los gates pendientes.**

- Node compatible EXISTENTE: `~/.nvm/versions/node/v20.20.2/bin/node` = v20.20.2. Se usó por PATH temporal, sin instalación ni cambio del Node 26 global.
- Monorepo: `NX_DAEMON=false NX_SKIP_NX_CACHE=true npm run build`, 40 proyectos **PASS**. Log: `/var/tmp/lens-head-node20-build-20261029.log`.
- TypeScript: tres `tsc --noEmit` (Core, ErrorBoundary, OpenLens) **PASS**.
- Preflight independiente: cinco tests Node **PASS**; `node --check` **PASS**.
- Jest focalizado: ocho suites, **107/107 PASS**, incluidos Hotbar EntityIcon y migración del Home. ESLint focalizado Core (ejecutado desde `packages/core`) **PASS**; el intento desde la raíz tuvo un error de cwd/configuración, no de código.
- Se generó **nuevo candidato ARM64** desde el build del HEAD `b02278b` (los únicos cambios locales adicionales eran informes y el clasificador de preflight, no código de producto): `open-lens/dist-stage-head-node20-20261029/mac-arm64/OpenLens DevOps.app`. SHA-256 `app.asar`: `eabd34a19c49c6937d3e96d71201c72a2c144230c4f5969dc6a5d9afccb41924`. Ejecutable Mach-O arm64, firma ad hoc, sin release pública.
- **Smoke real Electron/Playwright sin Kubernetes:** perfil HOME/CICD temporal y kubeconfig vacío (0 clústeres). **PARTIAL_PASS**: carga Welcome, único Home superior, Home lateral heredado ausente, Home navega correctamente; rail 72 px y sin overflow horizontal en 1280×800, 900×620, 700×560. Evidencia y script puntual: `open-lens/qa/2026-10-29/head-node20-20261029/`.
- **NO VALIDADO**: ubicación badge Kubernetes en pin de clúster, 25/35 pines, drag/persistencia, PROD y LED, reconexión de terminal, interacciones con clúster y duración 30 minutos. El QEMU aislado no estaba escuchando en su endpoint documentado; no se conectó ni se emplearon credenciales ajenas.
- Estado: **build bloqueado por Node: RESUELTO**. **DEVELOPMENT_READY** requiere decisión explícita sobre los pendientes funcionales; **RELEASE_READY: NO**. La prueba visual es parcial y no reemplaza la matriz UI-04 ni los gates de release.

## Recuperación

Respaldo Git completo, verificado antes de consolidar:
`/Users/gustavomarcon/Documents/lens-out-of-repo-20261030/_backups/LENS_ALL_BRANCHES_20261029_BEFORE_DEVELOP.bundle`.

Archivos originales sin commit y detalles de auditoría:
`/Users/gustavomarcon/Documents/lens-out-of-repo-20261030/_backups/commit-batches-20261029/`,
`/Users/gustavomarcon/Documents/lens-out-of-repo-20261030/_backups/worktree-unification-20261029/`.

## Cómo continuar

Trabajar únicamente en `develop` una vez actualizada. Mantener tareas pendientes en documentos/checklists y evitar generar otra bifurcación o worktree salvo que haya una necesidad técnica explícita. Para una nueva release, crear un candidato nuevo, verificar hash, terminar los QA gates y obtener aprobación específica.
