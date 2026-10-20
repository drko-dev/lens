# CATÁLOGO COMPLETO PARA DECISIÓN — OpenLens DevOps Revival

**Fecha:** 2026-10-19 · **Rama analizada:** `feat/openlens-devops-revival` · **Estado:** inventario comparativo completo por áreas; aún requiere validación manual de ejecución y decisiones del usuario.

**Fuentes primarias:** `LENS_2026_COMPLETE_CATALOG.md`, `LENS_2026_K8S_AUTH_DEVOPS_DEEP_DIVE.md`, `LENS_2026_UI_UX_DEEP_DIVE.md`, `REA_FINDINGS.md`. Comparación con el **working tree** local, no solo HEAD. El catálogo oficial se refiere **principalmente a Lens `2026.10.121159-latest`**; el informe REA documenta también otro build (no combinar evidencias entre ellos sin referencia). Los nombres en source maps y búsquedas estáticas **no prueban funcionamiento en ejecución**.

### Cómo leer esta matriz
- **U:** hay código y pruebas unitarias relacionadas aprobadas; no equivale a smoke de UI ni laboratorio Kubernetes.
- **C:** código local identificado, comportamiento no probado en esta pasada.
- **P:** funcionalidad parcial o heredada; requiere cerrar el diferencial exacto.
- **N:** no se encontró implementación equivalente mediante búsquedas dirigidas de código, **no prueba formal de ausencia**.
- **F:** futuro por decisión del usuario (IA).
- **X:** excluido por decisión del usuario (integraciones cloud propietarias, productos comerciales).
- **Esfuerzo:** estimación comparativa *baja / media / alta*, no es cronograma ni compromiso.
- **Decisión del usuario:** pendiente para todas las opciones U/C/P/N; no crear roadmap ni modificar código antes de seleccionarlas.

Se identifican **43 entradas oficiales** (UI-01…14, KC-01…10, K8S-01…11, DEV-01…08), desdobladas cuando permiten decisiones independientes. Se añaden elementos locales y transversales (K8S-12/13, P-01…10). Algunos componentes de Lens oficial existían ya en OpenLens clásico; este archivo **no supone que toda diferencia sea una novedad real**.

## Interfaz, navegación y editor

