# Roadmap provisional — OpenLens DevOps Revival

## Actualización de estado — 2026-10-20

**Este documento conserva el plan histórico** y algunas puertas de salida de R2 redactadas antes de su implementación. Los hitos ejecutados efectivamente se registran en [R1_IMPLEMENTATION_CHECKLIST.md](./R1_IMPLEMENTATION_CHECKLIST.md), [R2_IMPLEMENTATION_CHECKLIST.md](./R2_IMPLEMENTATION_CHECKLIST.md) y [R2_06_VALIDATION.md](./R2_06_VALIDATION.md). Según el informe final de R2: 27 suites/206 pruebas focalizadas, build ARM64 y Playwright; no equivale a toda la suite del monorepo. **MCP no se implementó en R2** aunque el roadmap inicial lo contemplaba: sigue pendiente, propuesto ahora para **R3-07**.

**R3 quedó planificada en nueve hitos (R3-00 a R3-08)** en [R3_RELEASE_PLAN.md](./R3_RELEASE_PLAN.md), con checklist en [R3_IMPLEMENTATION_CHECKLIST.md](./R3_IMPLEMENTATION_CHECKLIST.md) y primer prompt en [R3_00_EXECUTION_PROMPT.md](./R3_00_EXECUTION_PROMPT.md). El estado es **planificación**, no implementación certificada.

**Protección de trabajo:** al iniciar R3 se comprobó que `git ls-files docs/revival` devuelve 0 archivos. Los informes y scripts existen localmente pero están sin seguimiento; R3-00 debe crear/verificar respaldo seguro y plantear el primer commit selectivo antes de entrar en cambios de código. Nunca ejecutar `git clean` ni `reset --hard` sobre ese árbol.

---

**Fecha:** 2026-10-19 · **Estado:** propuesta de orden, NO autorización de implementación · **Rama analizada:** `feat/openlens-devops-revival`.

**Propósito:** pasar del inventario a una propuesta concreta de **qué construir, cuándo hacerlo y cómo comprobarlo**, sin perder la decisión del usuario sobre el alcance. Documento fuente: [FEATURE_CATALOG_FULL.md](./FEATURE_CATALOG_FULL.md), con **107 opciones**, más [CODE_VERIFICATION.md](./CODE_VERIFICATION.md) y [REA_FINDINGS.md](./REA_FINDINGS.md). Las referencias a Lens 2026 describen principalmente el build `2026.10.121159-latest`, no necesariamente capacidades verificadas en ejecución.

## Reglas ya acordadas

- **MCP local, independiente del proveedor:** prioritario; comenzar por lectura antes de herramientas que modifiquen el clúster.
- **IA integrada y asistentes externos:** registrar para el futuro, no incorporarlos en el núcleo inicial.
- **No incorporar** licencias, suscripciones, funciones comerciales, cuentas/sincronización cloud propietarios ni conectores nativos AWS/Azure/GCP/MKE. **Sí mantener conexión Kubernetes por kubeconfig y autenticación `exec`** para clústeres alojados donde sea.
- **No copiar código propietario** de Lens 2026; usar las evidencias para especificar soluciones propias y compatibles con licencias.
- **No empezar desarrollo** sin aprobar las opciones concretas. Los esfuerzos son ordinales (S/M/L/XL), **no fechas ni estimaciones de horas**.

## Regla obligatoria de validación continua por hito

**Desde R1-01 y en cada hito de implementación posterior**, no alcanza con que Jest pase o con que el empaquetado compile: se debe generar una **build local ejecutable de OpenLens DevOps**, abrir esa misma build en macOS ARM64 y comprobar manual y automáticamente las funciones nuevas junto con una regresión breve de las anteriores. El usuario debe poder probarla visualmente antes de aceptar el hito y avanzar. **R1-00 es la excepción:** solo preparó el entorno; la primera apertura funcional corresponde a R1-01.

- Ciclo obligatorio: **cambiar → pruebas unitarias e integración → build → ejecutar binario empaquetado → smoke visual y específico → guardar evidencia → validación del usuario**.
- Perfil de pruebas **aislado**, con `KUBECONFIG=/dev/null` para un smoke offline; operaciones reales sobre Kubernetes solo contra un laboratorio local previamente autorizado.
- Comprobar arranque, ventana principal, navegación, preferencias, terminal y cierre, además de pruebas específicas del cambio; documentar ruta del `.app`, comando de lanzamiento, baseline, logs, aprobaciones y defectos.
- No borrar `lens.js.map` ni datos personales como parte de la limpieza. Proteger artefactos anteriores cuando se necesiten para comparación o rollback. La limpieza controlada de salidas de build requiere consentimiento.
- Si la aplicación no abre o no puede probarse visualmente, el hito queda **PENDIENTE DE VALIDACIÓN**, aunque las pruebas unitarias pasen. No afirmar que se probaron funciones Kubernetes sin un laboratorio.

