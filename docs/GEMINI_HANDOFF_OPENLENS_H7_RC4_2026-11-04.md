# OpenLens DevOps — Handoff completo a Gemini (H7 / RC4)

**Fecha:** 2026-11-04
**Propósito:** traspasar a Gemini el entorno de desarrollo ya aprobado, sin perder contexto, confundir Kubetail con el repositorio principal ni rehacer hitos cerrados.
**Estado:** OpenLens DevOps H7.8 / RC4 PASS para QA interno. No hay backlog funcional nuevo autorizado.

## 1. Fuente de verdad, ubicación y arranque

Directorio de trabajo canónico y único:

    /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections

Para iniciar Gemini desde CUALQUIER directorio:

    /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/scripts/ai/start-gemini-h7.sh

Alternativa manual:

    cd /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections
    export ENGRAM_PROJECT=lens-v6-ui-corrections
    gemini

No iniciar desde /Users/gustavomarcon/Documents/lens, porque ese directorio contiene DOS repositorios Git independientes:
- lens-v6-ui-corrections: OpenLens DevOps, ESTE proyecto.
- kubetail: componente/proyecto hermano independiente, NO elegir, NO modificar como parte de H7.

El archivo GEMINI.md y .gemini/settings.json dentro de este repositorio son las directivas locales para este trabajo. El lanzador fija cwd a la raíz real y el proyecto Engram; no selecciona automáticamente otra rama.

## 2. Engram y resolución de la ambigüedad

La memoria Engram global sigue existiendo en ~/.engram/engram.db y puede contener otros proyectos del usuario. NO eliminarla ni borrar los otros proyectos.

Problema reproducido (antes):
- engram mcp ejecutado desde Documents/lens sin --project detecta available_projects = [kubetail, lens-v6-ui-corrections] y project_source = ambiguous;
- desde el repo correcto sin override detecta project = lens por el remoto Git, una clave histórica que contiene 131 observaciones;
- hay también 32 observaciones previas bajo lens-v6-ui-corrections.

Solución aplicada:
- MCP de Engram con argumentos mcp --tools=agent --project lens-v6-ui-corrections;
- ENGRAM_PROJECT = lens-v6-ui-corrections;
- en pruebas read-only, mem_current_project devolvió project = lens-v6-ui-corrections, project_source = process_override y available_projects = null desde la raíz del repo Y desde el directorio padre.

IMPORTANTE: el override elimina el selector ambiguo en ESTE agente, pero no borra ni oculta globalmente otras memorias. El proyecto canónico actual para Gemini es lens-v6-ui-corrections.

No leer indiscriminadamente memorias de otros proyectos. El historial H7 más reciente estaba bajo la clave histórica lens y ha sido condensado en este handoff y los documentos oficiales. En una futura investigación histórica concreta, solicitar autorización o especificación del usuario antes de explorar memorias históricas fuera de la clave canónica.

## 3. Git: rama, remoto, worktrees y límites

Verificado a fecha del traspaso:

    git rev-parse --show-toplevel
    /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections

    git branch --show-current
    feature/global-docking-h7

    git remote -v
    origin git@github.com:drko-dev/lens.git (fetch)
    origin git@github.com:drko-dev/lens.git (push)

    git log -1 --oneline
    02caa15 docs(h7): record RC4 build, packaged smoke and RC3 rollback

    git worktree list --porcelain
    worktree /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections
    HEAD 02caa15bdbe0cf8a1d676dac50792238c4f1d08b
    branch refs/heads/feature/global-docking-h7

Existe UN SOLO worktree activo de este repositorio. Branches locales históricas H1–H6, develop, checkpoint y otras son refs y no implican carpetas de trabajo activas.

La rama local estaba 36 commits por delante de origin/feature/global-docking-h7 al crear este handoff. No hay cambios rastreados pendientes. Hay archivos SIN seguimiento anteriores (carpetas .omc/.codebase-memory, imágenes, scratch, odd/tasks, etc.): conservarlos, no agregarlos masivamente ni limpiarlos.

