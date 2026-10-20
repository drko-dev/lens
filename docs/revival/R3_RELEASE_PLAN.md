# OpenLens DevOps Revival — Release 3: Kubernetes moderno, GitOps y observabilidad local
**Fecha:** 2026-10-20  
**Estado:** planificación técnica propuesta para ejecutar por hitos, tras cerrar R2. No constituye evidencia de código implementado.  
**Rama de referencia:** `feat/openlens-devops-revival`  
**Ubicación:** `/Users/gustavomarcon/Documents/lens/lens`

## 1. Punto de partida y decisiones

**R1** cerrada según `R1_06_VALIDATION.md`. **R2** cerrada según `R2_06_VALIDATION.md`: 27 suites / 206 tests de regresión seleccionados, typecheck, monorepo build de 40 proyectos, paquete ARM64 y smoke Playwright. Esto **no demuestra** toda la suite del monorepo, ni todas las integraciones contra clústeres reales. El ejecutable de R2 reside en `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`.

**Corrección importante del roadmap original:** el archivo `ROADMAP_PROVISIONAL.md` puso MCP en R2, pero R2 ejecutada fue UX y productividad, sin servidor MCP. **MCP permanece pendiente**, y este plan lo **recupera expresamente como R3-07**, sin afirmar que esté implementado. La aprobación de R2 no implica paridad con el plan inicial.

**Riesgo crítico de continuidad:** `git ls-files docs/revival` devuelve **0**. Todo `docs/revival/` está sin seguimiento; no está protegido por Git. Un `git clean -fd` o pérdida del equipo podría eliminarlo. R3-00 debe realizar inventario/copia no destructiva y proponer un commit selectivo de documentación y código tras revisión; **no ejecutar commits, reset, clean ni stage masivo sin autorización explícita**. También hay multitud de cambios no confirmados en el código del fork. Preservar los estados y respaldos existentes.

## 2. Objetivo de Release 3

Incorporar las APIs recientes de Kubernetes y observabilidad/GitOps opcionales sin perder la estabilidad de R1 y R2, la seguridad operativa de producción ni el diseño original de OpenLens DevOps. **Descubrimiento de APIs y permisos primero**; después vistas concretas. Si un API/CRD/operador no está instalado, la funcionalidad se oculta o indica ausencia con claridad; el resto de OpenLens debe seguir funcionando.

Mantener independencia de proveedor y conexión por kubeconfig/exec. **No** integrar cuentas propias AWS/Azure/GCP, productos SaaS obligatorios, telemetría comercial, licencias ni automatizaciones mutadoras de producción. Ninguna instalación automática de Argo, Flux, Trivy, VictoriaMetrics ni OpenCost.

## 3. Hitos R3 (R3-00 a R3-08)

| Hito | Alcance práctico | Dependencias | Entregable verificable |
|---|---|---|---|
| **R3-00** | Blindar trabajo sin commit, baseline de R2, matriz de descubrimiento API/CRD/RBAC, arquitectura y alcance de laboratorios | R2 | `R3_00_BASELINE.md`, checklist ajustado; **solo auditoría/documentación** |
| **R3-01** | Compatibilidad de APIs core, desuso de PSP, negociación HPA/PDB/Eviction, utilidades de discovery, errores RBAC y selección de versión | R3-00 | Tests fake API de presencia/ausencia, versionado, 403/404; paquete y GUI |
| **R3-02** | EndpointSlice `discovery.k8s.io` y Gateway API opcional (GatewayClass/Gateway/Routes/ReferenceGrant con relaciones útiles) | R3-01 | Vistas solo donde existan, navegación, estado y tests GUI con fixtures |
| **R3-03** | ValidatingAdmissionPolicy/Binding, CEL como **visor de políticas** y recursos DRA según descubrimiento/versiones soportadas | R3-01 | Tablas/detalle solo lectura inicialmente, permisos y errores seguros |
| **R3-04** | Integración opcional Argo CD y Flux desde CRDs del clúster, visualización de salud, sync, reconciliación y errores | R3-01/02 | Vista GitOps **solo lectura**, sin lanzar Sync/Reconcile/Suspend de forma automática |
| **R3-05** | Visión de aplicaciones por etiquetas `app.kubernetes.io`, Trivy Operator opcional, información de imágenes OCI del Pod (sin autenticación de registries por defecto) | R3-01/04 | Vistas de aplicaciones/seguridad con relaciones, severidades, redacción y RBAC |
| **R3-06** | Observabilidad: compatibilidad VictoriaMetrics/Prometheus API existente y OpenCost opcional; costes locales estimados con supuestos visibles | R3-01 | Paneles de métricas/costos con ausencias, permisos, períodos y unidades claras |
| **R3-07** | Recuperar MCP postergado: servidor **stdio local** e independiente, herramientas **solo lectura** de clúster/recursos/logs/métricas | R3-01/06 | Cliente MCP externo de prueba; scopes por clúster, cuotas, revocación y no mutaciones |
| **R3-08** | Regresión integral, matriz K8s/API, security review, build final ARM64, Playwright funcional y pruebas con laboratorio autorizado | Todas | `R3_08_VALIDATION.md` y paquete final; no cerrar sin evidencias requeridas |

No ampliar el scope hasta contar con datos de R3-00. Las tecnologías nuevas son **optativas por discovery**. En R3-02/R3-03 tomar versiones efectivamente anunciadas por el clúster; no asumir `v1` universal, no romper compatibilidad con versiones previas.

