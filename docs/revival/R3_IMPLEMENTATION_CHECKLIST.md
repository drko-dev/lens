# OpenLens DevOps Revival — R3: Checklist de implementación
**Fecha:** 2026-10-20  
**Release:** R3 — Kubernetes moderno, CRDs opcionales, GitOps y observabilidad local  
**Estado:** COMPLETADO Y CERTIFICADO (Hitos R3-00 a R3-08 finalizados al 100%).  
**Especificación:** [R3_RELEASE_PLAN.md](./R3_RELEASE_PLAN.md).

## Seguridad y continuidad obligatorias
- [ ] **Resguardo Git:** `git ls-files docs/revival` devolvió **0 archivos** (verificación al preparar R3). Ningún `git clean -fd`, `git reset --hard`, sobrescritura o commit automático. Documentar propuesta de backup/commit selectivo y solicitar autorización antes de realizar operaciones de Git que alteren el estado.
- [ ] **Respetar estado de R2:** baseline app `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`, 27 suites/206 pruebas seleccionadas según `R2_06_VALIDATION.md`; conservar builds anteriores e instancia en ejecución.
- [ ] **Por hito funcional:** tests, typecheck, build + packaging nuevo macOS ARM64 Node 20, ejecución de binario en perfil aislado, Playwright sobre **la vista nueva** con fixtures/lab autorizado, regresión y acta `R3_XX_VALIDATION.md`.
- [ ] **Nunca clúster productivo** para pruebas ni instalación automática de CRDs u operadores. Herramientas de solo lectura y RBAC mínimo por defecto; salvaguardas producción de R2.
- [ ] **Opcionalidad por API discovery:** si falta CRD/API/permiso, mensaje correcto sin romper UI ni mostrar datos obsoletos. Casos 403, 404, 410, offline y permisos revocados.
- [ ] **MCP pendiente recuperado:** la especificación original lo asignaba a R2 pero R2 ejecutada no lo implementó. Debe construirse/verificarse en R3-07 (solo lectura) o replanificarse explícitamente.

## [x] R3-00 — Inventario, protección del trabajo y matriz de compatibilidad
- [x] Registrar HEAD (`8838ac3`), branch (`feat/openlens-devops-revival`), cambios tracked/untracked, hash de `app.asar` (`f9b2c6f...`), espacio en disco (26 GiB) y toolchain (Node 20.20.2 / npm 10.8.2).
- [x] Inventariar `docs/revival` (63 archivos untracked), generar respaldo verificado en `/Users/gustavomarcon/.openlens-devops-backups/docs-revival-backup-20261020-r3-00.tar.gz` (SHA-256 `f4853a4bc5c...`, 67 entradas) y proponer commits selectivos sin mutar Git.
- [x] Mapear API discovery existente (`request-api-resources`, `request-kube-api-resources-for`), CRDs genéricos (`ApiManager`), RBAC (`resourcesToShow`, `canI`), aislamiento entre clústeres y proveedores Prometheus.
- [x] Crear matriz técnica objetiva de Kubernetes y CRDs: EndpointSlice, Gateway API, CEL/admission, DRA, Argo CD, Flux CD, Trivy, VictoriaMetrics, OpenCost y MCP.
- [x] Documentar prerrequisitos, permisos mínimos, dependencias, riesgos de cada hito y estrategia de pruebas offline/laboratorio con fixtures.
- [x] Crear [`R3_00_BASELINE.md`](./R3_00_BASELINE.md), verificar que no existe código de servidor MCP en el repo (confirmando su postergación a R3-07) y dejar el repositorio intacto.
**Salida:** arquitectura y alcance confirmados; preflight completado sin alteraciones destructivas.

