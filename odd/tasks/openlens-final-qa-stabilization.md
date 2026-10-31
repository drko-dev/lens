# OpenLens final QA stabilization
Objective: Certify the current `develop` HEAD for development readiness where evidence permits, without declaring release readiness by inference.
Branch: `develop` only; local thematic commits only when code is corrected; no push. Runner: npm/Lerna + Playwright Electron.

## Specs

### S1 — Workspace and preservation
> Continuá sobre el único workspace:
>
> `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`
>
> Rama obligatoria: `develop`.
>
> **No crear ramas, worktrees, repositorios ni proyectos Engram nuevos.**

Acceptance: preserve the existing branch/worktree; do not clean/reset/push or overwrite protected QA candidates. Keep historical results separate from current-HEAD evidence.
Checks: `git branch`, `git worktree list`, `git status`; preserve ignored QA files.

### S2 — Safe split QA runners
> Crear una prueba nueva y reproducible para el HEAD actual.
>
> Separar dos tipos de validación:
>
> **A. QA visual sin Kubernetes real**
>
> Utilizar un perfil Electron temporal, fixtures controlados y datos de catálogo aislados.
>
> **B. QA de integración con Kubernetes**
>
> Utilizar exclusivamente el kubeconfig dedicado de QEMU después de verificar contexto, endpoint, aislamiento y permisos. No utilizar `~/.kube/config` ni otros perfiles.
>
> No renombrar contextos en el archivo original. Trabajar solamente sobre copias temporales.
>
> No ejecutar operaciones destructivas ni modificar recursos reales para fabricar fixtures.

Acceptance: new tracked runner(s) distinguish visual-only fixtures from integration checks, never default to personal credentials, isolate Electron profile and outputs, record cluster integration as BLOCKED when endpoint/preconditions are unavailable, and leave source fixtures and cluster resources unchanged.
Checks: runner self-checks; isolated-profile assertions; endpoint/context/permission preflight; process cleanup and fixture persistence tests.

### S3 — Current HEAD ARM64 artifact
> Si el candidato R10 no corresponde al HEAD, construir un nuevo ARM64 en una carpeta independiente.
>
> Evitar cachés obsoletos de Nx y Webpack.
>
> Registrar SHA-256 del nuevo `app.asar` y utilizar ese mismo hash durante todas las pruebas.
>
> No sobrescribir los tres candidatos QA protegidos.

Acceptance: build exact current `develop` HEAD into a new, unoccupied candidate directory; use cache-bypass/rebuild steps; confirm architecture and static resource/package consistency; record one immutable SHA-256 for all following QA.
Checks: full monorepo build, TypeScript, ESLint, affected Jest, package integrity, ARM64 bundle inspection, SHA before/after.

### S4 — UI and navigation behavior
> Comprobar sobre el nuevo candidato:
>
> - Home lateral completamente eliminado.
> - Home superior conservado.
> - Símbolo pequeño Kubernetes en la esquina inferior derecha.
> - Avatar centrado horizontal y verticalmente.
> - Borde activo fino, sin contornos duplicados.
> - Rail de 72 px, pin de 56 px y separación vertical de 16 px.
> - Espaciados de 16/24 px en escritorio y 8/12 px en compacto.
> - Drag-and-drop y persistencia de favoritos.
> - Scroll con 25 y 35 favoritos.
> - Navegación Nodes, Pods y Deployments.
> - Tooltip, menú contextual, teclado y foco.
> - Ausencia de errores visibles y overflow.
>
> Probar con resoluciones 1280×800, 900×620 y 700×560.

Acceptance: only executed Playwright and captured geometry/screenshots can yield PASS; historical measurements remain historical. Visual-only cases run without requiring Kubernetes. Cluster-dependent navigation/cross-cluster cases are BLOCKED when the authorized lab is unavailable.
Checks: each viewport; fixture counts 1/2/5/25/35; drag cycles and restart persistence; focus/menu/tooltip; no console/page errors or horizontal overflow.

### S5 — Technical validation and project status
> Ejecutar:
>
> - TypeScript.
> - ESLint.
> - Jest de módulos afectados.
> - Build completo.
> - Playwright actualizado.
> - Integridad del paquete ARM64.
> - Cierre limpio de procesos.
>
> Usar npm y las herramientas realmente declaradas por el repositorio. No exigir Yarn si el proyecto no lo utiliza.
>
> Actualizar `docs/PROJECT_STATUS_20261029.md`.
>
> Guardar las nuevas pruebas sin sobrescribir R10.