| ID | Capacidad elegible | Estado fork | Esfuerzo | Dependencia / riesgo | Referencia oficial |
|---|---|:---:|---|---|---|
| UI-01a | Pestañas múltiples de recursos en el área principal | N | Alta | Refactor de navegación y estado por clúster | UI-01 |
| UI-01b | Pestañas de previsualización temporales y pin por doble clic | N | Media | Depende de UI-01a | UI-01 |
| UI-01c | Menús y atajos de cerrar/ordenar pestañas | N | Baja-media | Depende de UI-01a | UI-01 |
| UI-02a | Navegador unificado de clústeres y recursos | N | Alta | Sustituye sidebar/iframes existentes | UI-02 |
| UI-02b | Drill-down, renombrado en árbol y navegación por teclado | N | Media | Depende de UI-02a | UI-02 |
| UI-03a | Desacoplar vistas en ventanas Electron independientes | N | Alta | IPC, estado y seguridad de ventanas | UI-03 |
| UI-03b | Persistir/restaurar ventanas y su estado | N | Media-alta | Depende de UI-03a | UI-03 |
| UI-04a | Elegir color/icono de clúster (base local implementada) | U | Baja | Código en cluster-appearance; validación visual pendiente | UI-04 |
| UI-04b | Propagar acento de clúster a pestañas, dock y guías | P | Baja-media | Requiere UI-01a/UI-12a para propagación completa | UI-04 |
| UI-04c | Color dominante automático desde avatar personalizado | N | Baja | Librería de extracción, coste UI | UI-04 |
| UI-05a | Motor de tablas TanStack virtualizadas | N | Alta | Sustituye react-virtualized; pruebas rendimiento | UI-05 |
| UI-05b | Reordenar, redimensionar y persistir columnas por contexto | P | Media | Estado y migración de preferencias; confirmar capacidades heredadas | UI-05 |
| UI-05c | Autoajuste del ancho de columna con doble clic | N | Baja-media | Depende del motor de tabla elegido | UI-05 |
| UI-06 | Filtros multiselección dentro del encabezado de columnas | N | Media | Requiere estado de filtros; ideal con UI-05 | UI-06 |
| UI-07a | Búsqueda por expresiones regulares y sensibilidad a mayúsculas | N | Baja | Validar coste de regex sobre listas grandes | UI-07 |
| UI-07b | Exportar tablas de recursos a CSV/JSON | N | Baja | Escapar celdas; proteger Secrets | UI-07 |
| UI-07c | Contador visible de elementos filtrados y totales | N | Baja | Depende de motor de listas | UI-07 |
| UI-08 | Resumen de estado/disponibilidad sobre Deployments | N | Baja-media | Consultas y agregados de tabla | UI-08 |
| UI-09a | Comparación lado a lado en editor YAML | N | Baja-media | MonacoDiffEditor; preservar borradores | UI-09 |
| UI-09b | Revertir el borrador al original con confirmación | N | Baja | Evitar pérdida accidental de trabajo | UI-09 |
| UI-09c | Preferencias modernas de Monaco y eliminación managedFields | P | Baja-media | El editor base existe; revisar settings concretos | UI-09 |
| UI-10a | Terminales como pestañas de ventana principal | P | Media | Hay terminales de pod en dock; falta main-view | UI-10 |
| UI-10b | Búsqueda integrada dentro de la terminal | N | Baja | xterm-addon-search | UI-10 |
| UI-11a | Logs virtualizados con selector desde fecha/hora | P | Media | Hay visor de logs heredado; faltan estos controles | UI-11 |
| UI-11b | Saltar del log al recurso controlador | N | Baja | Resolver ownerReferences | UI-11 |
| UI-11c | Persistir word-wrap y prefijar logs combinados por pod | P | Baja-media | Revisar soporte heredado y persistencia | UI-11 |
| UI-12a | Dock separado por clúster y restauración de sus pestañas | N | Media | Migración de estado del dock | UI-12 |
| UI-12b | Historial atrás/adelante entre vistas y detalles | P | Media | Parte de la navegación heredada existe; confirmar alcance | UI-12 |
| UI-13a | Diálogos guiados de Secrets, Quotas, Namespaces y RBAC | P | Baja-media | Secrets y ResourceQuotas ya tienen diálogos; revisar restantes | UI-13 |
| UI-13b | Diálogos GUI para repositorios y rollback Helm | P | Baja-media | Existen flujos Helm; cotejar UX | UI-13 |
| UI-14a | Sincronizar tema claro/oscuro con macOS | C | Baja | Listener nativeTheme presente y prueba indirecta; smoke visual pendiente | UI-14 |
| UI-14b | Paneles de detalle modulares, etiquetas +N y acordeones persistentes | P | Media | Paneles heredados; decidir si refactor amplio justifica | UI-14 |
| UI-14c | Alertas de caducidad de certificados TLS en Secrets | N | Baja | Parseo seguro x509 y manejo de datos sensibles | UI-14 |

## Kubeconfig, autenticación y transporte