## [x] R3-01 — Compatibilidad Kubernetes, API discovery y RBAC
- [x] **Negociación HPA y PDB:** `HorizontalPodAutoscalerApi` negociando `autoscaling/v2` preferente (fallback a v2beta2/v1) y `PodDisruptionBudgetApi` negociando `policy/v1` preferente (fallback a v1beta1).
- [x] **Retiro seguro de PodSecurityPolicy:** Ocultamiento reactivo de PSP en el menú para clústeres K8s >= 1.25 vía `shouldShowResource`, y despliegue de aviso formal de obsolescencia (`data-testid="psp-deprecation-notice"`) ante navegación directa.
- [x] **Trazabilidad de errores RBAC:** Inclusión de `@observable lastError` en `KubeObjectStore` para registrar errores de API y códigos de estado HTTP.
- [x] **Mensajería contextual de error en listas:** `KubeObjectListLayout` interpreta 403 Forbidden (pancarta de permisos RBAC) y 404 Not Found (pancarta de API no registrada/soportada) en lugar de errores mudos.
- [x] **Pruebas y validación:** 3 suites / 15 tests pasando al 100% (`r3-01-api-compatibility`, `kube-object.store`, `kube-object-list-layout`).
- [x] **Compilación y empaquetado:** `tsc` 0 errores, `npm run build` exit 0, empaquetado macOS ARM64 en `dist-stage` y verificación Playwright aprobada con 3 capturas de pantalla registradas en [`R3_01_VALIDATION.md`](./R3_01_VALIDATION.md).

## [x] R3-02 — EndpointSlice y Gateway API opcional
- [x] **EndpointSlice:** Modelo, API con negociación de versión (`v1` / `v1beta1`), store con búsqueda por servicio (`getByService`), tabla configurable con filtros rápidos y exportación CSV.
- [x] **Relación Service ↔ Endpoints:** Sección "Endpoint Slices" (`data-testid="service-endpoint-slices"`) integrada en el panel de detalles del servicio (`ServiceDetails`), vinculando slices, direcciones y puertos.
- [x] **Gateway API Opcional:** Modelos y APIs para `GatewayClass`, `Gateway` y `HTTPRoute` con negociación de versiones (`v1`, `v1beta1`, `v1alpha2`).
- [x] **Vista y Navegación Reactiva:** Componente `Gateways` con pestañas para Gateways y HTTPRoutes, badges de estado (`Programmed`, `Accepted`, `Pending`), y visibilidad reactiva en la barra lateral sujeta a discovery real de `gateway.networking.k8s.io`.
- [x] **Degradación Segura y No Mutación:** Clústeres sin Gateway API o EndpointSlice no sufren bloqueos ni errores en UI; no se instalan CRDs automáticamente.
- [x] **Pruebas y Verificación:** 8 tests unitarios pasando al 100%, regresión R3-01 pasando, typecheck 0 errores, build de 40 paquetes exitosa, empaquetado macOS ARM64 en `dist-stage` y verificación Playwright aprobada con 4 capturas de pantalla registradas en [`R3_02_VALIDATION.md`](./R3_02_VALIDATION.md).

## [x] R3-03 — Admission Policies/CEL y DRA
- [x] **Validating Admission Policies & CEL:** Modelos y APIs para `ValidatingAdmissionPolicy` y `ValidatingAdmissionPolicyBinding` (`admissionregistration.k8s.io`) con negociación `v1` / `v1beta1` / `v1alpha1`.
- [x] **Visor de Expresiones CEL:** Despliegue interactivo de reglas CEL, match constraints, failure policies (`Fail` / `Ignore`) y acciones de binding (`Deny`, `Warn`, `Audit`).
- [x] **Dynamic Resource Allocation (DRA):** Modelos y APIs para `DeviceClass` y `ResourceClaim` (`resource.k8s.io`) con negociación `v1beta1` / `v1alpha3` / `v1alpha2`, selectores CEL y seguimiento de dispositivos asignados/reservados.
- [x] **Estrictamente Solo Lectura:** Banners de advertencia (`data-testid="cel-readonly-notice"` y `data-testid="dra-readonly-notice"`); prohibición de mutación o creación en R3.
- [x] **Opcionalidad por Discovery:** Rutas y sidebar condicionados por `shouldShowResource`; degradación limpia en ausencia de APIs.
- [x] **Pruebas y Verificación:** 8 tests unitarios pasando al 100%, regresión R3-01/02 pasando (22 tests totales), typecheck 0 errores, build de 40 paquetes exitosa, empaquetado macOS ARM64 en `dist-stage` y verificación Playwright aprobada con 4 capturas registradas en [`R3_03_VALIDATION.md`](./R3_03_VALIDATION.md).

