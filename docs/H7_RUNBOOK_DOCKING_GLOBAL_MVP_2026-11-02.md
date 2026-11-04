# H7 — Runbook MVP: docking global de OpenLens DevOps

**Fecha:** 2026-11-02
**Estado:** PLAN APROBABLE / implementación funcional NO INICIADA
**Rama de trabajo:** `feature/global-docking-h7`
**Base de código:** `feature/floating-panels-h6` en `2ef8c98` (RC3; commit de corrección `08abb14`)
**Rollback independiente:** `rc3-pre-h7-2026-11-02` (etiqueta y rama remotas)
**Instalador RC3 respaldado:** `~/Documents/lens/releases/rc3-pre-h7-2026-11-02/OpenLens DevOps-6.5.3-dev-arm64-RC3.dmg`
**SHA-256 RC3:** `805972f6e58e476a840536e3ae4bb1a9817d6f27d33af27ae97131f7206c3197`

> Este runbook NO autoriza despliegues ni operaciones contra Kubernetes. Todos los hitos se prueban inicialmente con perfil, HOME y kubeconfigs de QA aislados y datos sintéticos. El objetivo es aumentar libertad de disposición sin perder la identidad Cursor grafito que ya aprobó el usuario.

## 1. Qué se quiere conseguir (en criollo)

Abrir una página de OpenLens —Pods, Deployments, Events, Kubetail, terminal, detalles, Configuración o catálogo— como un panel con una pestaña o una barra superior muy discreta. Arrastrarlo a **izquierda, derecha, arriba, abajo**, agruparlo con otras pestañas, ajustar tamaños, replegarlo sin que desaparezca, sacarlo a una ventana Electron real y devolverlo. Si cerramos o movemos un panel, los demás ocupan el espacio disponible. La interfaz mantiene los controles ocultos hasta hover/focus, sin añadir ruido visual.

**Un clúster por escritorio de trabajo, múltiples paneles y ventanas por clúster.** Cada ventana nativa o panel conserva siempre su `clusterId`; cambiar el clúster seleccionado en la ventana principal NO retargetea una terminal, logs, editor ni acción del clúster anterior. La mezcla deliberada de clústeres en un mismo escritorio queda fuera del MVP, aunque varias ventanas de clústeres distintos puedan coexistir.

**Marca visual uniforme:** línea fina de color del pin del clúster, en una ubicación superior o inferior según el componente; aplicada a selector de clúster, encabezado, panel, pestaña y ventana desacoplada. Nombre de clúster y estado `PROD` disponibles como identificación adicional; nunca depender solo del color. Resolver la divergencia conocida: la acción contextual “Change Color Item and Environment” no actualiza correctamente, mientras Settings sí lo hace.

## 2. Referencias verificadas y decisión de UX

- **VS Code / Cursor:** grupos de editores, divisiones a cuatro lados, vistas arrastrables, comandos de mover/restaurar, ventanas flotantes y modo compacto. Referencia: https://code.visualstudio.com/docs/configure/custom-layout
- **Obsidian:** pestañas/grupos arrastrables, zonas de colocación discretas, separación en ventanas, distribución que persiste. Referencia: https://obsidian.md/help/tabs
- **Dockview (candidato técnico, no decisión tomada):** dock/tab/floating/popout y serialización para React; comparar integración antes de sumar dependencias. Referencia: https://dockview.dev/docs/overview/introduction/

**Diseño acordado:** no copiar toda la UI de esos productos. Encabezado compacto (~26–28 px, sujeto a QA visual), rayita del pin de 2 px orientativa, separadores sutiles; controles **replegar (−), desacoplar, cerrar (×)** solo visibles al pasar el mouse o al dar foco por teclado. El encabezado sirve de asa de arrastre; las guías de drop se muestran solo mientras se arrastra. Doble clic para maximizar/restaurar es deseable si no interfiere con otras interacciones.

En ventanas flotantes se respetan controles nativos macOS. El replegado conserva una barra/pestaña recuperable, no destruye el panel. El cierre es distinto de replegar; el panel cerrado puede reabrirse desde navegación/catálogo. Los controles deben estar disponibles con teclado y para tecnologías de asistencia aunque estén ocultos visualmente sin hover.

## 3. Qué hay realmente hoy en el código