| ID | Capacidad elegible | Estado fork | Esfuerzo | Dependencia / riesgo | Referencia oficial |
|---|---|:---:|---|---|---|
| KC-01a | Continuar cargando entradas válidas si otras fallan | P | Media | Validación heredada elimina contextos inválidos; falta validar secciones por separado | KC-01 |
| KC-01b | Diagnóstico seguro de entradas descartadas sin mostrar credenciales | N | Baja | Auditar redacción logs y excepciones | KC-01 |
| KC-02a | Preservar tls-server-name al serializar kubeconfig | C | Baja | Presente en dumpConfigYaml; test round-trip pendiente | KC-02 |
| KC-02b | Preservar proxy-url y disable-compression en round-trip | N | Baja | No están en dumpConfigYaml actual | KC-02 |
| KC-02c | Preservar full exec auth: env, interactiveMode, provideClusterInfo | P | Media | Se conserva exec; validar modelo cliente Kubernetes 0.19 | KC-02 |
| KC-03a | Vigilancia estable de kubeconfigs con ignorados y tamaños máximos | U | Baja | Watcher existente 2/32 MiB, awaitWriteFinish y atomic; tests sync aprobados | KC-03 |
| KC-03b | Leer UTF-8 estrictamente y evitar duplicados en sync | U | Baja | TextDecoder fatal y test de dos fuentes superpuestas | KC-03 |
| KC-03c | UI de administración de fuentes locales de kubeconfig | P | Baja | Gestor de sync existe; cotejar UI específica | KC-03 |
| KC-04 | Alternar kubeconfig directo vs proxy interno por clúster | N | Media | Archivos credenciales 0600; no exponer tokens | KC-04 |
| KC-05a | Actualizar proxy Kubernetes empaquetado y dependencias | N | Media-alta | Actual proxy 0.3.0; ABI y autenticación | KC-05 |
| KC-05b | Checksum proxy, timeout de arranque y reintentos supervisados | N | Media | Verificar firma/hash de binarios oficiales elegidos | KC-05 |
| KC-06a | Resolver proxy PAC del sistema operativo | U | Baja | resolveProxy Electron presente; pruebas aprobadas | KC-06 |
| KC-06b | Cadena PAC HTTP/HTTPS/SOCKS y fallback de variables de entorno | P | Media | Resolver heredado; no se comprobó cadena completa | KC-06 |
| KC-06c | CAs del sistema con filtrado de vencimiento | P | Media | Verificar implementación de trust store y certificados | KC-06 |
| KC-07 | Conector nativo de cuentas AWS EKS y token propio | X | — | Excluido; conservar kubeconfig con exec existente | KC-07 |
| KC-08 | Conector nativo de Azure AKS y token propio | X | — | Excluido; conservar kubeconfig con exec existente | KC-08 |
| KC-09 | Conector nativo de Google GKE y token propio | X | — | Excluido; conservar kubeconfig con exec existente | KC-09 |
| KC-10 | Conector nativo de Mirantis MKE | X | — | Excluido; conservar kubeconfig con exec existente | KC-10 |

## Kubernetes moderno, APIs y operaciones

