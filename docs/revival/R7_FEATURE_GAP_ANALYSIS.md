# OpenLens DevOps Revival — R7-00 Análisis de Brechas Funcionales (Feature Gap Analysis)

**Hito:** R7-00 — Análisis comparativo de capacidades y detección de brechas  
**Fecha:** 2026-10-23  
**Arquitecto Principal:** Senior Architect & Software Engineer (OpenLens DevOps Revival)  
**Autor del fork:** Gustavo Marcon  
**Rama:** `feat/r7-devops-capabilities`  
**Base consolidada de Release 6:** Commit `731fb1ff4bf4b3cc1fb74972f1cb6428acdce6e0`  

---

## 1. Metodología del Análisis

Para diseñar un roadmap de Release 7 verdaderamente útil, se contrastó el estado actual de OpenLens DevOps con las herramientas de referencia de la industria Kubernetes:
- **Herramientas de Terminal:** `k9s` (eficiencia extrema, atajos de teclado, inspección de dependencias y rollouts).
- **Consolas y Clientes Open Source:** `Headlamp`, `Kubectl plugins` (`kubectl-tree`, `kubectl-who-can`, `kubectl-neat`, `kubectl-debug`).
- **Lens Oficial Comercial:** Análisis de las capacidades de valor agregado que fueron privatizadas tras muros de pago o licencias comerciales en versiones 2025/2026, abstrayendo exclusivamente los casos de uso para diseñar **soluciones limpias, locales y de código abierto (clean-room)**.

Se descartaron expresamente todas las funcionalidades vinculadas a:
- Servicios en la nube obligatorios (Lens Cloud, Mirantis ID).
- Telemetría de uso comercial o encuestas emergentes.
- Modelos de Inteligencia Artificial propietarios o de pago por token.
- Paywalls de funcionalidades básicas de Kubernetes.

---

## 2. Catálogo de Brechas Detectadas (Gaps)

### GAP-01: Mantenimiento Operativo de Nodos (Cordon, Uncordon, Drain y Node Shell)
- **Estado Actual:** La vista de Nodos en OpenLens solo muestra métricas de CPU/memoria y la lista de pods asignados. No existe ninguna acción operativa en el menú de contexto del nodo ni en el panel de detalles.
- **Evidencia en Código:** La sesión de backend `node-shell-session.ts` existe en `packages/core/src/main/shell-session/`, pero está completamente huérfana (ningún botón o menú del renderer la invoca).
- **Impacto Operativo:** Ante tareas de mantenimiento de hardware, actualización de kernel o rotación de nodos en EKS/GKE/bare-metal, el operador debe recurrir a la terminal externa para ejecutar `kubectl cordon` o `kubectl drain`.
- **Propuesta Clean-Room:**
  1. Acciones en menú de nodo: `Cordon` (marcar `spec.unschedulable: true`), `Uncordon` (`false`).
  2. Diálogo modal seguro para `Drain` con flags configurables: `--ignore-daemonsets`, `--delete-emptydir-data`, `--force`, `--grace-period`.
  3. Conexión del trigger de `Node Shell` en la barra de herramientas del nodo (lanzando un pod de depuración seguro con `hostPID: true`, `hostNetwork: true` y rootfs montado).
  4. Bloqueo estricto y confirmación doble obligatoria si el nodo pertenece a un clúster `PROD`.

### GAP-02: Validación Pre-vuelo y Server-Side Dry-Run (`dryRun=All`)
- **Estado Actual:** Al editar un recurso YAML en el Monaco Editor o al crear un manifiesto, el botón "Save" ejecuta un `PUT` o `POST` directo contra el clúster. Si el recurso viola políticas de admisión (CEL, Kyverno, Gatekeeper) o altera campos inmutables (e.g. `spec.selector` en Deployments), el API server devuelve un error `422 Unprocessable Entity` tardío.
- **Evidencia en Código:** La búsqueda de `dryRun` en `packages/core/src` arroja cero coincidencias.
- **Impacto Operativo:** El operador puede romper cargas de trabajo en producción o perder tiempo diagnosticando errores de sintaxis que el servidor de Kubernetes podría validar preventivamente sin persistir cambios.
- **Propuesta Clean-Room:**
  1. Incorporar el botón `Dry Run (Server-Side)` en la barra del editor Monaco y modales de creación.
  2. Enviar la solicitud HTTP con el query parameter `?dryRun=All`.
  3. Si la validación pasa, mostrar badge verde `Dry Run Validated: Admitted by Cluster`.
  4. Si falla, presentar un desglose claro del webhook o política que rechazó el cambio sin tocar el clúster vivo.