- Motor recursivo de grupos/divisiones: `packages/core/src/renderer/components/split-panel/` (`SplitPanelStore`, `DynamicLayoutRenderer`, `PanelContainer`, descriptores y persistencia).
- Está conectado principalmente a `packages/core/src/renderer/components/kubetail/kubetail-page.tsx`, no como workspace global.
- Punto de integración a investigar: `packages/core/src/renderer/frames/cluster-frame/cluster-frame-layout-child-component.injectable.tsx`, que renderiza la ruta activa dentro de `MainLayout` con `Sidebar` y `Dock`.
- `PanelKind` soporta Kubetail, detalles, Pods, Deployments, Events, terminal, editor; el catálogo actual marca **terminal y resource-editor no disponibles**, y el desacople de `DynamicLayoutRenderer` está limitado a Kubetail y detalles. NO anunciar universalidad antes de habilitar y probar cada vista.
- Deben convivir los sistemas preexistentes de `workspace-tabs`, `cluster-frame` y ventanas desacopladas; evitar duplicar sesiones, watchers, WebSockets, PTYs o navegación.
- No adoptar Dockview ni otra librería sin una prueba pequeña y decisión técnica documentada; primero contrastar con el motor propio ya probado.

## 4. Regla obligatoria: una sola app Electron de desarrollo

Comandos existentes comprobados en `open-lens/package.json`:
- `npm run start-dev` desde la raíz: orquesta los comandos de desarrollo, según configuración actual.
- `open-lens`: `dev:main` corre webpack en modo `--watch`; `dev:renderer` usa Webpack Dev Server con HMR `hot: "only"`.
- `open-lens`: `dev-run` inicia Electron bajo nodemon y activa depuración (DevTools/inspect) SOLO para QA aislado.
- Verificar versión de Node, puertos libres, compilación inicial y aislamiento antes de iniciar; no fijar aquí un puerto distinto del realmente configurado.

**Protocolo:** una sola instancia DEV supervisada y una carpeta de perfil QA fija, sin usar el perfil habitual ni escribir `~/.kube`. HMR para renderer/SCSS; reinicio controlado de Electron solo si cambia main/preload/IPC o falla HMR. No ejecutar `electron-builder`, `build:app`, generar DMG ni copiar `.app` por cada cambio. Abrir DevTools, revisar consola, estado, fuentes/estilos calculados y tests de interacción; evitar dejar procesos Electron/webpack zombie.

**Único empaquetado planificado:** al cerrar criterios de salida del MVP y pruebas E2E, producir un solo RC4 de QA con firma/integridad/checksum; recompilar RC4 únicamente si hubo un defecto demostrado en la versión empaquetada.

## 5. Disciplina de disco (bloqueante, no opcional)

**Lectura inicial observada el 2026-11-02:** volumen de datos 228 GiB, aproximadamente 17 GiB disponibles y ~92% ocupado. El usuario informó reinicio inesperado cuando se llenó el disco. **Con este nivel de espacio, NO iniciar nuevo packaging.**

Antes de cada hito y operación costosa:
1. Ejecutar `df -h .` y `df -k .` para medir espacio **real**, `du -sh` de `open-lens/dist`, perfiles QA, temporales y logs cuando corresponda. Registrar antes/después.
2. **Umbral preventivo:** si hay <20 GiB libres, detener builds pesadas, nueva instalación de dependencias y nuevas suites extensas; auditar/limpiar primero. Para empaquetar RC4, exigir **≥25 GiB libres** antes de empezar (más si la medición real demuestra que hacen falta). No intentar solucionar el problema creando más copias.
3. Un solo perfil persistente DEV de QA, con limpieza final controlada; perfiles de test efímeros marcados inequívocamente por hito. Si queda menos de un margen operativo razonable, detener la ejecución y reportarlo.
4. Al finalizar cada prueba, cerrar procesos temporales y borrar **solo** builds, screenshots, perfiles y caches **creados por H7** que se hayan identificado como descartables, verificando rutas y procesos en uso. Inventariar y medir antes de borrar.
5. **Nunca borrar:** RC3 respaldada, RC1/RC2 DMG de rollback sin decisión expresa, `open-lens/dist/rc3` vigente, carpetas fuente, perfiles reales, kubeconfigs, claves, worktree activo, cambios no commiteados ni `node_modules` sin evaluar el impacto.
6. Al cerrar un hito: `git status`, `git worktree list`, `df -h .`; informar qué se generó, qué se borró, GiB libres y si los procesos dev quedaron cerrados.
7. No lanzar herramientas de limpieza global indiscriminada ni `rm -rf` con rutas inferidas, comodines amplios o sin validación del directorio exacto.

## 5 bis. Orquestación de agentes y presupuesto de tests (obligatorio en TODOS los hitos)

**Modelo coordinador:** Opus, exclusivamente como arquitecto/revisor y único responsable de integrar las decisiones y autorizar ejecuciones pesadas. **Agentes de implementación:** Sonnet, preferentemente dos tareas independientes como máximo; nunca editar en paralelo el mismo archivo y evitar múltiples worktrees pesados. **Agentes de QA:** Haiku, para seleccionar/ejecutar pruebas focalizadas y analizar errores; Haiku no sustituye a Jest, al compilador ni a la inspección de Electron.

