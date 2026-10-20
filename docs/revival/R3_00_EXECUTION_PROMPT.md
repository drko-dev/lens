# Prompt — OpenLens DevOps Revival R3-00
## Resguardo del trabajo, baseline R2 y arquitectura Kubernetes moderno

**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens`  
**Rama:** `feat/openlens-devops-revival`  
**Hito:** R3-00 (preflight y planificación ejecutable de R3).  
**Modo:** trabajo local de análisis/documentación y copia no destructiva de seguridad; **no programar R3-01 todavía**.

Actuá como arquitecto senior de Kubernetes, Electron, Node/TypeScript y seguridad de aplicaciones DevOps.

### Lectura inicial obligatoria
- `docs/revival/R3_RELEASE_PLAN.md` (orden detallado R3-00→R3-08 y deuda de MCP)
- `docs/revival/R3_IMPLEMENTATION_CHECKLIST.md`
- `docs/revival/R2_06_VALIDATION.md`
- `docs/revival/ROADMAP_PROVISIONAL.md` y `FEATURE_CATALOG_FULL.md`
- `docs/revival/CODE_VERIFICATION.md`, `TEST_RESULTS.md`
- Código actual de API discovery/CRDs, RBAC, métricas Prometheus y rutas de integración.

### 1. Proteger el trabajo (prioridad absoluta)
1. Inventariar Git HEAD, rama, `git status --short` (incluyendo todos los untracked), `git ls-files docs/revival`, `.gitignore`, tamaños y espacio. **Hecho previo comprobado:** `git ls-files docs/revival | wc -l` devolvió 0, por lo que toda la documentación está fuera de control de versiones. Esto NO significa que los archivos estén protegidos; `git clean -fd` podría eliminarlos.
2. **Sin borrar ni modificar originales**, realizar una copia de seguridad verificable de `docs/revival` en un archivo nuevo y fechado fuera del repo, con SHA-256, revisión de tamaño e inventario de contenido. Revisar que el archivo no esté vacío y pueda leerse, y verificar ubicación/espacio antes de copiar; no crear un archivo si contiene material sensible para una ubicación compartida o no segura. No subas el respaldo a internet.
3. Proponer un **commit selectivo** del código/doc de R1 y R2 (preferiblemente varios commits coherentes) para que el historial sea reproducible, pero **no hacer commits, `git add` masivo, stash, reset, clean ni rebase sin autorización específica del usuario**.
4. Registrar ubicación del backup y cómo restaurarlo, sin exponer credenciales.

### 2. Registrar baseline R2 real
- Verificar la existencia del ejecutable `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`, hash `app.asar`, versión Node 20.20.2, identidad `dev.drko.openlens-devops`, espacio y existencia de procesos que podrían usar bundles. Conservar `dist` y `dist-stage` existentes.
- Tomar como referencia documental R2-06: **27 suites/206 pruebas seleccionadas**, no afirmar que sea toda la batería del monorepo. Si reproducís tests puntuales, registrar exactamente cuáles y su exit code.
- No compilar ni cerrar una aplicación abierta en este hito salvo necesidad excepcional justificada; R3-00 es preflight.

### 3. Auditar arquitectura previa a nuevas integraciones
Revisar y mapear dependencias:
- `packages/core/src/main/cluster/request-api-resources.injectable.ts` y `request-kube-api-resources-for.injectable.ts`.
- `packages/core/src/common/k8s-api/api-manager`, `renderer/components/custom-resources`, CRD metadata, versión/scope, watches.
- API endpoints PSP, HPA, PDB, Eviction, EndpointSlice y demás realmente existentes.
- RBAC por clúster, permisos mínimos, manejo 403/404/410, desconexión y expiración de caché.
- Integraciones existentes de Prometheus, StackLight, Helm, port-forward, terminal y protección de Secrets.
- Verificar si realmente existe algún servidor MCP local en código; no inferirlo del roadmap.
No modificar el código fuente, dependencias ni lockfiles en R3-00.

### 4. Matriz técnica y secuenciación
Crear una tabla de capabilities: grupo/kind/API versions, namespaced vs cluster scope, CRD opcional, dependencia, permisos `get/list/watch`, componentes reutilizables, pruebas sintéticas necesarias, impacto en R1/R2 y esfuerzo/riesgo. Cobertura mínima:
- PSP deprecado, HPA/PDB/Eviction, EndpointSlice.
- Gateway API GatewayClass/Gateway/HTTPRoute/GRPCRoute/etc. según versiones reales.
- Validating/Mutating Admission Policies, CEL, DRA.
- Argo CD, Flux CD, Trivy Operator como CRDs opcionales.
- Proveedores de métricas Prometheus/VictoriaMetrics y OpenCost.
- MCP stdio **read-only** pendiente, con controles por clúster.

Proponer laboratorio local aislado y reproducible para API fake + clúster de pruebas, sin instalación ni conexión a infraestructura real durante R3-00. Priorizar el uso de las abstracciones de API/CRD existentes; no copiar fuentes propietarias.

### 5. Entregables y criterio de cierre
- Crear `docs/revival/R3_00_BASELINE.md` con inventario, respaldo verificado, matriz API/CRD/RBAC, riesgos, priorización final, criterios de aceptación por hito y comandos de reproducción.
- Actualizar `docs/revival/R3_IMPLEMENTATION_CHECKLIST.md` solamente en puntos efectivamente demostrados. No cambiar checkboxes de R3-01 a R3-08 por anticipado.
- Proponer correcciones al `ROADMAP_PROVISIONAL.md` para aclarar que R2 se implementó sin MCP y que MCP se reprogramó tentativamente a R3-07. Preservar el historial anterior.
- Informar claramente pendientes, bloqueos, decisiones que demandan autorización y si R3-00 quedó completado. Si la copia/verificación falla, informar BLOQUEADO en protección de estado y no proceder a tareas que arriesguen el working tree.

### Reglas persistentes para los siguientes hitos
El usuario pidió **no pedir autorización rutinaria entre hitos**. Tras completar R3-00 y solo cuando esté seguro el estado local, el agente podrá continuar **R3-01…R3-08** conforme a `R3_RELEASE_PLAN.md`, pero debe: conservar cambios sin commit; obtener autorización para acciones destructivas/producción/instalaciones; ejecutar tests y generar **una nueva build empaquetada y probada en GUI real por cada hito funcional**; documentar evidencia con datos ficticios. No certificar funcionalidades con solo screenshot de Welcome.

**Empezar ahora por R3-00. No iniciar R3-01 hasta que el estado y backup estén verificados.**
