# Pasaje de OpenLens de Electron a Rust nativo

Documento de análisis para este checkout (`lens-v6-ui-corrections`). No propone WebView, Tauri ni Electron. La interfaz sería Rust puro. La recomendación de interfaz es **iced**: un IDE con barras laterales, tablas y paneles persistentes encaja mejor en widgets retenidos. **egui** sirve para un prototipo rápido, pero su modo inmediato complica el layout de una aplicación de este tamaño. El resto del stack es solo crates de Rust.

Estado de partida verificado en este árbol: monorepo npm/Lerna, app `open-lens` (producto OpenLens DevOps 6.5.3-dev) y biblioteca `@openlens/core`.

## 1. Mapa de la arquitectura actual

Lenguajes: TypeScript en el código de producto, JavaScript en los bundles compilados, SCSS en la interfaz. React 17 pinta la pantalla. MobX guarda el estado visible. `@ogre-tools/injectable` conecta las piezas.

| Subsistema | Qué hace hoy | Dónde está |
| --- | --- | --- |
| Proceso principal | Crea la ventana, el proxy local, la bandeja, el protocolo `openlens-devops://` y arranca el resto | `open-lens/src/main/index.ts` (bundle `open-lens/static/build/main.js`); lógica en `packages/core/src/main` |
| Renderer | Aplicación React: catálogo, clúster, tablas, docks, tema | `open-lens/src/renderer/index.ts`; UI en `packages/core/src/renderer` (`bootstrap.tsx`, `components/`, `frames/`) |
| IPC | El renderer pide al proceso principal abrir un clúster, leer archivos o lanzar un comando; el principal devuelve resultados y eventos | `packages/core/src/main/ipc`, `packages/core/src/common/ipc`, canales de mensajería |
| Extensiones | Carga extensiones instaladas y las registra en el mismo grafo de inyección (páginas, menús, entidades de catálogo) | `packages/extension-api`, `packages/core/src/main/extension-loader`, `packages/core/src/renderer/extension-loader`, `packages/legacy-extension-example` |
| Clústeres | Lee kubeconfig, detecta contextos, activa y desactiva la conexión, mantiene el estado del clúster | `packages/core/src/main/cluster`, `kubeconfig-manager`, `create-cluster`, `cluster-detectors`, `kube-auth-proxy`; modelo en `packages/core/src/common/cluster` y `features/cluster` |
| kubectl y Helm | Descarga o reutiliza binarios y los ejecuta; lista releases y charts | `packages/core/src/main/kubectl`, `packages/core/src/main/helm`, `packages/ensure-binaries`, `packages/kubectl-versions`, `features/helm-releases`, `features/helm-charts` |
| API de Kubernetes | Peticiones al API server a través del proxy local de Lens | `packages/core/src/main/k8s`, `k8s-request`, `packages/core/src/common/k8s-api`, `packages/kube-object` |
| Preferencias | Tema, comportamiento de la app y ajustes por clúster | `packages/core/src/features/preferences`, `features/user-preferences`, `features/entity-settings` |
| Almacenes | JSON en el directorio de soporte de la app (clústeres, hotbar, usuario, weblinks, provisioner) | `packages/core/src/main/base-store`, `packages/core/src/renderer/base-store`, `packages/core/src/common/item.store.ts` |
| Interfaz | Catálogo, hotbar, sidebar, tablas, menús, docks, terminal, logs | `packages/core/src/renderer/components` y features de renderer (`hotbar`, `terminal`, `global-docking`, `pod-logs`) |
| Proxy y sesión de shell | Proxy HTTPS hacia el renderer y PTY para terminal y shells de pod o nodo | `packages/core/src/main/lens-proxy`, `shell-session`, `detached-tool-windows` |

`open-lens` no contiene la mayor parte de la lógica. Compila un caparazón que importa la biblioteca ya construida (`packages/core/static/build/library/main.js` y `renderer.js`). Por eso un cambio de TypeScript en core no llega al proceso en marcha hasta recompilar esa biblioteca. El SCSS importado por el renderer de `open-lens` sí puede recargarse en caliente.

## 2. Equivalente en Rust por subsistema