**Paralelismo real de tests:** ejecutar **dos pruebas o suites pequeñas en paralelo por defecto**, ampliable a **tres** solo cuando RAM, CPU y espacio libre estén estables. **Límite duro: TRES procesos de prueba locales simultáneos**, contando agentes, shells y procesos de test que ya estén en marcha; jamás iniciar una batería masiva o toda la suite en paralelo. La cifra acordada de “tres o cuatro” es un techo informal: H7 adopta tres para proteger esta Mac. No confundir el número de agentes de IA con workers de Jest.

**Aislamiento de workers:** cada proceso Jest usa exactamente los archivos relacionados y las opciones `--runInBand --maxConcurrency=1 --watch=false --coverage=false` (verificar compatibilidad con la versión instalada). Esto permite dos o tres *procesos* aislados en paralelo, pero evita que cada proceso multiplique workers por su cuenta. Para E2E Electron/Playwright, una sola instancia coordinada y un escenario a la vez, manteniendo la única sesión DEV.

**Control dinámico:** antes de lanzar trabajos leer `df -h .`, `memory_pressure` o `vm_stat`, carga CPU y procesos de test activos. Si hay menos de 20 GiB libres, degradación de memoria, swap importante o Electron/webpack en compilación pesada, disminuir a una prueba focalizada, detener nuevas ejecuciones y limpiar solo temporales identificados; jamás lanzar suites amplias para compensar un fallo. Usar resultados PASS/FAIL/PENDING por archivo. Nunca forzar el cierre de procesos ajenos.

**Regla repetible para cada prompt de H7:** especificar expresamente “Opus = arquitecto/coordinador; Sonnet = implementación; Haiku = QA; 2 tests paralelos por defecto, 3 máximo si hay recursos; cada Jest sin pool de workers; solo 1 Electron DEV; HMR; nada de empaquetar antes de RC4; RC3 intocable”.

## 6. Hitos cortos: uno por vez, demo + checkpoint

### H7.0 — Entorno seguro y decisión técnica (sin cambios visuales)
- [ ] Confirmar checkpoint RC3, tag, commit, checksum y rama H7.
- [ ] Establecer perfil DEV realmente aislado (`HOME`, settings y kubeconfig QA), puerto/debug solo local; confirmar que no comparta el perfil RC3.
- [ ] Levantar **una** instancia Electron DEV con webpack watch + HMR; demostrar que un cambio sintético temporal se refleja sin reconstruir DMG y revertirlo.
- [ ] Comparar el motor propio con un POC acotado de Dockview (solo si aporta valor), con criterios de aislamiento, persistencia, complejidad y peso. Registrar decisión; no migración masiva.
- [ ] Medir uso de disco, presupuesto del cambio y cerrar procesos al terminar.
**Salida:** app DEV validada, decisión de arquitectura y ningún cambio en RC3.

### H7.1 — Contenedor global mínimo (feature flag, vista clásica intacta)
- [ ] Crear un host de panels en la región de contenido del `ClusterFrameLayout`, sin alterar sidebar ni Dock ni las rutas existentes.
- [ ] Pilotar solo dos rutas/visuales de lectura: Pods y Deployments, asociadas a un `clusterId` fijo.
- [ ] Probar abrir y cambiar de ruta y volver a vista clásica con flag OFF. No duplicar instancias de frame ni suscripciones.
**Salida:** 2 vistas reales disponibles como paneles dentro del workspace global, sin regresión.

### H7.2 — Drag & split en las cuatro direcciones
- [ ] Arrastrar por encabezado compacto, drop-zones discretas izquierda/derecha/arriba/abajo y agrupación como pestaña.
- [ ] Resize, reordenamiento y auto-expansión sin huecos; límites mínimos de panel; alternativa con menú/teclado para mover.
- [ ] Probar movimientos repetidos, cancelar drag, cambio de foco y paneles inexistentes.
**Salida:** Pods y Deployments se reordenan en DEV sin pérdida de contenido ni errores.

### H7.3 — Replegado y controles discretos
- [ ] Botones −, desacoplar y × solo al hover/foco, con tooltips/aria-label y sin alterar tamaño de la barra.
- [ ] Replegar deja pestaña/banda accesible y el resto usa el espacio; desplegar recupera vista. Cerrar permite reabrir.
- [ ] Evaluar doble clic maximizar/restaurar y escapabilidad con teclado; prueba visual en Retina y poco ancho.
**Salida:** interacción clara sin saturación, aceptada visualmente por el usuario.