### GAP-03: Control de Rollouts y Despliegues en Cargas de Trabajo
- **Estado Actual:** En Deployments, StatefulSets y DaemonSets solo existen las acciones `Restart` y `Scale`. No hay forma de ver el historial de versiones ni deshacer un despliegue fallido.
- **Impacto Operativo:** Si un nuevo despliegue introduce un crash o degradación de rendimiento, el operador no puede hacer rollback desde la interfaz gráfica.
- **Propuesta Clean-Room:**
  1. **Rollout History:** Vista o pestaña en el detalle de la carga de trabajo que enumera los `ReplicaSets` históricos asociados con su número de revisión, fecha de despliegue, imágenes de contenedor y `change-cause`.
  2. **Rollout Undo / Rollback:** Acción para revertir el Deployment a la revisión anterior (o a una revisión seleccionada del historial).
  3. **Rollout Pause & Resume:** Control para pausar despliegues tipo RollingUpdate en situaciones de emergencia.

### GAP-04: Gestión de Instantáneas de Almacenamiento (VolumeSnapshots)
- **Estado Actual:** La sección Storage solo incluye StorageClasses, PersistentVolumes y PersistentVolumeClaims.
- **Evidencia en Código:** No existen tipos ni componentes para la API `snapshot.storage.k8s.io`.
- **Impacto Operativo:** En clústeres modernos con CSI (Amazon EBS, GCP Persistent Disk, Longhorn, Ceph), las copias de seguridad y recuperaciones ante desastres se gestionan mediante `VolumeSnapshot`. La ausencia de estas vistas en la UI deja ciego al operador sobre el estado de sus respaldos de datos.
- **Propuesta Clean-Room:**
  1. Soporte dinámico para `snapshot.storage.k8s.io/v1`: `VolumeSnapshot`, `VolumeSnapshotClass` y `VolumeSnapshotContent`.
  2. Integración en el menú lateral bajo la sección Storage.
  3. Acción rápida: "Create VolumeSnapshot from PVC" en el menú contextual de los PersistentVolumeClaims.
  4. Acción de redimensionado de PVC en caliente (PVC Expansion) cuando el StorageClass tiene `allowVolumeExpansion: true`.

### GAP-05: Matriz y Visualizador de Políticas de Red (NetworkPolicy Matrix)
- **Estado Actual:** `network-policy-details.tsx` muestra una lista plana de selectores de pod y puertos en texto plano.
- **Impacto Operativo:** Las NetworkPolicies de Kubernetes son notoriamente difíciles de auditar visualmente. Determinar si un pod tiene aislamiento total (`default-deny`) o si el tráfico de un namespace específico está bloqueado requiere analizar múltiples manifiestos YAML.
- **Propuesta Clean-Room:**
  1. Componente visual interactivo: Matriz de tráfico / Mapa de flujo de red.
  2. Identificación inmediata de pods aislados: Badge distintivo `Default Deny Ingress` / `Default Deny Egress`.
  3. Inspección en dos sentidos: Dado un Pod, mostrar qué NetworkPolicies lo aplican y qué fuentes/destinos están permitidos.

### GAP-06: Inspector de Permisos RBAC y Simulación (`auth can-i`)
- **Estado Actual:** OpenLens lista Roles, ClusterRoles y Bindings como recursos independientes. No existe forma de simular permisos ni de responder a la pregunta fundamental de seguridad: *"¿Qué puede hacer este usuario o ServiceAccount?"*.
- **Impacto Operativo:** Al depurar errores `403 Forbidden` en pods o pipelines de CI/CD, los operadores deben ejecutar múltiples comandos `kubectl auth can-i` manualmente desde la consola.
- **Propuesta Clean-Room:**
  1. Herramienta interactiva **RBAC Permission Inspector**:
     - Simulación de `SelfSubjectAccessReview` y `SubjectAccessReview`.
     - Selector de ServiceAccount, Namespace y Verbo (`get`, `list`, `create`, `update`, `delete`).
     - Respuesta inmediata con visualización de la regla o binding que otorga el permiso.
  2. Pestaña "Effective Permissions" en el Drawer de detalles de los ServiceAccounts.

