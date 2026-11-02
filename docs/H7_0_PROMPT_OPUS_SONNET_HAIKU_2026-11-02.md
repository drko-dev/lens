# Prompt maestro — H7.0 OpenLens DevOps (Opus + Sonnet + Haiku)

Actuá como **Opus, arquitecto principal y coordinador** de H7.0 del proyecto OpenLens DevOps. No arranques H7.1 ni H7.2. Trabajá desde el repositorio local:
`/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`.

## Contexto vinculante

1. Leé íntegramente `docs/H7_RUNBOOK_DOCKING_GLOBAL_MVP_2026-11-02.md`, especialmente H7.0, las reglas de disco y el apartado **5 bis**.
2. La rama de trabajo es `feature/global-docking-h7`. RC3 es la versión aprobada y está protegida por el checkpoint `rc3-pre-h7-2026-11-02` publicado en GitHub. No tocar `main`, `develop`, `feature/floating-panels-h6`, el instalador RC3 respaldado, los kubeconfigs reales ni el perfil real del usuario.
3. H7 busca que **toda OpenLens** permita mover/acoplar/desacoplar paneles como VS Code o Cursor; H7.0 NO implementa todavía esas funcionalidades. La apariencia Cursor grafito aprobada es inmutable.
4. El usuario perdió estabilidad de su Mac al llenarse el disco. La protección de espacio, RAM y CPU es requisito de salida, no una sugerencia.

## Roles y paralelismo explícitos

- **Opus (vos):** arquitecto, coordinador, dueño del plan y único integrador de resultados. Revisá riesgos, presupuestos de recursos, permisos y alcance antes de ejecutar algo pesado.
- **Sonnet:** hasta DOS subagentes para análisis/implementación de tareas distintas. H7.0: uno inspecciona `ClusterFrameLayout`, rutas y motor global de docking; el otro analiza el flujo de desarrollo Electron/watch/HMR, Node y aislamiento de QA. Al comienzo ambos trabajan solo en modo lectura. Ninguno modifica archivos compartidos simultáneamente.
- **Haiku:** agentes de QA/test, con hasta DOS pruebas focalizadas ejecutándose en paralelo por defecto, TRES únicamente si las mediciones de CPU/RAM/disco indican margen. Nunca más de TRES procesos de pruebas concurrentes en toda la Mac. No lanzar toda la suite de Jest ni varios E2E de Electron.
- Contá los procesos de test iniciados por cualquier agente y también los que ya estaban activos; **NO** confundir subagentes de IA con workers locales de Jest.
- Para cada proceso Jest usá solamente rutas de tests específicas con `--runInBand --maxConcurrency=1 --watch=false --coverage=false` (verificá que esas opciones funcionen en la versión instalada). Por defecto 2 procesos independientes como máximo; el tercero exige recursos holgados. Si falla la salud del equipo, volver a una sola prueba focalizada.
- Un único test E2E Electron/Playwright a la vez; una única instancia Electron DEV supervisada. No habilitar por accidente un pool de 4–12 Playwright workers.
- En H7.0 los agentes Haiku pueden revisar tests ya existentes y producir una matriz de cobertura; no ejecutar tests hasta comprobar aislamiento, recursos y compilación DEV básica.
- Cada agente tiene una asignación concreta; nada de worktrees adicionales pesados ni sesiones duplicadas del servidor.

## Objetivo exacto de H7.0

A. **Preflight y rollback**
- Confirmar `git branch --show-current`, `git status` y `git worktree list`; no incluir archivos no rastreados ajenos ni ocultar cambios.
- Validar checkpoint y checksum de la copia RC3: `~/Documents/lens/releases/rc3-pre-h7-2026-11-02/OpenLens DevOps-6.5.3-dev-arm64-RC3.dmg`; checksum esperado `805972f6e58e476a840536e3ae4bb1a9817d6f27d33af27ae97131f7206c3197`. La etiqueta Git resguarda el código; no sube el DMG.
- Medir `df -h .`, `df -k .`, `du -sh open-lens/dist`, `vm_stat` y procesos activos. Si hay **menos de 20 GiB libres**, no iniciar recompilaciones pesadas, instalaciones ni suites grandes. Para una futura RC4 se exigirán **25 GiB libres**; hoy no corresponde empaquetar.
- Si necesitás limpieza, inventariar tamaño, ruta exacta y procesos; borrar únicamente temporales H7 o cachés inequívocas. Nunca borrar RC3 respaldada, archivos personales, ni worktrees con cambios.

