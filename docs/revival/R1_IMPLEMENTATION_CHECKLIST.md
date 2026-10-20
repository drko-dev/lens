# R1 — Checklist técnico de implementación
**Proyecto:** OpenLens DevOps Revival  
**Fecha:** 2026-10-19  
**Rama de referencia:** `feat/openlens-devops-revival`  
**Estado:** alcance propuesto de R1 aprobado en conversación; tareas pendientes, ninguna modificación funcional autorizada por este documento.

## Alcance y reglas
R1 = Etapa 0 (baseline y build reproducible) + Etapa 1 (seguridad del editor y fidelidad de kubeconfig) + núcleo de Etapa 2 (conectividad, kubectl, Helm, proxy, sesiones). **MCP, nuevas familias de APIs, IA y rediseño general quedan fuera de R1**. Conservamos conexión con proveedores cloud a través de `kubeconfig/exec`; sin conectores cloud propietarios, cuentas Lens, telemetría comercial ni suscripciones.

**Protección del estado actual:** hay modificaciones y archivos sin seguimiento en el árbol de trabajo (64 entradas en comprobación inicial). No hacer `git clean`, `git reset --hard`, `git stash`, `npm audit fix`, instalación masiva ni sobrescritura de archivos existentes sin revisar y acordar previamente. Usar cambios aislados y reversibles. No conectar a clústeres de producción ni ejecutar tareas mutadoras sin autorización específica.

## Validación continua obligatoria — todos los hitos funcionales
- [ ] **Primera ejecución en R1-01:** compilar, empaquetar, abrir el binario ARM64 y validar arranque, interfaz, navegación, preferencias, terminal y cierre; el usuario debe poder probarlo. R1-00 fue solo preflight, correctamente cerrado sin ejecutar binario.
- [ ] **Cada hito R1-02 a R1-06:** ejecutar tests focalizados y regresión, generar nueva build, abrir el binario generado con perfil aislado, comprobar visualmente funciones nuevas y básicas antes de cerrar.
- [ ] **Evidencia por hito:** registrar ruta `.app`, versión/commit, Node, comando de arranque, logs, casos aprobados/fallidos y validación del usuario en `docs/revival/R1_XX_VALIDATION.md` (un archivo por hito).
- [ ] **Seguridad:** `CICD` aislado y `KUBECONFIG=/dev/null` para UI offline. CRUD de Kubernetes únicamente en laboratorio local autorizado.
- [ ] **Criterio de cierre:** si no se pudo lanzar o probar la app, informar `PENDIENTE DE VALIDACIÓN VISUAL` y no empezar otro hito.

## ETAPA 0 — Base estable y reproducible
- [x] **0.1 Inventario inmutable.** Registrado en [R1_00_PREFLIGHT.md](./R1_00_PREFLIGHT.md): rama `feat/openlens-devops-revival`, HEAD `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a`, 39 archivos modificados (`+1500/-159`) y 24 entradas sin seguimiento; hashes SHA-256 de `package-lock.json` (`db312b2b...`), `open-lens/package.json` (`34fd0b0f...`), `packages/core/package.json` (`502bb08a...`) y binarios `arm64` (`kubectl` `v1.25.16`, `helm` `v3.11.0`, `lens-k8s-proxy` `v0.3.0`). Ningún commit ni modificación del árbol de trabajo.
- [x] **0.2 Preparar espacio.** Verificado en [R1_00_PREFLIGHT.md](./R1_00_PREFLIGHT.md): `/System/Volumes/Data` dispone actualmente de **18 GiB libres** (91 % de ocupación sobre 228 GiB, sin snapshots locales activos), superando el margen orientativo de 10–15 GiB para el build. Identificados consumidores del repo (3.2 GiB, incluyendo 810 MiB en `open-lens/dist` y 105 MiB en `lens.js.map`) y cachés en `$HOME` (~8.5 GiB). No se borró ningún archivo.
- [x] **0.3 Entorno compatible.** Verificado en [R1_00_PREFLIGHT.md](./R1_00_PREFLIGHT.md): aunque el `PATH` por defecto expone Node `v26.7.0` (Homebrew) o `v22.22.0` (`nvm default`), ya está instalado localmente `/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin/node` (**Node `v20.20.2` / npm `10.8.2`**), que cumple `engines >=16 <=20`. Módulos nativos (`node-pty@0.10.1` ABI 110 `darwin-arm64`) ya están compilados y `npmRebuild: false` evita invocar `node-gyp` sobre `Python 3.14.6`.
- [x] **0.4 Baseline de pruebas.** Registradas en [TEST_RESULTS.md](./TEST_RESULTS.md) y [R1_00_PREFLIGHT.md](./R1_00_PREFLIGHT.md) las 19 suites y 215 pruebas unitarias focalizadas aprobadas, y definidas las verificaciones adicionales de arranque/bundle para R1-01 (incluyendo el hallazgo de ruta en `open-lens/integration/helpers/utils.ts` respecto a `OpenLens DevOps.app`).
- [x] **0.5 Compilación controlada.** Monorepo 40 proyectos y app arm64: builds exit 0 bajo Node 20, sin publicación ni firma. Evidencia: R1_01_VALIDATION.md.
- [ ] **0.6 Binarios nativos y CLI.** Arm64 y hashes confirmados; pendiente verificar carga de node-pty en terminal funcional. Evidencia: R1_01_VALIDATION.md.
- [ ] **0.7 Smoke de aplicación.** Welcome, catálogo aislado vacío, Preferencias y cierre comprobados en el .app; pendientes cambios de tema y terminal. Evidencia: R1_01_VALIDATION.md.
- [ ] **0.8 Evidencia y puerta de salida.** Registrar commit/base, entorno, cómo reproducir, artefacto, limitaciones y resultados. Criterio de aceptación: app abre y cierra, no altera perfiles previos y puede reconstruirse con las instrucciones registradas.

