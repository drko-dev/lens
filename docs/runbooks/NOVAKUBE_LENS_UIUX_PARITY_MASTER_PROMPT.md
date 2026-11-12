# PROMPT MAESTRO — Paridad visual UI/UX de NovaKube con Lens oficial

Actuá como un agente senior de Electron/React/TypeScript/SCSS, diseño de interfaces, accesibilidad, QA visual y automatización. Continuá AUTÓNOMAMENTE un proyecto REAL en mi Mac: alinear **uno por uno** el tema oscuro, componentes, geometría, estados interactivos y experiencia de uso de **NovaKube/OpenLens DevOps** con **Mirantis Lens oficial 2026.10.261408-latest**. No te quedes en sugerencias ni en una auditoría: **implementá, probá, corregí y guardá commits locales**. No declares una diferencia resuelta hasta verificar el resultado renderizado.

## Entorno y punto de continuidad

- Repositorio editable: `~/Documents/lens/lens-v6-ui-corrections`.
- Rama: `feature/novakube-high-contrast`; último checkpoint conocido: `b35c7582` (confirmar HEAD/estado antes de cambiar nada).
- Referencia **solo lectura**: `/Applications/Lens.app` (Mirantis Lens oficial). No modificar su paquete ni su código de instalación.
- NovaKube es la **opción de tema** que se está igualando a Lens Dark. Respetar el tema Cursor como predeterminado y aislar los cambios en `body.theme-novakube`, salvo cambios de componentes estrictamente necesarios y condicionados por el tema.
- Stack: Electron/Node.js 24, TypeScript, React, SCSS, Kubernetes. Existe una sesión de desarrollo Electron con hot reload y CDP local (en el último control `127.0.0.1:9223`; verificar que siga activa).
- Evidencia previa y test automatizado: `docs/evidence/novakube-lens-2026-visual-parity/EVIDENCE.md` y `audit.mjs`; capturas/JSON en `~/Documents/lens/qa-profiles/lens-2026-live-preview/evidence/`. Leerlos antes de empezar.
- Estado previo verificable: 46/46 controles visuales en Electron, 55/55 pruebas Jest seleccionadas; desarrollo webpack compilaba. Quedaban **123 errores en el typecheck global** no atribuibles a los cambios de paridad. Volvé a medir la línea base; no afirmes que el build completo pasa si no pasa.
- No dar por terminada una tarea simplemente por pasar Jest o un matcher de SCSS: la comprobación visual debe ocurrir **en el frame real del clúster** (Electron usa frames distintos) y contrastarse con Lens oficial.

## Resultado que busco

**Paridad 1:1 verificable** del diseño visual y los patrones de interacción de Lens Dark en todas las pantallas equivalentes de NovaKube, no solo Pods. Evitar diferencias de 1–2 px, colores incorrectos, iconografía desalineada, espaciados, fuentes, bordes, altura, hover, foco, active, disabled, selected, menús, diálogos, scrollbars y layouts responsive. Toda diferencia visible debe figurar como *reproducida/corregida/verificada*, *pendiente* o *no comparable*. No declarar "100 % igual" sin una matriz de pantallas/estados y pruebas visuales comparables.

No copiar código, fuentes pagas, logos, íconos ni assets propietarios sin derechos o licencia. Reproducir geometría, estilos e interacción desde referencias visuales y tokens permitidos. Preservar identidad NovaKube donde corresponda.

## Método obligatorio, por iteraciones completas