No hacer:
- git clone, git worktree add, cambio de rama, pull/rebase, reset --hard, git clean;
- git add . ni commits que incorporen archivos no relacionados;
- push ni merge a origin/develop, main o cualquier otra rama sin autorización.

RC3 se preserva mediante tag rc3-pre-h7-2026-11-02 y rama checkpoint/rc3-pre-h7-2026-11-02. El commit e4b59c5 es marcador de checkpoint en rama separada, NO ancestro obligatorio de H7. El código RC3 probado corresponde al ancestro 08abb14 (ver manifiesto).

Historial recomendado antes de cualquier nueva tarea: git status --short --branch, git log -15 --oneline, git worktree list --porcelain, git diff --stat, git branch -avv.

## 4. Hitos aprobados: NO volver a programarlos

- H7.0–H7.2: aislamiento DEV, GlobalPanelHost, drag & drop y splitter; corrección de watches/proxy.
- H7.3: controles hover, movimiento de teclado, replegado.
- H7.4: color por clúster, badge de entorno/PROD y tema grafito.
- H7.5: ventanas nativas desacopladas para Pods/Deployments con redock y aislamiento.
- H7.6.1: siete Workloads en docking.
- H7.6.2: Events, ConfigMaps, Services, Ingresses, PVCs, Nodes: 13 vistas de recursos.
- H7.6.3A: Details asociado a identidad estable del recurso.
- H7.6.3B: Logs con buffer, deduplicación, scroll/follow y cleanup.
- H7.6.3C: Editor Monaco con borradores y undo/redo durante movimientos, cierre confirmado y dispose().
- H7.6.3D: Terminal PTY estable; confirmación PROD en store y gate en Main.
- H7.6.3E: Kubetail dentro de docking, un solo KubetailStore por clúster; corrección de grants Main.
- H7.6.4: Settings y Catalog dentro de un host raíz sin clúster ficticio.
- H7.7: persistencia versionada de layout de clúster/raíz, restauración inerte de sesiones, manejo de corrupción.
- H7.8: DMG RC4 ARM64 generado, validación ad-hoc, smoke y rollback RC3: QA interno PASS.

No confundir el proyecto H7 con el antiguo cierre v5 / R8/R9. No portar código o documentación desde repositorios históricos por suposición.

### Secuencia de commits recientes

    2943987   H7.6.3B Logs
    ad72da2   Evidencia Playwright fuera de docs versionados
    9f25255   H7.6.3C Monaco Editor
    dfcd79a   H7.6.3D Terminal
    0b643a1   Gate PROD en Electron Main
    7f39954   H7.6.3E Kubetail
    5cfa13b   Revocar grants PROD al cerrar pestañas
    f2e7c3e   Root panel host Settings/Catalog
    b7ad77f   GV01–GV12 y evidencia
    90c4e24   Persistencia global versionada
    c4f24da   Restauración inerte de sesiones
    6504144   Pestaña activa/layout corrupto
    da9a7d1   PS01–PS16 Playwright/evidencias
    1639cf4   Aceptación H7.7
    f6be6fc   Harness para app empaquetada
    02caa15   Cierre documental H7.8/RC4

Verificar los commits reales y el árbol antes de modificar; no usar los SHA anteriores como referencia de trabajo si HEAD ha avanzado.

## 5. Mapa de archivos y arquitectura

### Global Docking

Directorio principal:

    packages/core/src/features/global-docking/

Subdirectorios:

- common/global-layout-persistence.ts: esquema versionado, serialización y validación/fallback.
- renderer/global-panel-host.tsx: host global por clúster.
- renderer/root-panel-host.tsx: host del frame raíz para Settings/Catalog.
- renderer/global-panel-store.ts y global-panel-store.injectable.ts: integración y acciones.
- renderer/root-panel-store.ts y root-panel-store.injectable.ts: store independiente raíz.
- renderer/global-layout-persistence.ts y layout-persistence-storage.injectable.ts: almacenamiento y restauración.
- renderer/restored-session-gate.ts y restored-session-placeholder.tsx: no iniciar sesiones al restaurar.
- renderer/bound-terminal.tsx, bound-pod-logs.tsx, bound-editor.tsx, bound-kubetail.tsx, bound-resource-details.tsx: vistas con recursos/sesiones.
- renderer/bound-settings.tsx, bound-catalog.tsx: vistas raíz.
- renderer/global-docking-feature-flag.ts: activación.