## ETAPA 1 — Integridad de edición y credenciales

### 1A — Concurrencia de TODOS los recursos editables
**Código de referencia:** `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx`; `request-patch-kube-resource.injectable.ts`; `save-verification.ts`; `save.test.tsx`.
- [x] **1.1 Mapear rutas por kind.** Documentado en [R1_02_VALIDATION.md](./R1_02_VALIDATION.md) y `save-verification.ts`: Secret y ConfigMap usan PUT con `resourceVersion`; el resto de recursos editables va por JSON Patch con precondiciones `test`.
- [x] **1.2 Exigir concurrencia optimista en JSON Patch.** Añadido `{ op: "test", path: "/metadata/resourceVersion", value: <versión originalmente cargada> }` y `{ op: "test", path: "/metadata/uid", value: <uid original> }` antes de los cambios del usuario; clasificación de 409/422 en `request-patch-kube-resource.injectable.ts`. Ver [R1_02_VALIDATION.md](./R1_02_VALIDATION.md) (pendiente validación contra API server en R1-06).
- [x] **1.3 Mantener PUT protegido para Secret/ConfigMap**, sin etiqueta de versión artificial; comparar el estado persistido tras GET, y conservar los borradores en error. Ver [R1_03_VALIDATION.md](./R1_03_VALIDATION.md).
- [x] **1.4 UX de conflictos para YAML.** Mostrar que hay versión remota nueva, diferencias por ruta sin secretos, opciones explícitas de recargar, comparar y re-aplicar cambios. No reintentar automáticamente con una versión más reciente. Ver [R1_02_VALIDATION.md](./R1_02_VALIDATION.md) y [R1_06_VALIDATION.md](./R1_06_VALIDATION.md).
- [x] **1.5 Pruebas de regresión.** Dos clientes/editores sobre Deployment, StatefulSet y CRD; cambios concurrentes en listas/campos, 403, desconexión, webhooks mutadores, borrado remoto y cambio de `uid`. Verificado en `save.test.tsx` y contra servidor HTTP K8s de laboratorio en `save.lab-integration.test.tsx` ([R1_06_VALIDATION.md](./R1_06_VALIDATION.md)).

### 1B — Secret y ConfigMap desde paneles inline
**Código de referencia:** `renderer/components/config-secrets/secret-details.tsx` y `renderer/components/config-maps/config-map-details.tsx`.
- [x] **1.6 Capturar 409 de `store.update()`** con estado específico (`secret-conflict-notice` y `config-map-conflict-notice`), no solamente toast genérico. Ver [R1_03_VALIDATION.md](./R1_03_VALIDATION.md).
- [x] **1.7 Conservar borrador local**, ofrecer recargar y comparar antes de volver a guardar; si el recurso cambió, no hacer overwrite silencioso ni permitir que `autorun` de MobX pise el borrador sin guardar. Ver [R1_03_VALIDATION.md](./R1_03_VALIDATION.md).
- [x] **1.8 Redactar secretos:** nunca poner tokens, valores `data`/`stringData`, base64 ni credenciales en logs, diferencias por campo, notificaciones o telemetría (`redactSecretValues` y resumen exclusivamente por nombres de clave). Ver [R1_03_VALIDATION.md](./R1_03_VALIDATION.md).
- [x] **1.9 Pruebas inline:** Secret/ConfigMap con cambios concurrentes, permisos insuficientes (403), recurso eliminado (404), transformaciones `stringData` → `data`, y lectura fallida tras guardar (`secret-details.test.tsx` y `config-map-details.test.tsx`). Ver [R1_03_VALIDATION.md](./R1_03_VALIDATION.md).

