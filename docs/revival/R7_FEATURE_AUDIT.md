# OpenLens DevOps Revival — R7-00 Auditoría Funcional del Repositorio

**Hito:** R7-00 — Auditoría funcional de línea base y preparación de Release 7  
**Fecha:** 2026-10-23  
**Arquitecto Principal:** Senior Architect & Software Engineer (OpenLens DevOps Revival)  
**Autor del fork:** Gustavo Marcon  
**Rama:** `feat/r7-devops-capabilities`  
**Base consolidada de Release 6:** Commit `731fb1ff4bf4b3cc1fb74972f1cb6428acdce6e0`  
**Checkpoint inmutable protegido:** R5-09 (`6012f4ac52da8c620d3fcae71d4fc406baa27081`)  
**Release archivada:** `/Users/gustavomarcon/Documents/lens/releases/R6-RC/OpenLens DevOps.app`  

---

## 1. Resumen Ejecutivo del Estado del Repositorio

Al concluir Release 6, OpenLens DevOps Revival se ha consolidado como una estación de trabajo Kubernetes rápida, ligera, local y visualmente moderna. Se ha eliminado por completo la telemetría comercial, los requerimientos de inicio de sesión en la nube y los componentes propietarios, logrando un consumo de memoria inferior a 250 MB en reposo (frente a los más de 1.5 GB del cliente comercial oficial).

La base técnica cuenta con:
- Arquitectura de monorepo estable bajo **Node 20.20.2**, **TypeScript**, **React** y **MobX**.
- Inyección de dependencias modular mediante `@ogre-tools/injectable`.
- Suite automatizada de pruebas unitarias Jest y pruebas de integración Playwright en binarios empaquetados reales para arquitectura Apple Silicon (ARM64).
- Cero deuda técnica bloqueante y cero errores de tipado o linting.

---

## 2. Inventario de Capacidades Implementadas (R1 a R6)

A continuación se detalla el catálogo exhaustivo de las funcionalidades activas en la rama `feat/r7-devops-capabilities`:

### 2.1 Identidad, Seguridad de Empaquetado y Plataforma (R1)
- **Identidad Propia:** Identificador de aplicación `dev.drko.openlens-devops`, esquema de URL `openlens-devops://`, directorio de datos aislado `~/.openlens-devops` y proceso completamente desvinculado de servidores de telemetría de Mirantis.
- **Empaquetado Limpio:** Cadena de compilación reproducible en macOS ARM64 con generación de ejecutables aislados en `dist-stage`.
- **Licencia:** Estricto respeto de la licencia de código abierto MIT del upstream, conservando el copyright de los autores originales y agregando la autoría del fork a nombre de **Gustavo Marcon**.

### 2.2 Operaciones Core de Cargas de Trabajo y Editor Seguro (R2)
- **Guardado Atómico de Recursos YAML:** Implementación de guardado optimista mediante `PUT` con verificación estricta de `resourceVersion` en ConfigMaps y Secrets.
- **Detección de Conflictos 409:** Modal inteligente de rebase ante modificaciones concurrentes en el clúster con opción de aplicar cambios locales sobre la versión viva.
- **Editor Monaco con Modo Diff:** Soporte para vista diferencial side-by-side (`Diff Live` y `Diff Original`) con **redacción automática de Secrets** en pantalla para evitar fugas visuales de contraseñas y tokens.
- **Menú DevOps de Pods:** Operaciones directas desde el menú de contexto:
  - Terminal interactiva directa mediante `PodShellSession` sin depender de kubectl externos en el PATH.
  - Visor de logs con soporte de reconexión, pausa/reanudación y descarga.
  - Gestión de Port-Forwards con bind seguro por defecto a `127.0.0.1` y terminación automática al desconectar el clúster o cerrar la app.
  - Acciones de seguridad: **Force Delete** (`gracePeriodSeconds: 0`) y **Evict** con negociación de API `policy/v1`.

### 2.3 Ecosistema Kubernetes Moderno y Observabilidad Local (R3)
- **Descubrimiento Dinámico de APIs:** Consulta de capacidades del API server antes de instanciar vistas, evitando pantallas rotas en clústeres antiguos o con CRDs ausentes.
- **Soporte de Redes Modernas:**
  - `EndpointSlices` (`discovery.k8s.io/v1`).
  - `Gateway API` (`gateway.networking.k8s.io/v1`): Visualización de `GatewayClass`, `Gateway` y `HTTPRoute`.
- **Políticas de Admisión CEL:** Visualizador de `ValidatingAdmissionPolicy` y `ValidatingAdmissionPolicyBinding` (`admissionregistration.k8s.io/v1`).
- **Dynamic Resource Allocation (DRA):** Vistas para `DeviceClass` y `ResourceClaim` (`resource.k8s.io/v1`).
- **GitOps en Modo Lectura:** Integración opcional de recursos de **Argo CD** (`Application`, `ApplicationSet`) y **Flux CD** (`Kustomization`, `HelmRelease`).
- **Seguridad Local:** Visualización de reportes de **Trivy Operator** (`VulnerabilityReport`) sin requerir backend comercial ni servicios SaaS.
- **Observabilidad:** Compatibilidad con Prometheus y **VictoriaMetrics**, y visualización estimada de costos con supuestos transparentes.
- **Servidor MCP Local:** Servidor `stdio` independiente y seguro de solo lectura para herramientas de observabilidad local.