### GAP-07: Inteligencia de Ciclo de Vida Helm (Historial y Diff de Valores)
- **Estado Actual:** La vista de Helm Release solo muestra la versión actual instalada y las notas. No permite consultar revisiones pasadas ni comparar diferencias entre valores.
- **Impacto Operativo:** Al actualizar un Chart de Helm en producción, el riesgo de sobreescribir valores críticos o configuraciones de base de datos es elevado si no se puede comparar la configuración actual contra el borrador nuevo.
- **Propuesta Clean-Room:**
  1. **Helm Release History:** Tabla interactiva de revisiones con estado (`superseded`, `deployed`, `failed`) y descripción.
  2. **Values Diff Viewer:** Comparador visual Monaco Diff entre los `values.yaml` de la revisión actual y una revisión previa.
  3. **Validación de Esquema JSON:** Validación cliente/editor contra `values.schema.json` si el chart lo incluye, resaltando errores de configuración antes de ejecutar el upgrade.

### GAP-08: Ergonomía de Logs Avanzada y Contenedores Efímeros (`kubectl debug`)
- **Estado Actual:**
  - Los logs no permiten acotar por tiempo relativo (`--since=15m`, `--since=1h`) ni cantidad de líneas (`--tail=500`).
  - No existe soporte de búsqueda por expresiones regulares (Regex).
  - Los pods que fallan en distroless o CrashLoopBackOff no pueden ser investigados con herramientas de diagnóstico interactivas sin alterar sus manifiestos.
- **Propuesta Clean-Room:**
  1. Selectores de límite temporal (`Since`) y tamaño de búfer inicial (`Tail lines`) en los controles de logs.
  2. Conmutador de formato JSON estructurado: Resaltado y formateo automático de logs generados en formato JSON (`level`, `message`, `timestamp`).
  3. Soporte para **Ephemeral Containers (`kubectl debug`)**: Acción "Attach Debug Container" en el menú DevOps del pod, permitiendo inyectar una imagen de diagnóstico ligera (e.g. `nicolaka/netshoot`, `alpine`, `busybox`) para depurar redes o procesos en vivo.

### GAP-09: Monitor de Capacidad y Alertas de Cuotas (Resource Headroom)
- **Estado Actual:** Los ResourceQuotas y LimitRanges se muestran como números crudos sin contexto visual.
- **Impacto Operativo:** Un namespace que alcanza el 99% de su cuota de memoria o pods comenzará a rechazar pods silenciosamente. Los operadores no reciben aviso preventivo en la lista de namespaces.
- **Propuesta Clean-Room:**
  1. Barras de consumo y margen (*headroom*) visuales en la tabla de Namespaces: porcentaje utilizado vs límite asignado (CPU, RAM, Pods).
  2. Advertencia visual en color amarillo (>80%) o rojo (>90%) cuando el namespace está próximo al agotamiento de cuota.

---

## 3. Matriz de Priorización de Brechas

| Brecha | Valor Operativo Diario | Complejidad Técnica | Riesgo de Regresión | Prioridad Recomendada |
|---|---|---|---|---|
| **GAP-01: Operaciones de Nodos (Cordon/Drain/Shell)** | **CRÍTICO** | Media | Bajo (con guardas PROD) | **Hito R7-01** |
| **GAP-02: Server-Side Dry-Run (`dryRun=All`)** | **ALTO** | Baja | Muy bajo | **Hito R7-02** |
| **GAP-03: Rollout History & Undo en Cargas de Trabajo** | **ALTO** | Media | Bajo | **Hito R7-03** |
| **GAP-04: VolumeSnapshots & Almacenamiento Moderno** | **ALTO** | Media | Muy bajo (discovery API) | **Hito R7-04** |
| **GAP-05: Matriz Visual de NetworkPolicies** | **ALTO** | Media | Muy bajo (solo lectura) | **Hito R7-05** |
| **GAP-06: Inspector de Permisos RBAC (`auth can-i`)** | **ALTO** | Media | Muy bajo (API review) | **Hito R7-06** |
| **GAP-07: Historial y Diff de Valores Helm** | **MEDIO-ALTO** | Media | Bajo | **Hito R7-07** |
| **GAP-08: Logs Avanzados & Ephemeral Debug Pods** | **ALTO** | Media | Bajo | **Hito R7-08** |
| **GAP-09: Headroom de Cuotas y Capacidad** | **MEDIO** | Baja | Muy bajo | **Hito R7-08** |