Acceptance: report observed PASS / FAIL / BLOCKED / NOT_RUN separately and update canonical project status with current candidate hash, evidence paths, and remaining gates.
Checks: exact npm/Lerna scripts from repository; `git diff --check`; child-process and app exit audit.

### S6 — Readiness decisions
> **DEVELOPMENT_READY:** si el HEAD está compilado, las funciones principales son utilizables y no quedan defectos críticos que impidan nuevos desarrollos.
>
> **RELEASE_READY:** requiere además completar los gates de E2E, estabilidad de 30 minutos, seguridad, distribución y aprobación.
>
> No exigir automáticamente todos los gates de release para permitir nuevos desarrollos.
>
> **Objetivo: terminar la estabilización necesaria y permitir que comencemos a desarrollar nuevas funcionalidades. No iniciar nuevos desarrollos todavía.**

Acceptance: assess the two readiness levels independently; do not claim RELEASE_READY without every release gate and explicit approval. Do not begin feature work.

## Tasks

- T1 [S1,S2,S3] inline — audit current repo, candidate, and QA environment; status: completed with integration environment unavailable; commit: none.
- T2 [S2,S4] inline — add tracked visual-only runner and controlled fixtures; preserve R10; status: partial (preflight classifier/tests only; no Electron runner).
- T3 [S3,S5] delegated action — full build and ARM64 packaging are long-running; status: blocked by unsupported Node runtime; no candidate created.
- T4 [S4,S5] delegated action — run the new Playwright matrix against the exact candidate/hash; status: not run (no candidate matching HEAD).
- T5 [S2,S4] inline — run read-only integration preflight/checks only if the dedicated QEMU endpoint is available; status: blocked pending QEMU endpoint.
- T6 [S5,S6] inline — run applicable type/lint/Jest/package/process checks, update canonical status, and report readiness; status: partial (5/5 preflight unit tests; canonical status updated; other checks not run; DEVELOPMENT_READY not certified).

## Log

### L1 — Original user request (verbatim)

# OpenLens DevOps — Desbloquear QA y certificar el HEAD actual

Continuá sobre el único workspace:

`/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`

Rama obligatoria: `develop`.

**No crear ramas, worktrees, repositorios ni proyectos Engram nuevos.**

## 1. Corregir el diagnóstico de QA

La auditoría anterior quedó incompleta por un bloqueo del runner R10.

Hechos verificados:

- El kubeconfig dedicado existe en `/Users/gustavomarcon/.config/openlens-r8r9-test/openlens-qa.kubeconfig`.
- Su contexto declarado es `openlens-r8r9-qemu`.
- El runner `open-lens/integration/uiux-audit/hotbar-pin-refinement.mjs` exige específicamente un contexto `qa` y el endpoint `https://localhost:49546`.
- Su candidato baseline anterior fue eliminado en la limpieza.
- Su directorio de salida R10 ya existe.
- Por lo tanto, **no debe ejecutarse R10 sin modificar sus precondiciones**.
- No se debe pasar directamente el kubeconfig QEMU al runner antiguo, porque sus condiciones son incompatibles.

## 2. Preparar un runner actualizado

Crear una prueba nueva y reproducible para el HEAD actual.

Separar dos tipos de validación:

**A. QA visual sin Kubernetes real**

Utilizar un perfil Electron temporal, fixtures controlados y datos de catálogo aislados.

Validar Hotbar, centrado, borde seleccionado, posición del badge Kubernetes, eliminación del Home lateral, Home superior y espacios entre columnas.

**B. QA de integración con Kubernetes**

Utilizar exclusivamente el kubeconfig dedicado de QEMU después de verificar contexto, endpoint, aislamiento y permisos. No utilizar `~/.kube/config` ni otros perfiles.

No renombrar contextos en el archivo original. Trabajar solamente sobre copias temporales.

No ejecutar operaciones destructivas ni modificar recursos reales para fabricar fixtures.

Si el laboratorio no está disponible, marcar BLOCKED únicamente esos casos. No bloquear las verificaciones visuales independientes.

## 3. Compilar el HEAD actual

Verificar primero la correspondencia del código, recursos estáticos y paquetes.

Si el candidato R10 no corresponde al HEAD, construir un nuevo ARM64 en una carpeta independiente.

Evitar cachés obsoletos de Nx y Webpack.

Registrar SHA-256 del nuevo `app.asar` y utilizar ese mismo hash durante todas las pruebas.

No sobrescribir los tres candidatos QA protegidos.

## 4. Verificar correcciones pendientes

Comprobar sobre el nuevo candidato:

- Home lateral completamente eliminado.
- Home superior conservado.
- Símbolo pequeño Kubernetes en la esquina inferior derecha.
- Avatar centrado horizontal y verticalmente.
- Borde activo fino, sin contornos duplicados.
- Rail de 72 px, pin de 56 px y separación vertical de 16 px.
- Espaciados de 16/24 px en escritorio y 8/12 px en compacto.
- Drag-and-drop y persistencia de favoritos.
- Scroll con 25 y 35 favoritos.
- Navegación Nodes, Pods y Deployments.
- Tooltip, menú contextual, teclado y foco.
- Ausencia de errores visibles y overflow.

Probar con resoluciones 1280×800, 900×620 y 700×560.

No declarar PASS sin pruebas ejecutadas y evidencias.

## 5. Completar validaciones técnicas

Ejecutar:

- TypeScript.
- ESLint.
- Jest de módulos afectados.
- Build completo.
- Playwright actualizado.
- Integridad del paquete ARM64.
- Cierre limpio de procesos.

Usar npm y las herramientas realmente declaradas por el repositorio. No exigir Yarn si el proyecto no lo utiliza.

## 6. Evaluación final

Determinar por separado:

**DEVELOPMENT_READY:** si el HEAD está compilado, las funciones principales son utilizables y no quedan defectos críticos que impidan nuevos desarrollos.

**RELEASE_READY:** requiere además completar los gates de E2E, estabilidad de 30 minutos, seguridad, distribución y aprobación.

No exigir automáticamente todos los gates de release para permitir nuevos desarrollos.

## 7. Entrega

Actualizar `docs/PROJECT_STATUS_20261029.md`.

Guardar las nuevas pruebas sin sobrescribir R10.

Informar:

1. Correcciones verificadas.
2. Defectos reales encontrados y resueltos.
3. Pruebas PASS / FAIL / BLOCKED / NOT_RUN.
4. Ruta y SHA del nuevo candidato.
5. Pendientes que impiden DEVELOPMENT_READY.
6. Pendientes exclusivos de RELEASE_READY.

Si corregís código, crear commits temáticos en `develop`, sin hacer push.

**Objetivo: terminar la estabilización necesaria y permitir que comencemos a desarrollar nuevas funcionalidades. No iniciar nuevos desarrollos todavía.**

### L2 — Baseline y restricciones

2026-10-29: `develop` was verified at `b02278b277ac25674b9b129745a1115572db0062`, one worktree, tracked-clean; `origin/develop` is 126 commits behind. The candidate at `open-lens/dist-stage-uiux-home-badge-final-r3-20261029/mac-arm64/OpenLens DevOps.app` has SHA-256 `33f338355e3d1ef51ddece94b883df2cee55ae30164fcfdb48fe52e32df77c61`; source correspondence is unproven. The dedicated kubeconfig is mode 0600, context `openlens-r8r9-qemu`, endpoint `https://localhost:50997`; no local listener is active. The old UI-04 run for hash `8c47c07a...` is not current candidate evidence. Do not inspect ambient Kubeconfig, do not use R10, preserve all prior evidence.

### L3 — Test-first evidence

`node --test open-lens/integration/uiux-audit/head-stabilization.test.cjs` failed RED because the planned `head-stabilization.cjs` module did not yet exist (`MODULE_NOT_FOUND`). This is the pre-implementation baseline for the dedicated-target/visual-independence preflight tests.

### L4 — Build environment blocker

The delegated full build and one parent spot-check both failed before compilation under Node `v26.7.0`: Lerna's bundled yargs raised `ReferenceError: require is not defined in ES module scope`. The project declares Node `<=20`; neither Node 20 nor another supported runtime is available on PATH. No candidate was created, no dependencies/runtime were installed, and no network was used. The QEMU endpoint remains unavailable at `localhost:50997`; it blocks integration checks, while the unsupported build runtime separately blocks current-HEAD visual execution.

### L5 — Implemented QA preflight policy and result

Added `open-lens/integration/uiux-audit/head-stabilization.cjs` with exact dedicated-QEMU allowlisting and a candidate-hash/ARM64 preflight, plus 5 Node tests. RED was observed before implementation (`MODULE_NOT_FOUND`); GREEN is 5/5 PASS and `git diff --check` passes. This is only a preflight classifier, not an Electron/Playwright visual runner; do not claim UI proof from it.

### L6 — Readiness and remaining proof

Updated `docs/PROJECT_STATUS_20261029.md` with PASS/BLOCKED/NOT_RUN evidence. DEVELOPMENT_READY remains unverified because no supported-Node build or exact-HEAD visual run exists. RELEASE_READY remains NO; historical build/Jest reports and the old candidate hash are not evidence for this HEAD. No product defect was reproduced or modified.