## Resultado de revisión técnica antes del roadmap

Se ejecutaron localmente **19 suites / 215 pruebas unitarias, todas aprobadas**, repartidas en tandas de 4/23, 8/53 y 7/139. Se cubrieron: guardado de recursos y conflictos 409, operaciones de Pod/terminal, port-forward, kubeconfig/sync, integración básica de proxy, APIs K8s, Helm, apariencia. **No se lanzó la app empaquetada, no se usó un clúster y no se verificó el comportamiento real de Lens oficial**. Node del host `26.7.0` supera el `<=20` declarado en `packages/core/package.json`: compatibilidad de toolchain **pendiente de comprobar con entorno fijado**.

Hallazgo prioritario: el editor usa `PUT` con `resourceVersion` para Secret/ConfigMap, pero **al menos Deployment permanece en JSON Patch sin operación previa `test /metadata/resourceVersion`**. El GET posterior confirma el estado guardado pero **no previene un cambio concurrente previo al PATCH**.

## Orden propuesto para discutir (base mínima primero)

| Etapa | Objetivo y entregable verificable | Opciones relacionadas | Dependencia | Tamaño relativo |
|---|---|---|---|---|
| **0 — Baseline reproducible** | Build arm64 identificable, smoke test de UI sin afectar perfiles; entorno Node/Electron documentado, test baseline y copia del estado Git existente; **no modificar trabajo sin commit** | P-01, P-02, P-04, P-07 | Ninguna | S–M |
| **1 — Integridad de operaciones y kubeconfig** | Resolver edición concurrente en **todos** los recursos YAML, 409 con diff/refresco; preservar campos kubeconfig y exec, probar errores sin filtrar secretos; paneles inline Secret/ConfigMap | E01/E02/E05 del inventario resumido; KC-01, KC-02, K8S-13, P-06 | 0 | M |
| **2 — Conectividad Kubernetes diaria** | Watch robusto al suspender Mac o perder red, checksums kubectl, selección de binarios también para port-forward; proxy y Helm actualizados si las pruebas lo justifican; cierre y recuperación de sesiones | K8S-01, K8S-02, K8S-03, KC-05, KC-06, T01/T02, P-04 | 1 | L |
| **3 — MCP local, primera versión útil** | Servidor **stdio local** y herramientas **solo lectura**, listar/conectar clústeres con permisos, get/describe/logs, consultas Prometheus; cuotas, auditoría y autenticación local. Herramientas de escritura quedan desactivadas | DEV-05a/b/c/d/f y diseño seguridad | 1–2: kubeconfig seguro + capa API confiable | M–L |
| **4 — Mejoras visibles de uso diario** | Diff/Revert Monaco, mejor visor de logs, búsqueda en terminal, CSV seguro, filtro de listas, badges TLS, colores de clúster, refinamiento de dock existente | UI-04, UI-06–11, UI-14, DEV-01, UI-13 | 1; independiente de UI nueva en lo posible | M–L |
| **5 — Compatibilidad y APIs Kubernetes modernas** | Retirar PSP obsoleto, negociar versiones Eviction/HPA, EndpointSlice, Gateway API, Admission Policies/CEL y DRA detectados según API Discovery | K8S-04–08, K8S-12 | 2 (API/CLI robustos) | L |
| **6 — GitOps, seguridad, observabilidad y costos** | Argo/Flux como **integración local del clúster**, aplicaciones lógicas, Trivy Operator opcional, VictoriaMetrics, OpenCost/Kubecost y estimación local sin APIs cloud | K8S-09–11, DEV-02–04 | 2, 5 para recursos comunes | L |
| **7 — Arquitectura avanzada de experiencia** | Modernizar tablas, workspace multipestaña, navegador unificado, dock por clúster y ventanas múltiples **solo si compensa migración/riesgo** | UI-01–03, UI-05, UI-12, UI-14b | 0 y mejoras simples de UI estables | XL |
| **8 — Evolución de plataforma** | Migración escalonada Electron/Node/node-pty/Monaco, IPC, CSP, aislamiento, extensiones; se puede abordar **en paralelo** con etapas 2–7 si bloquea algo, pero sin salto de versiones ciego | P-02–05, P-10, DEV-08 | 0; compatible con resto | XL transversal |
| **Fuera de las primeras entregas** | IA Prism, launchers de agentes, herramientas MCP que ejecutan cambios y grandes automatizaciones: volver a discutir cuando existan permisos, auditoría y pruebas suficientes | DEV-05e, DEV-06/07 | 3 y autorización explícita | Futuro |
| **Excluidas** | Cloud propietaria/SSO de cuenta, licencias, cloud price live, políticas comerciales por JWT | KC-07–10, DEV-03c, P-08/09 | Decisión ya tomada | No desarrollar |

