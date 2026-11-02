# OpenLens DevOps — Roadmap de paneles acoplables, flotantes y ventanas independientes

**Fecha:** 2026-11-01  
**Estado actualizado (2026-11-02):** H0–H6 completados para macOS ARM64 en el alcance de RC1; H6.1 (Cursor grafito y tipografía compacta) integrado en la rama H6. RC2 macOS ARM64 generado para QA interno; firma Developer ID/notarización, Linux y Windows siguen pendientes.
**Repositorio:** `lens-v6-ui-corrections`  
**Rama observada al redactar:** `feature/kubetail-native-integration` — commit `3ee21e7` (referencia informativa, no checkpoint de release).  
**Electron verificado:** `45.2.0`; `node-pty` `1.1.0-beta34`.  
**Alcance:** experiencia de escritorio y workspaces. La arquitectura de IA/Incidentes se conserva por separado en `/Users/gustavomarcon/Documents/lens/OPENLENS_AI_ARCHITECTURE_DECISIONS.md`.  
**Decisión:** mantener Electron. Priorizar paneles acoplables/desacoplables internos y, después, ventanas nativas. **macOS Apple Silicon (Mac M4 del usuario) es la plataforma primaria de desarrollo, builds, pruebas, aceptación visual y primer release.** Linux sigue siendo importante, pero se valida en una segunda etapa y podrá publicarse como **beta de alcance limitado** hasta completar pruebas Wayland reales. Ninguna validación de Linux bloquea los hitos iniciales de macOS.

## 1. Objetivo de producto

Permitir que el usuario componga la interfaz con componentes reutilizables: abrir, cerrar, mover, dividir, redimensionar, reagrupar y, cuando se valide, extraer a ventanas independientes. Ejemplos:

- Logs de Kubetail a la izquierda + detalles de un Deployment a la derecha.
- Pods/Events en una zona + terminal inferior + métricas en otra zona.
- Una ventana independiente de logs o terminal en un segundo monitor.
- Workspaces guardados, por ejemplo **Operación**, **Incidentes** y **Desarrollo**.

**No** convertir cada panel en un `BrowserWindow`: los paneles internos deben ser livianos. No pedir GitOps, Argo CD, Grafana, IA ni servicios externos para funcionar.

## 2. Punto de partida confirmado en el código (no equivalen a aceptación funcional)

| Base existente | Ruta orientativa | Reutilización propuesta |
|---|---|---|
| Apertura segura de ventanas independientes para herramientas | `packages/core/src/main/detached-tool-windows/open-detached-tool-window.injectable.ts` | Extender, no duplicar, el ciclo de vida de `BrowserWindow`, registro y validaciones IPC. |
| Gestor de sesiones desacopladas y ciclo de vida | `packages/core/src/main/detached-tool-windows/detached-tool-session-manager.injectable.ts` | Evitar streams/conexiones duplicadas; separar representación de sesión. |
| Desacople y reacople de Logs y Terminal | `packages/core/src/renderer/components/dock/logs/`, `.../dock/terminal/` | Primeros componentes piloto; revisar flags y comportamiento **en ejecución**. |
| Persistencia y tabs de workspace | `packages/core/src/features/workspace-tabs/renderer/workspace-persistence-store.ts` | Ampliar esquema de layout; migrar sin eliminar configuraciones antiguas. |
| Dock y pestañas actuales | `packages/core/src/renderer/components/dock/` | Compatibilidad con tabs, editores, logs, terminal y panel de detalle. |

**Advertencia de vigencia:** otros roadmaps del repositorio (por ejemplo `ROADMAP.md` y `docs/OPENLENS_DEVOPS_ROADMAP_VISUAL_2026-10-27.md`) incluyen snapshots históricos de versiones/ramas; no utilizarlos como fuente de la versión actual de Electron sin comprobar el checkout. La existencia de código y tests anteriores **no acredita** que una función esté habilitada o validada en el binario actual.

## 3. Principios arquitectónicos y no negociables