### 1C — Kubeconfig y autenticación
**Código de referencia:** `packages/core/src/common/kube-helpers.ts`; sincronización bajo `main/catalog-sources/kubeconfig-sync/`.
- [x] **1.10 Fidelidad de serialización:** mantener `tls-server-name` (ya presente) e incorporar `proxy-url` y `disable-compression` (`ExtendedCluster` en `kube-helpers.ts`), además de `token-file` e impersonación (`as*`), probados de ida y vuelta. Ver [R1_04_VALIDATION.md](./R1_04_VALIDATION.md).
- [x] **1.11 Fidelidad `exec`:** preservar `command`, `args`, `env`, `apiVersion`, `interactiveMode`, `provideClusterInfo`, `installHint`; validar estructura con `validateExecConfig`, variables de entorno y permisos `0o600` de archivos temporales. Ver [R1_04_VALIDATION.md](./R1_04_VALIDATION.md).
- [x] **1.12 Entradas defectuosas aisladas.** Conservar `clusters/users/contexts` válidos (`ActionOnInvalid.FILTER` + `stripUnknown: { arrays: true }`) sin bloquear contextos válidos en `loadValidatedConfig`, y redactar secretos en diagnósticos (`sanitizeKubeConfigValidationDetails` en `compute-diff.injectable.ts`). Ver [R1_04_VALIDATION.md](./R1_04_VALIDATION.md).
- [x] **1.13 No reimplementar watcher sin necesidad:** verificados `awaitWriteFinish`, `atomic`, límites 2/32 MiB y pruebas de sincronización en `kubeconfig-sync.test.ts`. Ver [R1_04_VALIDATION.md](./R1_04_VALIDATION.md).
- [x] **1.14 Matriz de pruebas de autenticación:** kubeconfigs sintéticos (múltiples contextos, SNI, CA, proxy HTTP/SOCKS y `exec` de prueba), credenciales expiradas y plugin ausente en `kube-helpers.test.ts`. Sin contacto con EKS/AKS/GKE reales. Ver [R1_04_VALIDATION.md](./R1_04_VALIDATION.md).
- [x] **1.15 Puerta de salida Etapa 1:** todos los saves protegidos contra conflictos, borradores conservados, errores sin fugas, paneles inline con recuperación y `kubeconfig` sin pérdida de campos compatibles. Ver [R1_06_VALIDATION.md](./R1_06_VALIDATION.md).

## ETAPA 2 — Núcleo de conectividad incluido en R1
- [x] **2.1 Selección de kubectl coherente.** `create-port-forward.injectable.ts` ahora selecciona `Kubectl` según la versión del clúster (`getClusterByIdInjectable` + `createKubectlInjectable`) con fallback a `bundledKubectlInjectable`, y `PortForward.start()` llama `getKubectlBinPath(false)`. Ver [R1_05_VALIDATION.md](./R1_05_VALIDATION.md).
- [x] **2.2 Integridad de descargas.** Verificación SHA-256 (`computeFileSha256`, `verifyBinaryIntegrity`, `fetchExpectedSha256`) y registro de fuente/arquitectura/versión en `kubectl.ts`, protegiendo el binario empaquetado (`unlinkIfManagedBinary`). Ver [R1_05_VALIDATION.md](./R1_05_VALIDATION.md).
- [x] **2.3 Actualizar Helm y proxy gradualmente** con reintentos de arranque acotados (`maxStartupAttempts = 3` en `create-kube-auth-proxy.injectable.ts`) evitando recursión infinita cuando el puerto no abre. Ver [R1_05_VALIDATION.md](./R1_05_VALIDATION.md).
- [x] **2.4 Resiliencia de watches:** soporte de `BOOKMARK` (`allowWatchBookmarks=true`), actualización de `resourceVersion` por namespace, limpieza de `watchdogTimer`, backoff exponencial con jitter (`computeWatchRetryDelay`), resincronización tras `410 Gone` (`KubeStatus` y `Response`) y preservación de tablas ante fallos transitorios de recarga. Ver [R1_05_VALIDATION.md](./R1_05_VALIDATION.md).
- [x] **2.5 Port-forward y sesiones:** parada en disconnect/quit verificada, captura de `stderr`/`error` en `lastError`, limpieza automática del registro activo cuando el arranque falla o expira, y bind seguro a `127.0.0.1`. Ver [R1_05_VALIDATION.md](./R1_05_VALIDATION.md).
- [x] **2.6 Verificar contra laboratorio local** (`save.lab-integration.test.tsx` con servidor HTTP Kubernetes local en `127.0.0.1` y soporte `OPENLENS_LAB_API` para `kind`/`k3d`/`minikube`): concurrencia JSON Patch (`Deployment`, `StatefulSet`, `CRD`) y `PUT` (`ConfigMap`, `Secret`), round-trip de `kubeconfig` y watches (`BOOKMARK`, `410 Gone`). Ver [R1_06_VALIDATION.md](./R1_06_VALIDATION.md).
- [x] **2.7 Puerta de salida R1:** build verificable, 11 suites / 127 tests de regresión + integración + smoke de GUI aprobados (`OpenLens DevOps.app` en `open-lens/dist-stage`), edición concurrente protegida, kubeconfigs fieles, herramientas y conexiones estables. Ver [R1_06_VALIDATION.md](./R1_06_VALIDATION.md).