| ID | Capacidad elegible | Estado fork | Esfuerzo | Dependencia / riesgo | Referencia oficial |
|---|---|:---:|---|---|---|
| K8S-01a | Versionar kubectl según versión de cada clúster | C | Media | Clase Kubectl descarga por versión; tabla extendida 1.30–1.37 | K8S-01 |
| K8S-01b | Verificar SHA-256 de kubectl descargado | N | Media | Validación de versión no equivale a checksum | K8S-01 |
| K8S-01c | Actualizar kubectl y Helm empaquetados | N | Media | Base 1.25.16/3.11.0; pruebas API y arquitectura | K8S-01 |
| K8S-01d | Usar kubectl compatible también para port-forward/exec | P | Media | port-forward fuerza binario bundled=true; compatibilidad | K8S-01 |
| K8S-02a | Watch bookmarks con resourceVersion actualizado | N | Media | Resiliencia contra watches sin eventos | K8S-02 |
| K8S-02b | Timeout de watch inactivo y reinicio silencioso | N | Media | 2 minutos oficial; evitar tormentas de requests | K8S-02 |
| K8S-02c | Backoff jitter y recuperación de sleep/red | N | Media | Electron powerMonitor, pruebas VPN/suspend | K8S-02 |
| K8S-03a | Paginación continue/limit 500 en grandes listados | N | Media | Control de carga y versiones de API | K8S-03 |
| K8S-03b | Rate limiting por clúster y parseo eficiente | N | Media | Rendimiento en clúster grande; seguridad de memoria | K8S-03 |
| K8S-04a | Retirar vistas y llamadas PodSecurityPolicy eliminadas | N | Baja | Referencias heredadas policy/v1beta1 localizadas | K8S-04 |
| K8S-04b | Negociar versión Eviction API al expulsar pods | P | Media | Acción Evict del fork presente; revisar api.evict y discovery | K8S-04 |
| K8S-04c | Corregir kubectl drain --delete-emptydir-data | P | Baja | Localizar comando de drain y versión CLI | K8S-04 |
| K8S-04d | HPA autoscaling/v2 y fallback API; PDB v1 | P | Media | Auditar negociación y soporte existente | K8S-04 |
| K8S-05 | Vistas y detalles de EndpointSlice discovery.k8s.io/v1 | N | Media | Se halló mención en test, no implementación de UI | K8S-05 |
| K8S-06 | Recursos Gateway API y referencias entre rutas | N | Media-alta | GatewayClass, Gateway, HTTP/GRPC/TCP/TLS/UDPRoute, ReferenceGrant | K8S-06 |
| K8S-07 | Políticas de admisión Validating/Mutating + vista CEL | N | Media-alta | Versiones v1/v1beta1/v1alpha1; permisos RBAC | K8S-07 |
| K8S-08 | Dynamic Resource Allocation GPU y dispositivos | N | Media-alta | DeviceClass, ResourceClaim, Template, Slice | K8S-08 |
| K8S-09 | Integración local Argo CD en clúster | N | Media | CRDs + acciones Sync/Refresh; controles destructivos | K8S-09 |
| K8S-10 | Integración local Flux CD en clúster | N | Media | CRDs + reconciliación/suspensión con permisos | K8S-10 |
| K8S-11 | Vista de aplicaciones lógicas por etiquetas app.kubernetes.io | N | Media | Agregación health de recursos relacionados | K8S-11 |
| K8S-12 | Ampliar recursos Kubernetes GA básicos según discovery | P | Media | Lease, Ingress, RuntimeClass, PriorityClass, CronJob presentes; revisar versiones | DeepDive 2.3 |
| K8S-13 | Mantener compatibilidad kubeconfig exec de proveedores cloud sin conectores | P | Media | Ruta exec presente, probar PATH/plugin externo local | Decisión usuario |

## DevOps, observabilidad, seguridad y MCP