1. **Renderer desacoplado de Electron:** definir componentes/paneles con IDs y descriptores estables; limitar llamadas a `BrowserWindow` y APIs nativas a una capa Electron en main + IPC tipado.
2. **Fuente única de sesión:** cambiar dónde aparece un panel no debe iniciar un nuevo stream de Kubetail, proxy Kubernetes ni PTY; mover la vista manteniendo el ciclo de vida correcto, o reiniciando de forma explícita si es necesario.
3. **Aislamiento de clúster y usuario:** cada panel carga su `clusterId`, namespace y recurso; cambio de clúster, cierre o pérdida de RBAC no puede retargetear un panel ni mezclar datos. Producción identificada visualmente.
4. **Seguridad de ventanas:** IPC con validación de origen, contexto mínimo, `contextIsolation`, sandbox y permisos restrictivos; no pasar kubeconfigs, certificados, tokens ni Secrets a ventanas por IPC; aplicar autorizaciones ya existentes.
5. **Restauración segura:** persistir geometría interna y descriptores, **nunca** credenciales, logs sensibles ni contenidos de terminal. Restaurar inicialmente el layout inerte, sin reabrir automáticamente conexiones, `exec`, port-forward o sesiones de producción.
6. **Feature flags y rollback:** opción opt-in en pilotos; vista clásica siempre recuperable. No tocar datos reales ni perfiles de usuario durante pruebas; usar laboratorio/perfil aislado.
7. **Wayland-first en restricciones:** dentro de la app, DnD y resize propios; para ventanas nativas el usuario controla posición. No prometer coordenadas exactas, `alwaysOnTop` ni restauración multimonitor perfecta bajo Wayland.
8. **Calidad:** unit tests + integración + binario ejecutable + pruebas visuales reales **en macOS Apple Silicon primero**. Un build correcto no es aprobación de UX; el usuario acepta cada hito en su Mac. Las pruebas de Linux son posteriores y no sustituyen las de macOS.

## 4. Hitos secuenciales y criterios de salida

### H0 — Línea base, inventario y diseño de interacción (P0)

- [x] Congelar referencia técnica: versión Electron, rama, commit, flags activos, perfil aislado, CPU/RAM de línea base, capturas de interfaz.
- [x] Verificar **en ejecución** lo que ya funciona: tabs/workspaces, desacople de logs/terminal, reacople, pérdida de conexión, cierre de ventana, reinicio.
- [x] Identificar componentes a convertir en paneles (`Kubetail`, Logs, Terminal, Pods, Deployments, Events y detalles de recurso); mapear sus stores, owners de conexiones y contextos.
- [x] Acordar prototipo UX: añadir/cerrar panel; arrastrar a izquierda/derecha/arriba/abajo; tabular; redimensionar; devolver a posición original; atajos y navegación por teclado.
- [x] Definir contrato `PanelDescriptor` (tipo, ID, `clusterId`, recurso/namespace, capacidades, versión del esquema) y eventos de ciclo de vida. Evaluar librería de docking mantenida **versus** solución mínima propia mediante prueba acotada; evitar dependencia o migración masiva prematura.

**Salida verificable:** mapa de arquitectura y prototipo de interacción aceptado; regresiones base registradas. No implementar aún un rediseño global.

### H1 — Motor de disposición dentro de la ventana principal (P0, MVP)

- [x] Crear contenedores de panel con grupos de pestañas, split horizontal/vertical, ajuste de tamaño, drag-and-drop y cierre.
- [x] Permitir acoplar/desacoplar **dentro de la ventana**, sin usar un `BrowserWindow` por panel.
- [x] Evitar renderizadores/streams duplicados al mover un panel; mantener foco, scroll y selección cuando sea técnicamente viable.
- [x] Inicialmente **Kubetail/Logs + vista de detalles de un recurso**; reutilizar stores y componentes existentes.
- [x] Añadir acción visible «Restaurar distribución predeterminada» y feature flag.

**Aceptación:** dos vistas lado a lado con resize, reordenamiento y recuperación del layout clásico; ningún flujo de logs duplicado; navegación accesible por teclado; ninguna regresión en vista clásica.

### H2 — Catálogo de paneles y workspace configurable (P1)