## 4. Arquitectura técnica verificada y reutilizable
- Ya existe `packages/core/src/main/cluster/request-api-resources.injectable.ts` con consulta de recursos API, concurrencia acotada y tratamiento de fallas parciales; y `request-kube-api-resources-for.injectable.ts`. Extender, no duplicar.
- Ya existe un subsistema de CRDs: `packages/core/src/common/k8s-api/api-manager`, `renderer/components/custom-resources/` y vistas genéricas. Usarlo para integraciones opcionales en lugar de construir un controlador por operador.
- Existe un endpoint heredado de PodSecurityPolicy, que requiere auditar remoción sin romper guardas de compatibilidad.
- Existen proveedores Prometheus heredados (incluido StackLight) y consultas de métricas. No reinventar Prometheus ni afirmar inexistencia de métricas.
- No se identificó servidor MCP integrado en búsquedas de código dirigidas. Ausencia en esta búsqueda no constituye prueba exhaustiva de todo el repositorio.
- La protección de Secrets (edición, Diff redactado, CSV) y la identidad visual de clústeres productivos de R1/R2 son invariantes.

## 5. Reglas no negociables de implementación
1. **Una build ejecutable por hito funcional:** Node 20.20.2, tests y typecheck, `npm run build`, empaquetado macOS ARM64 aislado en `dist-stage` o salida versionada. Ejecutar **esa build**, no la instancia habitual ni solo webpack. Verificar GUI con Playwright en pantalla real del cambio, con fixtures/API fake o lab autorizado. Guardar evidencias sin credenciales ni Secrets. R3-00 solo documental no necesita build.
2. **API-first con permisos:** discovery real por clúster, versionado y scope correctos, `RBAC 403`, ausencia `404`, CRD que aparece/desaparece y reinicio de UI. Mantener funcionamiento si un operador no está.
3. **Lectura inicial:** nuevas integraciones GitOps/Trivy/Cost/MCP no deben modificar Kubernetes. Mutaciones a futuro requieren diseño específico de confirmación, `resourceVersion`, prevención de producción y autorización por operación.
4. **Contexto persistente de clúster y producción:** alias, entorno, nombre de clúster, namespace y permisos visibles en acciones. Nunca asumir producción por nombre, ni cruzar datos entre clústeres al cambiar pestañas.
5. **Manejo de datos:** límites en resultados/listas/logs, timeout, limpieza de watchers, sanitización de HTML/texto/celdas, redacción de secretos; no capturar ni registrar kubeconfig/exec tokens ni reportes completos sensibles.
6. **Sin trabajo destructivo:** no `git clean`, `git reset --hard`, borrar perfil, sobreescribir aplicación en uso, rebasar/stashear sin autorización ni comprometer carpetas backup. No contactar producción ni instalar CRDs/operadores automáticamente.
7. **Trazabilidad y bloqueo real:** cada hito `R3_XX_VALIDATION.md`, checklist actualizado con evidencias, tests pasados/omitidos separados, rutas SHA-256 y captura de pantalla. Si función crítica no se verificó en pantalla o lab, declararla pendiente en vez de “100% cerrado”.

## 6. Matriz de pruebas sugerida (a validar en R3-00)
- API fake discovery: grupos y versiones presentes/ausentes, `403`, `404`, `410`, expiración y cambios de permisos.
- Laboratorio Kubernetes autorizado en al menos dos versiones/version profiles cuando sea posible; fixtures CRD de Gateway, Argo, Flux, Trivy, OpenCost, DRA. **No instalar operadores automáticamente**.
- Transiciones: desconectado → conectado, VPN suspend/resume, cambio de contexto/kubeconfig, producción vs lab; no fugas de watchers ni contenidos.
- Un API opcional faltante no rompe catálogo, sidebar, editores, logs, terminales, portforward ni CSV.
- Entradas hostiles en labels/annotations/CRDs y reportes Trivy: XSS/HTML, CSV injection, URLs y tokens.
- MCP: tests cliente externo, denegación por clúster, límites de resultados/tiempo y prohibición de herramientas de escritura.

## 7. Dependencias y deuda separada de R3
- **R4 opcional** conserva overhaul de workspace, Electron/Node y plataforma; no mezclar con R3.
- **MCP mutador, IA integrada y acciones GitOps que escriben** quedan fuera de R3; solo diseño futuro.
- Visor/gestión avanzada de imágenes OCI y port-forward para cambios en caliente pueden recibir investigación UX focalizada posterior, sin ampliar el scope técnico automáticamente.
- Actualizar `ROADMAP_PROVISIONAL.md` / catálogo con el estado real posterior a R3-00; no reemplazar su contexto histórico.

## 8. Orden de ejecución
Arrancar con `R3_00_EXECUTION_PROMPT.md`. Tras R3-00, ejecutar R3-01 a R3-08 en orden, sin pedir aprobaciones rutinarias; detener acciones destructivas, mutadoras o sobre clústeres reales que carezcan de autorización. Cada hito exige binario y validación funcional visible antes de marcarse terminado.

Referencias: [ROADMAP_PROVISIONAL.md](./ROADMAP_PROVISIONAL.md), [FEATURE_CATALOG_FULL.md](./FEATURE_CATALOG_FULL.md), [R2_06_VALIDATION.md](./R2_06_VALIDATION.md), [R1_06_VALIDATION.md](./R1_06_VALIDATION.md).