| ID | Capacidad elegible | Estado fork | Esfuerzo | Dependencia / riesgo | Referencia oficial |
|---|---|:---:|---|---|---|
| DEV-01a | CronJob ejecutar ahora, suspender/reanudar | C | Baja | CronJobMenu existente, validar comportamientos | DEV-01 |
| DEV-01b | Marcar IngressClass predeterminada | C | Baja | ingress-class-set-default.injectable.ts existente | DEV-01 |
| DEV-01c | Generar kubeconfig desde ServiceAccount | P | Media | Hay ruta SA; revisar token moderno y controles de exposición | DEV-01 |
| DEV-01d | Estado humano de Deployment y acciones rápidas | P | Baja-media | Actions legadas presentes, insignias modernas por verificar | DEV-01 |
| DEV-01e | Acciones Pod: terminal, logs, portforward y Evict | U | Baja | PodDevOpsMenu probado; Evict y Force Delete revisión adicional | Fork local |
| DEV-02a | Detectar y mostrar reportes Trivy Operator en recursos | N | Media | CRDs externos opcionales, no instalar automáticamente | DEV-02 |
| DEV-02b | Auditoría de configuración, RBAC y exposición de secretos | N | Media | Ocultar valores; limitar permisos y exportaciones | DEV-02 |
| DEV-02c | Análisis opcional de imágenes OCI/registry | N | Media-alta | Credenciales de registro y red; autorización | DEV-02 |
| DEV-03a | Panel de costes basado en OpenCost o Kubecost | N | Media | Conexión a servicios del clúster, sin licencia comercial propia | DEV-03 |
| DEV-03b | Estimación local usando Prometheus y tarifas manuales | N | Media | Sin conector cloud; advertir que son estimaciones | DEV-03 |
| DEV-03c | Consulta de precios en vivo a APIs cloud propietarias | X | — | Excluida por alcance | DEV-03 |
| DEV-04a | Soporte del proveedor de métricas StackLight | C | Baja | Proveedor heredado detectado en código | DEV-04 |
| DEV-04b | Proveedor específico VictoriaMetrics | N | Media | Validar endpoints y PromQL soportado | DEV-04 |
| DEV-04c | HTTPS configurable y filtrado de series vacías | P | Baja-media | Mejoras Prometheus no verificadas | DEV-04 |
| DEV-05a | Servidor MCP local por stdio sin cuenta comercial | N | Alta | Proceso, lifecycle, IPC, aislamiento y redacción | DEV-05 |
| DEV-05b | Herramientas MCP Kubernetes list/connect/get/describe | N | Media | Permisos mínimos, acceso al clúster explícito | DEV-05 |
| DEV-05c | Herramientas MCP Prometheus query/alertas/targets | N | Media | Consultas solo lectura, cuotas y límites de salida | DEV-05 |
| DEV-05d | Herramientas MCP navegación y apertura de logs/dock | N | Media | IPC del renderer, control de sesión | DEV-05 |
| DEV-05e | Herramientas MCP mutadoras kubectl/terminal/edit-resource | N | Alta | Nunca autoejecutar; confirmación previa y auditoría local | DEV-05 |
| DEV-05f | Configuración de clientes MCP, scopes y revocación | N | Media | Diseño propuesto; no se afirma paridad con Lens | Diseño seguridad |
| DEV-06 | Detectar/lanzar CLI externos de IA | F | Baja-media | Posponer; no confundir con servidor MCP | DEV-06 |
| DEV-07 | Prism / IA integrada y agentes con proveedores | F | Alta | Futuro; mantener neutralidad de proveedor | DEV-07 |
| DEV-08a | Recargar extensiones locales sin reiniciar app | P | Media | Existe extension-discovery; hot reload específico sin verificar | DEV-08 |
| DEV-08b | Guía/SDK de creación de extensiones locales | P | Media | SDK heredado existe; evaluar UX | DEV-08 |

## Plataforma, seguridad y calidad

| ID | Capacidad elegible | Estado fork | Esfuerzo | Dependencia / riesgo | Referencia oficial |
|---|---|:---:|---|---|---|
| P-01 | Aislar identidad, protocolo y datos de OpenLens DevOps | C | Baja | appId y userData propios presentes; tests aún sin smoke de app | Repo |
| P-02 | Compatibilidad Electron/Node y nativos | P | Alta | Electron 22, node-pty 0.10.1; host Node 26 fuera de engines <=20 | REA |
| P-03 | Modernizar React, TypeScript, MobX y Monaco escalonadamente | N | Alta | Migración transversal, APIs de dependencias | Catalog stack |
| P-04 | Integridad de binarios y empaquetado arm64 reproducible | P | Media | --publish never ya presente; falta checksum/SBOM | Repo |
| P-05 | Endurecer CSP, electron fuses e IPC | P | Alta | CSP contiene unsafe-eval; revisar necesidad y aislamiento | Repo+REA |
| P-06 | Retener tokens/Secrets fuera de logs, previews, MCP y exportaciones | P | Alta | Riesgo transversal; revisión de fugas | REA+Design |
| P-07 | Tests de concurrencia, kubeconfig, watch, terminal y reconexión | P | Media | 76 pruebas locales aprobadas; faltan laboratorios controlados | Tests |
| P-08 | Evitar licencias, suscripciones, telemetría y cuentas comerciales | X | — | Decisión fija; no portar módulos propietarios | Usuario |
| P-09 | Gobernanza de extensiones por JWT corporativo | X | — | Función comercial fuera de alcance | DeepDive 3.6 |
| P-10 | Compatibilidad legal: implementar limpio sin copiar código propietario | P | Alta | Usar análisis como especificación y revisar licencias antes de portar | Riesgo legal |

## Resultado de verificación (sin operar clústeres)