## Paquetes de trabajo sugeridos (orden relativo, NO calendario)
1. [x] **R1-00** Preflight de espacio, estado Git y toolchain (Etapa 0) — Completado en [R1_00_PREFLIGHT.md](./R1_00_PREFLIGHT.md).
2. [x] **R1-01** Build real y smoke automatizado aprobados en `OpenLens DevOps.app`. Ver [R1_01_VALIDATION.md](./R1_01_VALIDATION.md).
3. [x] **R1-02** JSON Patch con `test` y pruebas de concurrencia (Etapa 1A) — Completado y validado extremo a extremo en [R1_02_VALIDATION.md](./R1_02_VALIDATION.md) y [R1_06_VALIDATION.md](./R1_06_VALIDATION.md).
4. [x] **R1-03** UX de conflicto Secret/ConfigMap inline (Etapa 1B) — Completado en código, tests unitarios, build y smoke GUI aislado. Ver [R1_03_VALIDATION.md](./R1_03_VALIDATION.md).
5. [x] **R1-04** Round-trip kubeconfig y pruebas `exec` (Etapa 1C) — Completado en código, tests unitarios, build y smoke GUI aislado. Ver [R1_04_VALIDATION.md](./R1_04_VALIDATION.md).
6. [x] **R1-05** kubectl/Helm/proxy + watches y port-forward (núcleo Etapa 2) — Completado en código, tests unitarios, build y smoke GUI aislado. Ver [R1_05_VALIDATION.md](./R1_05_VALIDATION.md).
7. [x] **R1-06** Integración en clúster de laboratorio, smoke y criterios de salida — Completado en [R1_06_VALIDATION.md](./R1_06_VALIDATION.md).

## Registro de decisiones por tomar antes de editar código
- [ ] Aprobar ejecución de build local tras resolver espacio; confirmar directorio alternativo si se usa otro volumen.
- [ ] Determinar si el cambio de versión de `node-pty`/Electron es imprescindible para el primer build (en R1-00 se comprobó que `node-pty@0.10.1` ya tiene binario `darwin-arm64-110` para Electron `22.3.x`).
- [ ] Aprobar mecanismo de edición concurrente genérico (JSON Patch `test` o equivalente) y diseño de comparación/recarga.
- [ ] Definir matriz Kubernetes objetivo y plataforma(s) de R1: macOS arm64 primero, otras plataformas después si se decide.
- [ ] Aprobar explícitamente la preparación y uso de un clúster de laboratorio local para tests mutadores.

## Evidencia y trazabilidad
Ver [R1_00_PREFLIGHT.md](./R1_00_PREFLIGHT.md), [ROADMAP_PROVISIONAL.md](./ROADMAP_PROVISIONAL.md), [FEATURE_CATALOG_FULL.md](./FEATURE_CATALOG_FULL.md), [CODE_VERIFICATION.md](./CODE_VERIFICATION.md), [TEST_RESULTS.md](./TEST_RESULTS.md) y [REA_FINDINGS.md](./REA_FINDINGS.md).

Este checklist define **qué** validar y **cómo comprobarlo**. Los nuevos ítems de validación continua están pendientes; no son tareas ya realizadas y el documento no autoriza por sí mismo cambios en código.