Motor original compartido (no reescribir):

    packages/core/src/renderer/components/split-panel/

Componentes Lens originales:

    packages/core/src/renderer/components/dock/
    packages/core/src/renderer/components/dock/logs/
    packages/core/src/renderer/components/dock/terminal/
    packages/core/src/renderer/components/dock/edit-resource/
    packages/core/src/renderer/components/monaco-editor/
    packages/core/src/renderer/components/kubetail/

Electron Main, IPC, proxy y autorización: buscar referencias terminal-shell:request-authorization, terminal-shell:release-authorization, lens-k8s-proxy y detached-tool-windows en packages/core/src/main/ antes de cualquier modificación.

### QA

    open-lens/integration/h7-docking-e2e.mjs
    open-lens/integration/h7/harness.mjs
    open-lens/integration/h7/synthetic-kube-api.mjs

Usar H7_ONLY para correr grupos focalizados y H7_PACKAGED_APP para apuntar a un ejecutable empaquetado, según los contratos reales del harness. No suponer que las pruebas nuevas pueden ejecutarse de forma desordenada: algunas dependen de escenarios previos.

Perfil aislado:

    /Users/gustavomarcon/Documents/lens/qa-profiles/h7-dev

Puertos sintéticos habituales 18443/18444; DEV renderer en 9191. Aislar HOME, CICD y KUBECONFIG. No usar el perfil real en ~/Library/Application Support/OpenLens DevOpsDev.

## 6. Persistencia y seguridad

Feature flag de H7: localStorage openlens:global-docking = true; está OFF por defecto. Con OFF, la navegación clásica funciona y la persistencia H7 permanece intacta.

Persistencia H7.7:
- openlens:global-layout:v1:<clusterId> para vistas por clúster.
- openlens:root-layout:v1 para Settings/Catalog.
- almacenamiento en lens-local-storage dentro del userData, con backup :prev y datos corruptos :corrupted.
- nunca tocar openlens:split-layout de Kubetail clásico ni modificar plantillas compartidas.

Al restaurar una sesión antigua:
- Terminal: NO PTY hasta una acción explícita; solicitar autorización PROD de nuevo.
- Logs: NO polling hasta Resume.
- Monaco: NO guardar cambios automáticamente ni fingir recuperar borradores de otra sesión.
- Kubetail: NO streams automáticos.
- Detach: NO reabrir automáticamente ventanas nativas.

Garantías de seguridad:
- identidad clusterId estricta, sin mezcla de pods, pestañas ni sesiones.
- Main valida autorizaciones PROD de uso único; cierre revoca grants pendientes.
- Nunca abrir clúster real ni ejecutar escrituras Kubernetes en QA.
- Mantener sandbox/contextIsolation y seguridad de ventanas desacopladas.

## 7. Release RC3 y RC4

Copia protegida RC3, referencia de rollback:

    /Users/gustavomarcon/Documents/lens/releases/rc3-pre-h7-2026-11-02/OpenLens DevOps-6.5.3-dev-arm64-RC3.dmg

Copia adicional idéntica en:

    open-lens/dist/rc3/OpenLens DevOps-6.5.3-dev-arm64-RC3.dmg

SHA256 RC3:

    805972f6e58e476a840536e3ae4bb1a9817d6f27d33af27ae97131f7206c3197

RC4 aprobado para QA INTERNO:

    open-lens/dist/rc4/OpenLens DevOps-6.5.3-dev-arm64-RC4.dmg