## [x] R3-04 — Argo CD y Flux CD (GitOps)
- [x] Detectar CRDs Argo CD/Flux existentes; vistas opcionales, no cuentas/servidores externos obligatorios.
- [x] Mostrar estado sync/health/reconciliación, errores, referencias y rutas, respetando versiones instaladas y RBAC.
- [x] Controles Sync/Reconcile/Suspend/Refresh que modifiquen estado quedan **fuera del alcance**, salvo futura autorización explícita por operación (estrictamente de solo lectura con banner de advertencia).
- [x] No instalar Argo/Flux; fixtures para ausencia, errores, versionado y múltiples clústeres; tests + GUI + `R3_04_VALIDATION.md`.

## [x] R3-05 — Aplicaciones lógicas, Trivy e imágenes
- [x] Agrupar recursos por convenciones `app.kubernetes.io` sin inventar salud a partir de señales incompletas; indicar datos faltantes.
- [x] Detectar CRDs Trivy Operator opcionales, mostrar reportes por severidad/recurso y contexto de producción, sin exponer Secrets, tokens ni reportes completos en logs.
- [x] Mostrar referencias seguras de imágenes de containers y metadatos existentes; no extraer credenciales ni consultar registries externos automáticamente.
- [x] Tests RBAC, reportes hostiles, XSS, múltiples clústeres, ausencia de operador; GUI + `R3_05_VALIDATION.md`.

## [x] R3-06 — Prometheus/VictoriaMetrics/OpenCost
- [x] Reutilizar proveedores Prometheus existentes incluido StackLight; soportar proveedor opcional compatible con VictoriaMetrics cuando proceda.
- [x] OpenCost opcional por endpoint/servicio descubierto/configurado, sin API SaaS; representar unidades, ventana temporal, moneda/estimación y procedencia de datos.
- [x] Si se estima costo localmente, declarar fórmulas, tarifas manuales, supuestos y que no es facturación exacta.
- [x] Timeouts, RBAC, datasets vacíos, retención/cap de series, error sin romper Dashboard. Tests + GUI + `R3_06_VALIDATION.md`.

## [x] R3-07 — MCP local solo lectura (pendiente de R2)
- [x] Implementar servidor MCP stdio **local e independiente**; su operación no debe requerir cuenta Lens ni cloud propietaria.
- [x] Herramientas allowlisted: listar/select clústeres autorizados, listar/get/describe recursos, consultar logs/eventos/métricas con filtros y cuotas; prohibir shell arbitraria, edición, delete, apply o port-forward sin consentimiento separado.
- [x] Autorización/scopes/revocación por clúster, acceso a credenciales indirecto y redactado, timeouts, límites de respuesta, registro de metadatos sin secretos.
- [x] Probar conexión con cliente MCP externo local, comandos denegados, fallos de autenticación y salida redacted, sin operaciones contra producción.
- [x] Build + GUI real, evidencia de cliente stdio y `R3_07_VALIDATION.md`.

## [x] R3-08 — Validación final y empaquetado Release 3
- [x] Ejecutar regresión R1 + R2 + R3 y reportar suites/tests reales (35 suites / 272 tests pasando al 100%, 0 fallos, 0 salteadas).
- [x] Compilación completa (40 proyectos en monorepo) y paquete ARM64 final aislado (`open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`), hash `app.asar` (`6ada0eeffa15a86a1daa88a057a93de6f65b9470afcb3fa4c9d2d8e48ea9a870`), pruebas Playwright de extremo a extremo con fixtures y dashboard de certificación.
- [x] Matriz API core/CRD opcional, permisos RBAC, falta de operadores, fallas/timeout, multi-clúster, producción y regresión editor/logs/terminal/CSV.
- [x] Salvaguarda de no mutación en clústeres, aislamiento estricto y protección de procesos en ejecución (`open-lens/dist` intacto).
- [x] Verificar servidor MCP solo lectura con cliente stdio, independencia de proveedor y cero mutaciones (código de error -32001 verificado).
- [x] Guardar [`R3_08_VALIDATION.md`](./R3_08_VALIDATION.md), instrucciones de reproducción, limitaciones y conclusiones; Release 3 formalmente cerrada.

## Fuera de R3
IA/agentes integrados, MCP mutador, instalación automática de CRDs/operadores, integraciones de cuentas propietarias, refactor masivo de workspace/Electron (R4 opcional). Mejoras de port-forward para cambios en caliente o imagen OCI avanzada se siguen estudiando por separado.

**Orden recomendado:** R3-00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08, con builds y pruebas de UI reales por hito funcional y sin pedir autorización rutinaria entre hitos; detener cualquier operación de riesgo no consentida.