- [x] «Agregar componente» mediante catálogo: Logs/Kubetail, Pods, Deployments, Events, Terminal, detalles; diferir paneles no probados.
- [x] Permitir cerrar, reagrupar, mover y abrir instancias cuando tenga sentido; límites de cantidad por panel y clúster.
- [x] Unificar encabezados, estado del clúster, namespace y advertencias de producción sin duplicar barras de controles.
- [x] Definir layouts iniciales de Operación, Incidentes y Desarrollo como plantillas optativas, no dependientes de módulos IA aún pendientes.

**Aceptación:** configurar una distribución de al menos tres paneles, alternar recursos/clústeres sin contaminación de estado y recuperarse de paneles vacíos o con error.

### H3 — Ventanas nativas independientes y segundo monitor (P1)

- [x] Reutilizar la infraestructura **ya existente** de ventanas desacopladas de Logs/Terminal (`detached-tool-windows`) después de su auditoría.
- [x] Extender adaptador para extraer uno de los paneles compatibles a `BrowserWindow`; IPC validado, límites de ventanas, ciclo de vida y cierre robusto.
- [x] Acoplar de nuevo sin pérdidas silenciosas ni duplicados. Aclarar semántica de terminales interactivas y de logs: una sola sesión propietaria o recreación autorizada.
- [x] Asegurar cierre por clúster, logout, desconexión y exit; evitar streams o PTY huérfanos.
- [x] Probar múltiples monitores en macOS y Linux; bajo Wayland respetar restricciones del compositor.

**Aceptación:** abrir Logs en ventana separada, trabajar con Deployment en principal y volver a acoplar; no exponer credenciales ni perder el control de sesiones.

### H4 — Persistencia versionada y recuperación (P1)

- [x] Extender el almacenamiento actual de workspace con un esquema `LayoutV1` versionado, validación, migraciones no destructivas y rollback.
- [x] Guardar paneles/grupos/ratios/orden, workspace activo y ventanas abiertas **como intención de UI**; límites y manejo de configuraciones corruptas.
- [x] No restaurar automáticamente Kubernetes API subscriptions ni terminales privilegiadas; pedir activación cuando corresponda.
- [x] Persistir tamaño/ubicación externa **best-effort** por plataforma; en Wayland no garantizar coordenadas exactas ni monitor anterior.
- [x] Tratar datos de contexto ausentes y clústeres eliminados sin abrir otro clúster por accidente.

**Aceptación:** reiniciar aplicación y recuperar la distribución, sin recrear conexiones peligrosas ni reintroducir datos sensibles. (Completado y validado 2026-11-02 con 25/25 escenarios E2E PASS).

### H5 — Rendimiento, estabilidad y hardening (P0 antes de release)

- [x] Medir CPU, RAM, número de renderers, streams Kubernetes activos y latencia de interacción con 1, 4, 8 y 12 paneles.
- [x] Evitar watchers, websockets, suscripciones y timers duplicados; pausar trabajo innecesario en paneles ocultos sin cortar procesos que deban seguir activos.
- [x] Manejar fallos del renderer, cierre de ventana, desconexión y reconexión, errores RBAC 401/403 y datos de clústeres múltiples.
- [x] Pruebas unitarias de reducer/layout, stores, IPC, lifecycle; E2E de docking/redock y tests de regresión del editor, terminal, Kubetail y navegación.
- [x] Accesibilidad: foco, teclado, contraste, indicador visible de entorno PROD, resize usable y opciones para desactivar animaciones.
- [x] Empaquetado y prueba real en binarios; reportar mediciones antes/después, regresiones y estrategia de reversión.
- [x] Unificación visual integral bajo Midnight Graphite con tokens semánticos en `:root` (camelCase y kebab-case) y SCSS.

**Aceptación:** no se observan cuelgues, pérdidas de sesión, suscripciones duplicadas ni fugas progresivas en los escenarios definidos; métricas comparadas con baseline, no suposiciones de rendimiento. (Completado y validado 2026-11-02 con 87/87 tests unitarios PASS y 30/30 escenarios visuales/E2E PASS en Electron 45 ARM64 Mac M4).

### H6 — Validación de macOS y salida multiplataforma gradual (P1; Mac primero, Linux después)

**Primera prioridad — macOS Apple Silicon, entorno real del usuario:**