1. **Revisar y proteger:** leer README, evidencia y commits previos; `git status`, HEAD, rama, versiones, comandos de build/test. No borrar worktrees, builds, bases de datos, perfiles, configuración, clústeres o credenciales; no usar `git reset --hard`. Jamás modificar Lens oficial. Si hay cambios de otro trabajo, aislarlos.
2. **Referencia limpia y comparable:** utilizar Lens oficial con tema **Dark**, mismo tamaño lógico de ventana, escala/DPI y estado de navegación que NovaKube. Si cambia el estado/configuración de Lens, pedir aprobación antes de restablecer o mover archivos. No confundir el contenido de 23 Pods de Lens con los 2 Pods sintéticos de la demo. Para pruebas pixel a pixel, usar datos/estados equivalentes o comparar regiones estructurales enmascarando contenido dinámico.
3. **Inventariar pantallas y estados:** titlebar/macOS chrome, botones/menús, workspace tabs, hotbar/pins, Navigator (root, árbol, search, status y colores), Overview, Nodes, Pods, Deployments, ReplicaSets, Config, Network, Storage, Helm, tablas, columnas, sorting/filter, contexto y acciones, Search, Details/Drawer, dock/terminal/logs/Kubetail, Settings, context menus, diálogos, tooltips, loaders, estados vacíos, errores, selección, disabled, focus-visible y hover. Incluir pantallas propias de NovaKube con adaptación visual consistente.
4. **Medir, no adivinar:** capturar imágenes de ambas apps y medir `getBoundingClientRect()`, `getComputedStyle()`, CSS tokens, paddings, tipografía, fuentes, anchuras, alturas y scroll. Comparar mediante diff/overlay cuando el contenido sea equivalente. Documentar por pantalla: Lens, NovaKube, diferencia, causa CSS/React, propuesta, verificación y captura final.
5. **Corregir un conjunto pequeño de diferencias:** preferir tokens semánticos y componentes reutilizables sobre reglas frágiles. Evitar `!important`, selectores contra estilos inline y hardcodes dependientes de un clúster cuando exista una solución robusta. No romper otros temas; si un cambio React es exclusivo de NovaKube, condicionarlo por tema. No eliminar controles para que una captura "parezca" igual: conservar funcionalidad.
6. **Probar en Electron REAL:** HMR o recompilar cuando haga falta; inspeccionar el frame correcto, validar interacción de mouse/teclado, enfoque, menú, búsqueda, navegación, apertura/cierre, sin desbordamiento horizontal. Matriz mínima de tamaños: 1440×900, 900×700, 700×700, 700×500 (no superar las restricciones nativas de ventana). Comparar colores, alineación y estados, no solo que el elemento "exista".
7. **Regresión y trazabilidad:** correr Jest de los módulos afectados, ESLint, `git diff --check`, build webpack y análisis TypeScript; distinguir errores existentes de errores nuevos. Extender `audit.mjs` y `EVIDENCE.md` con checks reales y capturas, incluyendo fallos y limitaciones. No introducir regresiones en KubeConfig, Docker, Git, ArgoCD, RBAC, Incident Center, OAuth, terminal, hot reload, producción, networking o seguridad.
8. **Checkpoint:** cada lote estable se guarda con `git add` explícito, commit descriptivo y árbol versionado limpio. **Sin push, sin merge a main/develop, sin limpiar archivos del usuario y sin cambiar su instalación estable sin aprobación expresa.**
9. **Continuar:** pasar al siguiente bloque de mayor diferencia visual. Trabajar de forma autónoma y enviar actualizaciones breves por lote; no solicitar confirmación por cada archivo, prueba o commit. Pedirla solamente para permisos realmente necesarios, datos sensibles, instalaciones, borrados, cambios de seguridad, compras o alteraciones irreversibles.
10. **Cierre verdadero:** entregar matriz de comparación pantalla × estado, evidencia y screenshots lado a lado, conjunto de commits, tests, informe de diferencias restantes y estado de build. Solo generar/denominar binario **FINAL** si el empaquetado ARM64, firma, test fuera del servidor de desarrollo, validación funcional y typecheck global cumplen los criterios; reportar explícitamente si siguen bloqueados y por qué.

## Restricciones importantes

- Objetivo visual/UX **muy fiel**, pero NO sacrificar funciones propias de NovaKube para falsificar la similitud.
- Mantener colores semánticos de producción/advertencia, colores por clúster, RBAC, pruebas de autorización, credenciales y restricciones de red. Los cambios visuales no autorizan activar proveedores externos ni saltar seguridad.
- Mantener en funcionamiento búsqueda de terminal, seguimiento de streams, ventanas desacopladas y re-acoplamiento, drag/docking, layout persistido, menús, scroll y keyboard focus.
- No inventar pruebas ni afirmar 100 % de paridad si las capturas no son comparables.
- Fuentes comerciales de Lens: verificar nombre y licencia; si no están licenciadas, usar una alternativa legal muy similar y consignar la diferencia. Nunca extraer ni redistribuir fuentes propietarias.

## Orden inicial

A. Abrir ambos programas y realizar capturas del Navigator/Pods/terminal en estado comparable.
B. Identificar los **10 mayores desajustes visuales verificables** (px/color/función) y ordenarlos.
C. Empezar a corregirlos, medirlos y guardar commits locales sin detenerte a pedir instrucciones rutinarias.
D. Repetir el ciclo con todas las pantallas equivalentes.
E. Informar qué partes quedaron exactamente verificadas y cuáles no, con enlaces/rutas de evidencia.

**Empezá ahora por leer el estado del repositorio y la evidencia existente. No me respondas solo con un plan: ejecutá la primera iteración.**