**107 opciones de alcance granular**: N=54, U=5, P=32, C=7, X=7, F=2. Se ejecutaron **12 suites de Jest y 76 pruebas: todas aprobadas**, con Node de host `v26.7.0`, fuera del rango declarado `>=16 <=20` por el paquete core. Se probaron editor YAML, controles de concurrencia de Secret/ConfigMap, menú de pod, port-forward y su cleanup, kubeconfig, sincronización, terminal de pod, personalización, proxy de sistema y otras utilidades. Las pruebas no validan empíricamente Lens oficial ni la UI completa; revisar `CODE_VERIFICATION.md` y `TEST_RESULTS.md`.

**Riesgo crítico no resuelto:** el método `save()` usa PUT con `resourceVersion` para recursos concretos (Secret/ConfigMap) pero mantiene JSON Patch sin precondición `test /metadata/resourceVersion` para otros recursos como Deployment; el GET de verificación posterior detecta diferencias pero NO evita escrituras concurrentes. Antes de operar recursos sensibles, definir corrección y tests. No repetir la afirmación de que “todo el editor YAML es seguro”.

**Corregido respecto del catálogo abreviado:** vigilancia de kubeconfig (`awaitWriteFinish`, `atomic`, límites 2/32 MiB, UTF-8 estricto) ya existía y tiene pruebas. Resolución de proxy del sistema y tema de macOS también existen. Secret/ResourceQuota ya tienen diálogos; el repositorio incluye CronJobMenu e IngressClassSetDefault; StackLight también existe. La descarga de kubectl por versión ya existía, pero no se verificó SHA-256 y el port-forward selecciona el kubectl bundled.

**No confundir permisos de Kubernetes con permisos de herramientas MCP:** los wrappers locales y la política de confirmación son decisiones de diseño pendientes. No iniciar acciones mutadoras ni exponer credenciales sin consentimiento explícito. Todo recurso descubierto de forma opcional (Argo, Flux, Trivy, Gateway, DRA) debe ser detectado sin instalar componentes arbitrariamente.

## Secuencia de decisiones (NO es roadmap)

1. Revisar opciones por área: incorporar / mantener tal cual / evaluar / descartar.
2. Agrupar opciones escogidas en dependencias técnicas (por ejemplo, UI-01a precede a UI-01b y UI-03).
3. Establecer criterios de aceptación, riesgos, compatibilidad y pruebas por opción.
4. Solo después generar roadmap de hitos, orden, duración estimada y cómo implementar.

## Referencias locales de verificación

- Editor: `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx` y `save.test.tsx`.
- Kubernetes kubectl: `packages/core/src/main/kubectl/kubectl.ts`; tabla `packages/kubectl-versions/build/versions.json`.
- Proxy/port-forward: `packages/core/src/main/routes/port-forward/functionality/port-forward.ts`, `stop-port-forwards-on-quit.injectable.ts`.
- Kubeconfig: `packages/core/src/common/kube-helpers.ts`, `packages/core/src/main/catalog-sources/kubeconfig-sync/watch-file-changes.injectable.ts`, `diff-changed-kubeconfig.injectable.ts`.
- Tema: `packages/core/src/main/electron-app/features/sync-theme-from-operating-system.injectable.ts`.
- UI/DevOps: `packages/core/src/renderer/components/cluster-settings/`, `workloads-pods/`, `config-secrets/add-dialog/`, `config-resource-quotas/add-dialog/`, `network-ingresses/ingress-class-set-default.injectable.ts`, `kube-object-menu/kube-object-menu-items/cron-job-menu.injectable.ts`.
- Métricas: `packages/core/src/main/prometheus/stacklight-provider.injectable.ts`.
- Plataforma: `open-lens/package.json`, `packages/core/package.json`.

**Límite metodológico:** las búsquedas no han sustituido una revisión exhaustiva de todas las rutas ni prueban ausencia. “Catálogo completo” significa **cobertura de todas las áreas y todas las entradas detectadas en los cuatro informes**, no certificación funcional de cada opción.