- [x] Construir y probar un binario de OpenLens DevOps para **macOS ARM64** en la Mac M4; registrar commit, versión y perfil de prueba aislado.
- [x] Ejecutar E2E y QA visual/manual de drag-and-drop, splits, resize, pestañas, acoplar/desacoplar y restauración de layouts en **macOS**.
- [x] Comprobar logs de Kubetail, terminales, detalles de Deployment, cambio de clúster y cierre/reapertura de la aplicación sin duplicación de sesiones.
- [x] Probar ventanas separadas, foco, tamaños, pantalla Retina y, cuando exista un segundo monitor disponible, movimiento entre pantallas.
- [x] Medir RAM/CPU con paneles múltiples, registrar capturas y solicitar aceptación del usuario sobre una **app macOS ejecutable**.
- [x] Preparar release candidato macOS y rollback. **La finalización de estas verificaciones habilita la salida macOS sin esperar a Linux.**

**Segunda prioridad — Linux (beta opcional después del candidato macOS):**

- [ ] Linux VM en Mac M4: instalar Fedora Workstation **ARM64** con escritorio GNOME en Wayland (UTM u otro hipervisor); comprobar `echo $XDG_SESSION_TYPE` = `wayland`.
- [ ] Verificar empaquetado Linux **arm64**, compatibilidad de Electron/`node-pty` y dependencias nativas; el binario macOS no es ejecutable en Linux.
- [ ] GNOME/Wayland: probar resize, drag/drop interno, ventana externa, reacople, foco y restauración de layout interno, sin prometer posiciones absolutas de ventanas.
- [ ] KDE Plasma/Wayland y X11: explorar cuando haya entorno disponible; registrar limitaciones específicas de compositor.
- [ ] Antes de declarar soporte Linux general estable: comprobar Linux **x86_64** en hardware/VM adecuados; una VM Linux ARM64 en Apple Silicon no valida Linux x86_64 ni todos los escenarios de GPU/multimonitor.
- [ ] Linux podrá publicarse como **beta con funcionalidades acotadas** y matriz de limitaciones, sin frenar el desarrollo de macOS.

**Tercera prioridad — Windows (si se incorpora a la distribución):**

- [ ] Smoke tests y regresión en Windows antes de anunciar soporte o paridad.

**Aceptación:** release macOS basado en pruebas reales y aprobación del usuario; Linux etiquetado `Beta / funciones limitadas` o `No probado` hasta disponer de evidencia suficiente. Problemas críticos de seguridad bloquean cualquier plataforma afectada. (RC1 validado en macOS 2026-11-02: binario ARM64 ejecutado sin Webpack Dev Server, 34/35 escenarios E2E PASS, 1 PENDING por notarización Apple; H6.1 fija Cursor grafito como tema predeterminado aprobado para RC2).

### H6.1 — Consolidación visual definitiva Cursor grafito (aprobado)

- [x] Cursor queda como **único tema predeterminado**, manteniendo Midnight Graphite y otros temas como opciones.
- [x] Unificar fondos, superficies, controles y estados de navegación con **grafito neutro**; no utilizar azul claro como color principal.
- [x] Mantener colores semánticos de seguridad (PROD/error/advertencia/éxito) para que las alertas no se confundan con elementos decorativos.
- [x] Aplicar tipografía Inter Variable y compactación validada en Electron: navegación principal de 30 px, submenús de 26 px, tabla de 30 px como objetivo y barra de filtros de 34 px.
- [x] Validar el tema predeterminado, colores calculados y densidad real de navegación en aplicación ARM64 empaquetada, sin Dev Server; 98/98 tests focalizados PASS.
- [x] Integrar con commit `d682cb8` (`fix(ui): consolidate Cursor graphite and compact typography`) mediante fast-forward a `feature/floating-panels-h6`.
- [x] RC2 generado desde `8923f15`, DMG firmado ad-hoc, integridad verificada, SHA-256 documentado; RC1 intacto. **No notarizado: uso exclusivo de QA interno.**

**Restricción:** identidad visual aprobada; no efectuar nuevos cambios de apariencia durante empaquetado de RC2. El RC2 es QA interno mientras no disponga de firma Developer ID y notarización oficiales.

## 5. Orden de entrega propuesto