### Qué significa "lo básico": propuesta concreta de primera versión estable

**Paquete mínimo R1 (etapas 0 + 1 + partes de 2):**
1. Compilar y abrir la app en macOS ARM64 aislando su identidad y directorios; registrar versión y dependencias reproducibles.
2. Editar Secret, ConfigMap y Deployment en entorno local, simular dos editores simultáneos y **evitar sobrescribir datos sin advertencia**, incluso para JSON Patch. Verificar respuesta real del servidor tras guardado.
3. Cargar kubeconfig con entradas válidas/invalidas, certificados, `tls-server-name`, `proxy-url`, `disable-compression`, ejecución `exec` con PATH/env; nunca escribir secretos en logs.
4. Listar, observar y reconectar recursos tras pérdida de red/suspensión; `kubectl`, Helm, logs, terminal y port-forward seguros y coherentes con la versión del clúster.
5. Completar tests unitarios/regresión y un smoke contra **kind/minikube local autorizado**, sin intervenir clústeres ajenos.

**Paquete de productividad R2 (etapas 3 + 4, orden interno a elegir):** MCP local read-only, diff/revert YAML, búsqueda de terminal/logs y mejor filtrado/exportación de listas. Esto agrega utilidad visible sin esperar a la refactorización visual enorme.

**Expansión R3 (etapas 5 + 6):** APIs Kubernetes recientes, GitOps, Trivy y costos sin SaaS propio; cada integración debe ser opcional y funcionar aunque el CRD no esté instalado.

**R4 opcional (etapas 7 + 8):** nueva arquitectura de navegación/ventanas y modernización profunda de stack; no mezclar todo con las fases iniciales.

## Guía técnica por etapa (cómo)

- **Cambios aislados:** rama/commit separado por funcionalidad aprobada, pruebas de regresión mínimas, migraciones reversibles de preferencias y notas de compatibilidad.
- **K8s primero por descubrimiento:** detectar recursos/API versions disponibles; que Gateway/DRA/Argo/Flux/Trivy no estén instalados **no debe romper la UI**.
- **Mutaciones y concurrencia:** antes de PUT/PATCH usar precondición equivalente a `resourceVersion`; ante conflicto conservar borrador, mostrar remoto/local y exigir decisión humana.
- **MCP read-only por defecto:** stdio, sin shell libre, filtro estricto de acciones, consentimiento para clústeres, presupuestos de datos, timeout, resultados redactados, registro local revocable; las escrituras necesitan un hito y aprobación propios.
- **Pruebas:** Jest focalizado, integración con servidor fake para 409/403/timeout, e2e de GUI, pruebas macOS arm64, laboratorio local K8s multi-versión. Nunca inferir éxito de producción a partir de Jest.
- **Calidad legal/técnica:** usar documentación/arquitectura detectada en módulos de Lens como referencia funcional, implementar de cero, verificar licencias de librerías nuevas y procedencia de binarios.
- **No automatizar cambios en clústeres reales ni descargar/instalar operadores** sin acción explícita del usuario.

## Puertas de salida (criterios para avanzar)

| Entrega | Se considera terminada cuando... |
|---|---|
| R1 | Build abre estable; no mezcla perfiles; CRUD básico y editor concurrente se verifican en clúster local; kubeconfig/exec y proxy validados; tests clave verdes |
| R2 | MCP read-only responde desde cliente local con scopes efectivos; ninguna herramienta mutadora disponible; diff/logs/listas probados desde GUI |
| R3 | Cada nueva vista aparece solo si API/CRD está disponible; errores RBAC no cuelgan UI; Argo/Flux/Trivy sin dependencias forzosas |
| R4 | Uso de memoria/rendimiento y preferencias migradas se comparan con baseline; es posible volver a versión anterior sin perder configuración |

## Decisiones que siguen abiertas para el usuario

1. ¿Confirmamos que **R1** sea la primera entrega, con seguridad del editor y compatibilidad antes que rediseño de interfaz?
2. Dentro de **R2**, ¿preferís MCP read-only **antes** o **junto** a mejoras visuales?
3. ¿Qué bloques de R3 y R4 valen realmente la inversión? Seleccionar por IDs de [FEATURE_CATALOG_FULL.md](./FEATURE_CATALOG_FULL.md).

Este orden es una **propuesta para deliberar**, no un cronograma cerrado ni autorización para programar. No se tocó código del producto ni ningún clúster.