B. **Análisis de arquitectura, sin migraciones masivas**
- Revisar `packages/core/src/renderer/components/split-panel/` y `packages/core/src/renderer/components/kubetail/kubetail-page.tsx`.
- Revisar `packages/core/src/renderer/frames/cluster-frame/cluster-frame-layout-child-component.injectable.tsx`, `MainLayout`, `workspace-tabs`, `cluster-frame`, `detached-tool-windows` y descriptores/persistencia.
- Comparar la reutilización del motor propio con una alternativa como Dockview, pero **sin instalar una nueva dependencia ni realizar un POC pesado** todavía. Documentar la elección y su justificación, riesgos de foco, `clusterId`, watchers, terminales, IPC y estado.
- Definir el corte mínimo de H7.1: Pods + Deployments, un clúster por workspace, flag reversible. No mezclar clústeres involuntariamente.

C. **Electron DEV permanente, sin builds de instalador**
- El repositorio incluye `npm run start-dev`; en `open-lens/package.json` existen `dev:main` con webpack watch, `dev:renderer` con HMR y `dev-run` para Electron con debugging. Verificá Node compatible, binarios nativos y puertos antes de arrancar.
- Prepará un **HOME, UserData y kubeconfig ficticio de QA totalmente aislados**, con certeza de que no tocarán `~/Library/Application Support/OpenLens DevOps` ni `~/.kube` reales. No alcanza con usar solo `--user-data-dir` si otros procesos heredan HOME.
- Comprobá el aislamiento con evidencia antes de ejecutar. Si ese aislamiento no se puede garantizar, **detenete y reportá el bloqueo**, no abras Electron contra el perfil real.
- Arrancá **solo una instancia DEV**. Confirmá ventana abierta, consola/devtools, servidor webpack HMR, error logs y que una modificación visual sintética, trivial y reversible aparezca sin empaquetar; revertí el cambio inmediatamente. Evitá segundo dev-server o Electron zombie.
- Si hay un problema con Electron o ABI de un módulo nativo, diagnosticá y corregí el mínimo necesario. No hagas una instalación masiva, una nueva versión Electron ni construyas DMG por reflejo.

D. **Pruebas focalizadas y cierre**
- Con el entorno estable, Haiku propone 2 o 3 pruebas breves relacionadas con lo inspeccionado, en tandas; correr **dos en paralelo por defecto** (tres únicamente con salud comprobada). Cada proceso Jest: `--runInBand --maxConcurrency=1 --watch=false --coverage=false`.
- Registrar PASS/FAIL/PENDING, archivos concretos y consumo de recursos. No afirmar que la suite completa pasó si no fue ejecutada.
- Limpiar temporales creados por H7.0 que no estén en uso; mantener la sesión DEV solo si quedó controlada y estable. Comprobar `df -h .`, procesos y `git status` al finalizar.
- No merge ni push de otros cambios sin revisión del resultado. Se puede commitear exclusivamente documentación o código necesario y validado para H7.0, con diff limpio, dejando fuera archivos ajenos.

## Criterios de aceptación y formato de entrega

Entregá:
1. Estado de RC3 y rollback (commit, etiqueta, checksum, verificado).
2. Estado del disco antes/después y política aplicada; CPU/RAM mientras se corren pruebas.
3. Qué subagente Sonnet realizó qué análisis y qué tests ejecutó Haiku; máximo simultáneo real medido.
4. Instancia Electron DEV: ruta/perfil aislado, procesos/puertos, HMR comprobado (o bloqueo concreto).
5. Decisión sobre reutilizar `split-panel` frente a Dockview, riesgos y prueba mínima H7.1.
6. Tests focalizados, estados reales y qué no se probó.
7. Archivos cambiados, diff, commit si existió y próximos pasos.

**Regla más importante:** el primer MVP debe desarrollarse con **Electron DEV + hot reload**, NO con una imagen/DMG nuevo por cada cambio. **Opus arquitecto; Sonnet implementa; Haiku prueba; 2 tests en paralelo habituales, 3 máximo real, nunca toda la suite junta.**