Tamaño RC4: 245644088 bytes. SHA256:

    1a4e9979adc79f17209b9d7a9775a09683fd6ba2a4bbe76114fdb8124c35fc92

Comprobar open-lens/dist/rc4/SHA256SUMS y RELEASE_MANIFEST.txt. RC4 usa firma ad-hoc; NO Developer ID, NO notarización y NO distribución pública. RC3 y RC4 no deben borrarse ni sobrescribirse.

Procedimiento real está en docs/H7_8_RC4_CIERRE.md:
- build Core con SKIP_TS_CHECK=1 por 42 errores TypeScript preexistentes no relacionados con global-docking;
- build de open-lens;
- retirar hot-update.* ignorados del bundle;
- electron-builder ARM64 por separado, codesign --force --deep --sign -, DMG prepackaged;
- no ejecutar npm run clean porque borraría RC2/RC3.

NO reconstruir el DMG ni borrar temporales por iniciativa propia. RC4 ya está validado.

## 8. Evidencia y presupuesto de pruebas

- Regresión H7.7 funcional: 186 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED sobre código 6504144, reportada en docs/evidence/h7-7/results.json.
- El resultado tiene uncommittedChanges: true por el harness/doc del momento; comprobado que commits posteriores no alteraban producto.
- Smoke de aceptación DEV: 13/13 PASS, datos de RAM/CPU/listeners documentados en H7.7.
- Smoke sobre app RC4 empaquetada fuera del servidor DEV: 13/13 PASS, firma/verificación SHA PASS, rollback RC3 PASS.
- No había procesos huérfanos después de RC4 QA.
- Los 42 errores de tsc de Core son una línea base conocida; no equivalen a 42 errores nuevos en H7.
- El usuario pidió expresamente minimizar consumo de tokens y tiempo: ejecutar tests focalizados durante desarrollo; NO ejecutar automáticamente 186 E2E completos ni 4039 tests Core.
- Si una nueva funcionalidad cambia el producto, elegir las pruebas relevantes y registrar cobertura pendiente. Regresión integral sólo en un candidato final acordado.

Rutas de reportes:
- docs/H7_7_PERSISTENCIA_Y_RESTAURACION.md
- docs/H7_8_RC4_CIERRE.md
- docs/evidence/h7-7/results.json
- open-lens/dist/rc4/RELEASE_MANIFEST.txt
- /Users/gustavomarcon/Documents/lens/qa-artifacts/h7-playwright/ (corridas locales históricas)

## 9. Límites pendientes (no son bugs confirmados)

No verificado en RC4: múltiples monitores, perfil sin permisos, cambio de entorno, restauración de clúster eliminado, rollback en vivo del flag, listeners por panel.

Fuera del MVP: páginas dinámicas de extensiones en docking global y detach nativo de Settings/Catalog.

Pendiente administrativo: limpieza de temporales QA bajo inventario autorizado, push/merge por decisión humana. No hay requerimientos funcionales nuevos asignados tras RC4.

## 10. Reglas operativas del siguiente desarrollo

1. Usar la carpeta canónica y verificar Git/Engram.
2. Priorizar instrucciones del usuario actual y los archivos reales sobre memorias antiguas.
3. Acordar un alcance concreto; no inventar un backlog nuevo.
4. Sonnet 5.5 coordina, subagentes Sonnet sobre archivos disjuntos, Haiku para Playwright focalizado cuando estén disponibles. Evitar múltiples compilaciones.
5. No subir a GitHub ni hacer merge sin permiso.
6. No tocar RC3, RC4, snapshots, swap, perfiles reales, clústeres reales o archivos ajenos.
7. Mantener el estilo Cursor/Midnight Graphite, sidebar, headers 28 px, identidad de clúster 2 px.
8. Preservar un solo owner por PTY/stream/modelo Monaco y restauración inerte de layout.
9. Documentar exactamente qué cambió y qué se probó; no informar PASS sin ejecutar el test.
10. Si el usuario sólo pidió continuar, revisar el estado y solicitar una tarea concreta; RC4 interno está cerrado.