### 2.4 Arquitectura Multiclúster y Continuidad Operativa (R4)
- **Workspace Tab Bar (`WorkspaceTabBar`):** Barra superior de pestañas de clústeres concurrentes (32 px) con persistencia de contexto, scroll y namespace seleccionado por clúster.
- **Herramientas Desacopladas (`Detached Tool Windows`):** Capacidad de desacoplar terminales, logs de pods y editores de recursos en ventanas secundarias independientes de Electron con hidratación de estado vía IPC.
- **Resiliencia de Watchers:**
  - Soporte de `allowWatchBookmarks: true` y procesamiento de eventos `BOOKMARK` en `KubeObjectStore`.
  - Mecanismo de recuperación automática tras suspensión/reanudación del sistema (sleep/wake) y cambios de red.

### 2.5 Seguridad Operacional de Producción y Preferencias (R5)
- **Etiquetado Explícito de Entornos:** Asignación manual de perfiles `DEV`, `STG`, `PROD` o `LOCAL` por clúster, sin inferencias heurísticas frágiles basadas en nombres de kubeconfig.
- **Barreras de Seguridad en PROD:**
  - Color rojo `#EF4444` inmutable para el clúster de producción.
  - Halo de advertencia (`hazard ring`), borde rojo de 3 px en el sidebar del clúster y badges persistentes `PROD`.
  - Diálogos de confirmación reforzados para operaciones destructivas.
- **Catálogo y Bienvenida Modernizados:** Dashboard inicial de bienvenida con conteo de clústeres por entorno y accesos directos de alta visibilidad.

### 2.6 Ergonomía Visual, Identidad y Navegación Ágil (R6)
- **Tema Midnight Graphite:** Paleta cromática oscura de alto contraste (`#0D1117`, `#151B23`, `#1D2633`, `#7196D2`, `#4FAFB0`) optimizada para largas jornadas nocturnas.
- **Identidad de Marca Completa:** Isotipo vectorial, iconos macOS nativos `.icns`, plantillas de tray, pantalla de splash y diálogos About actualizados.
- **Alta Densidad Operativa:**
  - Filas de tabla a **33 px** (Compact) y **42 px** (Comfortable), coordinadas con `VirtualList`.
  - Drawer a 12 px de espaciado y 4 px de padding por ítem.
  - Toolbar de Dock a 28 px.
- **Navegación por Teclado y Reseteo 1-Clic:**
  - Foco fluido desde el buscador a la primera fila con `ArrowDown`.
  - Recorrido vertical por filas con `ArrowDown` / `ArrowUp` acotado al contenedor `.Table`.
  - Botón `Clear all` y badge `Filtered: X / Y` para reseteo instantáneo de filtros.

---

## 3. Matriz de Componentes Activos en el Repositorio

| Área Funcional | Componente Clave | Estado en Código | Nivel de Cobertura |
|---|---|---|---|
| **Cargas de Trabajo** | `workloads-pods`, `workloads-deployments`, `workloads-statefulsets`, `workloads-daemonsets`, `workloads-cronjobs` | Operativo con restart, scale y DevOps menu | **ALTO** |
| **Configuración** | `config-maps`, `config-secrets`, `monaco-editor` | Operativo con guardado verificado y diff | **ALTO** |
| **Redes** | `network-services`, `network-ingresses`, `network-endpoints`, `network-endpoint-slices`, `network-gateways`, `network-policies` | Operativo con visualización y listados | **MEDIO** |
| **Almacenamiento** | `storage-classes`, `storage-volumes` (PV), `storage-volume-claims` (PVC) | Operativo para CRUD básico | **MEDIO** |
| **Nodos** | `nodes` | Solo métricas y tabla de recursos; sin acciones | **BAJO** |
| **Helm** | `helm-charts`, `helm-releases` | Instalación, borrado y detalle básico | **MEDIO** |
| **CRDs** | `custom-resources` | Agrupación por API group; listado de instancias | **MEDIO** |
| **Seguridad / RBAC** | `user-management` (SA, Roles, RoleBindings) | Listado y borrado de manifiestos | **BAJO** |
| **Observabilidad** | `resource-metrics`, `cost-observability`, `applications-and-security` | Paneles básicos y reportes de Trivy | **MEDIO** |
| **Terminal & Shell** | `dock/terminal`, `pod-shell-session`, `node-shell-session` | Terminal funcional; node-shell sin trigger UI | **MEDIO** |

---

## 4. Conclusión de la Auditoría

El núcleo operativo de OpenLens DevOps es sólido, estable y seguro. Sin embargo, la auditoría pone de manifiesto que existen áreas críticas de la administración diaria de clústeres donde la herramienta aún obliga al operador a abandonar la interfaz gráfica y recurrir a la consola (`kubectl` CLI). En particular: operaciones de mantenimiento de nodos (drenado y acordonado), inspección de políticas de red complejas, depuración de pods en ejecución mediante contenedores efímeros, validación en seco (*dry-run*) antes de aplicar cambios, y trazabilidad de rollouts en cargas de trabajo.