### H7.4 — Identidad del clúster y reparación del cambio de color
- [ ] Fuente única del color del pin existente, aplicada a pestaña, encabezado, selector, contenido y ventanas nativas.
- [ ] Indicador de 2 px aproximado, discreto sobre grafito; nombre y PROD siempre legibles, independientemente del color.
- [ ] Reproducir y corregir el error de “Change Color Item and Environment” frente a Settings; al cambiar el pin todas las marcas se actualizan.
- [ ] Tests de DEV/PROD con colores iguales, neutros o ausentes; no permitir retarget accidental de acciones.
**Salida:** cada panel refleja el clúster correcto y el cambio de color funciona en todos los accesos.

### H7.5 — Desacople Electron real y reacople
- [ ] Reutilizar `detached-tool-windows`/IPC existentes; empezar con paneles piloto, **sin duplicar sesiones**.
- [ ] Botón desacoplar/reacoplar y luego gesto de arrastrar fuera de la ventana solo cuando sea fiable.
- [ ] Cierre, minimización nativa, segundo monitor si disponible, pérdida de conexión y limpieza de procesos.
- [ ] Un panel nunca cambia de clúster al activar otra ventana. Bloqueos/confirmaciones para operaciones sensibles.
**Salida:** ventana nativa identificada, desacoplada y devuelta sin conexiones huérfanas.

### H7.6 — Universalidad progresiva
- [ ] Incorporar en tandas pequeñas Events, detalles, Kubetail, terminal, editor y las rutas restantes.
- [ ] Incluir páginas globales como Configuración y catálogo como paneles de workspace sin romper navegación; diálogos modales siguen siendo diálogos cuando semánticamente corresponda.
- [ ] Investigar cada dependencia de `cluster-frame`, rutas y contexto antes de mover; evitar terminal duplicada, pérdida de edición o permisos.
- [ ] Checkpoint y pruebas focalizadas por familia de componentes.
**Salida:** todas las **vistas de aplicación** tienen mecanismo consistente de docking; limitaciones excepcionales documentadas.

### H7.7 — Persistencia, regresión y recuperación
- [x] Guardar layout por clúster y ventanas como intención visual, no secretos ni terminales activas; versión y migración reversible.
- [ ] Reinicio, layout corrupto, clúster eliminado, perfil sin permisos, cambio de entorno, múltiples monitores y rollback del feature flag. **Parcial (2026-11-04):** verificados reinicio completo y layout corrupto/versión desconocida/clúster ajeno (PS09, PS15). NO VERIFICADOS: clúster eliminado, perfil sin permisos, cambio de entorno, múltiples monitores y rollback del flag en vivo.
- [x] E2E en instancia DEV y validación visual sobre Mac M4; verificar RAM, CPU, viewers, listeners y conexión sin duplicados.
**Salida:** restauración segura y aceptación visual del MVP.

### H7.8 — RC4 única y cierre
- [ ] Revalidar guardia de disco (≥25 GiB libres) y suite final, luego **un solo** paquete ARM64 RC4 de QA.
- [ ] Firma ad-hoc, verificación DMG/codesign/SHA-256, lanzamiento fuera del servidor DEV, rollback a RC3.
- [ ] Eliminar solo artefactos temporales H7 ya validados; conservar instalador RC3 y RC4.
- [ ] Commit, revisión, push y merge del hito solo después de QA/aprobación; no tocar `main`/`develop` por defecto.
**Salida:** RC4 reproducible, reportes y disco en estado seguro.

## 7. Reglas de ejecución y reporte de cada hito

Cada hito se realiza **secuencialmente**, con su prueba funcional, test unitario/focalizado y demo visual. Antes de pasar al siguiente se exige: estado Git limpio de cambios relevantes o commit aislado; reporte de pruebas PASS/FAIL/PENDING; `df -h` con espacio libre; inventario de procesos y temporales; confirmación de que el flag OFF conserva RC3. No ocultar limitaciones o resultados no probados.

**No hacer:** modificar color grafito/base tipográfica, migrar de Electron, mezclar clústeres intencionalmente en un mismo escritorio como requisito MVP, hacer merge a ramas base sin QA, crear múltiples releases o borrar código/archivos por parecer antiguos.

## 8. Restauración de emergencia

El punto de control ya publicado es `rc3-pre-h7-2026-11-02` en GitHub. Si H7 falla: detener DEV y procesos propios, abrir la RC3 respaldada, desactivar flag; recuperar código creando una rama **nueva** desde la etiqueta, **nunca** `reset --hard` sobre trabajo no guardado.

Archivo original y checksum en la cabecera. La copia del DMG está en la Mac, **no** dentro del repositorio Git.

---

**Primer paso al retomar:** comenzar por **H7.0**, verificar aislamiento y liberar margen de disco antes de cualquier build pesada. Este documento es el plan; no afirma que los hitos funcionales ya estén terminados.