| Subsistema | Enfoque Rust | Reutilizar | Reescribir |
| --- | --- | --- | --- |
| Proceso principal y ventana | Un binario `tokio` + `iced`. Ventanas nativas de iced, sin proceso renderer separado | El orden de arranque (proxy y credenciales antes de la UI) como especificación | Electron, `BrowserWindow`, el proxy que solo existe para servir el renderer |
| Interfaz | iced (widgets de lista, panel, pestañas). egui solo si se acepta un prototipo de modo inmediato | Ningún componente React ni SCSS. Sí las reglas de layout que el usuario ya validó, descritas de nuevo en Rust | Todo `packages/core/src/renderer/components` |
| Estado de pantalla | Estado de la app en structs de Rust, actualizado por mensajes de iced. Sin MobX | Los nombres de los estados observables como lista de campos | MobX y el grafo `@ogre-tools/injectable` |
| IPC | No hay IPC de UI. Los comandos son llamadas internas `async`. Un canal `tokio` solo si un worker de clúster vive en otro hilo | Los contratos de mensajes (qué se pide y qué se responde) | Todos los canales Electron |
| Extensiones | Al final, una ABI Rust: crates dinámicos (`libloading`) o WASM (`wasmtime`) con una API pequeña y explícita | La idea de registrar páginas, menús y entidades | Las extensiones JavaScript actuales no pueden ejecutarse. `extension-api` se rediseña |
| Clústeres y kubeconfig | `serde_yaml` para kubeconfig, `kube` + `k8s-openapi` para el API, `rustls` para TLS, `notify` para vigilar archivos | Reglas de detección, fases de conexión y el formato de kubeconfig | `kube-auth-proxy` y el cliente HTTP actuales |
| kubectl y Helm | Fase 1: seguir invocando los mismos binarios con `tokio::process`. Fase 2: reemplazar las llamadas de lectura por `kube`; Helm puede quedar como binario más tiempo | Los binarios y la semántica de releases | `ensure-binaries` y los wrappers TypeScript |
| Preferencias | `serde` + un archivo JSON o TOML en el directorio de la app (`directories`) | Las claves de preferencia y sus valores por defecto, como contrato de migración | La UI de ajustes |
| Almacenes | Leer una vez los JSON actuales para importar; escribir después un formato versionado propio | El contenido (lista de clústeres, hotbar, preferencias) | `base-store` y la sincronización hacia un renderer que ya no existe |
| Terminal y logs | PTY con `portable-pty`. Widget propio de iced sobre `alacritty_terminal` o el modelo de WezTerm | La idea de una sesión por pestaña | xterm.js, el puente WebSocket y el dock HTML |
| Proxy local | Un `hyper` o `axum` mínimo solo donde un webhook o el auth exec de kubeconfig lo exijan. No hace falta servir la interfaz | Las reglas de autorización que sigan siendo válidas | `lens-proxy` como servidor del renderer |

## 3. Qué se conserva y qué se tira

Se conserva el conocimiento, no el código de interfaz:

- El modelo de entidad de catálogo, los estados de conexión del clúster y las reglas de sincronización de kubeconfig.
- Los binarios `kubectl` y `helm` durante la primera fase.
- Los archivos JSON ya guardados, como fuente de una importación única.
- Las pruebas de comportamiento (qué debe verse y qué debe fallar), reescritas en Rust.

Se reescribe por completo:

- React, SCSS, MobX, Electron, el IPC, webpack y el grafo de inyección.
- Cualquier extensión escrita en JavaScript.
- El terminal embebido y los docks HTML.

No hay una capa que se pueda “envolver” y seguir usando. El salto es de modelo de dominio, no de vista.

## 4. Orden de migración

1. **Núcleo sin ventana.** Tipos de clúster, lectura de kubeconfig y almacenes. Pruebas de dominio en `cargo test`.
2. **Conexión.** Cliente `kube` contra un clúster real. Sustituye las lecturas que hoy pasan por el proxy y por kubectl.
3. **Ventana iced mínima.** Lista de clústeres y una vista de workloads. Aquí se decide el tema visual, ya en Rust.
4. **Operación diaria.** Namespaces, logs, apply y el menú de contexto. kubectl queda solo donde el API no alcance.
5. **Terminal.** PTY nativo. Es el tramo más largo de interfaz; no bloquea los pasos anteriores.
6. **Helm.** Primero el binario; después, solo si hace falta, una biblioteca Rust.
7. **Importación.** Leer los JSON de OpenLens DevOps y escribir el formato nuevo.
8. **Extensiones.** API nueva. Las extensiones viejas quedan fuera a propósito.
9. **Empaquetado.** Un binario por sistema, sin `electron-builder`.

Cada paso debe poder ejecutarse solo. No se mantiene Electron en paralelo como motor de la interfaz.

## Criterio de interfaz

iced es la opción por defecto para este producto. egui queda como alternativa si el objetivo de un hito es una herramienta interna de una sola pantalla, no el IDE completo. En ambos casos el toolchain es el de Rust (`cargo`, `rustfmt`, `clippy`) y nada de runtime web.