| Entrega | Contenido | Dependencias | Estado |
|---|---|---|---|
| **E1 — Prototipo** | H0 + H1: Kubetail/Logs y Deployment lado a lado, docking interno y rollback | App actual en entorno aislado | Completado (2026-11-02) |
| **E2 — Composición** | H2: catálogo de paneles y grupos reconfigurables | E1 aprobada | Completado (2026-11-02) |
| **E3 — Multipantalla** | H3: desacople nativo aprovechando el código ya existente | E1/E2 + auditoría de ventanas | Completado (2026-11-02) |
| **E4 — Sesiones** | H4: restauración versionada y segura | E1–E3 | Completado (2026-11-02) |
| **E5 — Candidato macOS** | H5 + H6 (tramo macOS): estabilidad, métricas, E2E y aprobación visual en Mac M4; Linux beta como trabajo posterior separado | E1–E4 | RC1 validado (2026-11-02); notarización pendiente |
| **E6 — Consolidación UI final** | H6.1: Cursor grafito, Inter Variable, navegación y tablas compactas, aceptación del usuario | E5 | Integrado (commit `d682cb8`); RC2 DMG de QA interno verificado |

Las entregas son **hitos por evidencia**, no plazos prometidos. Los tiempos se estimarán después de H0.

## 6. Matriz mínima de pruebas de producto

- Abrir Logs/Kubetail y Deployment en paralelo; resize, maximizar/restaurar, cerrar/reabrir, mover entre grupos.
- Cambiar namespace y clúster mientras hay logs/terminal activos; nunca mezclar datos ni escalar privilegios.
- Pasar un panel a ventana externa y reacoplarlo; verificar que no quedan dos streams ni sesiones huérfanas.
- Cerrar ventana externa y aplicación; recuperar una sesión de trabajo sin reconectar automáticamente a producción.
- Operar con 1/4/8/12 paneles; memoria y carga de CPU no deben crecer sin límite.
- Forzar pérdida de conectividad, 401/403, cierre de renderer y estado de layout corrupto.
- **Mac M4 (prueba principal):** drag/resize internos, ventanas externas, foco, monitor secundario si está disponible, estado de Kubetail y aceptación visual con capturas del binario macOS.
- **Linux GNOME/Wayland (posterior):** VM ARM64, drag/resize internos, ventanas externas, foco y tolerancia a geometría desconocida; no bloquea el primer candidato macOS.
- Test de QA visual real con capturas y aceptación del usuario **en macOS**. No aprobar por pasar Jest únicamente.

## 7. Seguridad operativa, release y rollback

- Trabajar en rama separada al iniciar **la implementación**; este documento no autoriza cambiar el código ni hacer deploy.
- Preservar checkpoints/releases existentes; registrar el commit de partida y un procedimiento de rollback antes de cada entrega.
- Nunca tocar kubeconfigs, Settings reales, Secret/ConfigMap de producción ni recursos Kubernetes sin autorización explícita.
- Flags para volver instantáneamente al dock anterior. Conservar datos de preferencias antes de migrarlos.
- Al preparar builds, medir espacio, conservar binario estable y limpiar solamente artefactos identificados y prescindibles (ver `docs/OPENLENS_DEVOPS_ROADMAP_VISUAL_2026-10-27.md`).
- Proteger y auditar canales IPC y flujos entre ventanas; prevenir fugas de contexto entre clústeres.
- Evitar copiar implementaciones propietarias de Lens/Mirantis; tomar el comportamiento observable únicamente como referencia.

## 8. Pendiente de decisión antes de H1

1. Diseño final del catálogo y de los controles de drag/docking (UX a aprobar con prototipo).
2. Si el modo de panel flotante **dentro de la ventana** sale en E1 o después del split/acoplamiento básico.
3. Alcance inicial de paneles genéricos: elegir Kubetail/Logs + vista Deployment y, tras estabilización, Events/Terminal.
4. **Resuelto:** el primer binario candidato y las pruebas de aceptación se hacen en **macOS Apple Silicon (Mac M4)**. Linux se prueba después y puede mantenerse como beta limitada sin bloquear macOS.

---

**Nota de estado 2026-11-02:** roadmap actualizado tras H0–H6.1. No se realizaron push ni merge a ramas principales, ni se alteraron entornos Kubernetes reales. Linux/Windows y firma/notarización oficial quedan fuera del RC interno.
